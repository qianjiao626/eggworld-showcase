-- ============================================================================
-- 应急回滚 · 解绑任务群（把 tasks.conversation_id 置空）
--
-- 适用：新版上线后出致命问题 → 已把 eggworld.features.task-auto-group 置为 false 并重启，
--       需要把「事故窗口内自动建出来的任务群」从任务上摘掉。
-- 位置：服务器 ~/eggworld/sql/rollback-task-conversation-unbind.sql（随本批上传，默认不执行）
-- 关联：releases/迁移文档/2026-09-26_任务绑定群聊.md 第八节
--
-- ⚠️ 三条铁律（不遵守会二次事故）：
--   1. 执行前先备份库：
--      mysqldump -u eggworld -p eggworld > ~/eggworld/backup/db/eggworld_$(date +%Y%m%d_%H%M%S).sql
--      chmod 600 ~/eggworld/backup/db/*.sql
--   2. **只解绑事故窗口内建的群**（下面按 chat_conversations.created_at 限定）。
--      「全表 UPDATE tasks SET conversation_id = NULL」会把事故之前就在正常使用的任务群一起摘掉，
--      那些任务从此再接不回自己的群、也不会归档。
--   3. 解绑后**不要再把开关打开**：ensureTaskGroup 看到 conversation_id 为空会给同一个任务
--      **再建一个群**，一个任务出现两个群（要恢复新版请走第六节的完整回滚：换回 jar + index.html）。
--
-- 本脚本只改 tasks.conversation_id：不删会话/群、不踢人、不改任务状态、不碰蛋蛋币。
-- 群本身仍在（成员照旧能聊），但任务完成后不再自动归档 → 需要人工在后台「聊天室管理」里处理。
-- ============================================================================

-- 【第 1 步】按事故窗口调好这两个时间（服务器/库都是 Asia/Shanghai）
SET @since = '2026-09-26 20:00:00';   -- ← 新版上线的时刻
SET @until = '2026-09-26 22:00:00';   -- ← 决定回滚的时刻（新版存活了多久就写多久）

-- 【第 2 步】先导清单存档（务必先跑这一步，把结果贴进值班记录/工单）：
--   这批 conversation_id 就是需要人工善后的群，解绑后从任务上再也找不回来
SELECT t.id           AS task_id,
       t.title        AS task_title,
       t.task_type,
       t.status       AS task_status,
       t.conversation_id,
       c.title        AS group_title,
       c.created_at   AS group_created_at
FROM tasks t
JOIN chat_conversations c ON c.id = t.conversation_id
WHERE t.conversation_id IS NOT NULL
  AND t.task_type IN ('teach', 'team')
  AND t.status IN ('approved', 'in_progress', 'full')
  AND c.created_at BETWEEN @since AND @until
ORDER BY t.id;

-- 【第 3 步】解绑（把上面清单里的任务逐条摘掉群关联）
UPDATE tasks t
JOIN chat_conversations c ON c.id = t.conversation_id
SET t.conversation_id = NULL
WHERE t.conversation_id IS NOT NULL
  AND t.task_type IN ('teach', 'team')
  AND t.status IN ('approved', 'in_progress', 'full')
  AND c.created_at BETWEEN @since AND @until;

-- 【第 4 步】核对：应只剩「不在窗口内」的绑定（0 也正常——说明窗口内没建过群）
SELECT COUNT(*) AS still_bound_tasks
FROM tasks t
JOIN chat_conversations c ON c.id = t.conversation_id
WHERE t.conversation_id IS NOT NULL
  AND t.task_type IN ('teach', 'team')
  AND t.status IN ('approved', 'in_progress', 'full')
  AND c.created_at BETWEEN @since AND @until;

-- 【可选】窗口内核出的群清单（解绑后人工在后台聊天室管理里决定：留着当普通群 / 解散）
SELECT c.id, c.title, c.owner_id, c.member_count, c.read_only, c.created_at
FROM chat_conversations c
WHERE c.type = 'group'
  AND c.created_at BETWEEN @since AND @until
ORDER BY c.id;
