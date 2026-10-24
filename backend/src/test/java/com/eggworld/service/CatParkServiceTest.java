package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * CatParkService 规则校验单测（用户猫上公园模型）：
 * 存档投影 / 双方各自好感度门槛 / 48h 冷却 / 归属越权 / 并发同意 / 流浪猫领养 / 后代幂等领取。
 */
class CatParkServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final NotificationService notificationService = mock(NotificationService.class);
    private final CatParkService service = new CatParkService(jdbc, notificationService);

    /** 公园猫行（含 source/affinity_level/maturity_level 等新列）。 */
    private static Map<String, Object> catRow(Long id, String source, Long ownerId, String uid, String breed,
                                              int affinity, int maturity, LocalDateTime lastBreed) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", id);
        m.put("source", source);
        m.put("breed_cat_id", breed);
        m.put("name", "测试猫");
        m.put("gender", "female");
        m.put("category", "official".equals(source) ? "stray" : "user");
        m.put("owner_user_id", ownerId);
        m.put("cat_uid", uid);
        m.put("adoptable", "official".equals(source) ? 1 : 0);
        m.put("can_breed", "official".equals(source) ? 0 : 1);
        m.put("affinity_level", affinity);
        m.put("maturity_level", maturity);
        m.put("last_breed_time", lastBreed == null ? null : Timestamp.valueOf(lastBreed));
        m.put("owner_nickname", ownerId == null ? null : "归属者");
        return m;
    }

    /** 存档猫（findSaveCat 返回的形态）。 */
    private static Map<String, Object> saveCat(String uid, int level, int maturity) {
        return saveCat(uid, level, maturity, "male");
    }

    private static Map<String, Object> saveCat(String uid, int level, int maturity, String gender) {
        Map<String, Object> m = new HashMap<>();
        m.put("uid", uid);
        m.put("catId", "orange");
        m.put("name", "我的猫");
        m.put("gender", gender);
        m.put("level", level);
        m.put("maturityLevel", maturity);
        return m;
    }

    private void stubSaveCat(Long userId, String uid, int level, int maturity) {
        stubSaveCat(userId, uid, level, maturity, "male");
    }

    private void stubSaveCat(Long userId, String uid, int level, int maturity, String gender) {
        String json = "{\"cats\":[" + "{\"uid\":\"" + uid + "\",\"catId\":\"orange\",\"name\":\"我的猫\","
                + "\"gender\":\"" + gender + "\",\"level\":" + level + ",\"maturityLevel\":" + maturity + "}]}";
        when(jdbc.queryForList(contains("save_json FROM cat_cabin_saves"), eq(Object.class), eq(userId)))
                .thenReturn(List.of(json));
    }

    private static Map<String, Object> requestRow(Long requester, Long target, Long owner, String uid, String status) {
        Map<String, Object> m = new HashMap<>();
        m.put("requester_id", requester);
        m.put("target_cat_id", target);
        m.put("owner_user_id", owner);
        m.put("applicant_cat_uid", uid);
        m.put("status", status);
        return m;
    }

    /* ================= 存档投影 reconcile ================= */

    @Test
    void reconcileUpsertsInParkCatsAndUnlistsRemoved() {
        Map<String, Object> save = new HashMap<>();
        save.put("cats", List.of(
                Map.of("uid", "cat_1", "catId", "orange", "name", "橘", "gender", "male",
                        "level", 3, "maturityLevel", 3, "inPark", true),
                Map.of("uid", "cat_2", "catId", "black", "name", "黑", "inPark", false)));
        service.reconcileFromSave(42L, save);
        // inPark=true 的猫 upsert 进名录
        verify(jdbc).update(contains("INSERT INTO park_cats"), eq("orange"), eq("橘"), eq("male"),
                eq(42L), eq("cat_1"), eq(3), eq(3), isNull());
        // 不再在公园的猫触发下架（含空 keepUids 分支不会发生：这里 cat_2 未上架）
        verify(jdbc).update(contains("SET deleted = 1"), eq(42L), eq("cat_1"));
    }

    @Test
    void reconcileIgnoresCatsBeyondThreePerUser() {
        List<Map<String, Object>> cats = new java.util.ArrayList<>();
        for (int i = 0; i < 5; i++) {
            cats.add(Map.of("uid", "u" + i, "catId", "orange", "name", "n", "gender", "male",
                    "level", 3, "maturityLevel", 3, "inPark", true));
        }
        Map<String, Object> save = new HashMap<>();
        save.put("cats", cats);
        service.reconcileFromSave(42L, save);
        // 每人最多 3 只：只 upsert 前 3 次
        verify(jdbc, times(3)).update(contains("INSERT INTO park_cats"), any(), any(), any(),
                any(), any(), any(), any(), any());
    }

    @Test
    void reconcileSkipsSubLevel3CatsAndUnlistsPreviouslyProjectedOnes() {
        // 2026-10-12 门槛：放上公园同样要求好感度 ≥ Lv.3（与繁育同源）。
        // 低等级猫不投影；且不进 keepUids → 下架语句覆盖它，
        // 门槛上线前（旧客户端）已投影上名录的猫会被自动下架。
        Map<String, Object> save = new HashMap<>();
        save.put("cats", List.of(
                Map.of("uid", "cat_low", "catId", "orange", "name", "橘", "gender", "male",
                        "level", 2, "maturityLevel", 2, "inPark", true),
                Map.of("uid", "cat_ok", "catId", "black", "name", "黑", "gender", "male",
                        "level", 3, "maturityLevel", 3, "inPark", true)));
        service.reconcileFromSave(42L, save);
        verify(jdbc, times(1)).update(contains("INSERT INTO park_cats"), any(), any(), any(),
                any(), any(), any(), any(), any());
        verify(jdbc).update(contains("INSERT INTO park_cats"), eq("black"), eq("黑"), eq("male"),
                eq(42L), eq("cat_ok"), eq(3), eq(3), isNull());
        // 下架按「不在 keepUids」执行：cat_low 不豁免
        verify(jdbc).update(contains("SET deleted = 1"), eq(42L), eq("cat_ok"));
    }

    @Test
    void reconcileSurvivesGarbageSave() {
        assertDoesNotThrow(() -> service.reconcileFromSave(42L, null));
        assertDoesNotThrow(() -> service.reconcileFromSave(42L, new HashMap<>(Map.of("cats", "not-a-list"))));
        assertDoesNotThrow(() -> service.reconcileFromSave(null, new HashMap<>(Map.of("cats", List.of()))));
    }

    /* ================= 公园场景抽取 sceneCats ================= */

    /** 流浪猫种子行（official，固定 2 只）。 */
    private static Map<String, Object> strayRow(long id, String breed) {
        return catRow(id, "official", null, null, breed, 1, 1, null);
    }

    @Test
    void sceneReturnsTwoStraysPlusThreeDistinctOwnersOneCatEach() {
        when(jdbc.queryForList(contains("c.source = 'official'")))
                .thenReturn(new java.util.ArrayList<>(List.of(strayRow(1, "tabby"), strayRow(2, "black"))));
        // 用户池：u99 有 3 只、u98 有 1 只、u97 有 2 只、u96 有 1 只（共 4 个不同用户）
        List<Map<String, Object>> pool = new java.util.ArrayList<>();
        for (int i = 0; i < 3; i++) pool.add(catRow(10L + i, "user", 99L, "c99_" + i, "ragdoll", 5, 3, null));
        pool.add(catRow(20L, "user", 98L, "c98", "orange", 4, 3, null));
        for (int i = 0; i < 2; i++) pool.add(catRow(30L + i, "user", 97L, "c97_" + i, "black", 3, 3, null));
        pool.add(catRow(40L, "user", 96L, "c96", "calico", 3, 3, null));
        when(jdbc.queryForList(contains("c.owner_user_id <> ?"), eq(42L))).thenReturn(pool);

        // 多次抽取都应满足：2 流浪 + 恰好 3 只他人猫、且归属用户互不相同
        for (int round = 0; round < 30; round++) {
            List<Map<String, Object>> scene = service.sceneCats(42L);
            assertEquals(5, scene.size(), "场景固定 5 只");
            assertEquals(2, scene.stream().filter(c -> "official".equals(c.get("source"))).count());

            List<Map<String, Object>> others = scene.stream()
                    .filter(c -> "user".equals(c.get("source"))).toList();
            assertEquals(3, others.size());
            long distinctOwners = others.stream().map(c -> c.get("ownerUserId")).distinct().count();
            assertEquals(3, distinctOwners, "同一用户的多只猫不得同屏（用户去重）");
            assertTrue(others.stream().noneMatch(c -> Boolean.TRUE.equals(c.get("isMine"))));
        }
    }

    @Test
    void sceneSingleCatOwnerIsPickedDirectly() {
        when(jdbc.queryForList(contains("c.source = 'official'")))
                .thenReturn(new java.util.ArrayList<>(List.of(strayRow(1, "tabby"), strayRow(2, "black"))));
        // 只有 1 个其他用户、且他只放了 1 只猫 → 直接选中，无需随机
        when(jdbc.queryForList(contains("c.owner_user_id <> ?"), eq(42L)))
                .thenReturn(new java.util.ArrayList<>(List.of(
                        catRow(20L, "user", 98L, "c98", "orange", 4, 3, null))));

        List<Map<String, Object>> scene = service.sceneCats(42L);
        assertEquals(3, scene.size(), "他人用户不足 3 人时按实际人数返回");
        assertEquals(20L, scene.get(2).get("id"));
        assertEquals(98L, scene.get(2).get("ownerUserId"));
    }

    @Test
    void sceneWithNoOtherUsersShowsOnlyStrays() {
        when(jdbc.queryForList(contains("c.source = 'official'")))
                .thenReturn(new java.util.ArrayList<>(List.of(strayRow(1, "tabby"), strayRow(2, "black"))));
        when(jdbc.queryForList(contains("c.owner_user_id <> ?"), eq(42L)))
                .thenReturn(new java.util.ArrayList<>());   // 公园没有其他用户

        List<Map<String, Object>> scene = service.sceneCats(42L);
        assertEquals(2, scene.size());
        assertTrue(scene.stream().allMatch(c -> "official".equals(c.get("source"))));
    }

    @Test
    void sceneExcludesOwnCatsAtQueryLevel() {
        // 自己的猫（owner=42）不进场景：SQL 层 owner_user_id <> ? 裁决，候选池只含他人猫
        when(jdbc.queryForList(contains("c.source = 'official'")))
                .thenReturn(new java.util.ArrayList<>(List.of(strayRow(1, "tabby"), strayRow(2, "black"))));
        when(jdbc.queryForList(contains("c.owner_user_id <> ?"), eq(42L)))
                .thenReturn(new java.util.ArrayList<>(List.of(
                        catRow(50L, "user", 99L, "c99", "ragdoll", 5, 3, null))));

        List<Map<String, Object>> scene = service.sceneCats(42L);
        assertTrue(scene.stream().noneMatch(c -> Boolean.TRUE.equals(c.get("isMine"))));
        // 校验查询确实带上排除当前用户的参数
        verify(jdbc).queryForList(contains("c.owner_user_id <> ?"), eq(42L));
    }

    @Test
    void sceneRequiresLogin() {
        assertThrows(BusinessException.class, () -> service.sceneCats(null));
    }

    /* ================= 流浪猫领养：无前置、用户猫不可领养 ================= */

    @Test
    void adoptStraySucceedsWithoutPrerequisites() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(1L)))
                .thenReturn(List.of(catRow(1L, "official", null, null, "tabby", 1, 1, null)));
        Map<String, Object> res = service.adoptStray(42L, 1L);
        assertEquals("tabby", res.get("breedCatId"));
        assertEquals(true, res.get("adopted"));
    }

    @Test
    void adoptRejectsUserCat() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.adoptStray(42L, 6L));
        assertEquals(403, ex.getCode());
    }

    @Test
    void adoptRequiresLogin() {
        assertThrows(BusinessException.class, () -> service.adoptStray(null, 1L));
    }

    /* ================= 繁育申请：目标猫门槛（主人好感度快照） ================= */

    @Test
    void createRequestBlockedWhenTargetAffinityBelowLv3() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 1, 3, null)));   // 主人好感 Lv.1
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertEquals(403, ex.getCode());
        assertTrue(ex.getMessage().contains("好感度"));
        verify(jdbc, never()).update(contains("INSERT INTO breeding_requests"), any(), any(), any(), any());
    }

    @Test
    void createRequestBlockedWhenTargetAffinityExactlyLv2() {
        // 回归（2026-10-11 门槛上调 Lv.2→Lv.3）：旧门槛下 Lv.2 可繁育，新门槛必须拦截
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 2, 3, null)));   // 主人好感 Lv.2
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertEquals(403, ex.getCode());
        assertTrue(ex.getMessage().contains("好感度"));
        verify(jdbc, never()).update(contains("INSERT INTO breeding_requests"), any(), any(), any(), any());
    }

    @Test
    void createRequestBlockedWhenTargetNotAdult() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 2, null)));   // 幼猫
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertTrue(ex.getMessage().contains("成年"));
    }

    @Test
    void createRequestBlockedForOfficialCat() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(1L)))
                .thenReturn(List.of(catRow(1L, "official", null, null, "tabby", 1, 1, null)));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 1L, "my_cat"));
        assertTrue(ex.getMessage().contains("流浪猫") || ex.getMessage().contains("平台猫"));
    }

    @Test
    void createRequestBlockedForOwnCat() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 42L, "cat_x", "ragdoll", 5, 3, null)));   // owner=42
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertTrue(ex.getMessage().contains("自己的猫咪"));
    }

    @Test
    void createRequestBlockedWhenTargetInCooldown() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, LocalDateTime.now().minusHours(1))));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertTrue(ex.getMessage().contains("刚繁育过"));
    }

    /* ================= 繁育申请：发起猫门槛（服务端读发起方存档） ================= */

    @Test
    void createRequestBlockedWhenApplicantCatNotInSave() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        when(jdbc.queryForList(contains("save_json FROM cat_cabin_saves"), eq(Object.class), eq(42L)))
                .thenReturn(List.of());   // 无存档
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "ghost_uid"));
        assertEquals(403, ex.getCode());
        assertTrue(ex.getMessage().contains("不在你的猫咪队伍"));
    }

    @Test
    void createRequestBlockedWhenApplicantCatAffinityBelowLv3() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        stubSaveCat(42L, "my_cat", 1, 3);   // 发起猫 Lv.1
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertEquals(403, ex.getCode());
        assertTrue(ex.getMessage().contains("好感度"));
    }

    @Test
    void createRequestBlockedWhenApplicantCatAffinityExactlyLv2() {
        // 回归（2026-10-11 门槛上调 Lv.2→Lv.3）：发起猫 Lv.2 也必须被拦
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        stubSaveCat(42L, "my_cat", 2, 3);   // 发起猫 Lv.2（旧门槛恰好放行，新门槛应拦截）
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertEquals(403, ex.getCode());
        assertTrue(ex.getMessage().contains("好感度"));
    }

    @Test
    void createRequestAllowedWhenBothCatsExactlyLv3() {
        // 新门槛边界：双方 Lv.3 应放行（异性 + 成年 + 无冷却）
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 3, 3, null)));
        stubSaveCat(42L, "my_cat", 3, 3);
        when(jdbc.queryForList(contains("MAX(handled_at)"), eq("my_cat"))).thenReturn(List.of());
        when(jdbc.queryForObject(contains("status = 'pending'"), eq(Long.class), eq(42L), eq(6L), eq("my_cat")))
                .thenReturn(0L);
        Map<String, Object> idRow = new HashMap<>();
        idRow.put("id", 556L);
        when(jdbc.queryForList(contains("SELECT id FROM breeding_requests"), eq(42L), eq(6L), eq("my_cat")))
                .thenReturn(List.of(idRow));
        Map<String, Object> res = service.createBreedingRequest(42L, 6L, "my_cat");
        assertEquals("pending", res.get("status"));
        assertEquals(556L, res.get("requestId"));
    }

    @Test
    void createRequestBlockedWhenApplicantCatNotAdult() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        stubSaveCat(42L, "my_cat", 5, 2);   // 成年不足
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertTrue(ex.getMessage().contains("成年"));
    }

    @Test
    void createRequestBlockedWhenApplicantCatInCooldown() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        stubSaveCat(42L, "my_cat", 5, 3);
        Map<String, Object> cd = new HashMap<>();
        cd.put("last_handled", Timestamp.valueOf(LocalDateTime.now().minusHours(2)));
        when(jdbc.queryForList(contains("MAX(handled_at)"), eq("my_cat"))).thenReturn(List.of(cd));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertTrue(ex.getMessage().contains("刚繁育过"));
    }

    @Test
    void createRequestHappyPathInsertsAndNotifiesOwner() {
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        stubSaveCat(42L, "my_cat", 5, 3);
        when(jdbc.queryForList(contains("MAX(handled_at)"), eq("my_cat"))).thenReturn(List.of());
        when(jdbc.queryForObject(contains("status = 'pending'"), eq(Long.class), eq(42L), eq(6L), eq("my_cat")))
                .thenReturn(0L);
        Map<String, Object> idRow = new HashMap<>();
        idRow.put("id", 555L);
        when(jdbc.queryForList(contains("SELECT id FROM breeding_requests"), eq(42L), eq(6L), eq("my_cat")))
                .thenReturn(List.of(idRow));
        Map<String, Object> res = service.createBreedingRequest(42L, 6L, "my_cat");
        assertEquals("pending", res.get("status"));
        assertEquals(555L, res.get("requestId"));
        verify(jdbc).update(contains("INSERT INTO breeding_requests"), eq(42L), eq(6L), eq(99L), eq("my_cat"));
        verify(notificationService).notify(eq(99L), contains("繁育"), eq("breeding"));
    }

    /* ================= 同意：越权 / 冷却复查 / 下架复查 / 后代裁决 ================= */

    @Test
    void acceptRejectsNonOwner() {
        when(jdbc.queryForList(contains("FROM breeding_requests WHERE id = ?"), eq(7L)))
                .thenReturn(List.of(requestRow(42L, 6L, 99L, "my_cat", "pending")));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.acceptRequest(42L, 7L));
        assertEquals(403, ex.getCode());
    }

    @Test
    void acceptRejectsAlreadyHandled() {
        when(jdbc.queryForList(contains("FROM breeding_requests WHERE id = ?"), eq(7L)))
                .thenReturn(List.of(requestRow(42L, 6L, 99L, "my_cat", "accepted")));
        assertThrows(BusinessException.class, () -> service.acceptRequest(99L, 7L));
    }

    @Test
    void acceptAutoRejectsWhenTargetCooldownRecheckFails() {
        // 并发：同意瞬间目标猫 last_breed_time 已被别的同意刷新。
        // 回归：必须正常返回 rejected 而非抛异常——抛异常会让 @Transactional 回滚掉
        // UPDATE status='rejected'，申请永远卡在 pending（2026-10-10 e2e 实测踩坑）。
        when(jdbc.queryForList(contains("FROM breeding_requests WHERE id = ?"), eq(7L)))
                .thenReturn(List.of(requestRow(42L, 6L, 99L, "my_cat", "pending")));
        Map<String, Object> cdCat = catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, LocalDateTime.now().minusHours(1));
        cdCat.put("deleted", 0);
        when(jdbc.queryForList(contains("FROM park_cats WHERE id = ? FOR UPDATE"), eq(6L))).thenReturn(List.of(cdCat));
        Map<String, Object> res = service.acceptRequest(99L, 7L);
        assertEquals("rejected", res.get("status"));
        assertEquals(true, res.get("blockedByCooldown"));
        verify(jdbc).update(contains("SET status = 'rejected'"), any(LocalDateTime.class), eq(7L));
        verify(notificationService).notify(eq(42L), contains("冷却"), eq("breeding_result"));
        verify(jdbc, never()).update(contains("SET status = 'accepted'"), any(), any(), any());
    }

    @Test
    void acceptAutoRejectsWhenTargetCatDelisted() {
        // 回归：目标猫中途离开公园（deleted=1），同意应自动拒绝而非继续繁育
        when(jdbc.queryForList(contains("FROM breeding_requests WHERE id = ?"), eq(7L)))
                .thenReturn(List.of(requestRow(42L, 6L, 99L, "my_cat", "pending")));
        Map<String, Object> gone = catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null);
        gone.put("deleted", 1);
        when(jdbc.queryForList(contains("FROM park_cats WHERE id = ? FOR UPDATE"), eq(6L))).thenReturn(List.of(gone));
        Map<String, Object> res = service.acceptRequest(99L, 7L);
        assertEquals("rejected", res.get("status"));
        verify(notificationService).notify(eq(42L), contains("离开公园"), eq("breeding_result"));
    }

    @Test
    void acceptHappyPathAwardsOffspringAndWritesCooldown() {
        when(jdbc.queryForList(contains("FROM breeding_requests WHERE id = ?"), eq(7L)))
                .thenReturn(List.of(requestRow(42L, 6L, 99L, "my_cat", "pending")));
        Map<String, Object> cat = catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null);
        cat.put("deleted", 0);
        when(jdbc.queryForList(contains("FROM park_cats WHERE id = ? FOR UPDATE"), eq(6L))).thenReturn(List.of(cat));
        when(jdbc.queryForList(contains("MAX(handled_at)"), eq("my_cat"))).thenReturn(List.of());
        // 后代裁决读发起方存档取繁育猫品种（orange）
        stubSaveCat(42L, "my_cat", 5, 3);
        Map<String, Object> res = service.acceptRequest(99L, 7L);
        assertEquals("accepted", res.get("status"));
        // 双亲混合裁决：后代品种必须合法（orange×ragdoll 均普通档 → 普通池），且双方各一只
        assertTrue(CatParkService.BREED_RARITY.containsKey((String) res.get("offspringBreedId")),
                "非法后代: " + res.get("offspringBreedId"));
        assertTrue(CatParkService.BREED_RARITY.containsKey((String) res.get("ownerOffspringBreedId")));
        verify(jdbc).update(contains("UPDATE park_cats SET last_breed_time"), any(LocalDateTime.class), eq(6L));
        verify(jdbc).update(contains("SET status = 'accepted'"), any(), any(), any(LocalDateTime.class), eq(7L));
        verify(notificationService).notify(eq(42L), contains("小猫已就绪"), eq("breeding_result"));
        verify(notificationService).notify(eq(99L), contains("小猫已就绪"), eq("breeding_result"));
    }

    /* ================= 拒绝 ================= */

    @Test
    void rejectNonOwnerBlocked() {
        when(jdbc.queryForList(contains("FROM breeding_requests WHERE id = ?"), eq(7L)))
                .thenReturn(List.of(requestRow(42L, 6L, 99L, "my_cat", "pending")));
        assertThrows(BusinessException.class, () -> service.rejectRequest(42L, 7L));
    }

    @Test
    void rejectHappyPathNotifiesRequester() {
        when(jdbc.queryForList(contains("FROM breeding_requests WHERE id = ?"), eq(7L)))
                .thenReturn(List.of(requestRow(42L, 6L, 99L, "my_cat", "pending")));
        service.rejectRequest(99L, 7L);
        verify(jdbc).update(contains("SET status = 'rejected'"), any(LocalDateTime.class), eq(7L));
        verify(notificationService).notify(eq(42L), contains("婉拒"), eq("breeding_result"));
    }

    /* ================= 领取后代：越权 / 双方各一只 / 幂等 ================= */

    private static Map<String, Object> claimRow(Long requester, String status, String offspring, LocalDateTime claimed) {
        Map<String, Object> m = new HashMap<>();
        m.put("requester_id", requester);
        m.put("owner_user_id", 99L);
        m.put("target_cat_id", 6L);
        m.put("applicant_cat_uid", "my_cat");
        m.put("status", status);
        m.put("offspring_breed_id", offspring);
        m.put("owner_offspring_breed_id", "calico");
        m.put("claimed_at", claimed == null ? null : Timestamp.valueOf(claimed));
        m.put("owner_claimed_at", null);
        return m;
    }

    @Test
    void claimBlockedForStranger() {
        when(jdbc.queryForList(contains("owner_offspring_breed_id"), eq(7L)))
                .thenReturn(List.of(claimRow(42L, "accepted", "ragdoll", null)));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.claimOffspring(12345L, 7L));
        assertEquals(403, ex.getCode());
    }

    @Test
    void claimBlockedWhenAlreadyClaimed() {
        when(jdbc.queryForList(contains("owner_offspring_breed_id"), eq(7L)))
                .thenReturn(List.of(claimRow(42L, "accepted", "ragdoll", LocalDateTime.now())));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.claimOffspring(42L, 7L));
        assertTrue(ex.getMessage().contains("已领取"));
    }

    @Test
    void claimHappyPathReturnsOffspring() {
        when(jdbc.queryForList(contains("owner_offspring_breed_id"), eq(7L)))
                .thenReturn(List.of(claimRow(42L, "accepted", "ragdoll", null)));
        when(jdbc.update(contains("SET claimed_at = ?"), any(LocalDateTime.class), eq(7L))).thenReturn(1);
        when(jdbc.queryForList(contains("SELECT name FROM park_cats WHERE id = ?"), eq(Object.class), eq(6L)))
                .thenReturn(List.of("测试猫"));
        Map<String, Object> res = service.claimOffspring(42L, 7L);
        assertEquals("ragdoll", res.get("offspringBreedId"));
        assertEquals("requester", res.get("role"));
        assertEquals("my_cat", res.get("applicantCatUid"));
    }

    @Test
    void ownerClaimReturnsOwnerOffspring() {
        // 双方各一只：归属方（u99）领 owner_offspring_breed_id，走 owner_claimed_at 幂等列
        when(jdbc.queryForList(contains("owner_offspring_breed_id"), eq(7L)))
                .thenReturn(List.of(claimRow(42L, "accepted", "ragdoll", null)));
        when(jdbc.update(contains("SET owner_claimed_at = ?"), any(LocalDateTime.class), eq(7L))).thenReturn(1);
        when(jdbc.queryForList(contains("SELECT name FROM park_cats WHERE id = ?"), eq(Object.class), eq(6L)))
                .thenReturn(List.of("测试猫"));
        Map<String, Object> res = service.claimOffspring(99L, 7L);
        assertEquals("calico", res.get("offspringBreedId"));
        assertEquals("owner", res.get("role"));
    }

    @Test
    void claimRaceLosingUpdateThrows() {
        when(jdbc.queryForList(contains("owner_offspring_breed_id"), eq(7L)))
                .thenReturn(List.of(claimRow(42L, "accepted", "ragdoll", null)));
        when(jdbc.update(contains("SET claimed_at = ?"), any(LocalDateTime.class), eq(7L))).thenReturn(0);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.claimOffspring(42L, 7L));
        assertTrue(ex.getMessage().contains("已领取"));
    }

    /* ================= 异性校验 + 后代裁决 ================= */

    @Test
    void createRequestBlockedWhenSameGender() {
        // 目标猫 female（catRow 默认），发起猫也 female → 同性拦截
        when(jdbc.queryForList(contains("WHERE c.id = ? AND c.deleted = 0"), eq(6L)))
                .thenReturn(List.of(catRow(6L, "user", 99L, "cat_x", "ragdoll", 5, 3, null)));
        stubSaveCat(42L, "my_cat", 5, 3, "female");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBreedingRequest(42L, 6L, "my_cat"));
        assertTrue(ex.getMessage().contains("一公一母"));
    }

    @Test
    void pickOffspringBreedAlwaysReturnsValidBreed() {
        // 双亲混合裁决：任意组合都必须落在品种表内；一方 null 回退另一方
        for (int i = 0; i < 200; i++) {
            assertTrue(CatParkService.BREED_RARITY.containsKey(CatParkService.pickOffspringBreed("orange", "ragdoll")));
            assertTrue(CatParkService.BREED_RARITY.containsKey(CatParkService.pickOffspringBreed("maine", "bengal")));
        }
        assertEquals("orange", CatParkService.pickOffspringBreed(null, "orange"));
        assertEquals("orange", CatParkService.pickOffspringBreed("orange", null));
    }

    /* ================= 近亲检查（三代祖先求交，尽力而为） ================= */

    private static Map<String, Object> lineageRow(String uid, String parentsJson) {
        Map<String, Object> m = new HashMap<>();
        m.put("cat_uid", uid);
        m.put("parent_uids", parentsJson);
        return m;
    }

    @Test
    void inbreedingDetectsSharedAncestorWithinThreeGenerations() {
        // 发起猫 A 的父母 [G1]，目标猫 B 的父母 [G1, G2] → 共享祖先 G1 → 近亲
        when(jdbc.queryForList(contains("SELECT cat_uid, parent_uids FROM park_cats")))
                .thenReturn(List.of(lineageRow("B", "[\"G1\",\"G2\"]")));
        when(jdbc.queryForList(contains("save_json FROM cat_cabin_saves"), eq(Object.class), eq(42L)))
                .thenReturn(List.of());
        Map<String, Object> applicantCat = new HashMap<>();
        applicantCat.put("parentUids", List.of("G1"));
        assertTrue(service.isInbreeding(42L, "A", "B", applicantCat, "[\"G1\",\"G2\"]"));
    }

    @Test
    void inbreedingPassesWhenNoCommonAncestor() {
        when(jdbc.queryForList(contains("SELECT cat_uid, parent_uids FROM park_cats")))
                .thenReturn(List.of(lineageRow("B", "[\"G3\",\"G4\"]")));
        when(jdbc.queryForList(contains("save_json FROM cat_cabin_saves"), eq(Object.class), eq(42L)))
                .thenReturn(List.of());
        Map<String, Object> applicantCat = new HashMap<>();
        applicantCat.put("parentUids", List.of("G1", "G2"));
        assertFalse(service.isInbreeding(42L, "A", "B", applicantCat, "[\"G3\",\"G4\"]"));
    }

    @Test
    void inbreedingPassesWhenLineageUnknown() {
        // 双方都没有可查的族谱（祖先未登记）→ 不误判，放行
        when(jdbc.queryForList(contains("SELECT cat_uid, parent_uids FROM park_cats")))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("save_json FROM cat_cabin_saves"), eq(Object.class), eq(42L)))
                .thenReturn(List.of());
        assertFalse(service.isInbreeding(42L, "A", "B", new HashMap<>(), null));
    }

    @Test
    void inbreedingDetectsSameUid() {
        assertFalse(service.isInbreeding(42L, null, "B", new HashMap<>(), null));
        assertTrue(service.isInbreeding(42L, "same", "same", new HashMap<>(), null));
    }

    @Test
    void inbreedingTracesGrandparentViaParkLineage() {
        // 二代：A 的父母 [P1]，P1 的父母 [G1]（P1 上过公园）；B 的父母 [G1] → A 的祖母的爸爸 = B 的爸爸
        when(jdbc.queryForList(contains("SELECT cat_uid, parent_uids FROM park_cats")))
                .thenReturn(List.of(lineageRow("P1", "[\"G1\"]"), lineageRow("B", "[\"G1\"]")));
        when(jdbc.queryForList(contains("save_json FROM cat_cabin_saves"), eq(Object.class), eq(42L)))
                .thenReturn(List.of());
        Map<String, Object> applicantCat = new HashMap<>();
        applicantCat.put("parentUids", List.of("P1"));
        assertTrue(service.isInbreeding(42L, "A", "B", applicantCat, "[\"G1\"]"));
    }
}
