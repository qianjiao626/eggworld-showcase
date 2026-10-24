-- =====================================================================
-- 运营配置表（后台「系统设置」写入，业务侧每次实时读取，改完不用重启）
-- 2026-10-18 首次用于大师兄简历：是否收费 / 单次价格 / 每人每天次数
--
-- 执行（本地 / 线上同名脚本都要跑，线上账号 eggworld）：
--   mysql -u eggworld -p eggworld < backend/sql/migrate-app-settings.sql
--
-- 默认值：免费开启（charge_enabled=0）、恢复收费后 50 蛋蛋币/次、每天 3 次。
-- 重复执行安全：建表用 IF NOT EXISTS，初始值用 ON DUPLICATE KEY 跳过已有配置。
-- =====================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   VARCHAR(64)  NOT NULL COMMENT '配置键（如 resume.charge_enabled）',
  setting_value VARCHAR(500) NOT NULL COMMENT '配置值（字符串存储，业务侧按类型解析）',
  updated_by    BIGINT       NULL     COMMENT '最后修改人 user_id',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='运营配置（后台可改，实时生效）';

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('resume.charge_enabled', '0'),
  ('resume.analyze_cost', '50'),
  ('resume.daily_limit', '3')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
