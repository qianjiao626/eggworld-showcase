package com.eggworld.controller;

import com.eggworld.dto.TaskChatBackfillVO;
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

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 存量任务补群接口的路径契约。
 * <p>
 * 这条路径不会出现在前端界面上，只写在迁移文档里给上线执行方 curl —— 路径写错会直接 404，
 * 所以这里钉住「方法 + 路径 + 返回值透传」。
 */
class AdminTaskChatBackfillApiTest {

    @Test
    void backfillReturnsServiceSummary() throws Exception {
        LegacyDataMigrationService service = mock(LegacyDataMigrationService.class);
        TaskChatBackfillVO vo = new TaskChatBackfillVO();
        vo.setScanned(3);
        vo.setCreated(2);
        vo.setJoined(5);
        vo.setFailed(1);
        vo.setFailures(List.of("任务 #8「组队刷题」：群成员已满"));
        when(service.backfillTaskChatGroups()).thenReturn(vo);

        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AdminController(
                mock(TaskService.class), mock(AdminService.class), mock(AdminStatsService.class),
                mock(FeedbackService.class), mock(RatingService.class), mock(UserActivityService.class),
                mock(PairingRemindService.class), service)).build();

        mvc.perform(post("/api/admin/tasks/backfill-chat-groups"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.scanned").value(3))
                .andExpect(jsonPath("$.data.created").value(2))
                .andExpect(jsonPath("$.data.joined").value(5))
                .andExpect(jsonPath("$.data.failed").value(1))
                .andExpect(jsonPath("$.data.failures[0]").value("任务 #8「组队刷题」：群成员已满"));

        verify(service).backfillTaskChatGroups();
    }
}
