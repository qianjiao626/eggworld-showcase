-- 每日签到表 增量迁移（v2.4）
CREATE TABLE IF NOT EXISTS daily_checkins (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL COMMENT '用户ID',
  check_date DATE   NOT NULL COMMENT '签到日期',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, check_date),
  KEY idx_user (user_id),
  CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日签到表';
