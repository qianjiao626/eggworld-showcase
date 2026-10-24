package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.config.AppProperties;
import com.eggworld.dto.ClaimDTO;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 功能开关 eggworld.features.task-auto-group 的新老流程路由（应急回滚止血）。
 *
 * 开关关闭（false）= 回到旧流程：不建任务群、报名进候选池等发布者 pair() 挑人、
 * 组队出资回到「发布者选中时」才冻、联系方式恢复必填。
 * 开关打开（true，默认）= 本次改动的「上线自动建群 + 认领即入队」。
 */
class TaskFlowToggleTest {

    TaskMapper tasks;
    TaskClaimMapper claims;
    UserMapper users;
    PointService points;
    NotificationService notices;
    ChatGroupService groups;
    /** 注入 ClaimService 的 TaskService 替身（认领逻辑只用到它的 memberCount） */
    TaskService memberStub;
    /** 真实 TaskService：验证建群与发布的开关分支 */
    TaskService service;
    ClaimService claimService;

    @BeforeEach
    void setup() {
        tasks = mock(TaskMapper.class);
        claims = mock(TaskClaimMapper.class);
        users = mock(UserMapper.class);
        points = mock(PointService.class);
        notices = mock(NotificationService.class);
        groups = mock(ChatGroupService.class);
        rebuild(true);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    /** 用指定开关状态重建两个服务（开关是构造期注入的配置对象，测试里改它的值即可） */
    private void rebuild(boolean autoGroup) {
        AppProperties props = new AppProperties();
        props.getFeatures().setTaskAutoGroup(autoGroup);
        memberStub = mock(TaskService.class);
        service = new TaskService(tasks, claims, mock(TaskRevisionMapper.class), users, points,
                mock(InviteService.class), notices, groups, props);
        claimService = new ClaimService(tasks, claims, users, mock(UserCharacterMapper.class),
                mock(UserStatsMapper.class), mock(RatingMapper.class), points, notices, memberStub, groups, props);
    }

    private Task teachTask(int maxClaimers) {
        Task t = new Task();
        t.setId(7L); t.setPublisherId(1L); t.setTitle("高数辅导");
        t.setTaskType("teach"); t.setStatus("approved"); t.setReward(10); t.setSkillCategory("study");
        t.setClaimMode(maxClaimers == 1 ? "single" : "multiple"); t.setMaxClaimers(maxClaimers);
        return t;
    }

    private Task teamTask(int maxClaimers) {
        Task t = teachTask(maxClaimers);
        t.setTaskType("team"); t.setReward(10); t.setTitle("组队刷题");
        return t;
    }

    /** 管理员发布组队任务（不带联系方式——开关关闭时应被拦下） */
    private PublishTaskDTO teamDto() {
        PublishTaskDTO dto = new PublishTaskDTO();
        dto.setTitle("组队刷题"); dto.setTaskType("team"); dto.setSkillCategory("study");
        dto.setReward(10); dto.setClaimMode("multiple"); dto.setMaxClaimers(3);
        return dto;
    }

    /**
     * 发布者替身：经验 100 = 进阶蛋，认领人数上限 3（LevelPolicy：新手蛋 2、每升一级 +1）。
     * 发布用例用 maxClaimers=3，给新用户等级（exp 为空）会被等级校验提前拦下，掩盖本类要验的开关分支。
     */
    private User publisherWithExp() {
        User u = new User();
        u.setId(1L);
        u.setNickname("蛋总");
        u.setExp(100);
        return u;
    }

    // ==================== TaskService：建群 / 发布 ====================

    @Test
    void groupCreationIsSkippedWhenToggleOff() {
        rebuild(false);

        assertNull(service.ensureTaskGroup(teachTask(1)));
        verify(groups, never()).createTaskGroup(anyLong(), anyString(), anyString());
        verify(tasks, never()).bindConversation(anyLong(), anyLong());
    }

    @Test
    void groupCreationWorksWhenToggleOn() {
        rebuild(true);
        when(groups.createTaskGroup(anyLong(), anyString(), anyString())).thenReturn(88L);

        assertEquals(88L, service.ensureTaskGroup(teachTask(1)).longValue());
        verify(tasks).bindConversation(7L, 88L);
    }

    @Test
    void publishRequiresContactWhenToggleOff() {
        rebuild(false);
        UserContext.set(new LoginUser(1L, "admin", "蛋总"));
        when(users.selectById(1L)).thenReturn(publisherWithExp());
        when(tasks.selectCount(any())).thenReturn(0L);

        BusinessException e = assertThrows(BusinessException.class, () -> service.publish(1L, teamDto()));

        assertTrue(e.getMessage().contains("请填写联系方式"), e.getMessage());
        verify(tasks, never()).insert(any(Task.class));     // 拦在入库/冻资之前
        verify(points, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), anyLong());
    }

    @Test
    void publishWithoutContactStillAllowedWhenToggleOn() {
        rebuild(true);
        UserContext.set(new LoginUser(1L, "admin", "蛋总"));
        when(users.selectById(1L)).thenReturn(publisherWithExp());
        when(tasks.selectCount(any())).thenReturn(0L);
        doAnswer(inv -> { ((Task) inv.getArgument(0)).setId(33L); return 1; }).when(tasks).insert(any(Task.class));
        when(groups.createTaskGroup(anyLong(), anyString(), anyString())).thenReturn(99L);

        assertEquals(33L, service.publish(1L, teamDto()).longValue());
        verify(groups).createTaskGroup(eq(1L), eq("组队刷题"), anyString());
    }

    // ==================== ClaimService：认领 ====================

    @Test
    void teachClaimFallsBackToCandidatePoolWhenToggleOff() {
        rebuild(false);
        when(tasks.selectById(7L)).thenReturn(teachTask(2));
        when(claims.selectCount(any())).thenReturn(0L);
        when(points.getBalance(9L)).thenReturn(1000);
        when(users.selectById(9L)).thenReturn(new User());

        ClaimDTO dto = new ClaimDTO();
        dto.setContact("wx-9");
        claimService.claim(9L, 7L, dto);

        ArgumentCaptor<TaskClaim> cap = ArgumentCaptor.forClass(TaskClaim.class);
        verify(claims).insert(cap.capture());
        assertEquals("pending_pairing", cap.getValue().getStatus());    // 回候选池，等发布者挑
        assertEquals(0, cap.getValue().getSelected());
        verify(groups, never()).joinIfAbsent(anyLong(), anyLong());     // 旧流程没有任务群
        verify(tasks, never()).updateById(any(Task.class));             // 任务留在 approved 继续收报名
    }

    @Test
    void teamClaimDoesNotFreezeDepositWhenToggleOff() {
        rebuild(false);
        when(tasks.selectById(7L)).thenReturn(teamTask(3));
        when(claims.selectCount(any())).thenReturn(0L);
        when(points.getBalance(9L)).thenReturn(1000);
        when(users.selectById(9L)).thenReturn(new User());

        ClaimDTO dto = new ClaimDTO();
        dto.setContact("wx-9");
        claimService.claim(9L, 7L, dto);

        /* 出资回到「发布者 pair() 选中时」才冻 —— 认领阶段一分钱不动 */
        verify(points, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), anyLong());
    }

    @Test
    void claimRequiresContactWhenToggleOff() {
        rebuild(false);
        when(tasks.selectById(7L)).thenReturn(teachTask(1));
        when(claims.selectCount(any())).thenReturn(0L);

        BusinessException e = assertThrows(BusinessException.class,
                () -> claimService.claim(9L, 7L, new ClaimDTO()));

        assertTrue(e.getMessage().contains("请填写联系方式"), e.getMessage());
        verify(claims, never()).insert(any(TaskClaim.class));
    }

    @Test
    void claimWithoutContactStillAllowedWhenToggleOn() {
        rebuild(true);
        Task t = teachTask(1);
        t.setConversationId(88L);
        when(tasks.selectById(7L)).thenReturn(t);
        when(claims.selectCount(any())).thenReturn(0L);
        when(points.getBalance(9L)).thenReturn(1000);
        when(users.selectById(9L)).thenReturn(new User());
        when(memberStub.memberCount(7L)).thenReturn(0L);

        claimService.claim(9L, 7L, new ClaimDTO());     // 新流程有任务群，联系方式可以空着

        ArgumentCaptor<TaskClaim> cap = ArgumentCaptor.forClass(TaskClaim.class);
        verify(claims).insert(cap.capture());
        assertEquals("in_progress", cap.getValue().getStatus());
        assertEquals(1, cap.getValue().getSelected());
        verify(groups).joinIfAbsent(9L, 88L);
    }
}
