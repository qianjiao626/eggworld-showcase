package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 后台系统设置：默认值（免费 / 50 币 / 每天 3 次）、读取已存配置、保存校验与写入。
 * 全部 mock，不连数据库。
 */
class AppSettingsServiceTest {

    private JdbcTemplate jdbc;
    private AppSettingsService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new AppSettingsService(jdbc);
        setDefaultCost(50);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(Collections.emptyList());
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
    }

    private void setDefaultCost(int cost) {
        try {
            var field = AppSettingsService.class.getDeclaredField("defaultAnalyzeCost");
            field.setAccessible(true);
            field.set(service, cost);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private void stored(String key, String value, String updatedAt) {
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("setting_key", key, "setting_value", value, "updatedAt", updatedAt)));
    }

    @Test
    void defaultsToFreeWithDailyLimitWhenTableIsEmpty() {
        AppSettingsService.ChargeSettings s = service.resumeSettings();

        assertFalse(s.chargeEnabled(), "未配置时默认免费");
        assertEquals(50, s.analyzeCost());
        assertEquals(3, s.dailyLimit());
        assertEquals(0, s.effectiveCost(), "免费时实际扣费为 0");
        assertEquals("", s.toMap().get("updatedAt"));
    }

    @Test
    void readsStoredValues() {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(
                Map.of("setting_key", AppSettingsService.RESUME_CHARGE_ENABLED, "setting_value", "1",
                        "updatedAt", "2026-10-18 10:30"),
                Map.of("setting_key", AppSettingsService.RESUME_ANALYZE_COST, "setting_value", "88",
                        "updatedAt", "2026-10-18 10:30"),
                Map.of("setting_key", AppSettingsService.RESUME_DAILY_LIMIT, "setting_value", "0",
                        "updatedAt", "2026-10-18 10:30")));

        AppSettingsService.ChargeSettings s = service.resumeSettings();

        assertTrue(s.chargeEnabled());
        assertEquals(88, s.analyzeCost());
        assertEquals(0, s.dailyLimit(), "0 表示不限次数");
        assertEquals(88, s.effectiveCost());
        assertEquals("2026-10-18 10:30", s.updatedAt());

        Map<String, Object> map = s.toMap();
        assertEquals(true, map.get("chargeEnabled"));
        assertEquals(88, map.get("analyzeCost"));
        assertEquals(88, map.get("effectiveCost"));
        assertEquals(0, map.get("dailyLimit"));
    }

    @Test
    void saveRejectsOutOfRangeValues() {
        BusinessException zeroCost = assertThrows(BusinessException.class,
                () -> service.saveResumeSettings(true, 0, 3, 1L));
        assertTrue(zeroCost.getMessage().contains("单次价格"));

        BusinessException badLimit = assertThrows(BusinessException.class,
                () -> service.saveResumeSettings(false, 50, 101, 1L));
        assertTrue(badLimit.getMessage().contains("每天"));

        BusinessException missing = assertThrows(BusinessException.class,
                () -> service.saveResumeSettings(null, 50, 3, 1L));
        assertTrue(missing.getMessage().contains("完整"));

        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void saveWritesAllThreeKeysAndReturnsFreshSnapshot() {
        service.saveResumeSettings(true, 66, 5, 9L);

        verify(jdbc).update(contains("app_settings"), eq("1"), eq(9L),
                eq(AppSettingsService.RESUME_CHARGE_ENABLED));
        verify(jdbc).update(contains("app_settings"), eq("66"), eq(9L),
                eq(AppSettingsService.RESUME_ANALYZE_COST));
        verify(jdbc).update(contains("app_settings"), eq("5"), eq(9L),
                eq(AppSettingsService.RESUME_DAILY_LIMIT));
        verify(jdbc, never()).update(contains("INSERT INTO app_settings"), any(), any(), any());
    }

    @Test
    void careerDefaultsToChargedFiftyPerDayLimitThree() {
        AppSettingsService.ChargeSettings s = service.careerSettings();

        assertTrue(s.chargeEnabled(), "职业测评默认收费");
        assertEquals(50, s.analyzeCost());
        assertEquals(3, s.dailyLimit());
        assertEquals(50, s.effectiveCost());
    }

    @Test
    void saveCareerWritesCareerKeys() {
        service.saveCareerSettings(false, 30, 0, 9L);

        verify(jdbc).update(contains("app_settings"), eq("0"), eq(9L),
                eq(AppSettingsService.CAREER_CHARGE_ENABLED));
        verify(jdbc).update(contains("app_settings"), eq("30"), eq(9L),
                eq(AppSettingsService.CAREER_ANALYZE_COST));
        verify(jdbc).update(contains("app_settings"), eq("0"), eq(9L),
                eq(AppSettingsService.CAREER_DAILY_LIMIT));
    }

    @Test
    void workshopOrderDefaultsToEmpty() {
        assertTrue(service.workshopOrder().isEmpty(), "未配置时返回空列表，前端用默认顺序");
    }

    @Test
    void workshopOrderReadsStoredCsvAndDropsIllegalIds() {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(
                Map.of("setting_key", AppSettingsService.WORKSHOP_ORDER,
                        "setting_value", "careerquiz,catcabin,BAD ID,catcabin",
                        "updatedAt", "2026-10-20 18:00")));

        assertEquals(List.of("careerquiz", "catcabin"), service.workshopOrder(),
                "非法 id 被丢弃、重复项去重");
    }

    @Test
    void saveWorkshopOrderDedupesAndWritesCsv() {
        service.saveWorkshopOrder(List.of("careerquiz", "catcabin", "careerquiz"), 9L);

        verify(jdbc).update(contains("app_settings"), eq("careerquiz,catcabin"), eq(9L),
                eq(AppSettingsService.WORKSHOP_ORDER));
    }

    @Test
    void saveWorkshopOrderRejectsIllegalIdsOrEmptyList() {
        assertThrows(BusinessException.class,
                () -> service.saveWorkshopOrder(List.of("bad id"), 9L));
        assertThrows(BusinessException.class,
                () -> service.saveWorkshopOrder(List.of(), 9L));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
