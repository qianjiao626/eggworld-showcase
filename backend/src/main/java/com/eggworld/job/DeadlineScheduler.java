package com.eggworld.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.service.NotificationService;
import com.eggworld.service.PointService;
import com.eggworld.service.TaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 报名截止定时任务（第一期）
 * ① 截止前 3 天 / 1 天：提醒发布者（文案含本次截止日期，靠 notifyOnce 去重）
 * ② 报名截止到期（教学/求助）：
 *    - 已有入选者（任务已开始）→ 不退回，按现有人数开工（转 full），候选池的人落选并通知
 *    - 无人入选（哪怕有人报名）→ 置 expired + 退回尚未花掉的冻结资金 + 通知发布者可重新发布
 * ③ 组队型单独分支：**没有报名截止**，只受「90 天兜底」约束，见 {@link #expireTeam}。
 *
 * 说明：
 * - 与 RefundScheduler 互不重复：RefundScheduler 只处理求助型 3 天无人认领；
 *   两边都只吃 status=approved，且都用条件更新（expireIfApproved / closeRecruitIfApproved）抢占，先到先得。
 * - 每 5 分钟一轮：把"已过期但仍挂在广场"的窗口压到 5 分钟以内。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeadlineScheduler {

    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final PointService pointService;
    private final NotificationService notificationService;
    private final TaskService taskService;

    /** 截止前提醒的天数（用户选定的节奏：3 天、1 天） */
    private static final int[] REMIND_DAYS = {3, 1};

    /** 每 5 分钟扫描一次 */
    @Scheduled(cron = "0 */5 * * * *")
    public void scanSignupDeadlines() {
        LocalDateTime now = LocalDateTime.now();
        List<Task> approved = taskMapper.selectList(
                new LambdaQueryWrapper<Task>().eq(Task::getStatus, "approved"));

        int reminded = 0, expired = 0;
        for (Task task : approved) {
            // 组队型没有报名截止，只受 90 天兜底约束（必须在这里分流，
            // 否则下面的 deadline == null 会把它当「长期有效」直接跳过，兜底形同虚设）
            if ("team".equals(task.getTaskType())) {
                if (expireTeam(task)) {
                    expired++;
                }
                continue;
            }
            LocalDateTime deadline = TaskService.effectiveSignupDeadline(task);
            if (deadline == null) {
                continue;   // 长期有效（奖励型没填截止）
            }
            if (deadline.isBefore(now)) {
                if (expire(task, deadline)) {
                    expired++;
                }
                continue;
            }
            long daysLeft = ChronoUnit.DAYS.between(now.toLocalDate(), deadline.toLocalDate());
            for (int d : REMIND_DAYS) {
                if (daysLeft == d && remind(task, deadline, d)) {
                    reminded++;
                }
            }
        }
        if (reminded > 0 || expired > 0) {
            log.info("报名截止定时任务：提醒 {} 条、过期 {} 条", reminded, expired);
        }
    }

    /** 截止前提醒：同一任务同一截止日期只发一次 */
    private boolean remind(Task task, LocalDateTime deadline, int daysLeft) {
        return notificationService.notifyOnce(task.getPublisherId(),
                "你的任务「" + task.getTitle() + "」将在 " + deadline.toLocalDate() + " 截止报名（还剩 " + daysLeft +
                        " 天），到期后会从广场下架。点「我的任务 → 已过期」可重新发布",
                "deadline", 24 * 30);
    }

    /**
     * 组队型到期处理（2026-09-21 起组队没有报名截止，本方法只负责 90 天兜底）。
     *
     * 规则：
     * - 已有人入选 → 任务早已转 full（pair 满员时收口），走到这里说明状态异常，不动。
     * - 超过 {@link TaskService#TEAM_RECRUIT_FALLBACK_DAYS} 天仍无人入选 → 下架退币，避免僵尸任务永久占位。
     * - 未超兜底 → 什么都不做，**继续挂在广场招募**（候选池有人没人都不下架）。
     *
     * 注意：这里刻意不看候选池是否有报名 —— 组队的语义是「只要没满员就长期招募」，
     * 没人报名同样继续挂着等；真正让任务消失的只有「满员转 full」与「90 天兜底」两条路径。
     */
    private boolean expireTeam(Task task) {
        // 兜底时钟锚定「最后一条状态变更」而非单纯创建时间：
        // 重新发布（renew）会把任务从 expired 拉回 approved，但 tasks.created_at 没有 ON UPDATE、
        // renewIfExpired 只改 signup_deadline —— 若仍按 createdAt 算，重新发布后会立刻被再次下架并白退一次币。
        // updated_at 由数据库 ON UPDATE CURRENT_TIMESTAMP 维护，每次状态变更都会刷新。
        LocalDateTime since = task.getCreatedAt();
        if (task.getUpdatedAt() != null && (since == null || task.getUpdatedAt().isAfter(since))) {
            since = task.getUpdatedAt();
        }
        if (since == null) {
            return false;   // 两个时间都没有，无法计算兜底
        }
        LocalDateTime fallback = since.plusDays(TaskService.TEAM_RECRUIT_FALLBACK_DAYS);
        if (fallback.isAfter(LocalDateTime.now())) {
            return false;   // 未到兜底期限：继续招募
        }
        if (taskMapper.expireIfApproved(task.getId()) == 0) {
            return false;
        }
        int refund = TaskService.frozenAmountOf(task);
        if (refund > 0) {
            pointService.changeBalance(task.getPublisherId(), refund, "refund",
                    "组队任务超期未成队退回：" + task.getTitle(), task.getId());
        }
        /* 退回已入队搭子的出资：「认领即入队」后未满员的队伍里可能已经有人冻过 10 币。
           以前"入选"只发生在发布者配对时，而配对满员即转 full、走不到这条分支，所以这里原先不用退；
           改成先到先得后若还不退，就等于把用户的币吞掉。 */
        for (TaskClaim c : taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getTaskId, task.getId())
                .eq(TaskClaim::getSelected, 1)
                .in(TaskClaim::getStatus, TaskService.SELECTED_STATUSES))) {
            pointService.changeBalance(c.getClaimerId(), TaskService.TEAM_DEPOSIT, "refund",
                    "组队任务超期未成队退回出资：" + task.getTitle(), task.getId());
            /* 队伍没能成行 → 把还在参与中的认领一并收尾（已经完成的除外）。
               不收尾的话，发布者点「重新发布」后这条 in_progress/selected=1 的记录仍能「提交完成」，
               任务完成后 RatingService.settleTask 会按 selected 再退一次 8 币 —— 本地实跑实测会凭空发币。 */
            if (!"completed".equals(c.getStatus())) {
                c.setStatus("cancelled");
                taskClaimMapper.updateById(c);
            }
            notificationService.notifyOnce(c.getClaimerId(),
                    "「" + task.getTitle() + "」招募超期未成队，已下架，你的 " + TaskService.TEAM_DEPOSIT
                            + " 币出资已退回，本次报名已关闭",
                    "deadline", 24 * 30);
        }
        taskService.closeCandidatePool(task.getId(), task.getTitle(), "cancelled",
                "组队招募超过 " + TaskService.TEAM_RECRUIT_FALLBACK_DAYS + " 天仍未成队，任务已关闭下架");
        notificationService.notifyOnce(task.getPublisherId(),
                "你的组队任务「" + task.getTitle() + "」招募已满 " + TaskService.TEAM_RECRUIT_FALLBACK_DAYS +
                        " 天仍未成队，已从广场下架并退回出资。点「我的任务 → 已过期」可重新发布，重新发布无需再次审核",
                "deadline", 24 * 30);
        return true;
    }

    /**
     * 报名截止到期处理（教学/求助；组队走 {@link #expireTeam}，奖励型长期有效不处理）：
     * - 已有入选者（任务已开始）→ **不退回**，置 full 按现有人数开工，候选池的人落选并通知
     * - 无人入选（哪怕有人报名）→ 置 expired + 退回尚未花掉的冻结资金 + 候选池取消 + 通知发布者可重新发布
     */
    private boolean expire(Task task, LocalDateTime deadline) {
        if ("reward".equals(task.getTaskType())) {
            return false;
        }
        long members = taskService.memberCount(task.getId());
        if (members > 0) {
            // 已有人入选 = 任务已开始，不能退回；只结束招募并按现有人数继续
            if (taskMapper.closeRecruitIfApproved(task.getId()) == 0) {
                return false;
            }
            taskService.closeCandidatePool(task.getId(), task.getTitle(), "rejected",
                    "报名已截止，本次未能入选");
            String msg = "「" + task.getTitle() + "」已于 " + deadline.toLocalDate() +
                    " 截止报名，已有 " + members + " 人入选，任务按现有人数开工，不再接受新报名";
            notificationService.notifyOnce(task.getPublisherId(), msg, "deadline", 24 * 30);
            for (TaskClaim c : taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                    .eq(TaskClaim::getTaskId, task.getId())
                    .eq(TaskClaim::getSelected, 1)
                    .in(TaskClaim::getStatus, TaskService.SELECTED_STATUSES))) {
                notificationService.notifyOnce(c.getClaimerId(), msg, "deadline", 24 * 30);
            }
            return true;
        }
        // 无人入选 → 解散下架（组队不走这里，见 expireTeam）
        if (taskMapper.expireIfApproved(task.getId()) == 0) {
            return false;
        }
        int refund = TaskService.frozenAmountOf(task);
        if (refund > 0) {
            pointService.changeBalance(task.getPublisherId(), refund, "refund",
                    "任务报名截止结束退回：" + task.getTitle(), task.getId());
        }
        taskService.closeCandidatePool(task.getId(), task.getTitle(), "cancelled",
                "报名截止时仍无人入选，任务已关闭下架");
        notificationService.notifyOnce(task.getPublisherId(),
                "你的任务「" + task.getTitle() + "」已于 " + deadline.toLocalDate() +
                        " 截止报名，已从广场下架。点「我的任务 → 已过期」可重新发布，重新发布无需再次审核",
                "deadline", 24 * 30);
        return true;
    }
}
