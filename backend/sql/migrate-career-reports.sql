-- =====================================================================
-- 职业测评（学生工坊 · 大师兄找方向）
--   ① 报告记录表：每次生成的报告存下来，用户可在「测评报告」里回看
--   ② 后台系统设置的默认值：收费开关 / 单次价格 / 每人每天次数
--
-- 执行（本地 / 线上同名脚本都要跑，线上账号 eggworld）：
--   mysql -u eggworld -p eggworld < backend/sql/migrate-career-reports.sql
--
-- 依赖 app_settings 表（migrate-app-settings.sql 已建）；本脚本里也带了一份
-- CREATE TABLE IF NOT EXISTS，单独执行不会报错。
-- 重复执行安全：建表用 IF NOT EXISTS，默认配置用 ON DUPLICATE KEY 跳过已有值。
-- =====================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   VARCHAR(64)  NOT NULL COMMENT '配置键（如 resume.charge_enabled）',
  setting_value VARCHAR(500) NOT NULL COMMENT '配置值（字符串存储，业务侧按类型解析）',
  updated_by    BIGINT       NULL     COMMENT '最后修改人 user_id',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='运营配置（后台可改，实时生效）';

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('career.charge_enabled', '1'),
  ('career.analyze_cost', '50'),
  ('career.daily_limit', '3')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- 报告记录：报告 HTML 直接存快照，避免素材/模板调整后历史报告变样。
-- request_id 唯一键用于幂等：同一个请求重试不会扣两次、也不会写两条。
CREATE TABLE IF NOT EXISTS career_reports (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  user_id      BIGINT       NOT NULL COMMENT '生成报告的用户',
  answers_json TEXT         NOT NULL COMMENT '19 题的答案数组（审计/复盘用）',
  headline     VARCHAR(120) NOT NULL DEFAULT '' COMMENT '列表展示的标题（命中的第一条职业路径）',
  report_html  MEDIUMTEXT   NOT NULL COMMENT '生成时的完整报告 HTML 快照',
  cost         INT          NOT NULL DEFAULT 0 COMMENT '本次实际消耗蛋蛋币（免费为 0）',
  request_id   VARCHAR(64)  NOT NULL COMMENT '幂等键',
  share_token  VARCHAR(32)  NULL     COMMENT '公开分享令牌（为空表示未分享，撤销后置空）',
  shared_at    DATETIME     NULL     COMMENT '首次创建分享链接的时间',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_career_reports_request (user_id, request_id),
  UNIQUE KEY uk_career_reports_share (share_token),
  KEY idx_career_reports_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='职业测评报告记录';
