-- ============================================================
-- 组队任务招募闭环：tasks.status 新增 full（已满员 / 招募已结束）
-- 适用：已上线的既有库（新库由 init.sql 直接建全量，无需本文件）
-- 用法：mysql -u eggworld -p eggworld < migrate-team-full-status.sql
-- 说明：组队任务在「配对入队人数达到 max_claimers」或「发布者主动结束招募」
--       或「报名截止到期但已有搭子入队」时进入 full：停止报名，广场置灰展示 7 天后收起，
--       任务本身继续走提交 / 确认 / 互评。
-- ============================================================
SET @hasFull := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
                   AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%''full''%');

SET @sql := IF(@hasFull = 0,
  'ALTER TABLE tasks MODIFY COLUMN status ENUM(''pending'',''approved'',''rejected'',''in_progress'',''completed'',''cancelled'',''expired'',''full'') NOT NULL DEFAULT ''pending'' COMMENT ''任务状态''',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
