-- ============================================================
-- 猫咪公园 · 繁育交互迁移 v2（用户猫上公园 + 双方好感度模型）
-- 适用：本地 MySQL 8 / 线上 MariaDB 10.3+
-- 安全：新表 IF NOT EXISTS；种子用固定主键 + ON DUPLICATE KEY UPDATE，可重复执行
-- ⚠️ 本版为 feat/cat-park-breeding 分支的定稿版（v1 的 3 只 official 自有猫与 cat_affinity 表已废弃，
--    该分支未上线，线上库无 v1 表，直接执行本文件即可；本地测试库需先 DROP 三张旧表再执行）
-- 上线前请先备份数据库
-- ============================================================

-- 1. 公园目录猫：official 流浪猫（可直接领养）+ user 用户寄养猫（仅繁育申请）
CREATE TABLE IF NOT EXISTS park_cats (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(8) NOT NULL DEFAULT 'user' COMMENT 'official=平台流浪猫（种子）/ user=用户从存档放出来的猫',
  breed_cat_id VARCHAR(30) NOT NULL COMMENT '对应前端 pet-data.js CATS 品种 id（calico/orange/...）',
  name VARCHAR(30) NOT NULL COMMENT '展示名（user 猫随存档回写同步，可改名）',
  gender VARCHAR(6) NOT NULL DEFAULT 'male' COMMENT 'male/female',
  category VARCHAR(6) NOT NULL COMMENT 'stray=流浪猫（adoptable）/ user=用户猫（仅繁育）',
  owner_user_id BIGINT NULL COMMENT 'user 猫的归属真实用户 id；official 流浪猫为 NULL',
  cat_uid VARCHAR(64) NULL COMMENT 'user 猫在主人存档中的实例 uid（稳定标识，改名/换位不影响）',
  adoptable TINYINT NOT NULL DEFAULT 0 COMMENT '是否开放直接领养：stray=1, user=0',
  can_breed TINYINT NOT NULL DEFAULT 1 COMMENT '是否可参与繁育',
  affinity_level INT NOT NULL DEFAULT 1 COMMENT '主人↔此猫好感度等级快照（存档回写同步；繁育门槛 >=3）',
  maturity_level INT NOT NULL DEFAULT 1 COMMENT '成熟度快照：1奶猫 2幼猫 3成年（繁育要求 =3）',
  parent_uids VARCHAR(500) NULL COMMENT '父母实例 uid JSON 数组快照（P2 近亲检查用）',
  last_breed_time DATETIME NULL COMMENT '上次成功繁育时间（48h 冷却权威）；NULL 表示从未繁育',
  listed_at DATETIME NULL COMMENT '首次上架公园时间',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '下架：猫离开公园/从存档消失时置 1，保留 last_breed_time 防绕过',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_park_user_cat (owner_user_id, cat_uid),
  KEY idx_park_cats_category (category, deleted),
  KEY idx_park_cats_owner (owner_user_id),
  KEY idx_park_cats_source (source, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='猫咪公园目录猫（流浪猫种子 + 用户寄养猫投影）';

-- 2. 繁育申请：仿 chat_friend_requests 的申请-同意/拒绝模型
--    好感度门槛改为「双方各自与自己猫的好感度 >= Lv.3」，取自 park_cats.affinity_level 快照
--    与发起方存档（breeding 时服务端读 requester 的 cat_cabin_saves.save_json），
--    不再需要「陌生人对目标猫攒好感度」，故 v1 的 cat_affinity 表废弃。
CREATE TABLE IF NOT EXISTS breeding_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requester_id BIGINT NOT NULL COMMENT '发起申请的用户',
  target_cat_id BIGINT NOT NULL COMMENT '目标公园猫 id（须为 source=user 的用户猫）',
  owner_user_id BIGINT NOT NULL COMMENT '归属用户快照（申请时 target cat 的 owner，用于通知与越权校验）',
  applicant_cat_uid VARCHAR(64) NOT NULL COMMENT '发起方用于繁育的猫在存档中的 uid（服务端从发起方存档校验归属/成年/好感度）',
  status VARCHAR(10) NOT NULL DEFAULT 'pending' COMMENT 'pending/accepted/rejected',
  offspring_breed_id VARCHAR(30) NULL COMMENT '同意时后端裁决的后代品种 id（发起方领取）',
  owner_offspring_breed_id VARCHAR(30) NULL COMMENT '归属方领取的后代品种 id（双方各一只）',
  claimed_at DATETIME NULL COMMENT '发起方领取后代时间（幂等，防重复领取）',
  owner_claimed_at DATETIME NULL COMMENT '归属方领取后代时间（幂等）',
  handled_at DATETIME NULL COMMENT '同意/拒绝时间（发起猫冷却权威）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_breq_target_pending (target_cat_id, status),
  KEY idx_breq_requester (requester_id, status),
  KEY idx_breq_owner (owner_user_id, status),
  KEY idx_breq_applicant_cat (applicant_cat_uid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='猫咪繁育申请';

-- ============================================================
-- 种子数据：2 只平台流浪猫（固定主键 1..2，可重复执行）
-- v1 的 3 只 official 自有猫（id 3..5）不再创建——自有猫由用户从自己存档放上公园
-- ============================================================
INSERT INTO park_cats (id, source, breed_cat_id, name, gender, category, owner_user_id, adoptable, can_breed) VALUES
  (1, 'official', 'tabby', '狸花小灰', 'female', 'stray', NULL, 1, 0),
  (2, 'official', 'black', '玄影',     'male',   'stray', NULL, 1, 0)
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  breed_cat_id = VALUES(breed_cat_id),
  name = VALUES(name),
  gender = VALUES(gender),
  category = VALUES(category),
  adoptable = VALUES(adoptable),
  can_breed = VALUES(can_breed);
-- 注：流浪猫不能参与繁育（can_breed=0），繁育只发生在用户猫之间；ON DUPLICATE 不覆盖 owner/冷却/快照字段。

-- ============================================================
-- 使用说明
-- ------------------------------------------------------------
-- 1) 用户猫上架：无需手工 SQL。用户在猫咪小屋把猫「放到公园」（cat.inPark=true）后，
--    存档回写 POST /api/cat-cabin/state 时由服务端 reconcile 自动投影进 park_cats
--    （每人最多 3 只，超出忽略；下架/删猫自动置 deleted=1，保留 last_breed_time）。
--
-- 2) 繁育资格（全部服务端校验，前端不可绕过）：
--    · 目标猫：主人好感度快照 affinity_level>=3 且 maturity_level=3（成年）且不在 48h 冷却
--    · 发起猫：服务端读发起方存档 save_json 校验该 uid 属于本人、maturityLevel>=3、level>=3
--    · 双方任一在 48h 冷却内都拦截；同意时 FOR UPDATE 二次复查，防并发连续繁育
--
-- 3) 好感度等级阈值（与前端 js/pet-data.js LEVEL_CONFIG.expRequired 对齐）：
--    Lv.1=0, Lv.2=50, Lv.3=150, Lv.4=300 ...；繁育门槛 Lv.3（intimacy>=150）。
--
-- 4) 后代归属（P2 已实现）：同意后双方各领一只（发起方 offspring_breed_id /
--    归属方 owner_offspring_breed_id），领取接口按 claimed_at / owner_claimed_at 幂等。
--
-- 5) 本地测试库若已建过 v1 表，先执行：
--    DROP TABLE IF EXISTS cat_affinity;
--    DROP TABLE IF EXISTS breeding_requests;
--    DROP TABLE IF EXISTS park_cats;
--    再重新执行本文件。
--
-- 6) 可重复执行；只增表与固定主键种子，不动业务数据。
-- ============================================================
