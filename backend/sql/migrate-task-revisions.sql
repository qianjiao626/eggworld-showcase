-- ============================================================
-- 任务修改稿（第二期）：发布者对「已审核通过、且无人认领」的任务提交修改
-- 审核期间任务从广场下架（status=pending），通过则应用新值，驳回则按原内容恢复上线
-- 执行方式：线上库按文件名顺序执行本脚本（不要执行 init.sql，含 DROP TABLE）
-- ============================================================
CREATE TABLE IF NOT EXISTS task_revisions (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id           BIGINT       NOT NULL COMMENT '被修改的任务',
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending 待审核 / approved 已采纳 / rejected 已驳回',
  title             VARCHAR(200) NOT NULL COMMENT '提交后的标题',
  description       TEXT         COMMENT '提交后的描述',
  requirements      TEXT         COMMENT '提交后的参与要求',
  skill_category    VARCHAR(50)  COMMENT '提交后的技能大类',
  skill_sub         VARCHAR(50)  COMMENT '提交后的技能子类',
  reward            INT          NOT NULL COMMENT '提交后的蛋蛋币',
  claim_mode        VARCHAR(20)  COMMENT '提交后的认领模式 single/multiple',
  max_claimers      INT          COMMENT '提交后的最大认领人数',
  contact           VARCHAR(200) COMMENT '提交后的联系方式',
  signup_deadline   DATETIME     COMMENT '提交后的报名截止',
  complete_deadline DATETIME     COMMENT '提交后的完成截止',
  reject_reason     VARCHAR(200) COMMENT '驳回原因（驳回时必填）',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  reviewed_at       DATETIME     COMMENT '审核时间',
  KEY idx_task_status (task_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务修改稿（审核前后对比用）';
