package com.eggworld.controller;

import com.eggworld.service.AdminService;
import com.eggworld.service.AdminStatsService;
import com.eggworld.service.FeedbackService;
import com.eggworld.service.LegacyDataMigrationService;
import com.eggworld.service.PairingRemindService;
import com.eggworld.service.RatingService;
import com.eggworld.service.TaskService;
import com.eggworld.service.UserActivityService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 配对提醒两个后台接口的路径契约。
 * <p>
 * 前端（js/admin-workbench.js）把这两条路径写死了，路径写错会让按钮直接 404，
 * 所以这里钉住「方法 + 路径 + 返回值透传」。
 */
class AdminPairingRemindApiTest {

    private MockMvc mvc(PairingRemindService pairingRemindService) {
        return MockMvcBuilders.standaloneSetup(new AdminController(
                mock(TaskService.class), mock(AdminService.class), mock(AdminStatsService.class),
                mock(FeedbackService.class), mock(RatingService.class), mock(UserActivityService.class),
                pairingRemindService, mock(LegacyDataMigrationService.class))).build();
    }

    @Test
    void bulkRemindReturnsServiceMessage() throws Exception {
        PairingRemindService service = mock(PairingRemindService.class);
        when(service.remindAllForAdmin()).thenReturn("已给 2 位发布者发送配对提醒邮件；1 位今天已提醒过（跳过）");

        mvc(service).perform(post("/api/admin/tasks/remind-pairing/all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").value("已给 2 位发布者发送配对提醒邮件；1 位今天已提醒过（跳过）"));

        verify(service).remindAllForAdmin();
    }

    @Test
    void singleTaskRemindPassesTaskIdThrough() throws Exception {
        PairingRemindService service = mock(PairingRemindService.class);
        when(service.remindForTask(9L)).thenReturn("已给「蛋总」发送配对提醒邮件");

        mvc(service).perform(post("/api/admin/tasks/9/remind-pairing"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value("已给「蛋总」发送配对提醒邮件"));

        verify(service).remindForTask(9L);
    }
}
