-- ============================================================
-- 蛋蛋世界 - 任务「技能证明图片」增量迁移
-- 内容：
--   1) 新表 task_proof_images：发布任务时上传的证明图片（选填），只登记元数据、二进制落盘
--   2) tasks 新增 proof_image_id：指向 task_proof_images.id 的弱关联（为空表示没有证明图片）
--   3) task_revisions 新增 proof_image_id（2026-10-07 加强「修改任务」：改稿也能补充/替换/移除证明图，
--      服务层把「沿用原图」解析成具体 id 后写入，审核通过时原样回写到 tasks）
-- 适用：已上线的既有库（禁止执行 init.sql）；幂等，可重复执行
-- 特点：只建新表 + 只加列 + 只加索引，不修改/删除任何现有列与数据
-- 执行前必须备份数据库；脚本不含 USE/CREATE DATABASE/DROP/TRUNCATE
-- 用法：mysql -u eggworld -p eggworld < migrate-task-proof-image.sql
-- 前置：图片目录 /home/xiaos/eggworld/uploads/task-proof/ 需存在且对运行用户 xiaos 可写
--      （mkdir -p /home/xiaos/eggworld/uploads/task-proof），否则上传接口会 400
-- ============================================================

-- 1) 证明图片元数据表（图片本体按 image_key 落在 uploads/task-proof/ 下）
CREATE TABLE IF NOT EXISTS task_proof_images (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  uploader_id BIGINT       NOT NULL COMMENT '上传者用户ID（只有发布者本人能上传与读取自己的图）',
  image_key   VARCHAR(64)  NOT NULL COMMENT '落盘文件名（UUID + 扩展名）',
  content_type VARCHAR(50) NOT NULL COMMENT '图片 MIME：image/jpeg / image/png / image/webp',
  byte_size   INT          NOT NULL DEFAULT 0 COMMENT '字节数，便于排查与配额观察',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_proof_image_key (image_key),
  KEY idx_task_proof_uploader (uploader_id)
  -- 注：不加 uploader_id → users 外键（同 tasks.publisher_id 的策略），
  --     否则管理端物理删除用户会失败；注销清理由 UserPurgeMapper 负责
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务技能证明图片（发布任务选填，详情页展示）';

-- 2) tasks 新增 proof_image_id（已存在则跳过）
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'proof_image_id');
SET @sql := IF(@exist = 0,
  'ALTER TABLE tasks ADD COLUMN proof_image_id BIGINT NULL COMMENT \'技能证明图片（task_proof_images.id；为空表示未上传，详情页在任务描述之前展示）\'',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 证明图片索引（已存在则跳过）：任务详情按 id 直查，列表页不 JOIN，索引只为清理与审计
SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_proof_image');
SET @sql := IF(@exist = 0,
  'ALTER TABLE tasks ADD KEY idx_proof_image (proof_image_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 说明：故意不加 tasks.proof_image_id → task_proof_images.id 的外键（理由同 conversation_id）：
--   1) 管理端需要能物理删除用户，多一处外键就多一处失败点；
--   2) 任务与图片是弱关联：图片行被清理时任务应照常显示（前端按「取不到图就不渲染」处理）。

-- 4) 修改稿也能带证明图（2026-10-07 加强「修改任务」）：task_revisions 加同名列（已存在则跳过）
--    语义：服务层已把「沿用原图 / 替换 / 移除」解析成最终值再写库，
--    因此这里只是一个普通可空列：NULL = 通过审核后任务没有证明图。
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_revisions' AND COLUMN_NAME = 'proof_image_id');
SET @sql := IF(@exist = 0,
  'ALTER TABLE task_revisions ADD COLUMN proof_image_id BIGINT NULL COMMENT \'修改稿的证明图片（task_proof_images.id；已解析「沿用/替换/移除」后的最终值）\'',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
