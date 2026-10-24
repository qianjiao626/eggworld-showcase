package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.service.mail.MailNotifyService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 配对提醒：谁该被提醒、邮件内容怎么汇总、每人每天为什么只能一封、管理员手动触发怎么反馈。
 */
@ExtendWith(MockitoExtension.class)
class PairingRemindServiceTest {

    @Mock TaskMapper taskMapper;
    @Mock TaskClaimMapper taskClaimMapper;
    @Mock UserMapper userMapper;
    @Mock NotificationService notificationService;
    @Mock MailNotifyService mailNotifyService;

    @InjectMocks PairingRemindService service;

    private TaskClaim claim(Long taskId) {
        TaskClaim c = new TaskClaim();
        c.setTaskId(taskId);
        c.setStatus(PairingRemindService.PENDING_PAIRING);
        return c;
    }

    private Task task(Long id, Long publisherId, String title, String status) {
        Task t = new Task();
        t.setId(id);
        t.setPublisherId(publisherId);
        t.setTitle(title);
        t.setStatus(status);
        return t;
    }

    private User user(Long id, String nickname, String email) {
        User u = new User();
        u.setId(id);
        u.setNickname(nickname);
        u.setEmail(email);
        u.setBanned(0);
        return u;
    }

    @SuppressWarnings("unchecked")
    private void givenPendingClaims(TaskClaim... claims) {
        when(taskClaimMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(claims));
    }

    @SuppressWarnings("unchecked")
    private void givenApprovedTasks(Task... tasks) {
        when(taskMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(tasks));
    }

    // ---------- 定时任务：提醒谁 ----------

    /** 一个发布者一条汇总邮件：名下所有待配对任务一起列出，而不是每个任务发一封 */
    @Test
    void sendsOneAggregatedMailPerPublisher() {
        givenPendingClaims(claim(9L), claim(8L), claim(7L));
        givenApprovedTasks(task(9L, 1L, "组队打球", "approved"), task(8L, 1L, "高数辅导", "approved"),
                task(7L, 2L, "帮取快递", "approved"));
        when(userMapper.selectById(1L)).thenReturn(user(1L, "蛋总", "boss@example.test"));
        when(userMapper.selectById(2L)).thenReturn(user(2L, "小明", "ming@example.test"));

        assertEquals(2, service.remindAll().sent());

        verify(mailNotifyService).sendPairingRemind("boss@example.test", "蛋总", List.of("组队打球", "高数辅导"));
        verify(mailNotifyService).sendPairingRemind("ming@example.test", "小明", List.of("帮取快递"));
        // 站内提醒同时落一条（固定文案，作为「今天已提醒过」的凭据）
        verify(notificationService).notify(1L, PairingRemindService.REMIND_TEXT, "pair");
        verify(notificationService).notify(2L, PairingRemindService.REMIND_TEXT, "pair");
    }

    /** 完全没有报名的任务不进提醒：没人可选，提醒发布者也没用 */
    @Test
    void doesNothingWhenNobodyApplied() {
        when(taskClaimMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        assertEquals(0, service.remindAll().sent());

        verifyNoInteractions(taskMapper, mailNotifyService, notificationService);
    }

    /** 认领还在候选池、但任务已下架（expired/full）的不算：不提醒 */
    @Test
    void skipsTasksThatAreNoLongerRecruiting() {
        givenPendingClaims(claim(9L));
        givenApprovedTasks();   // 状态过滤在 SQL 里：这里模拟一条都没查出来

        assertEquals(0, service.remindAll().sent());

        verifyNoInteractions(mailNotifyService);
    }

    /** 每人每天最多一封：今天已提醒过就整体跳过（站内与邮件同进同退） */
    @Test
    void skipsWhenAlreadyRemindedToday() {
        givenPendingClaims(claim(9L));
        givenApprovedTasks(task(9L, 1L, "组队打球", "approved"));
        when(userMapper.selectById(1L)).thenReturn(user(1L, "蛋总", "boss@example.test"));
        when(notificationService.hasSameSince(eq(1L), eq(PairingRemindService.REMIND_TEXT),
                any(LocalDateTime.class))).thenReturn(true);

        assertEquals(new PairingRemindService.RemindSummary(0, 1, 0), service.remindAll());

        verify(notificationService, never()).notify(anyLong(), anyString(), anyString());
        verify(mailNotifyService, never()).sendPairingRemind(anyString(), anyString(), anyList());
    }

    /** 封禁账号不再发邮件（站内提醒也不写） */
    @Test
    void skipsBannedPublisher() {
        givenPendingClaims(claim(9L));
        givenApprovedTasks(task(9L, 1L, "组队打球", "approved"));
        User banned = user(1L, "蛋总", "boss@example.test");
        banned.setBanned(1);
        when(userMapper.selectById(1L)).thenReturn(banned);

        assertEquals(new PairingRemindService.RemindSummary(0, 0, 1), service.remindAll());

        verify(notificationService, never()).notify(anyLong(), anyString(), anyString());
        verify(mailNotifyService, never()).sendPairingRemind(anyString(), anyString(), anyList());
    }

    /** 发布者已注销（任务仍在）：没人可提醒 */
    @Test
    void skipsPurgedPublisher() {
        givenPendingClaims(claim(9L));
        givenApprovedTasks(task(9L, 1L, "组队打球", "approved"));
        when(userMapper.selectById(1L)).thenReturn(null);

        assertEquals(new PairingRemindService.RemindSummary(0, 0, 1), service.remindAll());

        verifyNoInteractions(mailNotifyService);
    }

    // ---------- 管理员一键提醒 ----------

    @Test
    void adminRemindSendsAggregatedMailForThatPublisher() {
        when(taskMapper.selectById(9L)).thenReturn(task(9L, 1L, "组队打球", "approved"));
        when(taskClaimMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);
        givenPendingClaims(claim(9L), claim(8L));
        givenApprovedTasks(task(9L, 1L, "组队打球", "approved"), task(8L, 1L, "高数辅导", "approved"));
        when(userMapper.selectById(1L)).thenReturn(user(1L, "蛋总", "boss@example.test"));

        String message = service.remindForTask(9L);

        assertTrue(message.contains("蛋总"), "后台提示要带上发布者昵称：" + message);
        verify(mailNotifyService).sendPairingRemind("boss@example.test", "蛋总", List.of("组队打球", "高数辅导"));
    }

    /** 手动提醒同样受「每人每天一封」限制：当天已提醒过只回提示，不重复发信 */
    @Test
    void adminRemindIsThrottledWhenAlreadyRemindedToday() {
        when(taskMapper.selectById(9L)).thenReturn(task(9L, 1L, "组队打球", "approved"));
        when(taskClaimMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);
        givenPendingClaims(claim(9L));
        givenApprovedTasks(task(9L, 1L, "组队打球", "approved"));
        when(userMapper.selectById(1L)).thenReturn(user(1L, "蛋总", "boss@example.test"));
        when(notificationService.hasSameSince(eq(1L), anyString(), any(LocalDateTime.class))).thenReturn(true);

        String message = service.remindForTask(9L);

        assertTrue(message.contains("今天已经提醒过"), message);
        verify(mailNotifyService, never()).sendPairingRemind(anyString(), anyString(), anyList());
    }

    /** 点了「提醒」但这个任务根本没人报名 → 明确报错，不要静默发一封没内容的邮件 */
    @Test
    void adminRemindRejectsTaskWithoutPendingClaims() {
        when(taskMapper.selectById(9L)).thenReturn(task(9L, 1L, "组队打球", "approved"));
        when(taskClaimMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);

        BusinessException e = assertThrows(BusinessException.class, () -> service.remindForTask(9L));

        assertTrue(e.getMessage().contains("没有待配对"), e.getMessage());
        verifyNoInteractions(mailNotifyService);
    }

    /** 任务已满员/已下架 → 不提醒 */
    @Test
    void adminRemindRejectsTaskNotRecruiting() {
        when(taskMapper.selectById(9L)).thenReturn(task(9L, 1L, "组队打球", "full"));

        BusinessException e = assertThrows(BusinessException.class, () -> service.remindForTask(9L));

        assertTrue(e.getMessage().contains("不在招募中"), e.getMessage());
        verify(taskClaimMapper, never()).selectCount(any());
    }

    @Test
    void adminRemindRejectsMissingTask() {
        when(taskMapper.selectById(9L)).thenReturn(null);

        BusinessException e = assertThrows(BusinessException.class, () -> service.remindForTask(9L));

        assertEquals(404, e.getCode());
    }

    // ---------- 管理员「提醒全部待配对发布者」 ----------

    /** 批量提醒把所有待配对发布者一次扫完，并把「今天已提醒过」「账号不可用」的跳过数报给后台 */
    @Test
    void adminRemindAllReportsSentAndSkippedCounts() {
        givenPendingClaims(claim(9L), claim(8L), claim(7L));
        givenApprovedTasks(task(9L, 1L, "组队打球", "approved"), task(8L, 2L, "高数辅导", "approved"),
                task(7L, 3L, "帮取快递", "approved"));
        when(userMapper.selectById(1L)).thenReturn(user(1L, "蛋总", "boss@example.test"));
        when(userMapper.selectById(2L)).thenReturn(user(2L, "小明", "ming@example.test"));
        User banned = user(3L, "老黑", "hei@example.test");
        banned.setBanned(1);
        when(userMapper.selectById(3L)).thenReturn(banned);
        // 默认都没提醒过；只把 2 号设成「今天已提醒过」（Mockito 后设的匹配优先）
        when(notificationService.hasSameSince(anyLong(), anyString(), any(LocalDateTime.class))).thenReturn(false);
        when(notificationService.hasSameSince(eq(2L), anyString(), any(LocalDateTime.class))).thenReturn(true);

        String message = service.remindAllForAdmin();

        assertTrue(message.contains("已给 1 位发布者"), message);
        assertTrue(message.contains("1 位今天已提醒过"), message);
        assertTrue(message.contains("1 位账号已注销或已封禁"), message);
        verify(mailNotifyService).sendPairingRemind("boss@example.test", "蛋总", List.of("组队打球"));
        verify(mailNotifyService, never()).sendPairingRemind(eq("ming@example.test"), anyString(), anyList());
        verify(mailNotifyService, never()).sendPairingRemind(eq("hei@example.test"), anyString(), anyList());
    }

    /** 一个待配对都没有时不发信，也不该说「已发送 0 封」 */
    @Test
    void adminRemindAllSaysNothingToDoWhenNoPendingPairing() {
        when(taskClaimMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        String message = service.remindAllForAdmin();

        assertTrue(message.contains("无需提醒"), message);
        verifyNoInteractions(mailNotifyService);
    }
}
