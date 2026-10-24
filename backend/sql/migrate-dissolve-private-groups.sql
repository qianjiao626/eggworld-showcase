-- ============================================================
-- 私密群停用：解散存量私密群
-- 适用：已上线的既有库（新库由 init.sql 直接建全量，无需本文件）
-- 用法：mysql -u eggworld -p eggworld < migrate-dissolve-private-groups.sql
--
-- 背景（2026-09-21）：
--   私密群「仅邀请」在没有好友体系支撑时容易变成小圈子，与校园广场的公开定位不符，
--   故整体停用。停用后：
--     ① 不允许新建私密群（后端 ChatGroupService.create() 拒绝 private，纯代码，无需 SQL）
--     ② 存量私密群冻结为只读（后端 ChatPermissionService.requireCanSend() 拦截，纯代码）
--   本脚本负责第 ③ 步：把存量私密群**解散**，使其从会话列表消失。
--
-- 与「只读冻结」的关系（两者可并存，按需选择）：
--   · 只想冻结、保留历史可查 → **不要执行本脚本**，仅靠后端代码即可（私密群会显示但发不了言）
--   · 想彻底清掉私密群       → 执行本脚本（群转为 dissolved，不再出现在任何人的会话列表）
--
-- ⚠️ 只影响 type='group' 且 visibility='private' 的会话。
--    一对一私聊（type='direct'）的 visibility 同样是 private，**绝不能被误伤**。
--
-- 回滚：本脚本不可逆（status 改为 dissolved 后，前端不再展示）。
--       执行前务必备份：mysqldump -u eggworld -p eggworld > ~/eggworld/backup/db/eggworld_$(date +%Y%m%d_%H%M%S).sql
-- ============================================================

-- 执行前先看一眼会影响多少（建议先单独跑这条确认，再跑下面的 UPDATE）
SELECT COUNT(*) AS private_group_conversations
FROM chat_conversations
WHERE type = 'group' AND visibility = 'private' AND status = 'active';

-- 1) 会话置为已解散（从会话列表消失）
UPDATE chat_conversations
SET status = 'dissolved'
WHERE type = 'group' AND visibility = 'private' AND status = 'active';

-- 2) 对应的群记录同步置为已解散
UPDATE chat_groups
SET status = 'dissolved'
WHERE visibility = 'private' AND status = 'active';

-- 3) 校验：应为 0 行
SELECT COUNT(*) AS remaining_private_groups
FROM chat_conversations
WHERE type = 'group' AND visibility = 'private' AND status = 'active';

-- 4) 顺带确认私聊未被误伤（执行前后行数应一致）
SELECT COUNT(*) AS direct_conversations_untouched
FROM chat_conversations
WHERE type = 'direct' AND status = 'active';
