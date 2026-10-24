-- ============================================================
-- 反馈工单（帮助与反馈）P0 迁移
-- 目的：让用户能看到管理员的回复，并能感知「有回复了」
-- 变更：feedback_tickets 增加 类型 / 回复时间 / 用户已读 / 更新时间
-- 适用：本地 MySQL 8 / 线上 MariaDB 10.3+
-- 说明：全新库直接执行 init.sql 即可（已含新字段），无需本脚本。
-- 注意：ADD COLUMN 不可重复执行，重复执行会报"列已存在"，属正常。
-- ============================================================

USE eggworld;

ALTER TABLE feedback_tickets
  ADD COLUMN type       VARCHAR(20) NOT NULL DEFAULT 'other' COMMENT '反馈类型：bug/suggestion/report/other' AFTER content,
  ADD COLUMN replied_at DATETIME    NULL COMMENT '管理员回复时间' AFTER admin_reply,
  ADD COLUMN user_read  TINYINT     NOT NULL DEFAULT 1 COMMENT '用户是否已读回复：0未读/1已读' AFTER replied_at,
  ADD COLUMN updated_at DATETIME    NULL COMMENT '最后更新时间' AFTER created_at;

-- 存量「已回复」工单：此前用户根本看不到回复，统一标为未读，上线后能提醒到人
UPDATE feedback_tickets SET user_read = 0 WHERE status = 'replied' AND admin_reply IS NOT NULL;
