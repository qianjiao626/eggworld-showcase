package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

/**
 * 猫舍系统（宠物系统 v3 外观改造）：
 * 捏猫 → 保存 → 公开展示 → 领养 → 投票 → 榜单 → 审核 → 发奖。
 *
 * 与 PetService（喂养/进化）并存：PetService 管数值，本服务管外观与社交。
 * 所有蛋蛋币变动一律走 PointService（事务 + 行锁），不另开写余额路径。
 */
@Service
@RequiredArgsConstructor
public class CatService {

    /** 每次投票的每日上限 */
    public static final int DAILY_VOTES = 3;
    /** 单账号最多领养别人猫的数量 */
    public static final int MAX_ADOPTIONS = 3;
    /** 被领养时原主人获得的声望 */
    public static final int ADOPT_REPUTATION = 10;
    /** 榜单第一名的奖励 */
    public static final int RANK1_POINTS = 100;
    public static final int RANK1_REPUTATION = 50;
    /** 认可的外观部件范围（与素材包一一对应） */
    private static final Map<String, Integer> LOOK_RANGE = new LinkedHashMap<>();
    static {
        LOOK_RANGE.put("body", 6);
        LOOK_RANGE.put("ear", 6);
        LOOK_RANGE.put("eye", 8);
        LOOK_RANGE.put("tail", 5);
        LOOK_RANGE.put("pattern", 5);
        LOOK_RANGE.put("face", 3);
    }

    private final JdbcTemplate jdbc;
    private final PointService pointService;
    private final CatReviewPermission catReviewPermission;
    private final ObjectMapper mapper = new ObjectMapper();

    /* ==================== 外观：校验与序列化 ==================== */

    /** 校验并规范化外观配置；返回存库用的 JSON 字符串。 */
    public String normalizeLook(Map<String, Object> raw) {
        if (raw == null) throw new BusinessException("外观配置不能为空");
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> e : LOOK_RANGE.entrySet()) {
            String key = e.getKey();
            int max = e.getValue();
            int v = toInt(raw.get(key));
            if (v < 1 || v > max) throw new BusinessException("外观部件超出范围：" + key);
            out.put(key, v);
        }
        out.put("blush", toInt(raw.get("blush")) == 1 ? 1 : 0);
        try {
            return mapper.writeValueAsString(out);
        } catch (Exception ex) {
            throw new BusinessException("外观配置格式不正确");
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseLook(String json) {
        try {
            return mapper.readValue(json, LinkedHashMap.class);
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    private int toInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(o).trim()); } catch (Exception e) { return 0; }
    }

    /* ==================== 我的猫舍 ==================== */

    /** 我创建的所有猫（含未公开），供自己管理。 */
    public List<Map<String, Object>> myRooms(Long userId) {
        requireLogin(userId);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM cat_rooms WHERE user_id = ? ORDER BY id DESC", userId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) out.add(toRoomVO(r, true));
        return out;
    }

    /** Cat-room reputation points are separate from the 0-5 review average. */
    public int myReputation(Long userId) {
        requireLogin(userId);
        List<Integer> scores = jdbc.queryForList("SELECT score FROM cat_reputation WHERE user_id = ?", Integer.class, userId);
        return scores.isEmpty() || scores.get(0) == null ? 0 : scores.get(0);
    }

    /** 创建一只猫（默认草稿，用户可提交审核或直接公开由审核决定）。 */
    @Transactional
    public Map<String, Object> createRoom(Long userId, String name, Map<String, Object> look, String intro) {
        requireLogin(userId);
        String cleanName = name == null ? "" : name.trim();
        if (cleanName.isEmpty()) throw new BusinessException("请给猫咪起个名字");
        if (cleanName.length() > 30) throw new BusinessException("名字最多 30 个字");
        String cleanIntro = intro == null ? null : intro.trim();
        if (cleanIntro != null && cleanIntro.isEmpty()) cleanIntro = null;
        if (cleanIntro != null && cleanIntro.length() > 200) throw new BusinessException("介绍最多 200 字");

        String lookJson = normalizeLook(look);
        jdbc.update("INSERT INTO cat_rooms (user_id, name, look_json, intro, status) VALUES (?,?,?,?,0)",
                userId, cleanName, lookJson, cleanIntro);
        Long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return roomDetail(userId, id);
    }

    /** 修改自己的猫（改名、改外观、改介绍）。 */
    @Transactional
    public Map<String, Object> updateRoom(Long userId, long roomId, String name, Map<String, Object> look, String intro) {
        requireLogin(userId);
        lockRoom(roomId);
        Map<String, Object> row = requireOwnedRoom(userId, roomId);
        String cleanName = name == null ? "" : name.trim();
        if (cleanName.isEmpty()) throw new BusinessException("请给猫咪起个名字");
        if (cleanName.length() > 30) throw new BusinessException("名字最多 30 个字");
        String cleanIntro = intro == null ? null : intro.trim();
        if (cleanIntro != null && cleanIntro.isEmpty()) cleanIntro = null;
        if (cleanIntro != null && cleanIntro.length() > 200) throw new BusinessException("介绍最多 200 字");

        String lookJson = normalizeLook(look);
        // Draft stays draft; edited published/rejected content must be reviewed again.
        jdbc.update("UPDATE cat_rooms SET name=?, look_json=?, intro=?, status=?, is_public=0, reject_reason=NULL WHERE id=?",
                cleanName, lookJson, cleanIntro, toInt(row.get("status")) == 0 ? 0 : 1, roomId);
        return roomDetail(userId, roomId);
    }

    /** 删除自己的猫。 */
    @Transactional
    public void deleteRoom(Long userId, long roomId) {
        requireLogin(userId);
        lockRoom(roomId);
        requireOwnedRoom(userId, roomId);
        // Never erase adoption/quota or reward history for a cat that others interacted with.
        for (String table : List.of("cat_adoptions", "cat_votes", "cat_reward_grants")) {
            Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE room_id = ?", Integer.class, roomId);
            if (count != null && count > 0) throw new BusinessException("已有领养、投票或奖励记录的猫不能删除");
        }
        jdbc.update("DELETE FROM cat_votes WHERE room_id = ?", roomId);
        jdbc.update("DELETE FROM cat_adoptions WHERE room_id = ?", roomId);
        jdbc.update("DELETE FROM cat_rooms WHERE id = ?", roomId);
    }

    /** 提交审核。 */
    @Transactional
    public void submitForReview(Long userId, long roomId) {
        requireLogin(userId);
        lockRoom(roomId);
        Map<String, Object> row = requireOwnedRoom(userId, roomId);
        int status = toInt(row.get("status"));
        if (status == 1) throw new BusinessException("这只猫正在等待审核");
        if (status == 2) throw new BusinessException("这只猫已经通过审核了");
        jdbc.update("UPDATE cat_rooms SET status=1, reject_reason=NULL, is_public=0 WHERE id=?", roomId);
    }

    /* ==================== 浏览与领养 ==================== */

    /** 猫市集：已通过审核 & 公开的猫，按票数倒序。 */
    public List<Map<String, Object>> market(Long userId, String keyword, int page, int size) {
        int safeSize = Math.max(1, Math.min(50, size));
        int safePage = Math.max(1, page);
        int offset = (safePage - 1) * safeSize;
        boolean hasKw = keyword != null && !keyword.trim().isEmpty();
        String like = hasKw ? "%" + keyword.trim() + "%" : null;

        List<Map<String, Object>> rows;
        if (hasKw) {
            rows = jdbc.queryForList(
                    "SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 AND name LIKE ? ORDER BY votes DESC, id DESC LIMIT ? OFFSET ?",
                    like, safeSize, offset);
        } else {
            rows = jdbc.queryForList(
                    "SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC, id DESC LIMIT ? OFFSET ?",
                    safeSize, offset);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> vo = toRoomVO(r, false);
            long ownerId = ((Number) r.get("user_id")).longValue();
            vo.put("mine", userId != null && userId == ownerId);
            vo.put("voted", userId != null && hasVoted(roomId(r), userId));
            vo.put("adopted", userId != null && hasAdopted(roomId(r), userId));
            vo.put("ownerName", nicknameOf(ownerId));
            out.add(vo);
        }
        return out;
    }

    /** 猫舍详情（含是否已投/已领养，以及投票与领养数）。 */
    public Map<String, Object> roomDetail(Long userId, long roomId) {
        Map<String, Object> row = requireRoom(roomId);
        int status = toInt(row.get("status"));
        long ownerId = ((Number) row.get("user_id")).longValue();
        boolean isOwner = userId != null && userId == ownerId;
        boolean isReviewer = userId != null && catReviewPermission.isReviewer(userId);
        // 未公开的只有主人与审核员能看
        if (!(status == 2 && toInt(row.get("is_public")) == 1) && !isOwner && !isReviewer) {
            throw new BusinessException(404, "这只猫还没有公开");
        }
        Map<String, Object> vo = toRoomVO(row, isOwner || isReviewer);
        vo.put("mine", isOwner);
        vo.put("ownerName", nicknameOf(ownerId));
        vo.put("voted", userId != null && hasVoted(roomId, userId));
        vo.put("adopted", userId != null && hasAdopted(roomId, userId));
        return vo;
    }

    /** 领养：复制一份外观到自己账号，并给原主人加声望（同一人只算一次）。 */
    @Transactional
    public Map<String, Object> adopt(Long userId, long roomId) {
        requireLogin(userId);
        lockUser(userId);
        lockRoom(roomId);
        Map<String, Object> row = requireRoom(roomId);
        if (toInt(row.get("status")) != 2 || toInt(row.get("is_public")) != 1) {
            throw new BusinessException("这只猫还没有公开");
        }
        long ownerId = ((Number) row.get("user_id")).longValue();
        if (ownerId == userId) throw new BusinessException("不能领养自己的猫");

        boolean already = hasAdopted(roomId, userId);
        if (already) throw new BusinessException("你已经领养过这只猫了");

        long adoptedCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cat_adoptions WHERE adopter_id = ?", Long.class, userId);
        if (adoptedCount >= MAX_ADOPTIONS) {
            throw new BusinessException("最多只能领养 " + MAX_ADOPTIONS + " 只别人的猫");
        }

        jdbc.update("INSERT INTO cat_adoptions (room_id, owner_id, adopter_id) VALUES (?,?,?)", roomId, ownerId, userId);
        jdbc.update("UPDATE cat_rooms SET adopts = adopts + 1 WHERE id = ?", roomId);
        addReputation(ownerId, ADOPT_REPUTATION);

        // 复制一份外观到领养人名下（草稿状态，可自行改名）
        String name = String.valueOf(row.get("name"));
        String suffix = "（领养）";
        String adoptedName = name.substring(0, Math.min(name.length(), 30 - suffix.length())) + suffix;
        jdbc.update("INSERT INTO cat_rooms (user_id, name, look_json, intro, status, is_public) VALUES (?,?,?,?,0,0)",
                userId, adoptedName, row.get("look_json"), row.get("intro"));
        return roomDetail(userId, roomId);
    }

    /* ==================== 投票 ==================== */

    /** 给一只猫投票：每人每天 3 票，不能投自己，不能重复投同一只。 */
    @Transactional
    public Map<String, Object> vote(Long userId, long roomId) {
        requireLogin(userId);
        lockUser(userId);
        lockRoom(roomId);
        Map<String, Object> row = requireRoom(roomId);
        if (toInt(row.get("status")) != 2 || toInt(row.get("is_public")) != 1) {
            throw new BusinessException("这只猫还没有公开");
        }
        long ownerId = ((Number) row.get("user_id")).longValue();
        if (ownerId == userId) throw new BusinessException("不能给自己的猫投票");

        if (hasVoted(roomId, userId)) throw new BusinessException("你已经给这只猫投过票了");

        LocalDate today = LocalDate.now();
        Integer used = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cat_votes WHERE voter_id = ? AND vote_date = ?", Integer.class, userId, today);
        int usedCount = used == null ? 0 : used;
        if (usedCount >= DAILY_VOTES) {
            throw new BusinessException("今天的 " + DAILY_VOTES + " 票已经用完啦，明天再来");
        }

        jdbc.update("INSERT INTO cat_votes (room_id, voter_id, vote_date) VALUES (?,?,?)", roomId, userId, today);
        jdbc.update("UPDATE cat_rooms SET votes = votes + 1 WHERE id = ?", roomId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("votes", toInt(row.get("votes")) + 1);
        out.put("remaining", DAILY_VOTES - usedCount - 1);
        return out;
    }

    /** 今天还剩几票。 */
    public int remainingVotes(Long userId) {
        if (userId == null) return 0;
        Integer used = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cat_votes WHERE voter_id = ? AND vote_date = ?", Integer.class, userId, LocalDate.now());
        return Math.max(0, DAILY_VOTES - (used == null ? 0 : used));
    }

    /* ==================== 榜单 ==================== */

    /** 总榜：按总票数倒序，仅统计已公开的猫。 */
    public List<Map<String, Object>> ranking(int limit) {
        int safe = Math.max(1, Math.min(100, limit));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC, adopts DESC, id ASC LIMIT ?", safe);
        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 0;
        for (Map<String, Object> r : rows) {
            rank++;
            Map<String, Object> vo = toRoomVO(r, false);
            long ownerId = ((Number) r.get("user_id")).longValue();
            vo.put("rank", rank);
            vo.put("ownerName", nicknameOf(ownerId));
            vo.put("rewarded", isRewarded("total", roomId(r)));
            out.add(vo);
        }
        return out;
    }

    /* ==================== 审核 ==================== */

    /** 待审核列表（仅宠物系统管理员）。 */
    public List<Map<String, Object>> pendingRooms(Long reviewerId) {
        catReviewPermission.requireReviewer(reviewerId);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM cat_rooms WHERE status = 1 ORDER BY id ASC LIMIT 100");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> vo = toRoomVO(r, true);
            vo.put("ownerName", nicknameOf(((Number) r.get("user_id")).longValue()));
            out.add(vo);
        }
        return out;
    }

    /** 审核通过：公开 + 进入榜单候选。 */
    @Transactional
    public void approve(Long reviewerId, long roomId) {
        catReviewPermission.requireReviewer(reviewerId);
        lockRoom(roomId);
        if (toInt(requireRoom(roomId).get("status")) != 1) throw new BusinessException("只能通过待审核的猫");
        jdbc.update("UPDATE cat_rooms SET status=2, is_public=1, reject_reason=NULL, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
                reviewerId, roomId);
    }

    /** 审核驳回：隐藏并记录原因（不删除，主人可改后重提）。 */
    @Transactional
    public void reject(Long reviewerId, long roomId, String reason) {
        catReviewPermission.requireReviewer(reviewerId);
        lockRoom(roomId);
        if (toInt(requireRoom(roomId).get("status")) != 1) throw new BusinessException("只能驳回待审核的猫");
        String clean = reason == null ? null : reason.trim();
        if (clean != null && clean.length() > 200) clean = clean.substring(0, 200);
        jdbc.update("UPDATE cat_rooms SET status=3, is_public=0, reject_reason=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
                clean, reviewerId, roomId);
    }

    /** 下架一只已公开的猫（仅管理员）。 */
    @Transactional
    public void takeDown(Long reviewerId, long roomId) {
        catReviewPermission.requireReviewer(reviewerId);
        lockRoom(roomId);
        if (toInt(requireRoom(roomId).get("status")) != 2) throw new BusinessException("只能下架已公开的猫");
        jdbc.update("UPDATE cat_rooms SET status=4, is_public=0, reviewed_by=?, reviewed_at=NOW() WHERE id=?", reviewerId, roomId);
    }

    /* ==================== 榜单奖励（管理员手动结算） ==================== */

    /**
     * 发放总榜第一名奖励：100 蛋蛋币 + 50 声望，每个赛季仅一次。
     * 幂等：靠 cat_reward_grants 的 season 唯一键保证同一赛季只发一次。
     */
    @Transactional
    public Map<String, Object> grantRankReward(Long reviewerId, String season) {
        catReviewPermission.requireReviewer(reviewerId);
        String cleanSeason = season == null || season.trim().isEmpty() ? "total" : season.trim();
        if (cleanSeason.length() > 20) throw new BusinessException("赛季标识过长");

        List<Map<String, Object>> top = jdbc.queryForList(
                "SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC, adopts DESC, id ASC LIMIT 1");
        if (top.isEmpty()) throw new BusinessException("当前没有可发奖的猫");

        Map<String, Object> first = top.get(0);
        long roomId = ((Number) first.get("id")).longValue();
        long ownerId = ((Number) first.get("user_id")).longValue();
        int votes = toInt(first.get("votes"));

        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cat_reward_grants WHERE season = ?", Integer.class, cleanSeason);
        if (exists != null && exists > 0) {
            throw new BusinessException("本赛季已经发过榜首奖励了");
        }

        try {
            jdbc.update("INSERT INTO cat_reward_grants (season, room_id, owner_id, rank_no, points, reputation, granted_by) VALUES (?,?,?,?,?,?,?)",
                    cleanSeason, roomId, ownerId, 1, RANK1_POINTS, RANK1_REPUTATION, reviewerId);
        } catch (DuplicateKeyException ex) {
            throw new BusinessException("本赛季已经发过榜首奖励了");
        }
        pointService.changeBalance(ownerId, RANK1_POINTS, "reward", "猫舍总榜第一名奖励", null);
        addReputation(ownerId, RANK1_REPUTATION);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roomId", roomId);
        out.put("ownerId", ownerId);
        out.put("ownerName", nicknameOf(ownerId));
        out.put("votes", votes);
        out.put("points", RANK1_POINTS);
        out.put("reputation", RANK1_REPUTATION);
        out.put("season", cleanSeason);
        return out;
    }

    /** 是否是我本人可投的场景（用于前端置灰）：不能投自己。 */
    public boolean canVote(Long userId, long roomId) {
        if (userId == null) return false;
        Map<String, Object> row = requireRoom(roomId);
        if (toInt(row.get("status")) != 2 || toInt(row.get("is_public")) != 1) return false;
        if (((Number) row.get("user_id")).longValue() == userId) return false;
        if (hasVoted(roomId, userId)) return false;
        return remainingVotes(userId) > 0;
    }

    /* ==================== 内部工具 ==================== */

    private long roomId(Map<String, Object> row) { return ((Number) row.get("id")).longValue(); }

    private void requireLogin(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
    }

    private Map<String, Object> requireRoom(long roomId) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", roomId);
        if (rows.isEmpty()) throw new BusinessException(404, "猫咪不存在");
        return rows.get(0);
    }

    private Map<String, Object> requireOwnedRoom(Long userId, long roomId) {
        Map<String, Object> row = requireRoom(roomId);
        if (((Number) row.get("user_id")).longValue() != userId) {
            throw new BusinessException(403, "只能管理自己的猫");
        }
        return row;
    }

    private void lockRoom(long roomId) {
        jdbc.queryForObject("SELECT id FROM cat_rooms WHERE id = ? FOR UPDATE", Long.class, roomId);
    }

    private void lockUser(Long userId) {
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, userId);
    }

    private boolean hasVoted(long roomId, Long voterId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cat_votes WHERE room_id = ? AND voter_id = ?", Integer.class, roomId, voterId);
        return c != null && c > 0;
    }

    private boolean hasAdopted(long roomId, Long adopterId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cat_adoptions WHERE room_id = ? AND adopter_id = ?", Integer.class, roomId, adopterId);
        return c != null && c > 0;
    }

    private boolean isRewarded(String season, long roomId) {
        Integer c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cat_reward_grants WHERE season = ? AND room_id = ?", Integer.class, season, roomId);
        return c != null && c > 0;
    }

    private String nicknameOf(long userId) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT nickname FROM users WHERE id = ?", userId);
        if (rows.isEmpty()) return "神秘蛋蛋";
        Object n = rows.get(0).get("nickname");
        return n == null ? "神秘蛋蛋" : String.valueOf(n);
    }

    private void addReputation(long userId, int delta) {
        // The 0-5 users/user_stats reputation is a review average, not cat-room points.
        jdbc.update("INSERT INTO cat_reputation (user_id, score) VALUES (?, ?) " +
                "ON DUPLICATE KEY UPDATE score = score + VALUES(score)", userId, delta);
    }

    /** 数据库行 → 前端结构。withModeration 为 true 时附带审核字段。 */
    private Map<String, Object> toRoomVO(Map<String, Object> r, boolean withModeration) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("id", r.get("id"));
        vo.put("userId", r.get("user_id"));
        vo.put("name", r.get("name"));
        vo.put("intro", r.get("intro"));
        vo.put("look", parseLook(String.valueOf(r.get("look_json"))));
        vo.put("status", r.get("status"));
        vo.put("votes", r.get("votes"));
        vo.put("adopts", r.get("adopts"));
        vo.put("views", r.get("views"));
        vo.put("isPublic", toInt(r.get("is_public")) == 1);
        vo.put("createdAt", String.valueOf(r.get("created_at")));
        if (withModeration) {
            vo.put("rejectReason", r.get("reject_reason"));
        }
        return vo;
    }
}
