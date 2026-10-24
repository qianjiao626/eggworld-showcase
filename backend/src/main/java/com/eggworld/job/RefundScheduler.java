package com.eggworld.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.service.PointService;
import com.eggworld.service.TaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 自动退回定时任务（Task 13）
 * 求助型任务 3 天无人认领 → 自动过期并退回冻结蛋蛋币（文档 6.3）。
 * 组队型不在此列：只要有人报名就继续招募，由 DeadlineScheduler 的 90 天兜底收口。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RefundScheduler {

    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final PointService pointService;

    /** 无人认领自动退回天数 */
    private static final int AUTO_REFUND_DAYS = 3;

    /** 每小时扫描一次 */
    @Scheduled(fixedRate = 3600_000L)
    public void scanExpiredTasks() {
        LocalDateTime deadline = LocalDateTime.now().minusDays(AUTO_REFUND_DAYS);

        // 查找：求助型 + 已审核通过 + 超时无人认领。
        //
        // ⚠️ 组队型已移出本任务（2026-09-21）：组队按「有人报名就继续招募」处理，
        //    由 DeadlineScheduler 的 90 天兜底负责收口；放在这里会与招募逻辑冲突。
        List<Task> expired = taskMapper.selectList(
                new LambdaQueryWrapper<Task>()
                        .eq(Task::getTaskType, "help")
                        .eq(Task::getStatus, "approved")
                        .lt(Task::getCreatedAt, deadline));

        int handled = 0;
        for (Task task : expired) {
            // 再次确认确实无人认领（防止并发认领后误退）
            Long claimCount = taskClaimMapper.selectCount(
                    new LambdaQueryWrapper<TaskClaim>().eq(TaskClaim::getTaskId, task.getId()));
            if (claimCount > 0) {
                continue;
            }
            task.setStatus("expired");
            taskMapper.updateById(task);
            // 退回发布时冻结的蛋蛋币（组队固定 10，求助退回悬赏）
            int amount = TaskService.frozenAmountOf(task);
            pointService.changeBalance(task.getPublisherId(), amount, "refund",
                    "任务超时无人认领退回：" + task.getTitle(), task.getId());
            handled++;
        }
        if (handled > 0) {
            log.info("自动退回定时任务：处理 {} 条超时任务", handled);
        }
    }
}
