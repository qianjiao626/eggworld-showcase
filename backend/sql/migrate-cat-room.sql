-- ============================================================
-- 猫舍系统迁移 v1（捏猫 + 展示 + 领养 + 投票 + 榜单 + 审核）
-- 适用：本地 MySQL 8 / 线上 MariaDB 10.3+
-- 安全：新表 IF NOT EXISTS；旧榜单索引存在时升级为赛季唯一键；不删除业务数据
-- 上线前请先备份数据库
-- ============================================================

-- 1. 房间表：每只猫在猫舍里的展示配置（用户可拥有多只）
CREATE TABLE IF NOT EXISTS cat_rooms (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  pet_id BIGINT NULL,
  name VARCHAR(30) NOT NULL,
  -- 外观配置：body/ear/eye/tail/pattern/face 各存部件编号，blush 存 0/1
  look_json VARCHAR(300) NOT NULL,
  intro VARCHAR(200) NULL,
  -- 展示状态：0 草稿 / 1 待审核 / 2 已通过 / 3 已驳回 / 4 已下架
  status TINYINT NOT NULL DEFAULT 0,
  reject_reason VARCHAR(200) NULL,
  -- 统计：票数 / 被领养次数 / 被浏览数
  votes INT NOT NULL DEFAULT 0,
  adopts INT NOT NULL DEFAULT 0,
  views INT NOT NULL DEFAULT 0,
  is_public TINYINT NOT NULL DEFAULT 0,
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cat_rooms_user (user_id),
  KEY idx_cat_rooms_status (status, is_public),
  KEY idx_cat_rooms_votes (votes DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 投票表：每人每天最多 3 票，且不能重复投同一只猫
CREATE TABLE IF NOT EXISTS cat_votes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT NOT NULL,
  voter_id BIGINT NOT NULL,
  vote_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 同一人对同一只猫只能投一次（永久去重）
  UNIQUE KEY uk_cat_votes_room_voter (room_id, voter_id),
  -- 配合每日限额查询
  KEY idx_cat_votes_daily (voter_id, vote_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 领养表：记录谁领养了谁，用于奖励与去重
CREATE TABLE IF NOT EXISTS cat_adoptions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT NOT NULL,
  owner_id BIGINT NOT NULL,
  adopter_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 同一只猫只能被同一人领养一次
  UNIQUE KEY uk_cat_adoptions (room_id, adopter_id),
  KEY idx_cat_adoptions_owner (owner_id),
  KEY idx_cat_adoptions_adopter (adopter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 专属审核员表：谁可以审核猫舍内容（与宿舍审核员同一套管理模式）
CREATE TABLE IF NOT EXISTS cat_reviewers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cat_reviewers_user (user_id),
  KEY idx_cat_reviewers_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 榜单奖励发放记录：保证「仅发一次」
CREATE TABLE IF NOT EXISTS cat_reward_grants (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  season VARCHAR(20) NOT NULL,
  room_id BIGINT NOT NULL,
  owner_id BIGINT NOT NULL,
  rank_no INT NOT NULL,
  points INT NOT NULL,
  reputation INT NOT NULL,
  granted_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 同一赛季只能发放一次，即使榜首后来换了猫
  UNIQUE KEY uk_cat_reward_season (season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If the earlier v1 script was already run, replace its per-room unique key
-- with the season-wide key. Existing duplicate grants for one season must be
-- audited manually before this ALTER; do not silently discard paid history.
SET @cat_old_reward_key = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'cat_reward_grants'
    AND index_name = 'uk_cat_reward_season_room');
SET @cat_reward_upgrade = IF(@cat_old_reward_key > 0,
  'ALTER TABLE cat_reward_grants DROP INDEX uk_cat_reward_season_room, ADD UNIQUE KEY uk_cat_reward_season (season)',
  'SELECT 1');
PREPARE cat_reward_stmt FROM @cat_reward_upgrade;
EXECUTE cat_reward_stmt;
DEALLOCATE PREPARE cat_reward_stmt;

-- 6. 猫舍声望单独累积，不影响用户互评的 0-5 分口碑
CREATE TABLE IF NOT EXISTS cat_reputation (
  user_id BIGINT NOT NULL PRIMARY KEY,
  score INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 使用说明
-- ------------------------------------------------------------
-- 1) 指定宠物系统管理员（把用户 id 换成实际账号）：
--    INSERT INTO cat_reviewers (user_id, active) VALUES (1, 1)
--    ON DUPLICATE KEY UPDATE active = 1;
--
-- 2) 上线后如需撤销某人的审核权限：
--    UPDATE cat_reviewers SET active = 0 WHERE user_id = 1;
--
-- 3) 可重复执行；若旧版已对同一赛季重复发奖，唯一键升级会中止，先人工审计，不自动删除记录。
-- ============================================================
