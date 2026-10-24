-- Apply only after a production database backup. Additive migration.
-- 大师兄简历：历史草稿（写简历生成的结构化数据）+ 深度对标记录（付费产出）。

CREATE TABLE IF NOT EXISTS resume_drafts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  target VARCHAR(120) NOT NULL DEFAULT '',
  data_json MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_resume_drafts_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_analyses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  resume_text MEDIUMTEXT NOT NULL,
  jd_text TEXT NOT NULL,
  score INT NULL,
  summary VARCHAR(255) NOT NULL DEFAULT '',
  result_json MEDIUMTEXT NOT NULL,
  cost INT NOT NULL DEFAULT 50,
  request_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_resume_analyses_request (user_id, request_id),
  KEY idx_resume_analyses_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
