-- 仅新增公告与不可变的操作留痕；先备份数据库，先迁移后切换服务；严禁执行 init.sql。
CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  publisher_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'published',
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_announcement_status_published (status, published_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcement_actions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  announcement_id BIGINT NOT NULL,
  action VARCHAR(20) NOT NULL,
  operator_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_announcement_action_target (announcement_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
