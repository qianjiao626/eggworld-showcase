-- ============================================================
-- v2.2 副管理员权限：users 表新增 sub_admin 字段
-- 适用：已上线的既有库（新库由 init.sql 直接建全量，无需本文件）
-- 用法：mysql -uroot -p < migrate-sub-admin.sql
-- ============================================================
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sub_admin');

SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN sub_admin TINYINT NOT NULL DEFAULT 0 COMMENT ''副管理员: 0否 1是（可发布官方任务/审核任务）'' AFTER banned',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
