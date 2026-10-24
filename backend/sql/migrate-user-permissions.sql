-- 仅新增权限管理与权限审计两张表；先备份数据库，先迁移后切换服务；严禁执行 init.sql。
--
-- 权限模型（两段式）：用户 → 权限点，无角色层。
-- 权限点写死在代码里（com.eggworld.common.PermCode）：content_review / data_dashboard。
-- 主管理员 / 副管理员对所有权限点隐式通过，不落表。
CREATE TABLE IF NOT EXISTS user_permissions (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT NOT NULL COMMENT '被授权用户ID',
  perm_code  VARCHAR(32) NOT NULL COMMENT '权限点：content_review / data_dashboard',
  granted_by BIGINT NOT NULL COMMENT '授权操作人ID',
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_perm (user_id, perm_code),
  KEY idx_perm_code (perm_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户权限点（当前状态，唯一权威源）';

CREATE TABLE IF NOT EXISTS permission_audit (
  id             BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  operator_id    BIGINT NOT NULL COMMENT '操作人ID',
  target_user_id BIGINT NOT NULL COMMENT '被操作用户ID',
  perm_code      VARCHAR(32) NOT NULL COMMENT '权限点',
  action         VARCHAR(8)  NOT NULL COMMENT '动作：grant / revoke',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_perm_audit_time (created_at, id),
  KEY idx_perm_audit_target (target_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限授予/收回审计（按人一条）';
