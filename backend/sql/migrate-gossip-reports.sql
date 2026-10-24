-- 仅新增独立爆料模块；先备份数据库，先迁移后切换服务；严禁执行 init.sql。
CREATE TABLE IF NOT EXISTS gossip_reports (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  publisher_id BIGINT NOT NULL,
  anonymous TINYINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reward_amount INT NOT NULL DEFAULT 0,
  reward_status VARCHAR(20) NOT NULL DEFAULT 'none',
  reviewer_id BIGINT NULL,
  review_reason VARCHAR(500) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_report_status_created (status, created_at, id),
  KEY idx_report_publisher_created (publisher_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gossip_report_comments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  content VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'visible',
  moderator_id BIGINT NULL,
  moderation_reason VARCHAR(500) NULL,
  moderated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_report_comments_report_status (report_id, status, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gossip_report_likes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_report_like (report_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gossip_report_rewards (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT NOT NULL,
  recipient_id BIGINT NOT NULL,
  amount INT NOT NULL,
  operator_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_report_reward (report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gossip_report_actions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL,
  target_id BIGINT NOT NULL,
  action VARCHAR(20) NOT NULL,
  operator_id BIGINT NOT NULL,
  reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_report_action_target (target_type, target_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
