package com.eggworld.service;

import com.eggworld.common.BusinessException;
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
 * 职业测评：规则匹配 / 素材拼接 / Markdown 转换，
 * 以及计费链路（扣一次、免费不扣、每日次数、同 requestId 不重复扣、落库失败退款）。
 * 全部 mock，不连数据库、不写真实报告。
 */
class CareerReportServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long USER = 9L;
    private static final long REPORT_ID = 7L;

    private JdbcTemplate jdbc;
    private PointService pointService;
    private AppSettingsService settingsService;
    private CareerReportService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        pointService = mock(PointService.class);
        settingsService = mock(AppSettingsService.class);
        service = new CareerReportService(jdbc, pointService, settingsService, MAPPER);
        service.init();
        when(settingsService.careerSettings())
                .thenReturn(new AppSettingsService.ChargeSettings(true, 50, 0, null));
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(Collections.emptyList());
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Integer.class), eq(USER))).thenReturn(0);
    }

    private void useSettings(boolean chargeEnabled, int cost, int dailyLimit) {
        when(settingsService.careerSettings())
                .thenReturn(new AppSettingsService.ChargeSettings(chargeEnabled, cost, dailyLimit, null));
    }

    private void useTodayCount(int used) {
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Integer.class), eq(USER))).thenReturn(used);
    }

    /* ---------------- 公开分享 ---------------- */

    @Test
    void shareReportReusesExistingTokenAndCreatesOnce() {
        when(jdbc.queryForList("SELECT share_token FROM career_reports WHERE id = ? AND user_id = ?",
                REPORT_ID, USER))
                .thenReturn(List.of(Map.of("share_token", "existing-token")));

        Map<String, Object> out = service.shareReport(USER, REPORT_ID);

        assertEquals("existing-token", out.get("token"));
        verify(jdbc, never()).update(contains("SET share_token = ?"), any(), any(), any());
    }

    @Test
    void shareReportCreatesTokenWhenMissing() {
        Map<String, Object> emptyRow = new java.util.HashMap<>();
        when(jdbc.queryForList("SELECT share_token FROM career_reports WHERE id = ? AND user_id = ?",
                REPORT_ID, USER))
                .thenReturn(List.of(emptyRow), List.of(Map.of("share_token", "new-token")));
        when(jdbc.update(contains("SET share_token = ?"), anyString(), eq(REPORT_ID), eq(USER)))
                .thenReturn(1);

        Map<String, Object> out = service.shareReport(USER, REPORT_ID);

        assertEquals("new-token", out.get("token"));
        verify(jdbc).update(contains("SET share_token = ?"), anyString(), eq(REPORT_ID), eq(USER));
    }

    @Test
    void shareReportRejectsMissingReportAndAnonymous() {
        when(jdbc.queryForList("SELECT share_token FROM career_reports WHERE id = ? AND user_id = ?",
                REPORT_ID, USER)).thenReturn(Collections.emptyList());

        assertThrows(BusinessException.class, () -> service.shareReport(USER, REPORT_ID));
        assertThrows(BusinessException.class, () -> service.shareReport(null, REPORT_ID));
    }

    @Test
    void unshareClearsTokenAndRejectsMissingReport() {
        when(jdbc.update(contains("SET share_token = NULL"), eq(REPORT_ID), eq(USER))).thenReturn(1);
        service.unshareReport(USER, REPORT_ID);
        verify(jdbc).update(contains("SET share_token = NULL"), eq(REPORT_ID), eq(USER));

        when(jdbc.update(contains("SET share_token = NULL"), eq(99L), eq(USER))).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.unshareReport(USER, 99L));
    }

    @Test
    void sharedReportReturnsSnapshotWithoutAnswers() {
        when(jdbc.queryForList(contains("WHERE share_token = ?"), eq("tok-123")))
                .thenReturn(List.of(Map.of(
                        "headline", "互联网核心业务操盘手",
                        "html", "<article class=\"career-dossier\">报告</article>",
                        "createdAt", "2026-10-21")));

        Map<String, Object> out = service.sharedReport("tok-123");

        assertEquals("互联网核心业务操盘手", out.get("headline"));
        assertTrue(String.valueOf(out.get("html")).contains("career-dossier"));
        assertFalse(out.containsKey("answers"), "公开分享不能带答题明细");
        assertThrows(BusinessException.class, () -> service.sharedReport(""));
        assertThrows(BusinessException.class, () -> service.sharedReport(null));
    }

    /* ---------------- 渲染 ---------------- */

    @Test
    void rendersMatchedReportsIntoHtml() throws Exception {
        // 第 2 题选 1（985/211）→ 命中规则 result=1，正文是「院校竞争力」那段
        String html = service.renderHtml(MAPPER.readTree("[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"));

        assertTrue(html.contains("你的职业测评报告"), "报告外壳应存在");
        assertTrue(html.contains("测评日期"), "应带测评日期");
        assertTrue(html.contains("你的院校为你的就业提供了非常强的竞争力"),
                "应命中考题 2 对应片段");
        assertTrue(html.startsWith("<article class=\"career-dossier\""),
                "返回值应是可直接插入页面的 HTML 片段（深色档案版式）");
        assertTrue(html.contains("PREPARED FOR"), "抬头要标明档案持有人");
        assertTrue(html.contains("同学"), "取不到昵称时用「同学」兜底");
        assertFalse(html.contains("default-avatar"), "报告不再使用头像图");
        assertFalse(html.contains("{{USER}}"), "用户占位符必须被替换");
    }

    @Test
    void reportHeadlinePrintsNicknameNotAvatar() throws Exception {
        when(jdbc.queryForList("SELECT nickname FROM users WHERE id = ?", String.class, USER))
                .thenReturn(List.of("小帅 <script>"));
        when(pointService.getBalance(USER)).thenReturn(80, 30);
        when(jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class)).thenReturn(91L);

        Map<String, Object> result = service.generate(USER,
                MAPPER.readTree("[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"), "req-user");

        String html = String.valueOf(result.get("html"));
        assertTrue(html.contains("小帅 &lt;script&gt;"), "昵称要转义后印在抬头");
        assertFalse(html.contains("{{USER}}"), "用户占位符必须被替换");
        assertFalse(html.contains("default-avatar"), "报告不使用头像");
    }

    @Test
    void differentAnswersProduceDifferentReports() throws Exception {
        String topSchool = service.renderHtml(MAPPER.readTree("[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"));
        String otherSchool = service.renderHtml(MAPPER.readTree("[1,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"));

        assertTrue(otherSchool.contains("你的院校在你的就业竞争中不能提供太多的有效助力"));
        assertFalse(topSchool.equals(otherSchool), "不同答案应生成不同报告");
    }

    @Test
    void emptyAnswersRejected() {
        BusinessException e = assertThrows(BusinessException.class, () -> service.renderHtml(null));
        assertTrue(e.getMessage().contains("测评"));

        assertThrows(BusinessException.class, () -> service.renderHtml(MAPPER.readTree("[]")));
    }

    @Test
    void markdownConverterHandlesHeadingsListsAndBold() {
        String html = CareerReportService.markdownToHtml("""
                ## 标题
                ### 小标题
                普通段落含 **重点**
                - 条目一
                - 条目二
                1. 第一步
                2. 第二步
                <script>alert(1)</script>
                """);

        assertTrue(html.contains("<h2>标题</h2>"));
        assertTrue(html.contains("<h3>小标题</h3>"));
        assertTrue(html.contains("<strong>重点</strong>"));
        assertTrue(html.contains("<ul><li>条目一</li><li>条目二</li></ul>"));
        assertTrue(html.contains("<ol><li>第一步</li><li>第二步</li></ol>"));
        assertTrue(html.contains("&lt;script&gt;"), "素材里的标签必须被转义");
        assertFalse(html.contains("<script>"));
    }

    /* ---------------- 计费 ---------------- */

    @Test
    void chargedGenerationDeductsOnceAndSavesRecord() throws Exception {
        when(pointService.getBalance(USER)).thenReturn(80, 30);
        when(jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class)).thenReturn(77L);

        Map<String, Object> result = service.generate(USER,
                MAPPER.readTree("[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"), "req-1");

        verify(pointService, times(1))
                .changeBalance(USER, -50, "spend", "职业测评报告", null);
        verify(pointService, never())
                .changeBalance(eq(USER), anyInt(), eq("refund"), anyString(), any());
        verify(jdbc).update(contains("INSERT INTO career_reports"),
                eq(USER), anyString(), anyString(), anyString(), eq(50), eq("req-1"));

        assertEquals(77L, result.get("recordId"));
        assertEquals(50, result.get("cost"));
        assertEquals(30, result.get("balance"));
        assertTrue(String.valueOf(result.get("html")).contains("测评日期"));
    }

    @Test
    void freeModeDoesNotCharge() throws Exception {
        useSettings(false, 50, 3);
        when(pointService.getBalance(USER)).thenReturn(80);
        when(jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class)).thenReturn(78L);

        Map<String, Object> result = service.generate(USER,
                MAPPER.readTree("[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"), "req-free");

        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
        verify(jdbc).update(contains("INSERT INTO career_reports"),
                eq(USER), anyString(), anyString(), anyString(), eq(0), eq("req-free"));
        assertEquals(0, result.get("cost"));
    }

    @Test
    void dailyLimitRejectsBeforeCharging() throws Exception {
        useSettings(true, 50, 3);
        useTodayCount(3);

        BusinessException e = assertThrows(BusinessException.class, () -> service.generate(USER,
                MAPPER.readTree("[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"), "req-limit"));

        assertEquals(429, e.getCode());
        assertTrue(e.getMessage().contains("3"));
        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
        verify(jdbc, never()).update(contains("INSERT INTO career_reports"),
                any(), any(), any(), any(), any(), any());
    }

    @Test
    void sameRequestIdReturnsSavedReportWithoutCharging() throws Exception {
        when(jdbc.queryForList(contains("request_id"), eq(USER), eq("req-1")))
                .thenReturn(List.of(Map.of("id", 42L, "headline", "路径", "report_html", "<p>已生成</p>")));
        when(pointService.getBalance(USER)).thenReturn(80);

        Map<String, Object> result = service.generate(USER, MAPPER.readTree("[1,1]"), "req-1");

        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
        assertEquals(42L, result.get("recordId"));
        assertEquals(0, result.get("cost"));
        assertEquals("<p>已生成</p>", result.get("html"));
    }

    @Test
    void saveFailureRefundsInFull() throws Exception {
        when(pointService.getBalance(USER)).thenReturn(80);
        when(jdbc.update(contains("INSERT INTO career_reports"),
                any(), any(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("db down"));

        assertThrows(IllegalStateException.class, () -> service.generate(USER,
                MAPPER.readTree("[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]"), "req-1"));

        verify(pointService).changeBalance(USER, -50, "spend", "职业测评报告", null);
        verify(pointService).changeBalance(USER, 50, "refund", "职业测评报告保存失败退款", null);
    }

    @Test
    void metaExposesPriceBalanceAndRemainingQuota() {
        useSettings(true, 50, 3);
        useTodayCount(1);
        when(pointService.getBalance(USER)).thenReturn(120);

        Map<String, Object> meta = service.meta(USER);

        assertEquals(50, meta.get("analyzeCost"));
        assertEquals(50, meta.get("listPrice"));
        assertEquals(true, meta.get("chargeEnabled"));
        assertEquals(3, meta.get("dailyLimit"));
        assertEquals(2, meta.get("todayLeft"));
        assertEquals(120, meta.get("balance"));
    }
}
