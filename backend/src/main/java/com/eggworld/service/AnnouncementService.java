package com.eggworld.service;

import com.eggworld.common.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AnnouncementService {
    private final JdbcTemplate jdbc;
    private final SensitiveWords sensitiveWords;

    private String required(String value, int max, String label) {
        if (value == null || value.isBlank() || value.strip().length() > max) {
            throw new BusinessException(label + "不能为空或超过" + max + "字");
        }
        return value.strip();
    }
    private void audit(Long id, String action, Long actor) {
        jdbc.update("INSERT INTO announcement_actions(announcement_id,action,operator_id) VALUES (?,?,?)", id, action, actor);
    }

    /** 不在查询中暴露发布者用户 ID 或已下架的公告。 */
    public Map<String, Object> list(long current, long limit) {
        int p = (int) Math.max(1, Math.min(current, 100000));
        int s = (int) Math.max(1, Math.min(limit, 30));
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM announcements WHERE status='published'", Long.class);
        return Map.of("records", jdbc.queryForList("SELECT a.id,a.title,a.content,a.published_at AS publishedAt,"
                        + "COALESCE(u.nickname,'已注销用户') AS publisherNickname FROM announcements a "
                        + "LEFT JOIN users u ON u.id=a.publisher_id WHERE a.status='published' "
                        + "ORDER BY a.published_at DESC,a.id DESC LIMIT ? OFFSET ?", s, (p - 1) * s),
                "total", total == null ? 0 : total, "current", p,
                "pages", (int) Math.ceil((double) (total == null ? 0 : total) / s));
    }

    public Map<String, Object> detail(Long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT a.id,a.title,a.content,a.published_at AS publishedAt,"
                        + "COALESCE(u.nickname,'已注销用户') AS publisherNickname FROM announcements a "
                        + "LEFT JOIN users u ON u.id=a.publisher_id WHERE a.id=? AND a.status='published' LIMIT 1", id);
        if (rows.isEmpty()) throw new BusinessException(404, "公告不存在或已下架");
        return rows.get(0);
    }

    /** 已下架公告仅可在主管理员管理台读取，不可重新发布。 */
    public List<Map<String, Object>> manage() {
        return jdbc.queryForList("SELECT a.*,COALESCE(u.nickname,'已注销用户') AS publisherNickname "
                + "FROM announcements a LEFT JOIN users u ON u.id=a.publisher_id "
                + "ORDER BY a.id DESC LIMIT 100");
    }

    @Transactional
    public Long publish(Long actor, String title, String content) {
        if (actor == null) throw new BusinessException(401, "请先登录");
        title = required(title, 120, "标题"); content = required(content, 3000, "正文");
        sensitiveWords.assertClean(title); sensitiveWords.assertClean(content);
        jdbc.update("INSERT INTO announcements(title,content,publisher_id,updated_by) VALUES (?,?,?,?)",
                title, content, actor, actor);
        Long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        audit(id, "publish", actor);
        return id;
    }

    @Transactional
    public void edit(Long id, Long actor, String title, String content) {
        if (actor == null) throw new BusinessException(401, "请先登录");
        title = required(title, 120, "标题"); content = required(content, 3000, "正文");
        sensitiveWords.assertClean(title); sensitiveWords.assertClean(content);
        int updated = jdbc.update("UPDATE announcements SET title=?,content=?,updated_by=?,updated_at=NOW() "
                + "WHERE id=? AND status='published'", title, content, actor, id);
        if (updated == 0) throw new BusinessException(404, "公告不存在或已下架");
        audit(id, "edit", actor);
    }

    @Transactional
    public void unpublish(Long id, Long actor) {
        if (actor == null) throw new BusinessException(401, "请先登录");
        int updated = jdbc.update("UPDATE announcements SET status='unpublished',updated_by=?,updated_at=NOW() "
                + "WHERE id=? AND status='published'", actor, id);
        if (updated == 0) throw new BusinessException(404, "公告不存在或已下架");
        audit(id, "unpublish", actor);
    }
}
