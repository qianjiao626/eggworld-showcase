-- ============================================================================
-- 应急回滚 · 失联名单查询（只读 SELECT，不改任何数据）
--
-- 适用：新版上线后回滚，需要找出「按新流程已达成合作、但双方没留联系方式」的记录，
--       由运营按名单发站内信/邮件补联系方式（老流程要靠联系方式才能继续对接）。
-- 位置：服务器 ~/eggworld/sql/rollback-task-conversation-contact-report.sql（随本批上传，默认不执行）
-- 关联：releases/迁移文档/2026-09-26_任务绑定群聊.md 第八节
--
-- 说明：本批实现**不写占位联系方式**（写假数据会让对方以为联系得上），所以这里只需判「为空」。
--       若将来真的落了占位值，在下面条件里补一条即可：
--       OR c.claimer_contact LIKE '系统降级%'  /  OR t.contact LIKE '系统降级%'
-- ============================================================================

-- 【第 1 步】把时间窗调成「新版存活的那一段」
SET @since = '2026-09-26 20:00:00';   -- ← 新版上线的时刻
SET @until = '2026-09-26 22:00:00';   -- ← 决定回滚的时刻

-- 【A】认领者失联名单：窗口内按新流程入队（selected=1 且进行中/已提交）却没留联系方式的人
--     运营动作：给 claimer 发站内信「请到「我的任务」补填联系方式」；同时留意发布者那侧是否也空
SELECT t.id              AS task_id,
       t.title           AS task_title,
       t.task_type,
       t.status          AS task_status,
       t.conversation_id,
       u_pub.id          AS publisher_id,
       u_pub.nickname    AS publisher_nick,
       u_pub.school      AS publisher_school,
       u_pub.email       AS publisher_email,
       t.contact         AS publisher_contact,
       u_c.id            AS claimer_id,
       u_c.nickname      AS claimer_nick,
       u_c.school        AS claimer_school,
       u_c.email         AS claimer_email,
       c.claimer_contact,
       c.status          AS claim_status,
       c.paired_at,
       c.created_at      AS claim_created_at
FROM task_claims c
JOIN tasks t       ON t.id = c.task_id
JOIN users u_pub   ON u_pub.id = t.publisher_id
JOIN users u_c     ON u_c.id = c.claimer_id
WHERE c.selected = 1
  AND c.status IN ('in_progress', 'submitted')
  AND (c.claimer_contact IS NULL OR TRIM(c.claimer_contact) = '')
  AND c.created_at BETWEEN @since AND @until
ORDER BY t.id, c.id;

-- 【B】发布者失联名单：窗口内上线/在建、但发布者自己没留联系方式的任务
--     （这种情况双方都联系不上，老流程下必须优先补）
SELECT t.id            AS task_id,
       t.title         AS task_title,
       t.task_type,
       t.status        AS task_status,
       t.conversation_id,
       u.id            AS publisher_id,
       u.nickname      AS publisher_nick,
       u.school        AS publisher_school,
       u.email         AS publisher_email,
       (SELECT COUNT(*) FROM task_claims c
         WHERE c.task_id = t.id AND c.selected = 1
           AND c.status IN ('in_progress', 'submitted')) AS joined_members
FROM tasks t
JOIN users u ON u.id = t.publisher_id
WHERE t.task_type IN ('teach', 'team')
  AND t.status IN ('approved', 'in_progress', 'full')
  AND (t.contact IS NULL OR TRIM(t.contact) = '')
  AND t.updated_at BETWEEN @since AND @until
ORDER BY t.id;

-- 【C】汇总口径（给值班记录用）：窗口内有多少条已入队记录、其中多少条失联
SELECT COUNT(*)                                                        AS joined_claims,
       SUM(CASE WHEN c.claimer_contact IS NULL
                 OR TRIM(c.claimer_contact) = '' THEN 1 ELSE 0 END)     AS claims_without_contact
FROM task_claims c
WHERE c.selected = 1
  AND c.status IN ('in_progress', 'submitted')
  AND c.created_at BETWEEN @since AND @until;
