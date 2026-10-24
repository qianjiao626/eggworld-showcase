-- 任务治理（管理后台「任务管理」页）
--   1) tasks.hidden            屏蔽标记（与 status 工作流状态解耦）
--   2) tasks.governance_reason 最近一次处置原因（列表副标题 / 信息弹窗展示）
--   3) task_governance_log     处置流水（谁 / 何时 / 对哪条 / 做了什么 / 为什么）
-- 幂等：列与表已存在时跳过；可重复执行。
-- ⚠️ 线上库禁止执行 init.sql（含 DROP TABLE）；本脚本按顺序单独执行。

-- 1) 屏蔽标记：1=已屏蔽。屏蔽后前台任务广场/搜索不再展示、不可认领；数据保留、可恢复。
--    刻意不复用 status：status 是认领/评价依赖的工作流状态机。
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'hidden');
SET @sql := IF(@exist = 0,
  'ALTER TABLE tasks ADD COLUMN hidden TINYINT NOT NULL DEFAULT 0 COMMENT ''屏蔽标记 0=正常 1=已屏蔽（前台不可见、不可认领）''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 最近一次处置原因：屏蔽/删除时写入；恢复/退回审核时清空。
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'governance_reason');
SET @sql := IF(@exist = 0,
  'ALTER TABLE tasks ADD COLUMN governance_reason VARCHAR(200) NULL COMMENT ''最近一次处置原因（屏蔽/删除填写，恢复/退回审核清空）''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 处置流水：每次处置追加一条，只增不改。
CREATE TABLE IF NOT EXISTS task_governance_log (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  task_id       BIGINT       NOT NULL COMMENT '被处置的任务 ID',
  task_title    VARCHAR(100) NOT NULL DEFAULT '' COMMENT '处置时的任务标题快照（标题后续被改仍可追溯到当时的对象）',
  action        VARCHAR(32)  NOT NULL COMMENT 'hide 屏蔽 / restore 恢复 / delete 删除 / return_review 退回审核',
  reason        VARCHAR(200) NOT NULL DEFAULT '' COMMENT '处置原因',
  operator_id   BIGINT       NULL COMMENT '操作人用户 ID',
  operator_name VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '操作人昵称快照',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '处置时间',
  PRIMARY KEY (id),
  KEY idx_task_created (task_id, created_at),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务处置流水';
