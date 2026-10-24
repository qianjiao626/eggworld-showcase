-- ============================================================
-- 反馈工单「演示数据」种子脚本（仅用于本地开发库）
-- 用途：给管理端「反馈工单」页 / 用户端「帮助与反馈」页造一批
--       覆盖各种状态、类型、时长、有无对话的样例数据，便于看效果。
--
-- 前置：依赖本库存在 id = 1(管理员) / 4(aaa) / 6(test1) / 9(小帅) 这几个用户；
--       若你的库里用户 id 不同，改下面的 @uAdmin/@uA/@uB/@uC 即可。
-- 说明：脚本可重复执行（先清掉 id 1-9 的工单，会话消息随外键级联删除）。
-- 移除：执行文件末尾「清理」段的 SQL 即可。
-- ============================================================

USE eggworld;

SET @uAdmin = 1, @uA = 4, @uB = 6, @uC = 9;

-- 清掉旧演示数据（id 1-9 为演示工单专用）
DELETE FROM feedback_tickets WHERE id BETWEEN 1 AND 9;

/* ---------- 工单 ---------- */

-- #1 待处理 · 已超时(28h) · 有联系方式 · 有往返对话
INSERT INTO feedback_tickets (id, user_id, content, type, contact, status, user_read, created_at, updated_at)
VALUES (1, @uC, '登录之后头像一直是灰色的，刷新和重新登录都不行，我室友也说有这个问题', 'bug',
        '微信 eggworld_helper', 'open', 1, NOW() - INTERVAL 28 HOUR, NOW() - INTERVAL 3 HOUR);

-- #2 待处理 · 刚提交(25分钟) · 无联系方式 · 无对话
INSERT INTO feedback_tickets (id, user_id, content, type, status, user_read, created_at)
VALUES (2, @uA, '发布任务时选了「线上协作」，保存后却显示成「线下」，差点约错地点', 'bug',
        'open', 1, NOW() - INTERVAL 25 MINUTE);

-- #3 待处理 · 5小时前 · 有联系方式 · 用户补充过一条
INSERT INTO feedback_tickets (id, user_id, content, type, contact, status, user_read, created_at, updated_at)
VALUES (3, @uB, '建议任务卡片上直接显示剩余名额，现在必须点进去才知道', 'suggestion',
        'QQ 12345678', 'open', 1, NOW() - INTERVAL 5 HOUR, NOW() - INTERVAL 2 HOUR);

-- #4 已回复 · 2小时前 · 用户还没看过这条回复（未读）
INSERT INTO feedback_tickets (id, user_id, content, type, status, admin_reply, replied_at, user_read, created_at, updated_at)
VALUES (4, @uC, '能不能加个夜间模式？晚上刷任务有点刺眼', 'suggestion', 'replied',
        '好建议！已经记录进排期，会优先做「深色背景 + 降低对比度」的方案～',
        NOW() - INTERVAL 2 HOUR, 0, NOW() - INTERVAL 9 HOUR, NOW() - INTERVAL 2 HOUR);

-- #5 已回复 · 1天前 · 用户已读
INSERT INTO feedback_tickets (id, user_id, content, type, status, admin_reply, replied_at, user_read, created_at, updated_at)
VALUES (5, @uA, '八卦区有一条帖子把某学院同学的姓名和手机号都贴出来了，麻烦处理一下', 'report', 'replied',
        '已核实并删除该帖，同时对发布者做了禁言处理，感谢你的举报！',
        NOW() - INTERVAL 20 HOUR, 1, NOW() - INTERVAL 30 HOUR, NOW() - INTERVAL 20 HOUR);

-- #6 已关闭 · 4天前
INSERT INTO feedback_tickets (id, user_id, content, type, status, admin_reply, replied_at, user_read, created_at, updated_at)
VALUES (6, @uB, '有人用「学业互助」当幌子发广告，私聊让加微信群', 'report', 'closed',
        '已处理该账号，相关任务下架。如需继续反馈可直接回复本条。',
        NOW() - INTERVAL 4 DAY, 1, NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 4 DAY);

-- #7 待处理 · 已超时(3天) · 无联系方式 · 无对话
INSERT INTO feedback_tickets (id, user_id, content, type, status, user_read, created_at)
VALUES (7, @uAdmin, '蛋蛋币明细里有一笔 +20 的记录没有说明来源，想确认一下是什么奖励', 'other',
        'open', 1, NOW() - INTERVAL 3 DAY);

-- #8 已回复 · 8小时前 · 三段对话 · 未读
INSERT INTO feedback_tickets (id, user_id, content, type, contact, status, admin_reply, replied_at, user_read, created_at, updated_at)
VALUES (8, @uC, '手机端打开任务详情页，底部的「立即认领」按钮会被浏览器工具栏挡住，点不到', 'bug',
        '手机号 138****6688', 'replied',
        '已经修复上线了，麻烦强制刷新（Ctrl+F5）后重试～',
        NOW() - INTERVAL 1 HOUR, 0, NOW() - INTERVAL 8 HOUR, NOW() - INTERVAL 1 HOUR);

-- #9 已回复 · 6天前 · 用户未读（用于验证用户端「我的反馈」未读红点）
INSERT INTO feedback_tickets (id, user_id, content, type, status, admin_reply, replied_at, user_read, created_at, updated_at)
VALUES (9, @uAdmin, '希望增加「已结束任务」的归档入口，任务多了翻起来很慢', 'other', 'replied',
        '已加入需求池，后续版本会评估～',
        NOW() - INTERVAL 6 DAY, 0, NOW() - INTERVAL 7 DAY, NOW() - INTERVAL 6 DAY);

/* ---------- 会话消息 ---------- */

-- #1：管理员追问 → 用户补充
INSERT INTO feedback_messages (ticket_id, sender_type, content, created_at) VALUES
  (1, 'admin', '收到～麻烦提供一下你的设备和浏览器版本，我们好复现', NOW() - INTERVAL 25 HOUR),
  (1, 'user',  'Win11 + Chrome 120，今天下午开始出现的',                  NOW() - INTERVAL 3 HOUR);

-- #3：用户自己补充信息
INSERT INTO feedback_messages (ticket_id, sender_type, content, created_at) VALUES
  (3, 'user', '补充一下：尤其是组队任务，名额满了之后我居然还能点报名', NOW() - INTERVAL 2 HOUR);

-- #4 / #5 / #6 / #9：各自的管理员回复
INSERT INTO feedback_messages (ticket_id, sender_type, content, created_at) VALUES
  (4, 'admin', '好建议！已经记录进排期，会优先做「深色背景 + 降低对比度」的方案～', NOW() - INTERVAL 2 HOUR),
  (5, 'admin', '已核实并删除该帖，同时对发布者做了禁言处理，感谢你的举报！',         NOW() - INTERVAL 20 HOUR),
  (6, 'admin', '已处理该账号，相关任务下架。如需继续反馈可直接回复本条。',           NOW() - INTERVAL 4 DAY),
  (9, 'admin', '已加入需求池，后续版本会评估～',                                     NOW() - INTERVAL 6 DAY);

-- #8：三段往返
INSERT INTO feedback_messages (ticket_id, sender_type, content, created_at) VALUES
  (8, 'admin', '已确认是手机安全区适配的问题，我们正在修', NOW() - INTERVAL 6 HOUR),
  (8, 'user',  '好的，等你们～',                           NOW() - INTERVAL 4 HOUR),
  (8, 'admin', '已经修复上线了，麻烦强制刷新（Ctrl+F5）后重试～', NOW() - INTERVAL 1 HOUR);

/* ---------- 核对 ---------- */
SELECT id, type, status, user_read, user_id,
       LEFT(content, 24) AS content, created_at
FROM feedback_tickets WHERE id BETWEEN 1 AND 9 ORDER BY id;

SELECT ticket_id, sender_type, LEFT(content, 22) AS content
FROM feedback_messages WHERE ticket_id BETWEEN 1 AND 9 ORDER BY ticket_id, id;

-- ============================================================
-- 清理（需要时取消注释执行）
-- ============================================================
-- DELETE FROM notifications WHERE type = 'feedback_reply';
-- DELETE FROM feedback_tickets WHERE id BETWEEN 1 AND 9;
