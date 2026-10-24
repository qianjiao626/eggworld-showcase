-- ============================================================
-- 「看看猫咪在想什么」6 小时冷却：cat_cabin_saves 新增 last_thought_at 字段
-- 适用：已上线的既有库（新库由 migrate-cat-cabin.sql 直接建全量，无需本文件）
-- 用法：mysql -uroot -p < migrate-cat-thought.sql
-- 安全：纯 ADD COLUMN，information_schema 判重后可重复执行
-- DATETIME(3) 毫秒精度：冷却判定按服务端时钟，防客户端改本地时间刷好感度
-- ============================================================
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cat_cabin_saves' AND COLUMN_NAME = 'last_thought_at');

SET @sql := IF(@col = 0,
  'ALTER TABLE cat_cabin_saves ADD COLUMN last_thought_at DATETIME(3) NULL COMMENT ''服务端权威：最近一次「看看猫咪在想什么」时刻（6h 冷却）'' AFTER last_donate_date',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
