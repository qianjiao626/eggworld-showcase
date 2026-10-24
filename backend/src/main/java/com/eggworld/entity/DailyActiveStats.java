package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;

/**
 * 每日活跃聚合快照实体，对应表 daily_active_stats
 * 由 DailyStatsScheduler 每日凌晨聚合写入，管理员看板直接查此表。
 */
@Data
@TableName("daily_active_stats")
public class DailyActiveStats {

    /** 统计日期（主键，非自增） */
    @TableId
    private LocalDate statDate;

    /** 日活跃登录用户数（去重） */
    private Integer dau;

    /** 匿名访客会话数 */
    private Integer anonymousSessions;

    /** 总会话数（登录 + 匿名） */
    private Integer totalSessions;

    /** 平均会话时长（秒） */
    private Integer avgDurationSec;

    /** 新访客数（首次访问） */
    private Integer newVisitorCount;

    /** 回访访客数 */
    private Integer returningVisitorCount;

    /** 最活跃小时（0-23） */
    private Integer peakHour;
}
