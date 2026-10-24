-- ============================================================
-- 评价治理迁移 v3（ratings 加列 + 历史数据清洗）
-- 适用：本地 MySQL 8 / 线上 MariaDB 10.3+
-- 安全：纯 ADD COLUMN + UPDATE 回填，不删除任何数据，可重复执行
-- ============================================================

USE eggworld;

ALTER TABLE ratings
  ADD COLUMN task_type VARCHAR(10)  NULL COMMENT '冗余任务类型(teach/help/team)，便于按类型统计',
  ADD COLUMN is_auto   TINYINT      NOT NULL DEFAULT 0 COMMENT '系统补录: 0用户真实 1系统默认分(不计口碑)',
  ADD COLUMN visible   TINYINT      NOT NULL DEFAULT 1 COMMENT '可见性: 1正常 0管理员隐藏(不计口碑)',
  ADD COLUMN reply     TEXT         NULL COMMENT '被评价者对这条评价的回复';

-- 回填历史记录的任务类型（旧记录未冗余存储）
UPDATE ratings r JOIN tasks t ON r.task_id = t.id SET r.task_type = t.task_type WHERE r.task_type IS NULL;

-- 历史"未及时互评按默认4分"的系统补录 → 标记 is_auto=1，此后口碑/条数统计全部排除
UPDATE ratings SET is_auto = 1 WHERE comment LIKE '未及时互评%';

-- 口碑统计索引：按被评者 + 可见 + 真实 过滤
ALTER TABLE ratings ADD INDEX idx_ratee_vis (ratee_id, visible, is_auto);

-- 回刷口碑：迁移后立即按"真实可见评价"重算 users / user_stats 的口碑（老均分含系统4分，需一次校正）
UPDATE users u
LEFT JOIN (SELECT ratee_id AS uid, ROUND(AVG(score), 1) AS av FROM ratings WHERE visible = 1 AND is_auto = 0 GROUP BY ratee_id) r
  ON r.uid = u.id
SET u.reputation = COALESCE(r.av, 0);

UPDATE user_stats s
LEFT JOIN (SELECT ratee_id AS uid, ROUND(AVG(score), 1) AS av FROM ratings WHERE visible = 1 AND is_auto = 0 GROUP BY ratee_id) r
  ON r.uid = s.user_id
SET s.reputation = COALESCE(r.av, 0);

-- ============================================================
-- MariaDB 幂等变体（线上 MariaDB 若需可重复执行，改用下行注释写法）：
-- ALTER TABLE ratings
--   ADD COLUMN IF NOT EXISTS task_type VARCHAR(10)  NULL,
--   ADD COLUMN IF NOT EXISTS is_auto   TINYINT      NOT NULL DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS visible   TINYINT      NOT NULL DEFAULT 1,
--   ADD COLUMN IF NOT EXISTS reply     TEXT         NULL;
-- ============================================================
