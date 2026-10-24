package com.eggworld.controller;

import com.eggworld.common.GlobalExceptionHandler;
import com.eggworld.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TaskSecurityApiTest {
    @Test void oversizedRewardRejectedBeforeBusinessService() throws Exception {
        TaskService service = mock(TaskService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TaskController(service,
                mock(ClaimService.class), mock(RatingService.class), mock(TaskProofImageService.class)))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        for (int amount : new int[]{10001, 99999}) {
            mvc.perform(post("/api/tasks").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\":\"fixture\",\"taskType\":\"teach\",\"skillCategory\":\"study\",\"reward\":" + amount + "}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(400));
        }
        verifyNoInteractions(service);
    }

    @Test void elevenInvitationSkillsRejectedAtController() throws Exception {
        UserService service = mock(UserService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserPublicController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        String skills = String.join(",", java.util.Collections.nCopies(11, "\"skill\""));
        mvc.perform(post("/api/users/2/invite-task").contentType(MediaType.APPLICATION_JSON)
                .content("{\"skills\":[" + skills + "]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(400));
        verifyNoInteractions(service);
    }
}
