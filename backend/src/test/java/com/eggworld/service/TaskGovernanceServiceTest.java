package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskGovernanceLog;
import com.eggworld.mapper.TaskGovernanceLogMapper;
import com.eggworld.mapper.TaskMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 任务治理的处置规则：必填原因、状态互斥、资金在途保护、流水留痕。
 * 这些规则是「管理后台点错一下就把线上任务打没」的直接防线，所以逐条钉住。
 */
class TaskGovernanceServiceTest {

    private final TaskMapper taskMapper = mock(TaskMapper.class);
    private final TaskGovernanceLogMapper logMapper = mock(TaskGovernanceLogMapper.class);
    private final TaskService taskService = mock(TaskService.class);

    private TaskGovernanceService service() {
        return new TaskGovernanceService(taskMapper, logMapper, taskService);
    }

    @AfterEach
    void clearContext() {
        UserContext.clear();
    }

    private Task task(long id, String status) {
        Task t = new Task();
        t.setId(id);
        t.setTitle("测试任务");
        t.setStatus(status);
        return t;
    }

    // ==================== 必填原因 ====================

    @Test
    void hideRequiresReason() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service().hide(1L, "   "));
        assertTrue(ex.getMessage().contains("必须填写原因"), ex.getMessage());
        verify(taskMapper, never()).hideTask(any(), any());
    }

    @Test
    void deleteRequiresReason() {
        assertThrows(BusinessException.class, () -> service().delete(1L, null));
        verify(taskMapper, never()).deleteTask(any(), any());
    }

    @Test
    void restoreAndReturnReviewAllowBlankReason() {
        when(taskMapper.selectById(2L)).thenReturn(hiddenTask(2L));
        service().restore(2L, null);
        verify(taskMapper).restoreTask(2L);

        when(taskMapper.selectById(3L)).thenReturn(task(3L, "approved"));
        service().returnReview(3L, "");
        verify(taskMapper).returnToReview(3L);
    }

    private Task hiddenTask(long id) {
        Task t = task(id, "approved");
        t.setHidden(1);
        return t;
    }

    // ==================== 状态互斥 ====================

    @Test
    void cannotHideTwice() {
        when(taskMapper.selectById(4L)).thenReturn(hiddenTask(4L));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service().hide(4L, "重复发布刷屏"));
        assertTrue(ex.getMessage().contains("已经是屏蔽状态"), ex.getMessage());
    }

    @Test
    void cannotRestoreTaskThatIsNotHidden() {
        when(taskMapper.selectById(5L)).thenReturn(task(5L, "approved"));
        assertThrows(BusinessException.class, () -> service().restore(5L, null));
    }

    @Test
    void cannotRestoreOrHideDeletedTask() {
        Task deleted = task(6L, "approved");
        deleted.setDeleted(1);
        when(taskMapper.selectById(6L)).thenReturn(deleted);
        assertThrows(BusinessException.class, () -> service().hide(6L, "垃圾广告"));
        assertThrows(BusinessException.class, () -> service().restore(6L, null));
        assertThrows(BusinessException.class, () -> service().returnReview(6L, null));
    }

    @Test
    void missingTaskIsNotFound() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service().delete(999L, "违规内容：学术不端"));
        assertEquals(404, ex.getCode());
    }

    // ==================== 资金在途保护 ====================

    @Test
    void cannotDeleteOrReturnReviewWhenClaimsInFlight() {
        for (String status : new String[]{"in_progress", "full", "submitted", "completed"}) {
            when(taskMapper.selectById(7L)).thenReturn(task(7L, status));
            String deleteMsg = assertThrows(BusinessException.class,
                    () -> service().delete(7L, "违规内容")).getMessage();
            assertTrue(deleteMsg.contains("屏蔽"), "删除提示应引导改用屏蔽：" + deleteMsg);

            String backMsg = assertThrows(BusinessException.class,
                    () -> service().returnReview(7L, null)).getMessage();
            assertTrue(backMsg.contains("屏蔽"), "退回提示应引导改用屏蔽：" + backMsg);
        }
        verify(taskMapper, never()).deleteTask(any(), any());
        verify(taskMapper, never()).returnToReview(any());
    }

    @Test
    void hideIsStillAllowedWhenClaimsInFlight() {
        when(taskMapper.selectById(8L)).thenReturn(task(8L, "in_progress"));
        service().hide(8L, "涉嫌线下交易风险");
        verify(taskMapper).hideTask(8L, "涉嫌线下交易风险");
    }

    // ==================== 流水留痕 ====================

    @Test
    void everyActionWritesLogWithOperatorAndReason() {
        UserContext.set(new LoginUser(42L, "admin", "主管理员"));
        when(taskMapper.selectById(9L)).thenReturn(task(9L, "approved"));

        service().hide(9L, "含联系方式违规");

        ArgumentCaptor<TaskGovernanceLog> captor = ArgumentCaptor.forClass(TaskGovernanceLog.class);
        verify(logMapper).insert(captor.capture());
        TaskGovernanceLog log = captor.getValue();
        assertEquals(9L, log.getTaskId());
        assertEquals("测试任务", log.getTaskTitle());
        assertEquals(TaskGovernanceLog.ACTION_HIDE, log.getAction());
        assertEquals("含联系方式违规", log.getReason());
        assertEquals(42L, log.getOperatorId());
        assertEquals("主管理员", log.getOperatorName());
    }
}
