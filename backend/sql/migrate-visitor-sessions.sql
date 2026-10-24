-- ============================================================
-- v2.5 访客会话追踪：新增 visitor_sessions 表 + 扩展 page_views
-- 适用：已上线的既有库（新库由 init.sql 直接建全量，无需本文件）
-- 用法：mysql -ueggworld -p eggworld < migrate-visitor-sessions.sql
-- 说明：追踪所有访客（含匿名）的会话信息，用于管理员看板
--       DAU/留存/时段/会话时长分析。不采集 IP、不做浏览器指纹。
--       不建 users 外键（与 page_views 同策略），用户注销时由
--       UserPurgeMapper.deleteVisitorSessions 显式清理。
-- ============================================================

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id      VARCHAR(64) NOT NULL COMMENT '前端生成的会话标识（UUID）',
  visitor_id      VARCHAR(64) NOT NULL COMMENT '访客标识（localStorage 持久化 UUID，跨会话不变）',
  user_id         BIGINT COMMENT '登录用户 ID，匿名访客为 NULL',
  started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '会话开始时间',
  last_active_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活跃时间（心跳更新）',
  page_count      INT NOT NULL DEFAULT 0 COMMENT '本次会话浏览页数',
  referrer        VARCHAR(256) COMMENT '来源页（首次进入的 document.referrer）',
  ua_device       VARCHAR(16) COMMENT '设备类型：mobile / desktop / tablet',
  is_new_visitor  TINYINT NOT NULL DEFAULT 0 COMMENT '是否首次访问（基于 localStorage 标记）',
  UNIQUE KEY uk_session_id (session_id),
  KEY idx_visitor (visitor_id, started_at),
  KEY idx_user_time (user_id, started_at),
  KEY idx_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='访客会话记录（管理员用户活跃看板数据源）';

-- 扩展 page_views：增加 session_id 和 visitor_id 两列，兼容旧数据（NULL 默认）
ALTER TABLE page_views ADD COLUMN session_id VARCHAR(64) COMMENT '关联 visitor_sessions.session_id';
ALTER TABLE page_views ADD COLUMN visitor_id VARCHAR(64) COMMENT '匿名访客标识';
ALTER TABLE page_views ADD KEY idx_session (session_id);
