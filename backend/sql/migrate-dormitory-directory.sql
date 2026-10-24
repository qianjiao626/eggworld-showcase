CREATE TABLE IF NOT EXISTS dormitory_profiles (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_name VARCHAR(100) NOT NULL,
  occupancy VARCHAR(500) NULL,
  room_configuration VARCHAR(1000) NULL,
  facilities TEXT NULL,
  accommodation_cost VARCHAR(500) NULL,
  source_url VARCHAR(1000) NULL,
  source_year SMALLINT NULL,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
  note VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dormitory_profiles_school (school_name),
  KEY idx_dormitory_profiles_source_year (source_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dormitory_reviewers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  assigned_by BIGINT NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dormitory_reviewers_user (user_id),
  KEY idx_dormitory_reviewers_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dormitory_images (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_name VARCHAR(100) NOT NULL,
  uploader_id BIGINT NOT NULL,
  image_key VARCHAR(80) NOT NULL,
  content_type VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewer_id BIGINT NULL,
  review_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  UNIQUE KEY uk_dormitory_images_key (image_key),
  KEY idx_dormitory_images_status_created (status, created_at),
  KEY idx_dormitory_images_school_status (school_name, status),
  KEY idx_dormitory_images_uploader (uploader_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO dormitory_profiles
  (school_name, accommodation_cost, source_url, source_year, verification_status, note)
VALUES
  ('浙江理工大学', '2025 级普通本科住宿费按 1600 元/生·学年预收，后续按实际住宿情况结算。', 'https://zs.zstu.edu.cn/info/1033/3975.htm', 2025, 'partial', '仅记录学校 2025 级本科新生须知公布的预收标准；不代表所有年级、房间的最终收费，其他宿舍信息待核实。'),
  ('温州大学', '4 人间公寓 1600 元/生·学年；6 人间 1200 元；套房内 4/2 人间 1280 元、6 人间 960 元。最终按实际入住房型收费。', 'https://www.wzu.edu.cn/__local/7/65/3A/A8F9929D20CF1CAB4C013B6FACE_425FB15E_2EE26.pdf', 2025, 'partial', '依据学校 2025 年普通高校招生章程收费标准；具体收费以实际入住房型与物价备案为准，其他宿舍信息待核实。')
ON DUPLICATE KEY UPDATE school_name = VALUES(school_name);
