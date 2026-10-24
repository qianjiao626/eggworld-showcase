CREATE TABLE IF NOT EXISTS school_complaints (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_name VARCHAR(100) NOT NULL,
  user_id     BIGINT,
  content     VARCHAR(500),
  metrics     JSON NOT NULL,
  score       DECIMAL(2,1) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_school (school_name),
  KEY idx_created (created_at),
  CONSTRAINT fk_bl_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
