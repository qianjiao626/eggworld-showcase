package com.eggworld.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.service.NotificationService;
import com.eggworld.service.PointService;
import com.eggworld.service.TaskService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 组队任务「人没满就找不到」修复的回归测试。
 *
 * 用户反馈：组队任务有人报名、发布者还没选人，就从广场消失了。
 * 修复口径（2026-09-21）：组队 = **长期招募**
 *   ① 组队没有报名截止（TaskService.effectiveSignupDeadline 对 team 返回 null）
 *   ② 没满员就一直留在广场、一直可报名
 *   ③ 只有两条路径能让组队任务离开招募：满员转 full、或超过 90 天兜底
 */
@ExtendWith(MockitoExtension.class)
class DeadlineSchedulerTeamTest {

    @Mock TaskMapper taskMapper;
    @Mock TaskClaimMapper taskClaimMapper;
    @Mock PointService pointService;
    @Mock NotificationService notificationService;
    @Mock TaskService taskService;

    @InjectMocks DeadlineScheduler scheduler;

    /** 组队任务（发布时前端会带一个显式截止，但组队已忽略它） */
    private Task teamTask(Long id, int ageDays) {
        Task t = new Task();
        t.setId(id);
        t.setTitle("组队测试任务");
        t.setTaskType("team");
        t.setStatus("approved");
        t.setPublisherId(1L);
        t.setReward(10);
        t.setCreatedAt(LocalDateTime.now().minusDays(ageDays));
        t.setSignupDeadline(LocalDateTime.now().minusDays(1));   // 昨天到期（组队应忽略）
        return t;
    }

    private void scan(Task task) {
        when(taskMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(task));
        scheduler.scanSignupDeadlines();
    }

    // ---------- 核心回归：报名截止到期不再下架 ----------

    @Test
    void teamTaskWithCandidatesIsNotExpiredAtDeadline() {
        // 有人报名（未选人）、未超兜底 -> 不下架，继续招募
        scan(teamTask(9L, 40));

        verify(taskMapper, never()).expireIfApproved(anyLong());
        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
    }

    @Test
    void teamTaskWithoutAnyCandidateAlsoKeepsRecruiting() {
        // 连候选池都是空的，也不再下架 —— 组队「只要没满员就长期招募」
        scan(teamTask(9L, 40));

        verify(taskMapper, never()).expireIfApproved(anyLong());
    }

    @Test
    void teamTaskIsNotExpiredEvenLongAfterExplicitDeadline() {
        // 显式截止早已过去（89 天前到期），但未到 90 天兜底 -> 仍不下架
        Task task = teamTask(9L, TaskService.TEAM_RECRUIT_FALLBACK_DAYS - 1);
        scan(task);

        verify(taskMapper, never()).expireIfApproved(anyLong());
    }

    // ---------- 90 天兜底 ----------

    @Test
    void teamTaskExpiresAfterFallbackDays() {
        // 超过 90 天仍未成队 -> 下架退币（组队固定退发布者 10）
        Task task = teamTask(9L, TaskService.TEAM_RECRUIT_FALLBACK_DAYS + 5);
        when(taskMapper.expireIfApproved(9L)).thenReturn(1);
        scan(task);

        verify(taskMapper).expireIfApproved(9L);
        verify(pointService).changeBalance(eq(1L), eq(10), eq("refund"), anyString(), eq(9L));
    }

    @Test
    void teamTaskExpiryRefundsSelectedMembersDeposit() {
        // 「认领即入队」后，未满员的队伍里可能已经有搭子冻过 10 币出资 —— 超期下架必须退给他们。
        // （原先"入选"只发生在发布者配对时，而配对满员即转 full、走不到这条分支，所以以前不需要退；
        //   改成先到先得后若不退，就等于把用户的币吞掉。）
        Task task = teamTask(9L, TaskService.TEAM_RECRUIT_FALLBACK_DAYS + 5);
        when(taskMapper.expireIfApproved(9L)).thenReturn(1);
        TaskClaim member = new TaskClaim();
        member.setId(70L);
        member.setTaskId(9L);
        member.setClaimerId(2L);
        member.setStatus("in_progress");
        member.setSelected(1);
        when(taskClaimMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(member));
        scan(task);

        verify(pointService).changeBalance(eq(1L), eq(10), eq("refund"), anyString(), eq(9L));   // 发布者出资
        verify(pointService).changeBalance(eq(2L), eq(10), eq("refund"), anyString(), eq(9L));   // 已入队搭子出资
        verify(notificationService).notifyOnce(eq(2L), anyString(), eq("deadline"), anyInt());
        // 队伍没成行 → 认领一并收尾：不收尾的话「重新发布 → 提交 → 完成」会再退一次 8 币（凭空发币）
        assertEquals("cancelled", member.getStatus());
        verify(taskClaimMapper).updateById(member);
    }

    @Test
    void teamTaskExpiryKeepsCompletedMemberClaimsUntouched() {
        // 已经完成的认领不改状态：只退仍在参与中的
        Task task = teamTask(9L, TaskService.TEAM_RECRUIT_FALLBACK_DAYS + 5);
        when(taskMapper.expireIfApproved(9L)).thenReturn(1);
        TaskClaim done = new TaskClaim();
        done.setId(71L);
        done.setTaskId(9L);
        done.setClaimerId(2L);
        done.setStatus("completed");
        done.setSelected(1);
        when(taskClaimMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(done));
        scan(task);

        assertEquals("completed", done.getStatus());
        verify(taskClaimMapper, never()).updateById(any(TaskClaim.class));
    }

    @Test
    void renewingATeamTaskResetsTheFallbackClock() {
        // 重新发布（renew）会把任务从 expired 拉回 approved，但 created_at 不变
        //（tasks.created_at 没有 ON UPDATE，renewIfExpired 只改 signup_deadline）。
        // 若兜底仍锚定 created_at，重新发布后任务会在下一轮扫描被立刻再次下架 —— 白退一次币。
        Task task = teamTask(9L, TaskService.TEAM_RECRUIT_FALLBACK_DAYS + 10);  // 创建已超兜底
        task.setUpdatedAt(LocalDateTime.now().minusDays(1));                    // 昨天刚重新发布
        scan(task);

        verify(taskMapper, never()).expireIfApproved(anyLong());
    }

    @Test
    void teamTaskWithNoCreatedAtIsNeverExpired() {
        // 没有发布时间 -> 无法计算兜底，保守不动
        Task task = teamTask(9L, 0);
        task.setCreatedAt(null);
        scan(task);

        verify(taskMapper, never()).expireIfApproved(anyLong());
    }

    // ---------- 组队不走报名截止路径 ----------

    @Test
    void teamTaskIsNotRemindedAboutDeadline() {
        // 组队没有报名截止 -> 不该给发布者发「即将截止」提醒
        scan(teamTask(9L, 27));

        verify(notificationService, never()).notifyOnce(anyLong(), anyString(), eq("deadline"), anyInt());
    }

    @Test
    void teamTaskWithSelectedMembersIsNotTouched() {
        // 已有人入选时任务应早已转 full（pair 满员收口），本任务不应再动它
        scan(teamTask(9L, 10));

        verify(taskMapper, never()).closeRecruitIfApproved(anyLong());
        verify(taskMapper, never()).expireIfApproved(anyLong());
    }

    // ---------- 教学 / 求助不受影响 ----------

    @Test
    void helpTaskStillExpiresByOriginalRule() {
        // 求助型不受影响：报名截止一到、无人入选即下架退币
        Task task = new Task();
        task.setId(8L);
        task.setTitle("求助任务");
        task.setTaskType("help");
        task.setStatus("approved");
        task.setPublisherId(1L);
        task.setReward(20);
        task.setCreatedAt(LocalDateTime.now().minusDays(40));
        task.setSignupDeadline(LocalDateTime.now().minusDays(1));
        when(taskService.memberCount(8L)).thenReturn(0L);
        when(taskMapper.expireIfApproved(8L)).thenReturn(1);
        scan(task);

        verify(taskMapper).expireIfApproved(8L);
        verify(pointService).changeBalance(eq(1L), eq(20), eq("refund"), anyString(), eq(8L));
    }

    @Test
    void helpTaskWithSelectedMembersSwitchesToFull() {
        // 求助型已有人入选 -> 按现有人数开工（转 full），不下架
        Task task = new Task();
        task.setId(8L);
        task.setTitle("求助任务");
        task.setTaskType("help");
        task.setStatus("approved");
        task.setPublisherId(1L);
        task.setReward(20);
        task.setCreatedAt(LocalDateTime.now().minusDays(40));
        task.setSignupDeadline(LocalDateTime.now().minusDays(1));
        when(taskService.memberCount(8L)).thenReturn(2L);
        when(taskMapper.closeRecruitIfApproved(8L)).thenReturn(1);
        scan(task);

        verify(taskMapper).closeRecruitIfApproved(8L);
        verify(taskMapper, never()).expireIfApproved(anyLong());
    }

    @Test
    void rewardTaskIsNeverExpired() {
        // 奖励型长期有效（effectiveSignupDeadline 返回 null），不进任何下架路径
        Task task = new Task();
        task.setId(7L);
        task.setTitle("官方悬赏");
        task.setTaskType("reward");
        task.setStatus("approved");
        task.setPublisherId(1L);
        task.setReward(50);
        task.setCreatedAt(LocalDateTime.now().minusDays(200));
        scan(task);

        verify(taskMapper, never()).expireIfApproved(anyLong());
    }
}