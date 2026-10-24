package com.eggworld.common;

import com.eggworld.controller.AdminGossipReportController;
import com.eggworld.controller.AnnouncementController;
import com.eggworld.controller.GossipReportController;
import com.eggworld.service.AnnouncementService;
import com.eggworld.service.GossipReportService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 回归（2026-10-06 本地实测缺陷）：
 * 路径变量不是数字时（GET /api/announcements/abc）此前落到兜底分支，返回 code=500
 * 并把内部异常文本（Failed to convert value of type ...）回显给前端。
 * 这属于客户端输入问题，必须是 400。
 */
class GlobalExceptionHandlerTypeMismatchTest {

    private final MockMvc announcements = MockMvcBuilders
            .standaloneSetup(new AnnouncementController(mock(AnnouncementService.class)))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    private final MockMvc reports = MockMvcBuilders
            .standaloneSetup(new GossipReportController(mock(GossipReportService.class)))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    private final MockMvc adminReports = MockMvcBuilders
            .standaloneSetup(new AdminGossipReportController(mock(GossipReportService.class)))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    @Test void nonNumericAnnouncementIdIsBadRequest() throws Exception {
        announcements.perform(get("/api/announcements/abc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("参数格式不正确：id"));
    }

    @Test void nonNumericReportIdIsBadRequest() throws Exception {
        reports.perform(get("/api/gossip/reports/abc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("参数格式不正确：id"));
    }

    @Test void nonNumericModerationPathIdIsBadRequest() throws Exception {
        adminReports.perform(post("/api/admin/gossip-reports/abc/approve")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":10}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("参数格式不正确：id"));
    }
}
