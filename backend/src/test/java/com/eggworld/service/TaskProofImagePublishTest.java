package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.entity.Task;
import com.eggworld.entity.User;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.TaskRevisionMapper;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 发布任务时「技能证明图片」的落库回归测试。
 * 口径：proofImageId 是发布时的选填字段，原样落到 tasks.proof_image_id；
 * 组队型仍然强制 reward=10（证明图不能影响资金口径）。
 */
class TaskProofImagePublishTest {

    private TaskMapper tasks;
    private UserMapper users;
    private TaskService service;

    @BeforeEach
    void setup() {
        tasks = mock(TaskMapper.class);
        users = mock(UserMapper.class);
        service = new TaskService(
                tasks,
                mock(TaskClaimMapper.class),
                mock(TaskRevisionMapper.class),
                users,
                mock(PointService.class),
                mock(InviteService.class),
                mock(NotificationService.class),
                mock(ChatGroupService.class),
                new AppProperties());
        User publisher = new User();
        publisher.setId(1L);
        publisher.setNickname("测试蛋");
        /* 经验 1000 = 传奇蛋，认领人数上限 6：本类用例用 maxClaimers=5，别被等级校验挡住视线 */
        publisher.setExp(1000);
        when(users.selectById(1L)).thenReturn(publisher);
    }

    private PublishTaskDTO dto(String taskType, Long proofImageId) {
        PublishTaskDTO dto = new PublishTaskDTO();
        dto.setTitle("教你做高数笔记");
        dto.setDescription("说明");
        dto.setTaskType(taskType);
        dto.setSkillCategory("study");
        dto.setSkillSub("学科辅导");
        dto.setReward(10);
        dto.setClaimMode("multiple");
        dto.setMaxClaimers(5);
        dto.setRequirements("先加我");
        dto.setProofImageId(proofImageId);
        return dto;
    }

    @Test
    void publishPersistsProofImageId() {
        service.publish(1L, dto("teach", 42L));

        ArgumentCaptor<Task> saved = ArgumentCaptor.forClass(Task.class);
        verify(tasks).insert(saved.capture());
        assertEquals(42L, saved.getValue().getProofImageId());
        assertEquals("pending", saved.getValue().getStatus());
    }

    @Test
    void publishWithoutProofImageLeavesColumnNull() {
        service.publish(1L, dto("teach", null));

        ArgumentCaptor<Task> saved = ArgumentCaptor.forClass(Task.class);
        verify(tasks).insert(saved.capture());
        assertNull(saved.getValue().getProofImageId());
    }

    @Test
    void teamPublishKeepsFixedDepositAndStillCarriesProofImage() {
        service.publish(1L, dto("team", 7L));

        ArgumentCaptor<Task> saved = ArgumentCaptor.forClass(Task.class);
        verify(tasks).insert(saved.capture());
        assertEquals(TaskService.TEAM_DEPOSIT, saved.getValue().getReward(), "组队出资固定 10，不能被证明图或入参改掉");
        assertEquals(7L, saved.getValue().getProofImageId());
    }

    @Test
    void publishDoesNotAcceptProofImageFromOtherFields() {
        /* 图片 id 只从 proofImageId 来：把 id 塞进别的文本字段不会变成证明图 */
        PublishTaskDTO dto = dto("teach", null);
        dto.setRequirements("42");
        service.publish(1L, dto);

        ArgumentCaptor<Task> saved = ArgumentCaptor.forClass(Task.class);
        verify(tasks).insert(saved.capture());
        assertNull(saved.getValue().getProofImageId());
        verify(tasks, times(1)).insert(any(Task.class));
    }
}
