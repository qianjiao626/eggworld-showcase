package com.eggworld.job;

import com.eggworld.entity.DailyActiveStats;
import com.eggworld.mapper.DailyActiveStatsMapper;
import com.eggworld.mapper.VisitorSessionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 每日活跃数据聚合调度器：每天 04:05 聚合前一天的访客数据写入 daily_active_stats
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DailyStatsScheduler {

    private final VisitorSessionMapper visitorSessionMapper;
    private final DailyActiveStatsMapper dailyActiveStatsMapper;

    @Scheduled(cron = "0 5 4 * * *")
    public void aggregateYesterday() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        LocalDateTime from = yesterday.atStartOfDay();
        LocalDateTime to = yesterday.plusDays(1).atStartOfDay();

        DailyActiveStats stats = new DailyActiveStats();
        stats.setStatDate(yesterday);
        stats.setDau(visitorSessionMapper.countDistinctUsers(from, to));
        stats.setAnonymousSessions(visitorSessionMapper.countAnonymousSessions(from, to));
        stats.setTotalSessions(visitorSessionMapper.countTotalSessions(from, to));
        stats.setAvgDurationSec(visitorSessionMapper.avgDurationSec(from, to));
        stats.setNewVisitorCount(visitorSessionMapper.countNewVisitors(from, to));
        stats.setReturningVisitorCount(visitorSessionMapper.countReturningVisitors(from, to));
        stats.setPeakHour(visitorSessionMapper.peakHour(from, to));

        try {
            dailyActiveStatsMapper.insert(stats);
            log.info("daily-stats aggregated for {}: dau={}, sessions={}", yesterday, stats.getDau(), stats.getTotalSessions());
        } catch (Exception e) {
            log.warn("daily-stats for {} already exists or failed: {}", yesterday, e.getMessage());
        }
    }
}
