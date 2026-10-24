-- =====================================================================
-- 职业测评报告：公开分享（生成分享链接 / 撤销）
--
-- 在 career_reports 上增加：
--   share_token  公开分享令牌（NULL = 未分享；撤销时置回 NULL）
--   shared_at    首次创建分享链接的时间
--   uk_career_reports_share  唯一键，保证一个令牌只对应一份报告
--
-- 执行（线上账号 eggworld）：
--   mysql -u eggworld -p eggworld < backend/sql/migrate-career-share.sql
--
-- 前置：career_reports 表已存在（migrate-career-reports.sql）。
-- 重复执行安全：先查 information_schema，再决定是否 ALTER。
-- 注意：只加列/索引，不改任何存量报告内容，也不影响计费。
-- =====================================================================
SET @col_token := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'career_reports' AND COLUMN_NAME = 'share_token'
);
SET @sql := IF(@col_token = 0,
  'ALTER TABLE career_reports ADD COLUMN share_token VARCHAR(32) NULL COMMENT ''公开分享令牌'' AFTER request_id',
  'SELECT ''share_token 已存在，跳过'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_shared_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'career_reports' AND COLUMN_NAME = 'shared_at'
);
SET @sql := IF(@col_shared_at = 0,
  'ALTER TABLE career_reports ADD COLUMN shared_at DATETIME NULL COMMENT ''首次创建分享链接的时间'' AFTER share_token',
  'SELECT ''shared_at 已存在，跳过'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_share := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'career_reports' AND INDEX_NAME = 'uk_career_reports_share'
);
SET @sql := IF(@idx_share = 0,
  'ALTER TABLE career_reports ADD UNIQUE KEY uk_career_reports_share (share_token)',
  'SELECT ''uk_career_reports_share 已存在，跳过'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
