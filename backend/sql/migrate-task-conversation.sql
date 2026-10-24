-- ============================================================
-- 蛋蛋世界 - 教学/组队任务绑定群聊 增量迁移
-- 内容：tasks 新增 conversation_id（= chat_conversations.id；为空表示该任务没有绑定群）
-- 适用：已上线的既有库（禁止执行 init.sql）；幂等，可重复执行
-- 特点：只加列 + 加索引，不修改/删除任何现有列与数据
-- 执行前必须备份数据库；脚本不含 USE/CREATE DATABASE/DROP/TRUNCATE
-- 用法：mysql -u eggworld -p eggworld < migrate-task-conversation.sql
-- ============================================================

-- 1) 新增列（已存在则跳过）
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'conversation_id');
SET @sql := IF(@exist = 0,
  'ALTER TABLE tasks ADD COLUMN conversation_id BIGINT NULL COMMENT \'绑定的群聊会话ID（chat_conversations.id；教学/组队任务上线时自动建群）\'',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 新增索引（已存在则跳过）
SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_conversation');
SET @sql := IF(@exist = 0,
  'ALTER TABLE tasks ADD KEY idx_conversation (conversation_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 说明：故意不加 conversation_id → chat_conversations 的外键。
-- 原因同 tasks.publisher_id：管理端需要能物理删除用户（UserPurgeMapper 会清聊天表），
-- 加外键会让用户注销失败。该列为弱关联，由业务代码保证一致性。
