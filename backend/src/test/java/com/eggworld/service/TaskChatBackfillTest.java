package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.dto.TaskChatBackfillVO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 存量任务补群（LegacyDataMigrationService）：建群 + 回写 + 拉老成员、跳过已建群/状态已变的任务、单任务失败不中断批次。
 * 纯 Mockito（无 Spring 上下文）：事务代理不生效，TransactionTemplate 只负责把回调执行掉。
 */
class TaskChatBackfillTest {

    TaskMapper tasks;
    TaskClaimMapper claims;
    TaskService taskService;
    ChatGroupService groups;
    LegacyDataMigrationService service;

    @BeforeEach
    void setup() {
        tasks = mock(TaskMapper.class);
        claims = mock(TaskClaimMapper.class);
        taskService = mock(TaskService.class);
        groups = mock(ChatGroupService.class);
        service = new LegacyDataMigrationService(tasks, claims, taskService, groups,
                mock(PlatformTransactionManager.class));
    }

    private Task task(long id) {
        Task t = new Task();
        t.setId(id);
        t.setTaskType("team");
        t.setStatus("approved");
        t.setPublisherId(1L);
        t.setTitle("组队刷题");
        return t;
    }

    private TaskClaim selected(long claimerId) {
        TaskClaim c = new TaskClaim();
        c.setTaskId(7L);
        c.setClaimerId(claimerId);
        c.setSelected(1);
        c.setStatus("in_progress");
        return c;
    }

    @Test
    void backfillCreatesGroupAndPullsSelectedMembers() {
        when(tasks.selectList(any())).thenReturn(List.of(task(7L)));
        when(tasks.selectById(7L)).thenReturn(task(7L));
        when(taskService.ensureTaskGroup(any())).thenReturn(88L);
        when(claims.selectList(any())).thenReturn(List.of(selected(1L), selected(2L), selected(3L)));

        TaskChatBackfillVO vo = service.backfillTaskChatGroups();

        assertEquals(1, vo.getScanned());
        assertEquals(1, vo.getCreated());
        assertEquals(2, vo.getJoined());
        assertEquals(0, vo.getFailed());
        verify(taskService).ensureTaskGroup(any());
        verify(groups).joinIfAbsent(2L, 88L);
        verify(groups).joinIfAbsent(3L, 88L);
        verify(groups, never()).joinIfAbsent(eq(1L), anyLong());    // 发布者是群主，建群时已入群
    }

    @Test
    void taskWithGroupAlreadyBoundIsSkipped() {
        Task bound = task(7L);
        bound.setConversationId(66L);
        when(tasks.selectList(any())).thenReturn(List.of(bound));
        when(tasks.selectById(7L)).thenReturn(bound);

        TaskChatBackfillVO vo = service.backfillTaskChatGroups();

        assertEquals(0, vo.getCreated());
        assertEquals(0, vo.getJoined());
        verify(taskService, never()).ensureTaskGroup(any());        // 幂等：不再建第二个群
        verify(groups, never()).joinIfAbsent(anyLong(), anyLong());
    }

    @Test
    void taskFinishedDuringBatchIsSkipped() {
        when(tasks.selectList(any())).thenReturn(List.of(task(7L)));    // 扫描时还是 approved
        Task finished = task(7L);
        finished.setStatus("completed");                                // 执行前刚好被确认完成
        when(tasks.selectById(7L)).thenReturn(finished);

        TaskChatBackfillVO vo = service.backfillTaskChatGroups();

        assertEquals(1, vo.getScanned());
        assertEquals(0, vo.getCreated());
        verify(taskService, never()).ensureTaskGroup(any());            // 不给已完成的任务建一个永不归档的群
    }

    @Test
    void taskSkippedWhenGroupCreationIsDisabled() {
        when(tasks.selectList(any())).thenReturn(List.of(task(7L)));
        when(tasks.selectById(7L)).thenReturn(task(7L));
        when(taskService.ensureTaskGroup(any())).thenReturn(null);      // 建群开关已关闭

        TaskChatBackfillVO vo = service.backfillTaskChatGroups();

        assertEquals(1, vo.getScanned());
        assertEquals(0, vo.getCreated());
        assertEquals(0, vo.getJoined());
        verify(groups, never()).joinIfAbsent(anyLong(), anyLong());
    }

    @Test
    void oneTaskFailureDoesNotStopTheBatch() {
        when(tasks.selectList(any())).thenReturn(List.of(task(7L), task(8L), task(9L)));
        when(tasks.selectById(7L)).thenReturn(task(7L));
        when(tasks.selectById(8L)).thenReturn(task(8L));
        when(tasks.selectById(9L)).thenReturn(task(9L));
        when(claims.selectList(any())).thenReturn(List.of());
        when(taskService.ensureTaskGroup(any())).thenAnswer(inv -> {
            Task t = inv.getArgument(0);
            if (t.getId() == 8L) {
                throw new BusinessException("群成员已满");
            }
            return t.getId() + 100;
        });

        TaskChatBackfillVO vo = service.backfillTaskChatGroups();

        assertEquals(3, vo.getScanned());
        assertEquals(2, vo.getCreated());      // 7、9 照常建群
        assertEquals(1, vo.getFailed());
        assertEquals(1, vo.getFailures().size());
        assertTrue(vo.getFailures().get(0).contains("#8"), vo.getFailures().get(0));
        assertTrue(vo.getFailures().get(0).contains("群成员已满"), vo.getFailures().get(0));
    }
}
