package com.eggworld.service;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 职业测评：确认资源能加载、报告能生成、扣币走 PointService。
 * 使用真实 classpath 资源（career_question.xml / career_map.xml / career.md）。
 */
class CareerTestServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PointService pointService = mock(PointService.class);
    private final CareerTestService service = new CareerTestService(jdbc, pointService, new CareerMarkdownRenderer());

    @Test
    void loadsQuestionsFromBundledResource() {
        int count = service.questionCount();
        assertEquals(19, count, "题库应为 19 题");
        List<java.util.Map<String, Object>> qs = service.questions();
        assertEquals(19, qs.size());
        assertEquals(1, qs.get(0).get("id"));
        assertTrue(qs.get(0).containsKey("stem"));
    }

    @Test
    void generatingReportChargesFiftyCoinsAndStoresHistory() {
        when(jdbc.update(anyString(), any(), any(), any(), any())).thenReturn(1);
        when(jdbc.queryForObject(anyString(), eq(Long.class))).thenReturn(7L);
        List<String> answers = Arrays.asList(
                "1", "1", "1", "计算机", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1");
        long id = service.generate(42L, answers);
        assertEquals(7L, id);
        verify(pointService).changeBalance(eq(42L), eq(-50), eq("spend"), contains("职业测评"), isNull());
        verify(jdbc).update(argThat(sql -> sql.contains("career_test_reports")), eq(42L), any(), any(), eq(50));
    }

    @Test
    void rejectsUnauthorizedAndIncompleteSubmissions() {
        assertEquals(401, assertThrows(com.eggworld.common.BusinessException.class,
                () -> service.generate(null, List.of("1"))).getCode());
        assertThrows(com.eggworld.common.BusinessException.class,
                () -> service.generate(42L, List.of("1", "2")));
        verifyNoInteractions(pointService);
    }
}
