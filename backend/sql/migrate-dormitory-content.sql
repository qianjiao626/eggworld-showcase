-- Apply only after a production database backup. This is an additive migration.
CREATE TABLE IF NOT EXISTS dormitory_notes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_name VARCHAR(100) NOT NULL,
  campus VARCHAR(100) NULL,
  building VARCHAR(100) NULL,
  content TEXT NOT NULL,
  source_url VARCHAR(1000) NULL,
  uploader_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewer_id BIGINT NULL,
  review_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  KEY idx_dormitory_notes_school_status (school_name, status, created_at),
  KEY idx_dormitory_notes_uploader (uploader_id, created_at),
  KEY idx_dormitory_notes_pending (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE dormitory_images
  ADD COLUMN campus VARCHAR(100) NULL,
  ADD COLUMN building VARCHAR(100) NULL;
