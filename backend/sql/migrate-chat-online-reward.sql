-- ============================================================
-- 蛋蛋世界 - 聊天室挂机金币 增量迁移
-- 适用：已有线上库，禁止执行 init.sql
-- 特点：只建新表，不修改/删除任何现有业务表与数据
-- 执行前必须备份数据库；脚本不包含 USE/CREATE DATABASE/DROP/TRUNCATE/ALTER
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_online_reward (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id          BIGINT NOT NULL COMMENT '用户ID',
  reward_date      DATE NOT NULL COMMENT '奖励日期（Asia/Shanghai）',
  seconds          INT NOT NULL DEFAULT 0 COMMENT '当日已计入的在线秒数',
  coins            INT NOT NULL DEFAULT 0 COMMENT '当日已发放的在线金币（不含发言加成）',
  msg_reward_count INT NOT NULL DEFAULT 0 COMMENT '当日已计入加成的发言条数',
  last_tick_at     DATETIME COMMENT '上一次心跳结算时间（服务端时钟）',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_online_user_date (user_id, reward_date),
  KEY idx_chat_online_date (reward_date),
  CONSTRAINT fk_chat_online_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天室在线奖励（挂机金币）每日累计';
