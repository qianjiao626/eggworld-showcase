package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 猫咪公园 · 繁育交互服务（服务端权威，「用户猫上公园」模型）。
 *
 * <p>目录猫两个来源：
 * <ul>
 *   <li>{@code official} 流浪猫（迁移种子，可直接领养、不可繁育）；</li>
 *   <li>{@code user} 用户猫——主人把存档里的猫放到公园（{@code cat.inPark=true}）后，
 *       由 {@link #reconcileFromSave} 在存档回写时投影进 {@code park_cats}
 *       （名字/性别/好感度/成熟度快照随回写自动同步，删猫/带回家自动下架）。
 *       放上公园同样要求好感度 ≥ Lv.3（与繁育门槛同源，2026-10-12 补齐校验）。</li>
 * </ul>
 *
 * <p>繁育资格（全部后端裁决，前端不可绕过）：
 * <ul>
 *   <li><b>双方各自与自己猫的好感度 ≥ Lv.3</b>：目标猫读 {@code park_cats.affinity_level} 快照；
 *       发起猫读发起方存档 {@code save_json}（归属 + 成年 + 好感度三校验）；</li>
 *   <li>双方均须成年（maturity=3）；</li>
 *   <li>48 小时冷却：目标猫（park_cats.last_breed_time）与发起猫
 *       （breeding_requests 中该 uid 最近 accepted 的 handled_at）任一在冷却内都拦截；
 *       同意时事务内 {@code FOR UPDATE} 锁目标猫行并二次复查，防并发连续繁育。
 *       拦下时<b>正常返回 rejected</b>（不能抛异常——事务回滚会吞掉 rejected 标记，2026-10-10 e2e 实测踩坑）。</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class CatParkService {

    /** 繁育所需最低好感度等级（双方各自与自己猫，2026-10-11 由 Lv.2 上调为 Lv.3）。 */
    static final int MIN_BREED_LEVEL = 3;
    /** 繁育所需最低成熟度（3=成年）。 */
    static final int MIN_MATURITY = 3;
    /** 每人最多寄养到公园的猫数（与前端 CAT_PARK_CONFIG.maxCatsInPark 一致）。 */
    static final int MAX_LISTED_PER_USER = 3;
    /** 繁育冷却小时数（48 小时 = 2 天）。 */
    static final int BREED_COOLDOWN_HOURS = 48;
    /** 公园场景固定展示数：2 只系统流浪猫 + 3 只他人用户猫。 */
    static final int SCENE_STRAY_COUNT = 2;
    static final int SCENE_OTHERS_COUNT = 3;

    /** 品种 → 稀有度档（0 普通 / 3 / 4 / 5），与前端 pet-data.js CATS 一致（包级可见供测试断言品种合法）。 */
    static final Map<String, Integer> BREED_RARITY = Map.ofEntries(
            Map.entry("calico", 0), Map.entry("orange", 0), Map.entry("black", 0), Map.entry("white", 0),
            Map.entry("tuxedo", 0), Map.entry("russianblue", 0), Map.entry("tabby", 0), Map.entry("ragdoll", 0),
            Map.entry("munchkin", 3),
            Map.entry("maine", 4), Map.entry("devon", 4), Map.entry("lion", 4),
            Map.entry("sphynx", 5), Map.entry("bengal", 5));
    /** 各稀有度档的品种池（后代随机取种）。 */
    private static final Map<Integer, List<String>> RARITY_POOL = Map.of(
            0, List.of("calico", "orange", "black", "white", "tuxedo", "russianblue", "tabby", "ragdoll"),
            3, List.of("munchkin"),
            4, List.of("maine", "devon", "lion"),
            5, List.of("sphynx", "bengal"));
    /** 双亲最高稀有度档 → [普通, 稀有3, 稀有4, 稀有5] 权重（仿前端 BREEDING_TABLE，服务端裁决）。 */
    private static final Map<Integer, int[]> RARITY_WEIGHTS = Map.of(
            0, new int[]{85, 12, 3, 0},
            3, new int[]{40, 45, 15, 0},
            4, new int[]{10, 25, 45, 20},
            5, new int[]{5, 10, 25, 60});

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String CAT_COLS =
            "SELECT c.id, c.source, c.breed_cat_id, c.name, c.gender, c.category, c.owner_user_id, c.cat_uid, "
                    + "c.adoptable, c.can_breed, c.affinity_level, c.maturity_level, c.last_breed_time, c.parent_uids, "
                    + "u.nickname AS owner_nickname "
                    + "FROM park_cats c LEFT JOIN users u ON u.id = c.owner_user_id ";

    private final JdbcTemplate jdbc;
    private final NotificationService notificationService;

    /* ================= 存档投影（reconcile） ================= */

    /**
     * 存档回写时同步公园名录（与 saveState 同事务）：
     * inPark=true 且合法的猫 upsert（刷新快照、复活下架行、保留 last_breed_time）；
     * 不再在公园的猫置 deleted=1（冷却权威保留，重新上架不重置，防绕过）。
     * 解析失败静默跳过——公园投影失败不应阻断存档保存。
     */
    @SuppressWarnings("unchecked")
    public void reconcileFromSave(Long userId, Map<String, Object> save) {
        if (userId == null || save == null) return;
        List<Map<String, Object>> cats;
        try {
            Object raw = save.get("cats");
            if (!(raw instanceof List)) return;
            cats = (List<Map<String, Object>>) raw;
        } catch (Exception e) {
            return;
        }

        Set<String> keepUids = new HashSet<>();
        int listed = 0;
        for (Map<String, Object> cat : cats) {
            if (cat == null || !Boolean.TRUE.equals(cat.get("inPark"))) continue;
            if (listed >= MAX_LISTED_PER_USER) break;   // 超上限的忽略（前端按钮已限 3）
            String uid = str(cat.get("uid"), 64);
            String breed = str(cat.get("catId"), 30);
            String name = str(cat.get("name"), 30);
            if (uid == null || breed == null || name == null) continue;
            String gender = "female".equals(cat.get("gender")) ? "female" : "male";
            int affinity = clampInt(cat.get("level"), 1, 10, 1);
            // 放上公园同样要求好感度 ≥ Lv.3（与繁育门槛同源，2026-10-12 补齐）。
            // 前端按钮已拦，这里兜住旧客户端与本地篡改存档：不达标不投影；又因不进
            // keepUids，下方下架语句会把门槛上线前投影过的同名猫置 deleted=1。
            if (affinity < MIN_BREED_LEVEL) continue;
            int maturity = clampInt(cat.get("maturityLevel"), 1, 3, 1);
            String parents = jsonOf(cat.get("parentUids"), 500);
            listed++;
            keepUids.add(uid);
            jdbc.update("INSERT INTO park_cats (source, breed_cat_id, name, gender, category, owner_user_id, cat_uid, "
                            + "adoptable, can_breed, affinity_level, maturity_level, parent_uids, listed_at) "
                            + "VALUES ('user', ?, ?, ?, 'user', ?, ?, 0, 1, ?, ?, ?, NOW()) "
                            + "ON DUPLICATE KEY UPDATE breed_cat_id = VALUES(breed_cat_id), name = VALUES(name), "
                            + "gender = VALUES(gender), category = 'user', adoptable = 0, can_breed = 1, "
                            + "affinity_level = VALUES(affinity_level), maturity_level = VALUES(maturity_level), "
                            + "parent_uids = VALUES(parent_uids), deleted = 0",
                    breed, name, gender, userId, uid, affinity, maturity, parents);
        }

        // 下架：本次不再在公园的用户猫（含被删除/送走的）；official 流浪猫不受影响
        if (keepUids.isEmpty()) {
            jdbc.update("UPDATE park_cats SET deleted = 1 WHERE owner_user_id = ? AND source = 'user' AND deleted = 0", userId);
        } else {
            jdbc.update("UPDATE park_cats SET deleted = 1 WHERE owner_user_id = ? AND source = 'user' AND deleted = 0 "
                    + "AND cat_uid NOT IN (" + placeholders(keepUids.size()) + ")",
                    concat(userId, keepUids.toArray()));
        }
    }

    /* ================= 目录猫列表 ================= */

    /** official 流浪猫 + 全部用户寄养猫（含自己的，标 isMine）+ 冷却与繁育资格。 */
    public List<Map<String, Object>> listCats(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = jdbc.queryForList(CAT_COLS + "WHERE c.deleted = 0 ORDER BY c.id");
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) out.add(toCatVO(r, userId, now));
        return out;
    }

    /* ================= 公园场景展示抽取 ================= */

    /**
     * 公园 canvas 场景固定 5 只：2 只系统流浪猫（official 种子，固定展示）
     * + 至多 3 只他人用户寄养猫（自己的猫不出现在自己的场景里，仅对其他用户可见）。
     *
     * <p>他人猫抽取规则（服务端裁决）：
     * ① 把所有「在公园且不属于当前用户」的猫按归属用户分组（用户池）；
     * ② 从用户池随机抽至多 {@link #SCENE_OTHERS_COUNT} 个<b>不同</b>用户（天然去重，
     *    同一用户的多只猫不会同屏）；
     * ③ 每个抽中用户从其公园猫集合随机取 1 只（仅 1 只时直接选中）。
     *
     * <p>边界：公园内其他用户不足 3 人时按实际人数返回（可为 0）；
     * 用户猫被带回家（deleted=1）后不再进入候选池，下次拉取即被替换。
     */
    public List<Map<String, Object>> sceneCats(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> out = new ArrayList<>();

        // 1) 流浪猫：固定取前 SCENE_STRAY_COUNT 只（种子 id 升序，顺序稳定不动）
        List<Map<String, Object>> strayRows = jdbc.queryForList(
                CAT_COLS + "WHERE c.deleted = 0 AND c.source = 'official' ORDER BY c.id LIMIT " + SCENE_STRAY_COUNT);
        for (Map<String, Object> r : strayRows) out.add(toCatVO(r, userId, now));

        // 2) 他人用户猫池：排除当前用户自己的猫（SQL 层裁决，前端不可绕过）
        List<Map<String, Object>> userRows = jdbc.queryForList(
                CAT_COLS + "WHERE c.deleted = 0 AND c.source = 'user' AND c.owner_user_id IS NOT NULL "
                        + "AND c.owner_user_id <> ? ORDER BY c.id", userId);
        Map<Long, List<Map<String, Object>>> byOwner = new LinkedHashMap<>();
        for (Map<String, Object> r : userRows) {
            Long owner = ((Number) r.get("owner_user_id")).longValue();
            byOwner.computeIfAbsent(owner, k -> new ArrayList<>()).add(r);
        }

        // 3) 随机抽不同用户，每人随机 1 只
        List<Long> owners = new ArrayList<>(byOwner.keySet());
        Collections.shuffle(owners, ThreadLocalRandom.current());
        int take = Math.min(SCENE_OTHERS_COUNT, owners.size());
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        for (int i = 0; i < take; i++) {
            List<Map<String, Object>> pool = byOwner.get(owners.get(i));
            Map<String, Object> picked = pool.get(rnd.nextInt(pool.size()));
            out.add(toCatVO(picked, userId, now));
        }
        return out;
    }

    /** 目录猫行 → 前端 VO（含冷却/繁育资格/我的视角标记）。 */
    private Map<String, Object> toCatVO(Map<String, Object> r, Long userId, LocalDateTime now) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("id", ((Number) r.get("id")).longValue());
        vo.put("source", r.get("source"));
        vo.put("breedCatId", r.get("breed_cat_id"));
        vo.put("name", r.get("name"));
        vo.put("gender", r.get("gender"));
        vo.put("category", r.get("category"));
        vo.put("adoptable", toInt(r.get("adoptable")) == 1);
        Long ownerId = r.get("owner_user_id") == null ? null : ((Number) r.get("owner_user_id")).longValue();
        vo.put("ownerUserId", ownerId);
        vo.put("ownerNickname", r.get("owner_nickname"));
        vo.put("isMine", ownerId != null && ownerId.equals(userId));

        long remainingMs = cooldownRemainingMs(toLdt(r.get("last_breed_time")), now);
        vo.put("cooldownRemainingMs", remainingMs);
        vo.put("inCooldown", remainingMs > 0);

        // 繁育资格：用户猫 + 可繁育 + 主人好感度≥Lv.3 + 成年 + 不在冷却 + 不是自己的猫
        boolean userCat = "user".equals(r.get("source"));
        boolean othersCat = ownerId != null && !ownerId.equals(userId);
        int affinity = toInt(r.get("affinity_level"));
        int maturity = toInt(r.get("maturity_level"));
        vo.put("affinityLevel", affinity);
        vo.put("maturityLevel", maturity);
        boolean breedable = userCat && othersCat && toInt(r.get("can_breed")) == 1
                && affinity >= MIN_BREED_LEVEL && maturity >= MIN_MATURITY && remainingMs == 0;
        vo.put("breedable", breedable);
        String blockedReason = null;
        if (userCat && othersCat && !breedable) {
            if (affinity < MIN_BREED_LEVEL) blockedReason = "主人好感度不足 Lv." + MIN_BREED_LEVEL;
            else if (maturity < MIN_MATURITY) blockedReason = "还未成年";
            else if (remainingMs > 0) blockedReason = "繁育冷却中";
        }
        vo.put("blockedReason", blockedReason);
        return vo;
    }

    /* ================= 流浪猫领养 ================= */

    /** 领养流浪猫：仅 official stray 放行，无前置条件。 */
    public Map<String, Object> adoptStray(Long userId, Long parkCatId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        Map<String, Object> cat = loadCat(parkCatId);
        if (!"stray".equals(cat.get("category")) || toInt(cat.get("adoptable")) != 1) {
            throw new BusinessException(403, "这只猫咪不是流浪猫，不能直接领养哦～");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("parkCatId", parkCatId);
        out.put("breedCatId", cat.get("breed_cat_id"));
        out.put("name", cat.get("name"));
        out.put("gender", cat.get("gender"));
        out.put("adopted", true);
        return out;
    }

    /* ================= 繁育申请 ================= */

    /**
     * 发起繁育申请（只能对他人的用户寄养猫）。
     * 目标猫门槛读名录快照（主人好感度/成年/冷却）；发起猫门槛读发起方存档（归属/成年/好感度）。
     */
    @Transactional
    public Map<String, Object> createBreedingRequest(Long userId, Long targetCatId, String applicantCatUid) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        if (applicantCatUid == null || applicantCatUid.isBlank()) {
            throw new BusinessException("请选择用于繁育的猫咪");
        }
        Map<String, Object> cat = loadCat(targetCatId);
        if (!"user".equals(cat.get("source"))) {
            throw new BusinessException("流浪猫可以直接领养，平台猫不参与繁育哦～");
        }
        Long ownerId = ownerIdOf(cat);
        if (ownerId == null) throw new BusinessException("这只猫咪暂未开放繁育～");
        if (ownerId.equals(userId)) throw new BusinessException("不能对自己的猫咪发起繁育申请");

        // 目标猫门槛（主人好感度快照 + 成年 + 冷却）
        if (toInt(cat.get("affinity_level")) < MIN_BREED_LEVEL) {
            throw new BusinessException(403, "「" + cat.get("name") + "」和主人的好感度还不到 Lv."
                    + MIN_BREED_LEVEL + "，主人还没准备好让它繁育～");
        }
        if (toInt(cat.get("maturity_level")) < MIN_MATURITY) {
            throw new BusinessException("「" + cat.get("name") + "」还没成年，不能繁育哦～");
        }
        LocalDateTime now = LocalDateTime.now();
        long targetRemaining = cooldownRemainingMs(toLdt(cat.get("last_breed_time")), now);
        if (targetRemaining > 0) {
            throw new BusinessException("「" + cat.get("name") + "」刚繁育过，" + cooldownHint(targetRemaining) + "后才能再次繁育～");
        }

        // 发起猫门槛：服务端读发起方存档校验（归属 + 成年 + 好感度 + 异性），不再只信前端
        Map<String, Object> applicant = findSaveCat(userId, applicantCatUid);
        if (applicant == null) {
            throw new BusinessException(403, "这只繁育猫不在你的猫咪队伍里哦～");
        }
        if (clampInt(applicant.get("maturityLevel"), 1, 3, 1) < MIN_MATURITY) {
            throw new BusinessException("你的「" + applicant.get("name") + "」还没成年，不能繁育哦～");
        }
        if (clampInt(applicant.get("level"), 1, 10, 1) < MIN_BREED_LEVEL) {
            throw new BusinessException(403, "你和「" + applicant.get("name") + "」的好感度还不到 Lv."
                    + MIN_BREED_LEVEL + "，先多喂食、玩耍、陪伴培养感情吧～");
        }
        // 异性校验：繁育双方必须一公一母
        if (String.valueOf(applicant.get("gender")).equals(String.valueOf(cat.get("gender")))) {
            throw new BusinessException("繁育需要一公一母哦，换一只异性猫咪吧～");
        }
        // 近亲检查（尽力而为）：双方 3 代内祖先 uid 有交集则拦截；祖先未登记则查不到、放行
        if (isInbreeding(userId, applicantCatUid, (String) cat.get("cat_uid"), applicant, (String) cat.get("parent_uids"))) {
            throw new BusinessException("这两只猫咪是三代以内的近亲，不能繁育哦～");
        }
        long applicantRemaining = applicantCatCooldownMs(applicantCatUid, now);
        if (applicantRemaining > 0) {
            throw new BusinessException("你的「" + applicant.get("name") + "」刚繁育过，"
                    + cooldownHint(applicantRemaining) + "后才能再次繁育～");
        }

        Long dup = jdbc.queryForObject(
                "SELECT COUNT(*) FROM breeding_requests WHERE requester_id = ? AND target_cat_id = ? "
                        + "AND applicant_cat_uid = ? AND status = 'pending'",
                Long.class, userId, targetCatId, applicantCatUid);
        if (dup != null && dup > 0) throw new BusinessException("你已经向这只猫咪发过申请，等待对方回应中～");

        jdbc.update("INSERT INTO breeding_requests (requester_id, target_cat_id, owner_user_id, applicant_cat_uid, status) "
                + "VALUES (?, ?, ?, ?, 'pending')", userId, targetCatId, ownerId, applicantCatUid);

        notificationService.notify(ownerId,
                "🐱 " + nickname(userId) + " 想和你的猫咪「" + cat.get("name") + "」繁育，去猫咪公园处理～", "breeding");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "pending");
        out.put("targetCatName", cat.get("name"));
        out.put("ownerNickname", cat.get("owner_nickname"));
        List<Map<String, Object>> mine = jdbc.queryForList(
                "SELECT id FROM breeding_requests WHERE requester_id = ? AND target_cat_id = ? "
                        + "AND applicant_cat_uid = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
                userId, targetCatId, applicantCatUid);
        out.put("requestId", mine.isEmpty() ? null : ((Number) mine.get(0).get("id")).longValue());
        return out;
    }

    /** 我收到的申请（归属用户视角，pending 优先）。 */
    public List<Map<String, Object>> listReceivedRequests(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return queryRequests(
                "SELECT r.id, r.requester_id, r.target_cat_id, r.owner_user_id, r.applicant_cat_uid, r.status, "
                        + "r.offspring_breed_id, r.owner_offspring_breed_id, r.claimed_at, r.owner_claimed_at, "
                        + "r.handled_at, r.created_at, ru.nickname AS requester_nickname, "
                        + "pc.name AS target_cat_name "
                        + "FROM breeding_requests r LEFT JOIN users ru ON ru.id = r.requester_id "
                        + "LEFT JOIN park_cats pc ON pc.id = r.target_cat_id "
                        + "WHERE r.owner_user_id = ? ORDER BY (r.status = 'pending') DESC, r.created_at DESC", userId);
    }

    /** 我发起的申请（发起方视角，看结果 + 领取后代）。 */
    public List<Map<String, Object>> listSentRequests(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return queryRequests(
                "SELECT r.id, r.requester_id, r.target_cat_id, r.owner_user_id, r.applicant_cat_uid, r.status, "
                        + "r.offspring_breed_id, r.owner_offspring_breed_id, r.claimed_at, r.owner_claimed_at, "
                        + "r.handled_at, r.created_at, ru.nickname AS requester_nickname, "
                        + "pc.name AS target_cat_name "
                        + "FROM breeding_requests r LEFT JOIN users ru ON ru.id = r.requester_id "
                        + "LEFT JOIN park_cats pc ON pc.id = r.target_cat_id "
                        + "WHERE r.requester_id = ? ORDER BY r.created_at DESC", userId);
    }

    /**
     * 同意繁育：锁目标猫行 + 二次复查冷却（防并发）→ 裁决后代 → 回写冷却 → 通知发起方。
     * 冷却复查拦下时正常返回 rejected（不抛异常，见类注释）。
     */
    @Transactional
    public Map<String, Object> acceptRequest(Long userId, Long requestId) {
        BreedingRequest r = loadRequest(requestId);
        if (r == null) throw new BusinessException(404, "申请不存在");
        if (!userId.equals(r.ownerUserId)) throw new BusinessException(403, "只有猫咪归属者才能处理该申请");
        if (!"pending".equals(r.status)) throw new BusinessException("该申请已被处理");

        LocalDateTime now = LocalDateTime.now();
        Map<String, Object> cat = lockCatForUpdate(r.targetCatId);
        if (toInt(cat.get("deleted")) == 1) {
            jdbc.update("UPDATE breeding_requests SET status = 'rejected', handled_at = ? WHERE id = ?", now, requestId);
            notificationService.notify(r.requesterId, "💤 目标猫咪已离开公园，你的繁育申请已自动拒绝～", "breeding_result");
            return blockedResult(requestId, "这只猫咪已离开公园，申请已自动拒绝");
        }
        long targetRemaining = cooldownRemainingMs(toLdt(cat.get("last_breed_time")), now);
        if (targetRemaining > 0) {
            jdbc.update("UPDATE breeding_requests SET status = 'rejected', handled_at = ? WHERE id = ?", now, requestId);
            notificationService.notify(r.requesterId, "💤 你的繁育申请因猫咪进入冷却期未能通过，稍后再试～", "breeding_result");
            return blockedResult(requestId, "「" + cat.get("name") + "」正在繁育冷却中，申请已自动拒绝");
        }
        long applicantRemaining = applicantCatCooldownMs(r.applicantCatUid, now);
        if (applicantRemaining > 0) {
            jdbc.update("UPDATE breeding_requests SET status = 'rejected', handled_at = ? WHERE id = ?", now, requestId);
            notificationService.notify(r.requesterId, "💤 你的繁育猫咪还在冷却期，申请已自动拒绝～", "breeding_result");
            return blockedResult(requestId, "你的繁育猫咪还在冷却期，申请已自动拒绝");
        }

        // 后代品种服务端裁决：双亲稀有度混合概率，双方各得一只（品种独立裁决）
        String applicantBreed = applicantBreedOf(r);
        String offspring = pickOffspringBreed(applicantBreed, (String) cat.get("breed_cat_id"));
        String ownerOffspring = pickOffspringBreed(applicantBreed, (String) cat.get("breed_cat_id"));
        jdbc.update("UPDATE park_cats SET last_breed_time = ? WHERE id = ?", now, r.targetCatId);
        jdbc.update("UPDATE breeding_requests SET status = 'accepted', offspring_breed_id = ?, "
                        + "owner_offspring_breed_id = ?, handled_at = ? WHERE id = ?",
                offspring, ownerOffspring, now, requestId);

        notificationService.notify(r.requesterId,
                "🎉 " + nickname(userId) + " 同意了繁育申请，你的小猫已就绪，去猫咪公园领取吧～", "breeding_result");
        notificationService.notify(userId,
                "🎉 你同意了繁育申请，你的一只小猫已就绪，去猫咪公园领取吧～", "breeding_result");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", requestId);
        out.put("status", "accepted");
        out.put("offspringBreedId", offspring);
        out.put("ownerOffspringBreedId", ownerOffspring);
        out.put("applicantCatUid", r.applicantCatUid);
        out.put("targetCatName", cat.get("name"));
        return out;
    }

    /** 拒绝繁育：置 rejected + 通知发起方。 */
    @Transactional
    public void rejectRequest(Long userId, Long requestId) {
        BreedingRequest r = loadRequest(requestId);
        if (r == null) throw new BusinessException(404, "申请不存在");
        if (!userId.equals(r.ownerUserId)) throw new BusinessException(403, "只有猫咪归属者才能处理该申请");
        if (!"pending".equals(r.status)) throw new BusinessException("该申请已被处理");

        jdbc.update("UPDATE breeding_requests SET status = 'rejected', handled_at = ? WHERE id = ?",
                LocalDateTime.now(), requestId);
        notificationService.notify(r.requesterId,
                "💔 " + nickname(userId) + " 婉拒了你对「" + catName(r.targetCatId) + "」的繁育申请", "breeding_result");
    }

    /**
     * 领取繁育后代（双方各一只，条件 UPDATE 幂等）：
     * 发起方领 {@code offspring_breed_id}（claimed_at），归属方领 {@code owner_offspring_breed_id}（owner_claimed_at）。
     */
    @Transactional
    public Map<String, Object> claimOffspring(Long userId, Long requestId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT requester_id, owner_user_id, target_cat_id, applicant_cat_uid, status, "
                        + "offspring_breed_id, owner_offspring_breed_id, claimed_at, owner_claimed_at "
                        + "FROM breeding_requests WHERE id = ?", requestId);
        if (rows.isEmpty()) throw new BusinessException(404, "申请不存在");
        Map<String, Object> r = rows.get(0);
        Long requesterId = ((Number) r.get("requester_id")).longValue();
        Long ownerUserId = ((Number) r.get("owner_user_id")).longValue();
        boolean isRequester = userId.equals(requesterId);
        boolean isOwner = userId.equals(ownerUserId);
        if (!isRequester && !isOwner) throw new BusinessException(403, "只有繁育双方才能领取后代");
        if (!"accepted".equals(r.get("status"))) throw new BusinessException("该申请还未通过，暂无后代可领");

        String claimedCol = isRequester ? "claimed_at" : "owner_claimed_at";
        String breedCol = isRequester ? "offspring_breed_id" : "owner_offspring_breed_id";
        if (r.get(claimedCol) != null) throw new BusinessException("你的小猫已领取，无需重复操作");

        LocalDateTime now = LocalDateTime.now();
        int updated = jdbc.update("UPDATE breeding_requests SET " + claimedCol + " = ? WHERE id = ? AND " + claimedCol + " IS NULL",
                now, requestId);
        if (updated == 0) throw new BusinessException("你的小猫已领取，无需重复操作");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", requestId);
        out.put("offspringBreedId", r.get(breedCol));
        out.put("applicantCatUid", r.get("applicant_cat_uid"));
        out.put("targetCatName", catName(((Number) r.get("target_cat_id")).longValue()));
        out.put("role", isRequester ? "requester" : "owner");
        return out;
    }

    /* ================= 私有工具 ================= */

    /** 冷却复查拦下时的正常返回（不抛异常，避免事务回滚吞掉 rejected 标记）。 */
    private static Map<String, Object> blockedResult(Long requestId, String msg) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", requestId);
        out.put("status", "rejected");
        out.put("blockedByCooldown", true);
        out.put("msg", msg);
        return out;
    }

    /** 读发起方存档取繁育猫品种（找不到返回 null，裁决时回退目标猫品种）。 */
    private String applicantBreedOf(BreedingRequest r) {
        Map<String, Object> cat = findSaveCat(r.requesterId, r.applicantCatUid);
        if (cat == null || cat.get("catId") == null) return null;
        return String.valueOf(cat.get("catId"));
    }

    /**
     * 双亲后代品种裁决（服务端权威）：取双亲最高稀有度档，按 {@link #RARITY_WEIGHTS} 抽稀有度，
     * 再从对应品种池随机取种；同品种时 50% 出父母品种（仿前端 BREEDING_TABLE.sameBreedChance）。
     */
    static String pickOffspringBreed(String parentA, String parentB) {
        java.util.Random rnd = new java.util.Random();
        if (parentA == null) return parentB;
        if (parentB == null) return parentA;
        if (parentA.equals(parentB) && rnd.nextFloat() < 0.5f) return parentA;
        int ra = BREED_RARITY.getOrDefault(parentA, 0);
        int rb = BREED_RARITY.getOrDefault(parentB, 0);
        int top = Math.max(ra, rb);
        int[] w = RARITY_WEIGHTS.getOrDefault(top, RARITY_WEIGHTS.get(0));
        int total = w[0] + w[1] + w[2] + w[3];
        int roll = rnd.nextInt(total);
        int rarity;
        if (roll < w[0]) rarity = 0;
        else if (roll < w[0] + w[1]) rarity = 3;
        else if (roll < w[0] + w[1] + w[2]) rarity = 4;
        else rarity = 5;
        List<String> pool = RARITY_POOL.getOrDefault(rarity, RARITY_POOL.get(0));
        return pool.get(rnd.nextInt(pool.size()));
    }

    private Map<String, Object> loadCat(Long parkCatId) {
        List<Map<String, Object>> rows = jdbc.queryForList(CAT_COLS + "WHERE c.id = ? AND c.deleted = 0", parkCatId);
        if (rows.isEmpty()) throw new BusinessException(404, "猫咪不存在");
        return rows.get(0);
    }

    private Map<String, Object> lockCatForUpdate(Long parkCatId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, breed_cat_id, name, gender, source, owner_user_id, can_breed, affinity_level, "
                        + "maturity_level, last_breed_time, deleted FROM park_cats WHERE id = ? FOR UPDATE", parkCatId);
        if (rows.isEmpty()) throw new BusinessException(404, "猫咪不存在");
        return rows.get(0);
    }

    private String catName(Long parkCatId) {
        List<Object> names = jdbc.queryForList("SELECT name FROM park_cats WHERE id = ?", Object.class, parkCatId);
        return names.isEmpty() ? "猫咪" : String.valueOf(names.get(0));
    }

    /** 从发起方存档 save_json 里按 uid 找猫（归属即"存在于本人存档"）。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> findSaveCat(Long userId, String uid) {
        Map<String, Object> cat = loadSaveCats(userId).get(uid);
        return cat;
    }

    /** 加载发起方存档全部猫，按 uid 建索引（解析失败抛业务异常提示重新同步）。 */
    @SuppressWarnings("unchecked")
    private Map<String, Map<String, Object>> loadSaveCats(Long userId) {
        Map<String, Map<String, Object>> byUid = new LinkedHashMap<>();
        List<Object> raws = jdbc.queryForList(
                "SELECT save_json FROM cat_cabin_saves WHERE user_id = ?", Object.class, userId);
        if (raws.isEmpty() || raws.get(0) == null) return byUid;
        try {
            Map<String, Object> save = MAPPER.readValue(String.valueOf(raws.get(0)), Map.class);
            Object cats = save.get("cats");
            if (!(cats instanceof List)) return byUid;
            for (Object o : (List<Object>) cats) {
                if (o instanceof Map) {
                    Object u = ((Map<String, Object>) o).get("uid");
                    if (u != null) byUid.put(String.valueOf(u), (Map<String, Object>) o);
                }
            }
            return byUid;
        } catch (Exception e) {
            throw new BusinessException("你的存档数据异常，请先重新进入猫咪小屋同步后再试");
        }
    }

    /**
     * 近亲检查（三代以内，尽力而为）：分别求双方 3 代祖先 uid 集合，有交集即判定近亲。
     * 族谱来源 = park_cats.parent_uids（上公园的猫）+ 发起方存档 parentUids（发起猫及其在本人档里的祖先）。
     * 祖先未登记（从未上公园、也不在发起方存档）则查不到 → 不误判，放行。
     */
    @SuppressWarnings("unchecked")
    boolean isInbreeding(Long requesterId, String applicantUid, String targetUid,
                         Map<String, Object> applicantCat, String targetParentUidsJson) {
        if (applicantUid == null || targetUid == null) return false;
        if (applicantUid.equals(targetUid)) return true;
        // 族谱图：uid -> parent uid 列表
        Map<String, List<String>> lineage = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT cat_uid, parent_uids FROM park_cats WHERE cat_uid IS NOT NULL")) {
            List<String> ps = parseUidList(row.get("parent_uids"));
            if (!ps.isEmpty()) lineage.put(String.valueOf(row.get("cat_uid")), ps);
        }
        // 发起方存档补全（发起猫 + 其祖先若在本人档）
        for (Map<String, Object> c : loadSaveCats(requesterId).values()) {
            Object u = c.get("uid");
            Object pu = c.get("parentUids");
            if (u == null || !(pu instanceof List)) continue;
            List<String> ps = new ArrayList<>();
            for (Object x : (List<Object>) pu) if (x != null) ps.add(String.valueOf(x));
            if (!ps.isEmpty()) lineage.putIfAbsent(String.valueOf(u), ps);
        }
        if (applicantCat != null && applicantCat.get("parentUids") instanceof List) {
            List<String> ps = new ArrayList<>();
            for (Object x : (List<Object>) applicantCat.get("parentUids")) if (x != null) ps.add(String.valueOf(x));
            if (!ps.isEmpty()) lineage.put(applicantUid, ps);
        }
        List<String> targetParents = parseUidList(targetParentUidsJson);
        if (!targetParents.isEmpty()) lineage.put(targetUid, targetParents);

        Set<String> aAnc = ancestors(applicantUid, lineage, 3);
        Set<String> bAnc = ancestors(targetUid, lineage, 3);
        if (aAnc.isEmpty() || bAnc.isEmpty()) return false;
        for (String s : aAnc) if (bAnc.contains(s)) return true;
        return false;
    }

    /** BFS 求 upToGen 代祖先 uid 集合（不含自身）。 */
    private static Set<String> ancestors(String root, Map<String, List<String>> lineage, int upToGen) {
        Set<String> seen = new HashSet<>();
        Set<String> frontier = new HashSet<>();
        List<String> first = lineage.get(root);
        if (first != null) frontier.addAll(first);
        for (int gen = 1; gen <= upToGen && !frontier.isEmpty(); gen++) {
            Set<String> next = new HashSet<>();
            for (String uid : frontier) {
                if (seen.add(uid)) {
                    List<String> ps = lineage.get(uid);
                    if (ps != null) next.addAll(ps);
                }
            }
            frontier = next;
        }
        return seen;
    }

    /** parent_uids JSON 字符串 → uid 列表（解析失败返回空）。 */
    @SuppressWarnings("unchecked")
    private static List<String> parseUidList(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) return out;
        try {
            for (Object x : MAPPER.readValue(String.valueOf(raw), List.class)) {
                if (x != null) out.add(String.valueOf(x));
            }
        } catch (Exception ignored) { /* 非 JSON 或空 */ }
        return out;
    }

    private long applicantCatCooldownMs(String applicantCatUid, LocalDateTime now) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT MAX(handled_at) AS last_handled FROM breeding_requests "
                        + "WHERE applicant_cat_uid = ? AND status = 'accepted'", applicantCatUid);
        if (rows.isEmpty()) return 0;
        return cooldownRemainingMs(toLdt(rows.get(0).get("last_handled")), now);
    }

    private List<Map<String, Object>> queryRequests(String sql, Long userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, userId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> vo = new LinkedHashMap<>();
            vo.put("id", ((Number) r.get("id")).longValue());
            vo.put("requesterId", ((Number) r.get("requester_id")).longValue());
            vo.put("targetCatId", ((Number) r.get("target_cat_id")).longValue());
            vo.put("ownerUserId", ((Number) r.get("owner_user_id")).longValue());
            vo.put("applicantCatUid", r.get("applicant_cat_uid"));
            vo.put("status", r.get("status"));
            vo.put("offspringBreedId", r.get("offspring_breed_id"));
            vo.put("ownerOffspringBreedId", r.get("owner_offspring_breed_id"));
            vo.put("claimedAt", r.get("claimed_at"));
            vo.put("ownerClaimedAt", r.get("owner_claimed_at"));
            vo.put("handledAt", r.get("handled_at"));
            vo.put("createdAt", r.get("created_at"));
            vo.put("requesterNickname", r.get("requester_nickname"));
            vo.put("targetCatName", r.get("target_cat_name"));
            out.add(vo);
        }
        return out;
    }

    private String nickname(Long userId) {
        if (userId == null) return "已注销";
        List<Object> names = jdbc.queryForList("SELECT nickname FROM users WHERE id = ?", Object.class, userId);
        return names.isEmpty() ? "已注销" : String.valueOf(names.get(0));
    }

    private Long ownerIdOf(Map<String, Object> cat) {
        return cat.get("owner_user_id") == null ? null : ((Number) cat.get("owner_user_id")).longValue();
    }

    private static long cooldownRemainingMs(LocalDateTime lastBreed, LocalDateTime now) {
        if (lastBreed == null) return 0;
        return Math.max(0, toEpochMs(lastBreed.plusHours(BREED_COOLDOWN_HOURS)) - toEpochMs(now));
    }

    private static long toEpochMs(LocalDateTime ldt) {
        return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private static String cooldownHint(long remainingMs) {
        long hours = (remainingMs + 3600_000 - 1) / 3600_000;
        if (hours >= 24) {
            long days = hours / 24, remH = hours % 24;
            return remH > 0 ? days + " 天 " + remH + " 小时" : days + " 天";
        }
        return hours + " 小时";
    }

    private static String str(Object v, int maxLen) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equals(s) || "undefined".equals(s)) return null;
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }

    private static int clampInt(Object v, int min, int max, int def) {
        if (v instanceof Number) {
            int i = ((Number) v).intValue();
            return Math.max(min, Math.min(max, i));
        }
        try {
            int i = Integer.parseInt(String.valueOf(v));
            return Math.max(min, Math.min(max, i));
        } catch (Exception e) {
            return def;
        }
    }

    private static String jsonOf(Object v, int maxLen) {
        if (v == null) return null;
        try {
            String json = MAPPER.writeValueAsString(v);
            return json.length() > maxLen ? null : json;
        } catch (Exception e) {
            return null;
        }
    }

    private static String placeholders(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(i == 0 ? "?" : ",?");
        return sb.toString();
    }

    private static Object[] concat(Long first, Object[] rest) {
        Object[] out = new Object[rest.length + 1];
        out[0] = first;
        System.arraycopy(rest, 0, out, 1, rest.length);
        return out;
    }

    private static int toInt(Object v) {
        return v instanceof Number ? ((Number) v).intValue() : Integer.parseInt(String.valueOf(v));
    }

    private static LocalDateTime toLdt(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof Timestamp ts) return ts.toLocalDateTime();
        return LocalDateTime.parse(String.valueOf(v));
    }

    private record BreedingRequest(Long requesterId, Long targetCatId, Long ownerUserId,
                                   String applicantCatUid, String status) {}

    private BreedingRequest loadRequest(Long requestId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT requester_id, target_cat_id, owner_user_id, applicant_cat_uid, status "
                        + "FROM breeding_requests WHERE id = ?", requestId);
        if (rows.isEmpty()) return null;
        Map<String, Object> r = rows.get(0);
        return new BreedingRequest(
                ((Number) r.get("requester_id")).longValue(),
                ((Number) r.get("target_cat_id")).longValue(),
                ((Number) r.get("owner_user_id")).longValue(),
                (String) r.get("applicant_cat_uid"),
                (String) r.get("status"));
    }
}
