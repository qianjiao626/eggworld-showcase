-- 任务优质标签（管理员可标记）
-- 幂等：列已存在时跳过
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'featured');
SET @sql := IF(@exist = 0,
  'ALTER TABLE tasks ADD COLUMN featured TINYINT NOT NULL DEFAULT 0 COMMENT \'优质标签 0=普通 1=优质\'',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
