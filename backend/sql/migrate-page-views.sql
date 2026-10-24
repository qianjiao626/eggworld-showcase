-- ============================================================
-- v2.3 页面浏览埋点：新增 page_views 表（管理员工作台「页面热度榜」数据源）
-- 适用：已上线的既有库（新库由 init.sql 直接建全量，无需本文件）
-- 用法：mysql -ueggworld -p < migrate-page-views.sql
-- 说明：仅记录已登录学生的学生端页面切页；游客与管理员不落库。
--       不建 users 外键（与 user_likes 同策略），用户注销时由
--       UserPurgeMapper.deletePageViews 显式清理。
-- ============================================================

USE eggworld;

CREATE TABLE IF NOT EXISTS page_views (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT COMMENT '浏览用户（当前仅记录登录学生，保留 NULL 以兼容未来游客统计）',
  page_key   VARCHAR(32) NOT NULL COMMENT '页面标识：plaza/teamplaza/helpplaza/rankhall/gossip/blacklist/mytasks/publish/profile',
  role       VARCHAR(16) COMMENT '记录时的角色：student',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_page_time (page_key, created_at),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生端页面浏览记录（工作台热度榜数据源）';
