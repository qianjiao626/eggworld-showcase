-- ============================================================
-- 反馈工单「用户追问」P1 迁移：新增会话消息表 feedback_messages
-- 背景：管理员回复后用户可能还有补充/追问，需要形成一段对话；
--       首次提交仍存在 feedback_tickets.content（会话起点），
--       本表只存其后的往返消息。
-- 适用：本地 MySQL 8 / 线上 MariaDB 10.3+
-- 说明：全新库直接执行 init.sql 即可（已含本表），无需本脚本。
-- ============================================================

USE eggworld;

CREATE TABLE IF NOT EXISTS feedback_messages (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  ticket_id   BIGINT NOT NULL COMMENT '所属工单',
  sender_type ENUM('user','admin') NOT NULL COMMENT '发送方',
  content     TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ticket (ticket_id),
  CONSTRAINT fk_msg_ticket FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='反馈工单会话消息表';

-- 存量数据：把已写过的管理员回复补成一条会话消息，保证老工单打开也能看到对话
INSERT INTO feedback_messages (ticket_id, sender_type, content, created_at)
SELECT id, 'admin', admin_reply, COALESCE(replied_at, created_at)
FROM feedback_tickets
WHERE admin_reply IS NOT NULL AND admin_reply <> ''
  AND NOT EXISTS (SELECT 1 FROM feedback_messages m WHERE m.ticket_id = feedback_tickets.id);
