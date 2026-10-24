-- ============================================================
-- v2.1 账号封禁/解封：users 表新增 banned 字段
-- 适用：已上线的既有库（新库由 init.sql 直接建全量，无需本文件）
-- 用法：mysql -uroot -p < migrate-user-ban.sql
-- ============================================================
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'banned');

SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN banned TINYINT NOT NULL DEFAULT 0 COMMENT ''封禁: 0正常 1已封禁'' AFTER deleted',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
