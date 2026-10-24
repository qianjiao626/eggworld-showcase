-- Apply only after a production database backup. Additive migration.
-- 猫咪小屋（移动端任务广场第4个tab）：用户级整份游戏存档，服务端为权威数据源。
-- save_json 存引擎（js/pet-engine.js）getState 的整份 JSON（猫列表/背包/签到/繁育等）。
-- version 为乐观锁：客户端必须带服务器当前 version 才能覆盖，防多设备并发写丢档。
-- ⚠️ save_json 里的 coins 字段服务端一律改写为真实蛋蛋币余额（P2 金币合并），
--    客户端伪造余额无效；余额变动只走 /earn /spend（PointService 原子扣入账）。
-- earn_date/earned_today：每日赚币上限（增发护栏，2026-10-10 负责人确认 200/天）。
-- last_checkin_date/checkin_streak/last_donate_date：赚币资格服务端权威——
-- 签到每天一次、捐赠每天一次（防脚本反复调 /earn 刷币），档位由服务端 streak 推算。
CREATE TABLE IF NOT EXISTS cat_cabin_saves (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  save_json LONGTEXT NOT NULL,                      -- 引擎存档整份 JSON（上限 256KB，service 层校验）
  version INT NOT NULL DEFAULT 1,                   -- 乐观锁版本号，每次成功保存 +1
  earn_date DATE NULL,                              -- 当日赚币计数所属日期（跨天重置）
  earned_today INT NOT NULL DEFAULT 0,              -- 当日已通过 /earn 入账的蛋蛋币
  last_checkin_date DATE NULL,                      -- 服务端权威：最近签到日（每天限一次）
  checkin_streak INT NOT NULL DEFAULT 0,            -- 服务端权威：连续签到天数（断一天归零重计）
  last_donate_date DATE NULL,                       -- 服务端权威：最近捐赠日（每天限一次）
  last_thought_at DATETIME(3) NULL,                 -- 服务端权威：最近一次「看看猫咪在想什么」时刻（6h 冷却）
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cat_cabin_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
