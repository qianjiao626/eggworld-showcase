package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * 简历计费：余额不足不扣、成功只扣一次、AI 失败全额退款、同 requestId 不重复扣，
 * 以及后台配置切换后的免费模式与每日次数上限。
 * 全部用 mock，不打真实 AI、不连数据库。
 */
class ResumeServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long USER = 7L;

    private ResumeAnalysisService analysisService;
    private PointService pointService;
    private AppSettingsService settingsService;
    private JdbcTemplate jdbc;
    private ResumeService service;

    @BeforeEach
    void setUp() {
        analysisService = mock(ResumeAnalysisService.class);
        pointService = mock(PointService.class);
        settingsService = mock(AppSettingsService.class);
        jdbc = mock(JdbcTemplate.class);
        service = new ResumeService(analysisService, pointService, settingsService, jdbc, MAPPER);
        when(settingsService.resumeSettings())
                .thenReturn(new AppSettingsService.ChargeSettings(true, 50, 0, null));
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(Collections.emptyList());
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Integer.class), eq(USER))).thenReturn(0);
    }

    private void useSettings(boolean chargeEnabled, int cost, int dailyLimit) {
        when(settingsService.resumeSettings())
                .thenReturn(new AppSettingsService.ChargeSettings(chargeEnabled, cost, dailyLimit, null));
    }

    private void useTodayCount(int used) {
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Integer.class), eq(USER))).thenReturn(used);
    }

    @Test
    void insufficientBalanceRejectsWithoutCallingAi() {
        when(pointService.getBalance(USER)).thenReturn(40);

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.analyze(USER, "简历", "JD", "req-1"));

        assertEquals(402, e.getCode());
        assertTrue(e.getMessage().contains("50"));
        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
        verifyNoInteractions(analysisService);
    }

    @Test
    void successfulAnalysisChargesExactlyOnce() throws Exception {
        when(pointService.getBalance(USER)).thenReturn(80, 30);
        when(analysisService.analyze("简历", "JD"))
                .thenReturn(MAPPER.readTree("{\"score\":88,\"summary\":\"不错\",\"highlights\":[]}"));
        when(jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class)).thenReturn(99L);

        Map<String, Object> result = service.analyze(USER, "简历", "JD", "req-1");

        verify(pointService, times(1))
                .changeBalance(USER, -50, "spend", "简历深度对标", null);
        verify(pointService, never())
                .changeBalance(eq(USER), anyInt(), eq("refund"), anyString(), any());
        verify(jdbc).update(contains("INSERT INTO resume_analyses"),
                eq(USER), eq("简历"), eq("JD"), eq(88), eq("不错"), anyString(), eq(50), eq("req-1"));

        assertEquals(99L, result.get("recordId"));
        assertEquals(30, result.get("balance"));
        assertEquals(50, result.get("cost"));
        assertEquals(88, ((JsonNode) result.get("analysis")).path("score").asInt());
    }

    @Test
    void aiFailureRefundsInFull() {
        when(pointService.getBalance(USER)).thenReturn(80);
        when(analysisService.analyze(anyString(), anyString()))
                .thenThrow(new IllegalStateException("对标服务暂时不可用，请稍后重试"));

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> service.analyze(USER, "简历", "JD", "req-1"));

        assertTrue(e.getMessage().contains("暂时不可用"));
        verify(pointService).changeBalance(USER, -50, "spend", "简历深度对标", null);
        verify(pointService).changeBalance(USER, 50, "refund", "简历对标失败退款", null);
        verify(jdbc, never()).update(contains("INSERT INTO resume_analyses"),
                any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void sameRequestIdDoesNotChargeTwice() {
        when(jdbc.queryForList(contains("request_id"), eq(USER), eq("req-1")))
                .thenReturn(List.of(Map.of("id", 42L, "result_json", "{\"score\":80}")));
        when(pointService.getBalance(USER)).thenReturn(80);

        Map<String, Object> result = service.analyze(USER, "简历", "JD", "req-1");

        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
        verifyNoInteractions(analysisService);
        assertEquals(42L, result.get("recordId"));
        assertEquals(0, result.get("cost"));
    }

    @Test
    void metaExposesPriceAndBalance() {
        when(pointService.getBalance(USER)).thenReturn(120);
        Map<String, Object> meta = service.meta(USER);
        assertEquals(50, meta.get("analyzeCost"));
        assertEquals(120, meta.get("balance"));
        assertEquals(true, meta.get("chargeEnabled"));
        assertEquals(0, meta.get("dailyLimit"));
        assertFalse(meta.containsKey("todayLeft"), "不限次数时不下发剩余次数");
    }

    @Test
    void freeModeDoesNotChargeAndRecordsZeroCost() throws Exception {
        useSettings(false, 50, 3);
        useTodayCount(1);
        when(pointService.getBalance(USER)).thenReturn(80);
        when(analysisService.analyze("简历", "JD"))
                .thenReturn(MAPPER.readTree("{\"score\":90,\"summary\":\"不错\",\"highlights\":[]}"));
        when(jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class)).thenReturn(100L);

        Map<String, Object> result = service.analyze(USER, "简历", "JD", "req-free");

        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
        verify(jdbc).update(contains("INSERT INTO resume_analyses"),
                eq(USER), eq("简历"), eq("JD"), eq(90), eq("不错"), anyString(), eq(0), eq("req-free"));
        assertEquals(0, result.get("cost"));
        assertEquals(false, result.get("chargeEnabled"));
        assertEquals(1, result.get("todayLeft"), "今天已用 1 次，这次之后还剩 1 次");
    }

    @Test
    void dailyLimitRejectsBeforeChargingOrCallingAi() {
        useSettings(false, 50, 3);
        useTodayCount(3);

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.analyze(USER, "简历", "JD", "req-limit"));

        assertEquals(429, e.getCode());
        assertTrue(e.getMessage().contains("3"));
        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
        verifyNoInteractions(analysisService);
    }

    @Test
    void freeMetaShowsZeroCostAndRemainingQuota() {
        useSettings(false, 50, 3);
        useTodayCount(1);
        when(pointService.getBalance(USER)).thenReturn(80);

        Map<String, Object> meta = service.meta(USER);

        assertEquals(0, meta.get("analyzeCost"));
        assertEquals(50, meta.get("listPrice"));
        assertEquals(false, meta.get("chargeEnabled"));
        assertEquals(3, meta.get("dailyLimit"));
        assertEquals(2, meta.get("todayLeft"));
    }
}
