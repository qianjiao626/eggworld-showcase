package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CatCabinServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PointService pointService = mock(PointService.class);
    private final CatParkService catParkService = mock(CatParkService.class);
    private final CatCabinService service = new CatCabinService(jdbc, pointService, catParkService);

    private static Map<String, Object> saveRow(int version, LocalDate earnDate, int earnedToday) {
        return saveRow(version, earnDate, earnedToday, null, 0, null);
    }

    private static Map<String, Object> saveRow(int version, LocalDate earnDate, int earnedToday,
                                               LocalDate lastCheckin, int streak, LocalDate lastDonate) {
        Map<String, Object> m = new HashMap<>();
        m.put("version", version);
        m.put("earn_date", earnDate);
        m.put("earned_today", earnedToday);
        m.put("last_checkin_date", lastCheckin);
        m.put("checkin_streak", streak);
        m.put("last_donate_date", lastDonate);
        return m;
    }

    /* ---------- getState ---------- */

    @Test
    void getStateReportsMissingWhenNoRow() {
        when(jdbc.queryForList(anyString(), eq(42L))).thenReturn(List.of());
        when(pointService.getBalance(42L)).thenReturn(77);
        Map<String, Object> res = service.getState(42L);
        assertEquals(false, res.get("exists"));
        assertEquals(0, res.get("version"));
        assertNull(res.get("save"));
        assertEquals(77, res.get("coins"));
    }

    @Test
    void getStateOverridesCoinsWithRealBalance() {
        when(jdbc.queryForList(contains("SELECT save_json"), eq(42L)))
                .thenReturn(List.of(Map.of("save_json", "{\"coins\":999999,\"cats\":[]}", "version", 3, "updated_at", "x")));
        when(pointService.getBalance(42L)).thenReturn(120);
        Map<String, Object> res = service.getState(42L);
        assertEquals(true, res.get("exists"));
        assertEquals(3, res.get("version"));
        // 落库 JSON 里的 coins=999999 是伪造值，必须被真实余额覆盖
        assertEquals(120, ((Map<?, ?>) res.get("save")).get("coins"));
        assertEquals(120, res.get("coins"));
    }

    @Test
    void getStateKeepsPlaceholderSaveEmpty() {
        // /earn、/thought 在无档时建的占位空行：必须保持空档语义（不被 coins 伪装成真实存档），
        // 否则前端会整档覆盖本地，导致刚领养的猫丢档（2026-10-11 线上事故）
        when(jdbc.queryForList(contains("SELECT save_json"), eq(42L)))
                .thenReturn(List.of(Map.of("save_json", "{}", "version", 1, "updated_at", "2026-10-11 21:20:00")));
        when(pointService.getBalance(42L)).thenReturn(232);
        Map<String, Object> res = service.getState(42L);
        assertEquals(true, res.get("exists"));
        assertEquals(1, res.get("version"));
        assertTrue(((Map<?, ?>) res.get("save")).isEmpty());
        assertEquals(232, res.get("coins"));
    }

    @Test
    void getStateRequiresLogin() {
        assertThrows(BusinessException.class, () -> service.getState(null));
    }

    /* ---------- saveState ---------- */

    @Test
    void firstSaveInsertsVersionOne() {
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L))).thenReturn(List.of());
        when(pointService.getBalance(42L)).thenReturn(50);
        Map<String, Object> res = service.saveState(42L, new HashMap<>(Map.of("coins", 999)), 0);
        assertEquals(1, res.get("version"));
        // 落库 JSON 的 coins 被服务端余额改写，客户端伪造无效
        verify(jdbc).update(contains("INSERT INTO cat_cabin_saves"), eq(42L), argThat((String json) -> json.contains("\"coins\":50")));
    }

    @Test
    void matchingBaseVersionUpdatesWithNextVersion() {
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(3, null, 0)));
        when(pointService.getBalance(42L)).thenReturn(10);
        when(jdbc.update(contains("UPDATE cat_cabin_saves SET save_json"), anyString(), eq(4), eq(42L), eq(3))).thenReturn(1);
        Map<String, Object> res = service.saveState(42L, new HashMap<>(Map.of("coins", 1)), 3);
        assertEquals(4, res.get("version"));
    }

    @Test
    void staleBaseVersionRejectedWith409() {
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(5, null, 0)));
        when(pointService.getBalance(42L)).thenReturn(10);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveState(42L, new HashMap<>(Map.of("a", 1)), 3));
        assertEquals(409, ex.getCode());
        verify(jdbc, never()).update(contains("UPDATE cat_cabin_saves SET save_json"), any(), any(), any(), any());
    }

    @Test
    void concurrentFirstInsertBecomes409() {
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L))).thenReturn(List.of());
        when(pointService.getBalance(42L)).thenReturn(10);
        when(jdbc.update(contains("INSERT INTO cat_cabin_saves"), eq(42L), anyString()))
                .thenThrow(new DuplicateKeyException("dup"));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveState(42L, new HashMap<>(Map.of("a", 1)), 0));
        assertEquals(409, ex.getCode());
    }

    @Test
    void updateLosingRaceBecomes409() {
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(3, null, 0)));
        when(pointService.getBalance(42L)).thenReturn(10);
        when(jdbc.update(contains("UPDATE cat_cabin_saves SET save_json"), anyString(), eq(4), eq(42L), eq(3))).thenReturn(0);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveState(42L, new HashMap<>(Map.of("a", 1)), 3));
        assertEquals(409, ex.getCode());
    }

    @Test
    void rejectsEmptySaveAndOversizeSave() {
        assertThrows(BusinessException.class, () -> service.saveState(42L, Map.of(), 0));
        assertThrows(BusinessException.class, () -> service.saveState(42L, null, 0));
        String big = "x".repeat(300 * 1024);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveState(42L, new HashMap<>(Map.of("blob", big)), 0));
        assertTrue(ex.getMessage().contains("过大"));
    }

    @Test
    void saveRequiresLogin() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveState(null, Map.of("a", 1), 0));
        assertEquals(401, ex.getCode());
    }

    /* ---------- spend（P2 金币合并） ---------- */

    @Test
    void spendDeductsThroughPointServiceWithLabeledReason() {
        when(pointService.getBalance(42L)).thenReturn(500, 380);
        Map<String, Object> res = service.spend(42L, "adopt", "orange", 120);
        assertEquals(120, res.get("coins"));
        assertEquals(380, res.get("balance"));
        verify(pointService).changeBalance(eq(42L), eq(-120), eq("spend"), contains("领养猫咪"), isNull());
    }

    @Test
    void spendRejectsUnknownReasonAndOversizeAmount() {
        assertThrows(BusinessException.class, () -> service.spend(42L, "hack", null, 10));
        assertThrows(BusinessException.class, () -> service.spend(42L, "adopt", null, -1));
        assertThrows(BusinessException.class, () -> service.spend(42L, "adopt", null, 10001));
        verifyNoInteractions(pointService);
    }

    @Test
    void spendInsufficientBalanceIs402() {
        when(pointService.getBalance(42L)).thenReturn(10);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.spend(42L, "adopt", null, 120));
        assertEquals(402, ex.getCode());
        verify(pointService, never()).changeBalance(any(), anyInt(), any(), any(), any());
    }

    @Test
    void spendRaceFailureBecomes402() {
        when(pointService.getBalance(42L)).thenReturn(500);
        doThrow(new BusinessException("蛋蛋币余额不足"))
                .when(pointService).changeBalance(eq(42L), eq(-400), eq("spend"), anyString(), isNull());
        BusinessException ex = assertThrows(BusinessException.class, () -> service.spend(42L, "home_buy", null, 400));
        assertEquals(402, ex.getCode());
    }

    @Test
    void zeroSpendSkipsPointService() {
        when(pointService.getBalance(42L)).thenReturn(66);
        Map<String, Object> res = service.spend(42L, "home_listing_fee", null, 0);
        assertEquals(0, res.get("coins"));
        verify(pointService, never()).changeBalance(any(), anyInt(), any(), any(), any());
    }

    // 回归：home_buy 的 refId 是内部挂牌 id（mock_listing_...），不能拼进用户可见的流水描述
    @Test
    void homeBuySpendOmitsInternalListingRefFromDescription() {
        when(pointService.getBalance(42L)).thenReturn(9961, 9576);
        service.spend(42L, "home_buy", "mock_listing_u014_be", 385);
        verify(pointService).changeBalance(eq(42L), eq(-385), eq("spend"),
                eq("猫咪小屋·购买家园猫咪"), isNull());
    }

    // 对照：其它消费 reason 仍保留 refId 后缀（如道具名），不受 home_buy 特例影响
    @Test
    void otherSpendStillAppendsRefSuffix() {
        when(pointService.getBalance(42L)).thenReturn(10095, 10087);
        service.spend(42L, "buy_food", "fish", 8);
        verify(pointService).changeBalance(eq(42L), eq(-8), eq("spend"),
                eq("猫咪小屋·购买猫粮：fish"), isNull());
    }

    /* ---------- earn（增发护栏：服务端定金额 + 每日封顶 200） ---------- */

    @Test
    void firstCheckinEverGrantsDayOneReward() {
        // 服务端无行：streak=1 → 第1天 30 币（客户端不再上报天数/数额）
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L))).thenReturn(List.of());
        when(pointService.getBalance(42L)).thenReturn(0, 30);
        Map<String, Object> res = service.earn(42L, "checkin", false);
        assertEquals(30, res.get("coins"));
        assertEquals(1, res.get("streakDays"));
        verify(pointService).changeBalance(eq(42L), eq(30), eq("earn"), contains("签到"), isNull());
        // 占位行写入：save_json='{}' + 签到日期权威
        verify(jdbc).update(contains("INSERT INTO cat_cabin_saves"), eq(42L), eq(LocalDate.now()), eq(30),
                eq(LocalDate.now()), eq(1), isNull());
    }

    @Test
    void streakContinuesFromYesterday() {
        // 服务端 streak=5、昨天签过 → 今天第6天 = 120 币
        LocalDate y = LocalDate.now().minusDays(1);
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, y, 0, y, 5, null)));
        when(pointService.getBalance(42L)).thenReturn(300, 420);
        Map<String, Object> res = service.earn(42L, "checkin", false);
        assertEquals(120, res.get("coins"));
        assertEquals(6, res.get("streakDays"));
    }

    @Test
    void brokenStreakResetsToDayOne() {
        // 上次签到是 3 天前 → 断签归零重计，第1天 30 币
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, LocalDate.now().minusDays(3), 0, LocalDate.now().minusDays(3), 5, null)));
        when(pointService.getBalance(42L)).thenReturn(300, 330);
        Map<String, Object> res = service.earn(42L, "checkin", false);
        assertEquals(30, res.get("coins"));
        assertEquals(1, res.get("streakDays"));
    }

    @Test
    void doubleCheckinSameDayGrantsZero() {
        // 服务端权威幂等：今天已记签到 → 再调 /earn 不发币（防脚本刷）
        LocalDate t = LocalDate.now();
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, t, 30, t, 1, null)));
        when(pointService.getBalance(42L)).thenReturn(30);
        Map<String, Object> res = service.earn(42L, "checkin", false);
        assertEquals(0, res.get("coins"));
        verify(pointService, never()).changeBalance(any(), anyInt(), any(), any(), any());
    }

    @Test
    void checkinDay7CapsAtDailyLimit() {
        // 第 7 天名义 200，但当日已赚 150 → 只补 50
        LocalDate y = LocalDate.now().minusDays(1);
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, LocalDate.now(), 150, y, 6, null)));
        when(pointService.getBalance(42L)).thenReturn(300, 350);
        Map<String, Object> res = service.earn(42L, "checkin", false);
        assertEquals(50, res.get("coins"));
        assertEquals(200, res.get("earnedToday"));
    }

    @Test
    void dailyCapExhaustedGrantsZero() {
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, LocalDate.now(), 200, LocalDate.now().minusDays(1), 6, null)));
        when(pointService.getBalance(42L)).thenReturn(400);
        Map<String, Object> res = service.earn(42L, "donate", false);
        assertEquals(0, res.get("coins"));
        verify(pointService, never()).changeBalance(any(), anyInt(), any(), any(), any());
    }

    @Test
    void yesterdayCounterResets() {
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, LocalDate.now().minusDays(1), 200, LocalDate.now().minusDays(1), 1, null)));
        when(pointService.getBalance(42L)).thenReturn(400, 420);
        Map<String, Object> res = service.earn(42L, "donate", false);
        assertEquals(20, res.get("coins"));
        verify(pointService).changeBalance(eq(42L), eq(20), eq("earn"), contains("捐赠"), isNull());
    }

    @Test
    void donateTwiceSameDayGrantsOnce() {
        LocalDate t = LocalDate.now();
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, t, 20, t.minusDays(1), 3, t)));
        when(pointService.getBalance(42L)).thenReturn(400);
        Map<String, Object> res = service.earn(42L, "donate", false);
        assertEquals(0, res.get("coins"));   // 捐赠每天限一次
        verify(pointService, never()).changeBalance(any(), anyInt(), any(), any(), any());
    }

    @Test
    void checkinDay3SlotFullConvertsTo100() {
        LocalDate y = LocalDate.now().minusDays(1);
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, y, 0, y, 2, null)));
        when(pointService.getBalance(42L)).thenReturn(0, 100);
        Map<String, Object> res = service.earn(42L, "checkin", true);
        assertEquals(100, res.get("coins"));
    }

    @Test
    void checkinDay3NormalGrantsZeroButStillSucceeds() {
        LocalDate y = LocalDate.now().minusDays(1);
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, y, 0, y, 2, null)));
        when(pointService.getBalance(42L)).thenReturn(0);
        Map<String, Object> res = service.earn(42L, "checkin", false);
        assertEquals(0, res.get("coins"));   // 第3天奖励是名额不是币
        verify(pointService, never()).changeBalance(any(), anyInt(), any(), any(), any());
    }

    @Test
    void earnRejectsUnknownReasonAndRequiresLogin() {
        assertThrows(BusinessException.class, () -> service.earn(42L, "mining", false));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.earn(null, "checkin", false));
        assertEquals(401, ex.getCode());
    }

    /* ---------- claimThought（「看看猫咪在想什么」6h 冷却，服务端权威） ---------- */

    @Test
    void thoughtRequiresLogin() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.claimThought(null));
        assertEquals(401, ex.getCode());
    }

    @Test
    void firstThoughtEverInsertsPlaceholderAndAllows() {
        // 无存档行：条件 UPDATE 未命中 → 建占位行（save_json='{}'）并放行
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L))).thenReturn(List.of());
        Map<String, Object> res = service.claimThought(42L);
        assertEquals(true, res.get("allowed"));
        verify(jdbc).update(contains("INSERT INTO cat_cabin_saves"), eq(42L), any(java.time.LocalDateTime.class));
    }

    @Test
    void thoughtAllowedWhenCooldownExpired() {
        // 上次交互在 7 小时前（早于 now-6h）：条件 UPDATE 命中 → 放行
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, null, 0)));
        when(jdbc.update(contains("UPDATE cat_cabin_saves SET last_thought_at"),
                any(java.time.LocalDateTime.class), eq(42L), any(java.time.LocalDateTime.class))).thenReturn(1);
        Map<String, Object> res = service.claimThought(42L);
        assertEquals(true, res.get("allowed"));
        verify(jdbc, never()).update(contains("INSERT INTO cat_cabin_saves"), any(), any());
    }

    @Test
    void thoughtBlockedWithinCooldown() {
        // 上次交互在 1 小时前：条件 UPDATE 未命中 → 拦截并给出剩余冷却
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(42L)))
                .thenReturn(List.of(saveRow(2, null, 0)));
        when(jdbc.update(contains("UPDATE cat_cabin_saves SET last_thought_at"),
                any(java.time.LocalDateTime.class), eq(42L), any(java.time.LocalDateTime.class))).thenReturn(0);
        when(jdbc.queryForList(contains("SELECT last_thought_at"), eq(42L)))
                .thenReturn(List.of(Map.of("last_thought_at",
                        java.sql.Timestamp.valueOf(java.time.LocalDateTime.now().minusHours(1)))));
        Map<String, Object> res = service.claimThought(42L);
        assertEquals(false, res.get("allowed"));
        long cooldownMs = ((Number) res.get("cooldownMs")).longValue();
        assertTrue(cooldownMs > 4 * 3600_000L && cooldownMs <= 5 * 3600_000L,
                "剩余冷却应约 5 小时，实测 " + cooldownMs);
        assertNotNull(res.get("nextAllowedAt"));
    }
}
