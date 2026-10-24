package com.eggworld.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.dto.TaskVO;
import com.eggworld.entity.TaskGovernanceLog;
import com.eggworld.service.TaskGovernanceService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 任务治理接口的路径与参数契约。
 * <p>
 * 前端 js/admin-task-manage.js 把这 6 条路径写死了，路径或参数名写错会让按钮直接 404，
 * 所以这里钉住「方法 + 路径 + 参数透传 + 返回结构」。
 */
class AdminTaskGovernanceApiTest {

    private MockMvc mvc(TaskGovernanceService service) {
        return MockMvcBuilders.standaloneSetup(new AdminTaskGovernanceController(service)).build();
    }

    @Test
    void managePassesFiltersThrough() throws Exception {
        TaskGovernanceService service = mock(TaskGovernanceService.class);
        when(service.manageTasks(eq("hidden"), eq("teach"), eq("快递"), eq(2L), eq(50L)))
                .thenReturn(new Page<TaskVO>(2, 50));

        mvc(service).perform(get("/api/admin/tasks/manage")
                        .param("status", "hidden")
                        .param("type", "teach")
                        .param("keyword", "快递")
                        .param("page", "2")
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.current").value(2));

        verify(service).manageTasks("hidden", "teach", "快递", 2L, 50L);
    }

    @Test
    void manageDefaultsToFirstPage() throws Exception {
        TaskGovernanceService service = mock(TaskGovernanceService.class);
        when(service.manageTasks(null, null, null, 1L, 20L)).thenReturn(new Page<>(1, 20));

        mvc(service).perform(get("/api/admin/tasks/manage"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        verify(service).manageTasks(null, null, null, 1L, 20L);
    }

    @Test
    void hidePassesReasonThrough() throws Exception {
        TaskGovernanceService service = mock(TaskGovernanceService.class);

        mvc(service).perform(post("/api/admin/tasks/9/hide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"含联系方式违规\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        verify(service).hide(9L, "含联系方式违规");
    }

    @Test
    void restoreDeleteAndReturnReviewRouteToService() throws Exception {
        TaskGovernanceService service = mock(TaskGovernanceService.class);
        MockMvc mvc = mvc(service);

        mvc.perform(post("/api/admin/tasks/7/restore").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/admin/tasks/7/delete").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"违规内容：学术不端\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/admin/tasks/7/return-review").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());

        verify(service).restore(7L, null);
        verify(service).delete(7L, "违规内容：学术不端");
        verify(service).returnReview(7L, null);
    }

    @Test
    void bodyIsOptional() throws Exception {
        TaskGovernanceService service = mock(TaskGovernanceService.class);

        mvc(service).perform(post("/api/admin/tasks/9/hide"))
                .andExpect(status().isOk());

        verify(service).hide(9L, null);
    }

    @Test
    void overlongReasonIsRejectedBeforeService() throws Exception {
        TaskGovernanceService service = mock(TaskGovernanceService.class);

        mvc(service).perform(post("/api/admin/tasks/9/hide")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"" + "长".repeat(201) + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void logsPassTaskIdThrough() throws Exception {
        TaskGovernanceService service = mock(TaskGovernanceService.class);
        when(service.logs(eq(9L), eq(1L), eq(20L))).thenReturn(new Page<TaskGovernanceLog>(1, 20));

        mvc(service).perform(get("/api/admin/task-governance-logs").param("taskId", "9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        verify(service).logs(9L, 1L, 20L);
    }
}
