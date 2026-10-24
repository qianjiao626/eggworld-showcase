-- 公共群精简：只保留「校园大厅」，其余官方频道归档（不删除历史消息）。
-- Apply after a production database backup. Non-destructive: 仅改 status，不 DELETE。
UPDATE chat_conversations
SET status = 'archived', updated_at = NOW()
WHERE type = 'channel'
  AND status = 'active'
  AND channel_key <> 'campus-hall';

-- 确认：应只剩 campus-hall 一条 active 频道
-- SELECT id, title, channel_key, status FROM chat_conversations WHERE type='channel';
