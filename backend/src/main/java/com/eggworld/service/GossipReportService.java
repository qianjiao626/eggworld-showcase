package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.UserContext;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/** 独立爆料：平台奖励与打听的用户冻结悬赏完全隔离。 */
@Service
@RequiredArgsConstructor
public class GossipReportService {
    public static final int MAX_REWARD = 10000;
    private final JdbcTemplate jdbc;
    private final SensitiveWords sensitiveWords;
    private final PointService points;
    private final NotificationService notifications;

    public int parseReward(JsonNode amount) {
        if (amount == null || !amount.isIntegralNumber() || !amount.canConvertToInt()
                || amount.intValue() < 0 || amount.intValue() > MAX_REWARD) {
            throw new BusinessException("奖励需为 0～10000 的整数");
        }
        return amount.intValue();
    }

    public void checkText(String text) {
        sensitiveWords.assertClean(text);
    }

    private String required(String text, int max, String label) {
        if (text == null || text.isBlank() || text.strip().length() > max) {
            throw new BusinessException(label + "不能为空或超过" + max + "字");
        }
        return text.strip();
    }

    private Long lastId() { return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class); }
    private void loggedIn(Long id) { if (id == null) throw new BusinessException(401, "请先登录"); }
    private void audit(String target, Long id, String action, Long actor, String reason) {
        jdbc.update("INSERT INTO gossip_report_actions(target_type,target_id,action,operator_id,reason) VALUES (?,?,?,?,?)",
                target, id, action, actor, reason);
    }

    /** 内容状态由服务端登录身份决定，不信任请求体中的角色、发布者或奖励状态。 */
    @Transactional
    public Long publish(Long userId, String title, String content, boolean anonymous) {
        loggedIn(userId);
        title = required(title, 120, "标题"); content = required(content, 2000, "正文");
        checkText(title); checkText(content);
        boolean moderator = UserContext.get() != null && userId.equals(UserContext.userId()) && UserContext.get().isModerator();
        jdbc.update("INSERT INTO gossip_reports(title,content,publisher_id,anonymous,status,reward_status) VALUES (?,?,?,?,?,?)",
                title, content, userId, anonymous, moderator ? "published" : "pending", moderator ? "pending" : "none");
        return lastId();
    }

    private int page(long n) { return (int) Math.max(1, Math.min(n, 100000)); }
    private int size(long n) { return (int) Math.max(1, Math.min(n, 30)); }

    public Map<String, Object> list(long current, long limit, Long viewer) {
        int p = page(current), s = size(limit);
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM gossip_reports WHERE status='published'", Long.class);
        return Map.of("records", jdbc.queryForList("SELECT r.id,r.title,r.content,r.anonymous,r.reward_amount AS rewardAmount,"
                        + "r.reward_status AS rewardStatus,r.created_at AS createdAt,"
                        + "CASE WHEN r.anonymous=1 THEN '匿名爆料' ELSE COALESCE(u.nickname,'已注销用户') END AS publisherNickname,"
                        + "(SELECT COUNT(*) FROM gossip_report_likes l WHERE l.report_id=r.id) AS likes,"
                        + "(SELECT COUNT(*) FROM gossip_report_comments c WHERE c.report_id=r.id AND c.status='visible') AS commentCount,"
                        + "(SELECT COUNT(*) FROM gossip_report_likes l WHERE l.report_id=r.id AND l.user_id=?) AS liked "
                        + "FROM gossip_reports r LEFT JOIN users u ON u.id=r.publisher_id WHERE r.status='published' "
                        + "ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?",
                viewer == null ? -1L : viewer, s, (p - 1) * s), "total", total == null ? 0 : total,
                "current", p, "pages", (int) Math.ceil((double) (total == null ? 0 : total) / s));
    }

    public Map<String, Object> detail(Long id, Long viewer) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT r.id,r.title,r.content,r.anonymous,r.reward_amount AS rewardAmount,"
                        + "r.reward_status AS rewardStatus,r.created_at AS createdAt,"
                        + "CASE WHEN r.anonymous=1 THEN '匿名爆料' ELSE COALESCE(u.nickname,'已注销用户') END AS publisherNickname,"
                        + "(SELECT COUNT(*) FROM gossip_report_likes l WHERE l.report_id=r.id) AS likes,"
                        + "(SELECT COUNT(*) FROM gossip_report_comments c WHERE c.report_id=r.id AND c.status='visible') AS commentCount,"
                        + "(SELECT COUNT(*) FROM gossip_report_likes l WHERE l.report_id=r.id AND l.user_id=?) AS liked "
                        + "FROM gossip_reports r LEFT JOIN users u ON u.id=r.publisher_id WHERE r.id=? AND r.status='published' LIMIT 1",
                viewer == null ? -1L : viewer, id);
        if (rows.isEmpty()) throw new BusinessException(404, "爆料不存在或已下架");
        return rows.get(0);
    }

    public Map<String, Object> comments(Long id, long current, long limit) {
        detail(id, null);
        int p = page(current), s = size(limit);
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM gossip_report_comments WHERE report_id=? AND status='visible'", Long.class, id);
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT c.id,c.content,c.created_at AS createdAt,"
                        + "COALESCE(u.nickname,'已注销用户') AS authorNickname FROM gossip_report_comments c "
                        + "LEFT JOIN users u ON u.id=c.author_id WHERE c.report_id=? AND c.status='visible' "
                        + "ORDER BY c.created_at ASC,c.id ASC LIMIT ? OFFSET ?", id, s, (p - 1) * s);
        return Map.of("records", rows, "total", total == null ? 0 : total, "current", p,
                "pages", (int) Math.ceil((double) (total == null ? 0 : total) / s));
    }

    @Transactional
    public Long comment(Long userId, Long id, String content) {
        loggedIn(userId);
        content = required(content, 500, "评论");
        checkText(content);
        // 使用 SQL 条件插入，避免读取详情和写入间被管理员下架的竞态。
        int inserted = jdbc.update("INSERT INTO gossip_report_comments(report_id,author_id,content) "
                        + "SELECT id,?,? FROM gossip_reports WHERE id=? AND status='published'", userId, content, id);
        if (inserted == 0) throw new BusinessException(404, "爆料不存在或已下架");
        return lastId();
    }

    @Transactional
    public void like(Long userId, Long id) {
        loggedIn(userId);
        try {
            int inserted = jdbc.update("INSERT INTO gossip_report_likes(report_id,user_id) "
                    + "SELECT id,? FROM gossip_reports WHERE id=? AND status='published'", userId, id);
            if (inserted == 0) throw new BusinessException(404, "爆料不存在或已下架");
        } catch (DuplicateKeyException ex) {
            throw new BusinessException("你已经点过赞啦");
        }
    }

    public List<Map<String, Object>> pending() {
        return jdbc.queryForList("SELECT r.*,COALESCE(u.nickname,'已注销用户') AS publisherNickname "
                + "FROM gossip_reports r LEFT JOIN users u ON u.id=r.publisher_id "
                + "WHERE r.status='pending' OR (r.status='published' AND r.reward_status='pending') "
                + "ORDER BY r.created_at ASC,r.id ASC LIMIT 50");
    }

    public List<Map<String, Object>> manage() {
        return jdbc.queryForList("SELECT r.*,COALESCE(u.nickname,'已注销用户') AS publisherNickname "
                + "FROM gossip_reports r LEFT JOIN users u ON u.id=r.publisher_id ORDER BY r.created_at DESC,r.id DESC LIMIT 50");
    }

    public List<Map<String, Object>> manageComments(Long id) {
        return jdbc.queryForList("SELECT c.*,COALESCE(u.nickname,'已注销用户') AS authorNickname "
                + "FROM gossip_report_comments c LEFT JOIN users u ON u.id=c.author_id "
                + "WHERE c.report_id=? ORDER BY c.id DESC LIMIT 100", id);
    }

    @Transactional
    public void approve(Long id, Long operator, int reward) {
        loggedIn(operator); checkReward(reward);
        // 需在领取状态前先判定不能给自己结算，失败无需回滚其它处理。
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT publisher_id,status,reward_status FROM gossip_reports WHERE id=?", id);
        if (rows.isEmpty()) throw new BusinessException(404, "爆料不存在");
        if (operator.equals(((Number) rows.get(0).get("publisher_id")).longValue())) {
            throw new BusinessException(403, "不能审核并结算自己发布的爆料");
        }
        int updated = jdbc.update("UPDATE gossip_reports SET status='published',reviewer_id=?,reviewed_at=NOW(),reward_status='pending' WHERE id=? AND status='pending'", operator, id);
        if (updated == 0) throw new BusinessException("爆料已被其他管理员处理");
        audit("report", id, "approve", operator, null);
        settleReward(id, operator, reward);
    }

    @Transactional
    public void reject(Long id, Long operator, String reason) {
        loggedIn(operator); reason = required(reason, 500, "驳回原因");
        int updated = jdbc.update("UPDATE gossip_reports SET status='rejected',reviewer_id=?,review_reason=?,reviewed_at=NOW() "
                + "WHERE id=? AND status='pending'", operator, reason, id);
        if (updated == 0) throw new BusinessException("爆料已被其他管理员处理");
        audit("report", id, "reject", operator, reason);
        Long recipient = jdbc.queryForObject("SELECT publisher_id FROM gossip_reports WHERE id=?", Long.class, id);
        notifications.notify(recipient, "你的爆料未通过审核：" + reason, "review");
    }

    private void checkReward(int amount) {
        if (amount < 0 || amount > MAX_REWARD) throw new BusinessException("奖励需为 0～10000 的整数");
    }

    /** 目标是否存在：不存在统一 404，避免与「已被其他管理员处理」「不能给自己结算」混为一谈。 */
    private void requireReport(Long id) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM gossip_reports WHERE id=?", Integer.class, id);
        if (count == null || count == 0) throw new BusinessException(404, "爆料不存在");
    }

    private void requireComment(Long id) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM gossip_report_comments WHERE id=?", Integer.class, id);
        if (count == null || count == 0) throw new BusinessException(404, "评论不存在");
    }

    /** 唯一 report_id 与 CAS 双保险；资金流水、奖励记录与状态在同一事务内提交。 */
    @Transactional
    public void settleReward(Long id, Long operator, int amount) {
        loggedIn(operator); checkReward(amount);
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT publisher_id,status,reward_status FROM gossip_reports WHERE id=?", id);
        if (rows.isEmpty()) throw new BusinessException(404, "爆料不存在");
        Map<String, Object> report = rows.get(0);
        Long publisher = ((Number) report.get("publisher_id")).longValue();
        if (operator.equals(publisher)) throw new BusinessException(403, "不能给自己发布的爆料结算奖励");
        if (!"published".equals(report.get("status")) || !"pending".equals(report.get("reward_status"))) {
            throw new BusinessException("爆料已被其他管理员处理");
        }
        int updated = jdbc.update("UPDATE gossip_reports SET reward_status='settled',reward_amount=?,updated_at=NOW() "
                + "WHERE id=? AND status='published' AND reward_status='pending'", amount, id);
        if (updated == 0) throw new BusinessException("爆料已被其他管理员处理");
        jdbc.update("INSERT INTO gossip_report_rewards(report_id,recipient_id,amount,operator_id) VALUES (?,?,?,?)",
                id, publisher, amount, operator);
        if (amount > 0) points.changeBalance(publisher, amount, "reward", "爆料平台奖励 #" + id, null);
        audit("report", id, "reward", operator, String.valueOf(amount));
        notifications.notify(publisher, "你的爆料已公开，平台奖励 " + amount + " 蛋蛋币", "review");
    }

    @Transactional
    public void moderateReport(Long id, Long operator, String action, String reason) {
        loggedIn(operator); reason = required(reason, 500, "处理原因");
        if (!"hide".equals(action) && !"delete".equals(action)) throw new BusinessException("不支持该操作");
        requireReport(id);
        String from = "hide".equals(action) ? "published" : "hidden";
        if ("delete".equals(action)) {
            // 删除允许直接处理公开内容；SQL 只接受公开/隐藏状态，避免改写驳回或待审核内容。
            int count = jdbc.update("UPDATE gossip_reports SET status='deleted',reviewer_id=?,review_reason=?,reviewed_at=NOW() "
                    + "WHERE id=? AND status IN ('published','hidden')", operator, reason, id);
            if (count == 0) throw new BusinessException("爆料已被其他管理员处理");
        } else {
            int count = jdbc.update("UPDATE gossip_reports SET status='hidden',reviewer_id=?,review_reason=?,reviewed_at=NOW() "
                    + "WHERE id=? AND status=?", operator, reason, id, from);
            if (count == 0) throw new BusinessException("爆料已被其他管理员处理");
        }
        audit("report", id, action, operator, reason);
    }

    @Transactional
    public void moderateComment(Long id, Long operator, String action, String reason) {
        loggedIn(operator); reason = required(reason, 500, "处理原因");
        if (!"hide".equals(action) && !"delete".equals(action)) throw new BusinessException("不支持该操作");
        requireComment(id);
        int count = "hide".equals(action)
                ? jdbc.update("UPDATE gossip_report_comments SET status='hidden',moderator_id=?,moderation_reason=?,moderated_at=NOW() "
                        + "WHERE id=? AND status='visible'", operator, reason, id)
                : jdbc.update("UPDATE gossip_report_comments SET status='deleted',moderator_id=?,moderation_reason=?,moderated_at=NOW() "
                        + "WHERE id=? AND status IN ('visible','hidden')", operator, reason, id);
        if (count == 0) throw new BusinessException("评论已被其他管理员处理");
        audit("comment", id, action, operator, reason);
    }
}
