package com.eggworld.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.entity.User;
import com.eggworld.mapper.UserMapper;
import com.eggworld.service.AchievementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 成就每日扫描（每日 04:00）
 *
 * 覆盖两类「没有明确行为触发点」的条件：
 *   - register_days（元老：注册满 365 天）
 *   - meta_ach_count / meta_category_count（依赖已解锁数量，可能因其他成就解锁而达标）
 *
 * 幂等：AchievementService.evaluate 依赖 uk_user_ach 唯一键，重复执行无副作用。
 * 容错：单用户评估失败被 evaluateQuietly 吞掉，不影响整批。
 *
 * 性能说明：当前按全量学生用户遍历。本项目规模（千级用户）下每日一次可接受；
 * 若用户量显著增长，建议改为只扫描「近期有活动的用户」或分批处理。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AchievementDailyScheduler {

    private final UserMapper userMapper;
    private final AchievementService achievementService;

    @Scheduled(cron = "0 0 4 * * ?")
    public void scanDaily() {
        List<User> users = userMapper.selectList(
                new LambdaQueryWrapper<User>().select(User::getId));
        int handled = 0;
        for (User u : users) {
            // 全量兜底：补偿主流程成功但成就评估失败的记录，并覆盖存量用户。
            achievementService.evaluateQuietly(u.getId(), null);
            handled++;
        }
        log.info("每日成就扫描完成：处理 {} 名用户", handled);
    }
}
