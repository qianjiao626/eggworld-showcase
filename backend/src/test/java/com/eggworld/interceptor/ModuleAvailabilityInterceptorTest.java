package com.eggworld.interceptor;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 回归（2026-10-07）：职业测评 / 宠物系统 / 猫舍本轮不在线上建表，缺表时接口必须给可读的
 * 「该功能暂未开放」（body code 404），而不是把 SQL 异常兜底成 code 500 + 表名原文。
 */
class ModuleAvailabilityInterceptorTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ModuleAvailabilityInterceptor gate = new ModuleAvailabilityInterceptor(jdbc);

    private void stubTable(String table, int count) {
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(table))).thenReturn(count);
    }

    private void call(String method, String uri) {
        gate.preHandle(new MockHttpServletRequest(method, uri), new MockHttpServletResponse(), new Object());
    }

    @Test
    void missingTableReturnsReadableBusinessCode() {
        stubTable("pets", 0);

        BusinessException error = assertThrows(BusinessException.class, () -> call("GET", "/api/pets/mine"));

        assertEquals(404, error.getCode());
        assertEquals("该功能暂未开放", error.getMessage());
    }

    @Test
    void allThreeModulesAreGatedByTheirCoreTable() {
        stubTable("career_test_reports", 0);
        stubTable("pets", 0);
        stubTable("cat_rooms", 0);

        for (String uri : new String[]{
                "/api/career-test/questions", "/api/career-test/generate",
                "/api/pets/shop", "/api/pets/buy",
                "/api/cats/mine", "/api/cats/review/pending"}) {
            assertThrows(BusinessException.class, () -> call("GET", uri), uri + " 应向未登录/未开放收敛");
        }
    }

    @Test
    void existingTablePassesThrough() throws Exception {
        stubTable("cat_rooms", 1);

        assertTrue(gate.preHandle(new MockHttpServletRequest("POST", "/api/cats"),
                new MockHttpServletResponse(), new Object()));
    }

    @Test
    void probeResultIsCachedPerTable() {
        stubTable("career_test_reports", 0);

        for (int i = 0; i < 3; i++) {
            assertThrows(BusinessException.class, () -> call("GET", "/api/career-test/history"));
        }

        verify(jdbc, times(1)).queryForObject(anyString(), eq(Integer.class), eq("career_test_reports"));
    }

    @Test
    void unrelatedPathNeverTouchesTheDatabase() throws Exception {
        assertTrue(gate.preHandle(new MockHttpServletRequest("GET", "/api/tasks"),
                new MockHttpServletResponse(), new Object()));

        verifyNoInteractions(jdbc);
    }

    @Test
    void probeFailureFailsOpenSoRealErrorsSurfaceInBusinessLayer() throws Exception {
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("pets")))
                .thenThrow(new RuntimeException("connection refused"));

        assertTrue(gate.preHandle(new MockHttpServletRequest("GET", "/api/pets/shop"),
                new MockHttpServletResponse(), new Object()));
    }
}
