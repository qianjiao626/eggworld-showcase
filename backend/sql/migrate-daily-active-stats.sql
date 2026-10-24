-- ============================================================
-- v2.5 每日活跃聚合快照：新增 daily_active_stats 表
-- 适用：已上线的既有库（新库由 init.sql 直接建全量，无需本文件）
-- 用法：mysql -ueggworld -p eggworld < migrate-daily-active-stats.sql
-- 说明：由 DailyStatsScheduler 每日凌晨聚合前一天的访客数据写入，
--       管理员看板直接查此表，避免实时扫描 visitor_sessions 大表。
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_active_stats (
  stat_date               DATE PRIMARY KEY COMMENT '统计日期',
  dau                     INT NOT NULL DEFAULT 0 COMMENT '日活跃登录用户数（去重）',
  anonymous_sessions      INT NOT NULL DEFAULT 0 COMMENT '匿名访客会话数',
  total_sessions          INT NOT NULL DEFAULT 0 COMMENT '总会话数（登录 + 匿名）',
  avg_duration_sec        INT NOT NULL DEFAULT 0 COMMENT '平均会话时长（秒）',
  new_visitor_count       INT NOT NULL DEFAULT 0 COMMENT '新访客数（首次访问）',
  returning_visitor_count INT NOT NULL DEFAULT 0 COMMENT '回访访客数',
  peak_hour               TINYINT COMMENT '最活跃小时（0-23）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日活跃聚合快照（管理员用户活跃看板数据源）';
