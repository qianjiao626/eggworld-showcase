package com.eggworld.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.entity.Task;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.service.RatingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 组队互评结算定时任务
 * 互评期（rate_deadline）到期后：先抢占结算权 → 完成任务退 80% 出资（不依赖评分）
 * 与无人认领退回共用固定周期，互不影响
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RateSettleScheduler {

    private final TaskMapper taskMapper;
    private final RatingService ratingService;

    /** 每小时扫描一次到期的组队互评任务 */
    @Scheduled(fixedRate = 3600_000L)
    public void scanExpiredRatings() {
        List<Task> tasks = taskMapper.selectList(
                new LambdaQueryWrapper<Task>()
                        .eq(Task::getTaskType, "team")
                        .eq(Task::getStatus, "completed")
                        .eq(Task::getSettled, 0)
                        .isNotNull(Task::getRateDeadline)
                        .lt(Task::getRateDeadline, LocalDateTime.now()));

        int handled = 0;
        for (Task task : tasks) {
            ratingService.settleTask(task.getId());
            handled++;
        }
        if (handled > 0) {
            log.info("组队互评结算定时任务：处理 {} 条到期任务", handled);
        }
    }
}
