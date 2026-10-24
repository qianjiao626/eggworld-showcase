-- Apply only after a production database backup. Additive migration.
CREATE TABLE IF NOT EXISTS career_test_reports (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  answers TEXT NOT NULL,
  report_html MEDIUMTEXT NOT NULL,
  cost INT NOT NULL DEFAULT 50,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_career_reports_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
