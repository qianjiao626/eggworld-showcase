-- ============================================================
-- 蛋蛋世界 - 聊天室增量迁移
-- 适用：已有线上库，禁止执行 init.sql
-- 特点：只建新表，不修改/删除任何现有业务表与数据
-- 执行前必须备份数据库；脚本不包含 USE/CREATE DATABASE/DROP/TRUNCATE
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  type            ENUM('direct','group','channel') NOT NULL COMMENT '会话类型',
  title           VARCHAR(100) COMMENT '群/频道名称；私聊为空',
  description     VARCHAR(500) COMMENT '群/频道简介',
  avatar_key      VARCHAR(80) COMMENT '预留头像资源key，第一版不使用',
  group_id        BIGINT COMMENT '自建群ID；非自建群为空',
  channel_key     VARCHAR(50) COMMENT '官方频道稳定标识',
  direct_key      VARCHAR(80) COMMENT '私聊双方稳定键',
  owner_id        BIGINT COMMENT '群主；频道为空',
  visibility      ENUM('private','public','official') NOT NULL DEFAULT 'private' COMMENT '可见性',
  read_only       TINYINT NOT NULL DEFAULT 0 COMMENT '1=只读公告，仅管理员可发言',
  status          ENUM('active','dissolved','archived') NOT NULL DEFAULT 'active',
  max_members     INT NOT NULL DEFAULT 200 COMMENT '成员上限',
  member_count    INT NOT NULL DEFAULT 0 COMMENT '成员计数缓存',
  last_message_id BIGINT COMMENT '最后消息ID',
  last_message_at DATETIME COMMENT '最后消息时间',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_channel_key (channel_key),
  UNIQUE KEY uk_chat_direct_key (direct_key),
  UNIQUE KEY uk_chat_group_id (group_id),
  KEY idx_chat_conversation_type_status (type, status),
  KEY idx_chat_conversation_visibility (visibility, status),
  KEY idx_chat_conversation_last (last_message_at),
  CONSTRAINT fk_chat_conv_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天室会话（私聊/群聊/频道）';

CREATE TABLE IF NOT EXISTS chat_conversation_members (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  conversation_id BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  role            ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
  status          ENUM('active','left','kicked','blocked') NOT NULL DEFAULT 'active',
  muted_until     DATETIME COMMENT '会话内禁言截止；NULL=未禁言',
  joined_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at         DATETIME,
  last_read_message_id BIGINT NOT NULL DEFAULT 0 COMMENT '最后已读消息ID',
  last_read_at    DATETIME,
  unread_count    INT NOT NULL DEFAULT 0 COMMENT '会话未读数缓存',
  mention_unread  INT NOT NULL DEFAULT 0 COMMENT '其中@/回复未读数',
  notification_mode ENUM('all','mention','muted') NOT NULL DEFAULT 'all',
  pinned          TINYINT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_member (conversation_id, user_id),
  KEY idx_chat_member_user_status (user_id, status, updated_at),
  KEY idx_chat_member_conv_status (conversation_id, status),
  CONSTRAINT fk_chat_member_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_member_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天室会话成员与未读状态';

CREATE TABLE IF NOT EXISTS chat_messages (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  conversation_id BIGINT NOT NULL,
  sender_id       BIGINT NOT NULL,
  message_type    ENUM('text','system') NOT NULL DEFAULT 'text',
  content         VARCHAR(1000) NOT NULL,
  reply_to_id     BIGINT COMMENT '回复的消息ID',
  mention_json    JSON COMMENT '被@用户ID数组',
  status          ENUM('normal','recalled','deleted') NOT NULL DEFAULT 'normal',
  client_msg_id   VARCHAR(64) COMMENT '客户端幂等ID',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_client_msg (sender_id, client_msg_id),
  KEY idx_chat_msg_conv_id (conversation_id, id),
  KEY idx_chat_msg_sender_time (sender_id, created_at),
  KEY idx_chat_msg_created (created_at),
  CONSTRAINT fk_chat_msg_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id),
  CONSTRAINT fk_chat_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天室热消息表';

CREATE TABLE IF NOT EXISTS chat_messages_archive (
  id              BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  sender_id       BIGINT,
  sender_snapshot VARCHAR(50) COMMENT '注销/删除后的展示快照',
  message_type    ENUM('text','system') NOT NULL DEFAULT 'text',
  content         VARCHAR(1000) NOT NULL,
  reply_to_id     BIGINT,
  mention_json    JSON,
  status          ENUM('normal','recalled','deleted') NOT NULL DEFAULT 'normal',
  created_at      DATETIME NOT NULL,
  archived_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chat_archive_conv (conversation_id, created_at),
  KEY idx_chat_archive_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天室冷归档消息表';

CREATE TABLE IF NOT EXISTS chat_read_states (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id         BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_read (user_id, conversation_id),
  KEY idx_chat_read_updated (updated_at),
  CONSTRAINT fk_chat_read_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_chat_read_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天室跨设备已读位置';

CREATE TABLE IF NOT EXISTS chat_friend_requests (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  requester_id    BIGINT NOT NULL,
  target_id       BIGINT NOT NULL,
  message         VARCHAR(200),
  status          ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at      DATETIME,
  UNIQUE KEY uk_chat_friend_pending (requester_id, target_id, status),
  KEY idx_chat_friend_target_status (target_id, status, created_at),
  CONSTRAINT fk_chat_friend_req_requester FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_chat_friend_req_target FOREIGN KEY (target_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='好友申请';

CREATE TABLE IF NOT EXISTS chat_friends (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id         BIGINT NOT NULL,
  friend_id       BIGINT NOT NULL,
  remark          VARCHAR(50),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_friend_pair (user_id, friend_id),
  KEY idx_chat_friend_user (user_id, created_at),
  CONSTRAINT fk_chat_friend_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_chat_friend_friend FOREIGN KEY (friend_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='双向好友关系（成对写两行）';

CREATE TABLE IF NOT EXISTS chat_follows (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  follower_id     BIGINT NOT NULL,
  following_id    BIGINT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_follow (follower_id, following_id),
  KEY idx_chat_following (following_id, created_at),
  CONSTRAINT fk_chat_follow_follower FOREIGN KEY (follower_id) REFERENCES users(id),
  CONSTRAINT fk_chat_follow_following FOREIGN KEY (following_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='关注关系';

CREATE TABLE IF NOT EXISTS chat_blocks (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id         BIGINT NOT NULL,
  blocked_id      BIGINT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_block (user_id, blocked_id),
  KEY idx_chat_blocked (blocked_id, created_at),
  CONSTRAINT fk_chat_block_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_chat_block_blocked FOREIGN KEY (blocked_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='黑名单';

CREATE TABLE IF NOT EXISTS chat_groups (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  conversation_id BIGINT NOT NULL,
  owner_id        BIGINT NOT NULL,
  name            VARCHAR(100) NOT NULL,
  description     VARCHAR(500),
  visibility      ENUM('private','public') NOT NULL DEFAULT 'private',
  max_members     INT NOT NULL DEFAULT 200,
  status          ENUM('active','dissolved') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_group_conv (conversation_id),
  KEY idx_chat_group_owner_status (owner_id, status),
  KEY idx_chat_group_visibility (visibility, status),
  CONSTRAINT fk_chat_group_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id),
  CONSTRAINT fk_chat_group_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户自建群';

CREATE TABLE IF NOT EXISTS chat_group_members (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  group_id        BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  role            ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
  status          ENUM('active','left','kicked','blocked') NOT NULL DEFAULT 'active',
  joined_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at         DATETIME,
  UNIQUE KEY uk_chat_group_member (group_id, user_id),
  KEY idx_chat_group_member_user (user_id, status),
  CONSTRAINT fk_chat_gm_group FOREIGN KEY (group_id) REFERENCES chat_groups(id),
  CONSTRAINT fk_chat_gm_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自建群成员';

CREATE TABLE IF NOT EXISTS chat_mutes (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  scope           ENUM('global','conversation') NOT NULL,
  conversation_id BIGINT,
  user_id         BIGINT NOT NULL,
  operator_id     BIGINT NOT NULL,
  reason          VARCHAR(300),
  muted_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  muted_until     DATETIME NOT NULL,
  revoked_at      DATETIME,
  revoked_by      BIGINT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chat_mute_user_active (user_id, scope, muted_until),
  KEY idx_chat_mute_conv (conversation_id, user_id, muted_until),
  CONSTRAINT fk_chat_mute_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_chat_mute_operator FOREIGN KEY (operator_id) REFERENCES users(id),
  CONSTRAINT fk_chat_mute_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全站/会话禁言记录';

CREATE TABLE IF NOT EXISTS chat_reports (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  reporter_id     BIGINT NOT NULL,
  conversation_id BIGINT,
  message_id      BIGINT,
  target_user_id  BIGINT,
  reason          VARCHAR(100) NOT NULL,
  detail          VARCHAR(1000),
  context_json    JSON COMMENT '举报时附带的前后消息快照',
  status          ENUM('open','processing','resolved','rejected') NOT NULL DEFAULT 'open',
  ticket_id       BIGINT COMMENT '接入反馈工单后的工单ID',
  handled_by      BIGINT,
  handled_at      DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chat_report_status (status, created_at),
  KEY idx_chat_report_target (target_user_id, created_at),
  CONSTRAINT fk_chat_report_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
  CONSTRAINT fk_chat_report_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id),
  CONSTRAINT fk_chat_report_message FOREIGN KEY (message_id) REFERENCES chat_messages(id),
  CONSTRAINT fk_chat_report_target FOREIGN KEY (target_user_id) REFERENCES users(id),
  CONSTRAINT fk_chat_report_ticket FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id),
  CONSTRAINT fk_chat_report_handler FOREIGN KEY (handled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天举报，处理状态接入后台工单';

CREATE TABLE IF NOT EXISTS chat_sensitive_words (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  word            VARCHAR(100) NOT NULL,
  level           ENUM('review','block') NOT NULL DEFAULT 'review' COMMENT 'review=提示修改，block=直接拒绝',
  enabled         TINYINT NOT NULL DEFAULT 1,
  created_by      BIGINT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_sensitive_word (word),
  KEY idx_chat_sensitive_enabled (enabled, level),
  CONSTRAINT fk_chat_sensitive_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台可编辑敏感词';

CREATE TABLE IF NOT EXISTS chat_audit_logs (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  operator_id     BIGINT,
  action          VARCHAR(50) NOT NULL,
  target_type     VARCHAR(30),
  target_id       BIGINT,
  detail_json     JSON,
  ip              VARCHAR(64),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chat_audit_operator_time (operator_id, created_at),
  KEY idx_chat_audit_action_time (action, created_at),
  KEY idx_chat_audit_created (created_at),
  CONSTRAINT fk_chat_audit_operator FOREIGN KEY (operator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天室审计日志，管理员不可删除';

-- 官方公共频道种子：公共群只保留「校园大厅」一个（2026-09-28 精简）。
-- 不覆盖已有运营配置；已存在的多余频道由 migrate-chatroom-channels.sql 归档。
INSERT IGNORE INTO chat_conversations(type,title,description,channel_key,visibility,read_only,status,max_members)
VALUES
 ('channel','校园大厅','全校同学自由交流','campus-hall','official',0,'active',100000);

