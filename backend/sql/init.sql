-- ============================================================
-- 蛋蛋世界 - 数据库完整初始化脚本（v2.0 完整版）
-- 日期: 2026-09-03
-- 数据库: MySQL 8.x  字符集: utf8mb4
-- 用法: mysql -u root -p < init.sql
-- 说明: 本文件包含全部 19 张表（v1.1~v1.6 历次增量迁移已全部并入主建表段，
--       含 feedback_messages 会话表、ratings 评价治理字段与 page_views 埋点表），
--       全新库执行一次即可完整建库，无尾部 ALTER 补丁，无需再执行任何迁移。
-- ============================================================

-- 创建数据库（如不存在）
CREATE DATABASE IF NOT EXISTS eggworld
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE eggworld;

-- ============================================================
-- 先删除（按依赖反序，避免外键约束失败）
-- ============================================================
-- 成就特效系统（v2.5）暂时下线：线上库未执行 migrate-achievement.sql，
-- 对应后端代码已抽到 backend/achievement-pending/，前端页面也已停止加载。
-- 恢复时取消下面 4 行注释，并同步放开 init.sql 第 19 节的建表与种子数据。
-- DROP TABLE IF EXISTS user_equip;
-- DROP TABLE IF EXISTS user_achievements;
-- DROP TABLE IF EXISTS achievements;
-- DROP TABLE IF EXISTS titles;
DROP TABLE IF EXISTS daily_checkins;
DROP TABLE IF EXISTS permission_audit;
DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS page_views;
DROP TABLE IF EXISTS school_complaints;
DROP TABLE IF EXISTS gossip_likes;
DROP TABLE IF EXISTS user_likes;
DROP TABLE IF EXISTS invite_records;
DROP TABLE IF EXISTS user_skills;
DROP TABLE IF EXISTS user_characters;
DROP TABLE IF EXISTS feedback_messages;
DROP TABLE IF EXISTS feedback_tickets;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS gossip_answers;
DROP TABLE IF EXISTS gossip_posts;
DROP TABLE IF EXISTS point_logs;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS task_claims;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS user_stats;
DROP TABLE IF EXISTS users;

-- ============================================================
-- 1. 用户表 users
-- ============================================================
CREATE TABLE users (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  nickname        VARCHAR(50)  NOT NULL COMMENT '昵称',
  email           VARCHAR(100) NOT NULL COMMENT '邮箱（登录凭证）',
  password_hash   VARCHAR(255) NOT NULL COMMENT '密码哈希（BCrypt）',
  role            ENUM('student','admin') NOT NULL DEFAULT 'student' COMMENT '角色',
  school          VARCHAR(100) COMMENT '学校',
  major           VARCHAR(100) COMMENT '专业',
  city            VARCHAR(50)  COMMENT '城市',
  grade           VARCHAR(20)  COMMENT '年级',
  age             INT          COMMENT '年龄',
  bio             TEXT         COMMENT '个人简介',
  mbti_type       VARCHAR(4)   COMMENT 'MBTI 类型（如 INTJ）',
  mbti_group      VARCHAR(2)   COMMENT 'MBTI 分组: NT/NF/SJ/SP',
  points          INT          NOT NULL DEFAULT 100 COMMENT '蛋蛋币余额',
  exp             INT          NOT NULL DEFAULT 0   COMMENT '经验值（完成任务数）',
  likes           INT          NOT NULL DEFAULT 0   COMMENT '获赞数',
  reputation      DECIMAL(2,1) NOT NULL DEFAULT 0.0 COMMENT '口碑值（评价均分）',
  egg_category    VARCHAR(20)  COMMENT '蛋类型分类',
  egg_rarity      ENUM('N','R','SR','SSR','UR') NOT NULL DEFAULT 'N' COMMENT '稀有度',
  invite_code     VARCHAR(20)  COMMENT '邀请码（v1.2 邀请注册）',
  banned          TINYINT      NOT NULL DEFAULT 0 COMMENT '封禁: 0正常 1已封禁（v2.1 账号封禁）',
  sub_admin       TINYINT      NOT NULL DEFAULT 0 COMMENT '副管理员: 0否 1是，可发布官方任务/审核任务（v2.2 权限）',
  deleted         TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除: 0未删 1已删',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_email (email),
  UNIQUE KEY uk_nickname (nickname),
  UNIQUE KEY uk_invite_code (invite_code),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ============================================================
-- 2. 用户统计表 user_stats（五维属性）
-- ============================================================
CREATE TABLE user_stats (
  user_id     BIGINT PRIMARY KEY,
  knowledge   DECIMAL(2,1) NOT NULL DEFAULT 0 COMMENT '学识值 0-10',
  skills      DECIMAL(2,1) NOT NULL DEFAULT 0 COMMENT '打工值 0-10',
  charm       DECIMAL(2,1) NOT NULL DEFAULT 0 COMMENT '魅力值 0-10',
  money       DECIMAL(2,1) NOT NULL DEFAULT 0 COMMENT '搞钱值 0-10',
  reputation  DECIMAL(2,1) NOT NULL DEFAULT 0 COMMENT '口碑值 0-5',
  CONSTRAINT fk_stats_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户五维属性';

-- ============================================================
-- 3. 角色解锁表 user_characters（初始蛋分类）
-- ============================================================
CREATE TABLE user_characters (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  category     VARCHAR(20) NOT NULL COMMENT 'study/job/side/hobby/game/life',
  unlocked     TINYINT NOT NULL DEFAULT 0 COMMENT '是否解锁: 0否 1是',
  count        INT    NOT NULL DEFAULT 0 COMMENT '该分类完成任务数',
  is_current   TINYINT NOT NULL DEFAULT 0 COMMENT '是否当前使用: 0否 1是',
  UNIQUE KEY uk_user_cat (user_id, category),
  CONSTRAINT fk_char_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色解锁表';

-- ============================================================
-- 4. 用户技能标签表 user_skills（v1.1 含 sort_order）
-- ============================================================
CREATE TABLE user_skills (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL COMMENT '用户ID',
  skill      VARCHAR(30) NOT NULL COMMENT '技能标签名称',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '展示排序（从0开始，按用户喜好）',
  UNIQUE KEY uk_user_skill (user_id, skill),
  CONSTRAINT fk_skill_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户技能标签表';

-- ============================================================
-- 5. 邀请记录表 invite_records（v1.2 邀请注册）
-- ============================================================
CREATE TABLE invite_records (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  inviter_id   BIGINT NOT NULL COMMENT '邀请人ID',
  invitee_id   BIGINT NOT NULL COMMENT '被邀请人ID',
  status       ENUM('pending','rewarded') NOT NULL DEFAULT 'pending' COMMENT 'pending待发布任务/rewarded已发放',
  reward       INT    NOT NULL DEFAULT 0 COMMENT '发放金额',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rewarded_at  DATETIME COMMENT '奖励发放时间',
  UNIQUE KEY uk_invitee (invitee_id),
  KEY idx_inviter (inviter_id),
  CONSTRAINT fk_inviter_user FOREIGN KEY (inviter_id) REFERENCES users(id),
  CONSTRAINT fk_invitee_user FOREIGN KEY (invitee_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邀请记录表';

-- ============================================================
-- 6. 用户点赞表 user_likes（v1.3 跨用户主页认可点赞）
-- ============================================================
CREATE TABLE user_likes (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  liker_id   BIGINT NOT NULL COMMENT '点赞者ID',
  likee_id   BIGINT NOT NULL COMMENT '被点赞者ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_liker_likee (liker_id, likee_id),
  KEY idx_likee (likee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户点赞表';

-- ============================================================
-- 7. 任务表 tasks
-- ============================================================
CREATE TABLE tasks (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  title              VARCHAR(200) NOT NULL COMMENT '任务标题',
  description        TEXT         COMMENT '任务描述',
  task_type          ENUM('teach','help','team','reward') NOT NULL COMMENT '任务类型: 教学/求助/组队/官方奖励',
  skill_category     VARCHAR(50)  COMMENT '技能大类: study/job/side/hobby/game/life',
  skill_sub          VARCHAR(50)  COMMENT '技能子类',
  reward             INT          NOT NULL DEFAULT 10 COMMENT '蛋蛋币金额',
  claim_mode         ENUM('single','multiple') NOT NULL DEFAULT 'single' COMMENT '认领模式',
  max_claimers       INT          COMMENT '最大认领人数',
  requirements       TEXT         COMMENT '参与要求',
  proof_image_id     BIGINT       NULL COMMENT '技能证明图片（task_proof_images.id；为空表示未上传，详情页在任务描述之前展示）',
  publisher_id       BIGINT       NOT NULL COMMENT '发布者ID',
  contact           VARCHAR(200) COMMENT '发布者联系方式',
  conversation_id    BIGINT       NULL COMMENT '绑定的群聊会话ID（chat_conversations.id；教学/组队任务上线时自动建群）',
  status            ENUM('pending','approved','rejected','in_progress','completed','cancelled','expired','full')
                     NOT NULL DEFAULT 'pending' COMMENT '任务状态: full=组队已满员/招募已结束',
  settled           TINYINT      NOT NULL DEFAULT 0 COMMENT '组队互评结算: 0未结算 1已结算（v1.6）',
  signup_deadline    DATETIME     COMMENT '报名截止',
  complete_deadline  DATETIME     COMMENT '完成截止',
  rate_deadline      DATETIME     COMMENT '组队互评截止（确认完成+3天，v1.6）',
  deleted           TINYINT      NOT NULL DEFAULT 0,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_publisher (publisher_id),
  KEY idx_type_status (task_type, status),
  KEY idx_category (skill_category),
  KEY idx_proof_image (proof_image_id)
  -- 注：不加 publisher_id → users 外键，使管理端可物理删除用户后仍保留其发布的任务（发布者显示为"已注销"）
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务表';

-- ============================================================
-- 7.1 任务技能证明图片 task_proof_images（发布任务选填，详情页展示）
-- ============================================================
CREATE TABLE task_proof_images (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  uploader_id  BIGINT       NOT NULL COMMENT '上传者用户ID（只有发布者本人能上传与读取自己的图）',
  image_key    VARCHAR(64)  NOT NULL COMMENT '落盘文件名（UUID + 扩展名）',
  content_type VARCHAR(50)  NOT NULL COMMENT '图片 MIME：image/jpeg / image/png / image/webp',
  byte_size    INT          NOT NULL DEFAULT 0 COMMENT '字节数，便于排查与配额观察',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_proof_image_key (image_key),
  KEY idx_task_proof_uploader (uploader_id)
  -- 注：不加 uploader_id → users 外键（同 tasks.publisher_id 的策略），否则管理端物理删除用户会失败
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务技能证明图片（发布任务选填，详情页展示）';

-- ============================================================
-- 8. 任务认领表 task_claims
-- ============================================================
CREATE TABLE task_claims (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id          BIGINT       NOT NULL,
  claimer_id       BIGINT       NOT NULL COMMENT '认领者ID',
  status           ENUM('pending_pairing','in_progress','submitted','completed','rejected','cancelled')
                   NOT NULL DEFAULT 'pending_pairing' COMMENT '认领状态',
  claimer_contact  VARCHAR(200) COMMENT '认领者联系方式',
  selected         TINYINT      NOT NULL DEFAULT 0 COMMENT '是否被发布者选中: 0否 1是',
  paired_at        DATETIME     COMMENT '配对确认时间',
  submitted_at     DATETIME     COMMENT '提交完成时间',
  completed_at     DATETIME     COMMENT '最终完成时间',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_claimer (task_id, claimer_id),
  KEY idx_claimer (claimer_id),
  CONSTRAINT fk_claim_task    FOREIGN KEY (task_id)    REFERENCES tasks(id),
  CONSTRAINT fk_claim_claimer FOREIGN KEY (claimer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务认领表';

-- ============================================================
-- 9. 评价表 ratings
-- ============================================================
CREATE TABLE ratings (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id      BIGINT NOT NULL,
  rater_id     BIGINT NOT NULL COMMENT '评价者ID',
  ratee_id     BIGINT NOT NULL COMMENT '被评价者ID',
  score        INT    NOT NULL COMMENT '1-5星',
  comment      TEXT   COMMENT '文字评价',
  rater_role   ENUM('publisher','claimer') NOT NULL COMMENT '评价者角色',
  task_type    VARCHAR(10) COMMENT '冗余任务类型(teach/help/team)，便于按类型统计',
  is_auto      TINYINT NOT NULL DEFAULT 0 COMMENT '系统补录: 0用户真实 1系统默认分(不计口碑)',
  visible      TINYINT NOT NULL DEFAULT 1 COMMENT '可见性: 1正常 0管理员隐藏(不计口碑)',
  reply        TEXT   COMMENT '被评价者对这条评价的回复',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rating (task_id, rater_id, ratee_id) COMMENT '防重复评价',
  KEY idx_ratee (ratee_id),
  KEY idx_ratee_vis (ratee_id, visible, is_auto),
  CONSTRAINT fk_rating_task FOREIGN KEY (task_id) REFERENCES tasks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评价表';

-- ============================================================
-- 10. 蛋蛋币流水表 point_logs
-- ============================================================
CREATE TABLE point_logs (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  type         VARCHAR(50) NOT NULL COMMENT '类型: earn/spend/freeze/refund/reward',
  label        VARCHAR(200) COMMENT '描述',
  delta        INT    NOT NULL COMMENT '变动金额（正增加负减少）',
  balance      INT    COMMENT '变动后余额',
  task_id      BIGINT COMMENT '关联任务ID',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_task (task_id),
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='蛋蛋币流水表';

-- ============================================================
-- 11. 打听/八卦表 gossip_posts（v1.4 含 tag 分类标签）
-- ============================================================
CREATE TABLE gossip_posts (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  title              VARCHAR(200) NOT NULL,
  description        TEXT,
  tag                VARCHAR(20) COMMENT '分类标签（校园/导师/职场/学业等）',
  publisher_id       BIGINT NOT NULL,
  bounty             INT  NOT NULL DEFAULT 1 COMMENT '悬赏蛋蛋币',
  coin_status        ENUM('frozen','awarded','refunded') NOT NULL DEFAULT 'frozen',
  adopted            TINYINT NOT NULL DEFAULT 0 COMMENT '是否已采纳: 0否 1是',
  adopted_answer_id  BIGINT COMMENT '采纳的回答ID',
  is_permanent       TINYINT NOT NULL DEFAULT 1 COMMENT '提问永久保留: 0否 1是',
  deadline           DATETIME COMMENT '30天后自动退回',
  deleted            TINYINT NOT NULL DEFAULT 0,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  -- 注：不加 publisher_id → users 外键，使管理端可物理删除用户后仍保留其发布的打听内容
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='打听/八卦表';

-- ============================================================
-- 12. 打听回答表 gossip_answers
-- ============================================================
CREATE TABLE gossip_answers (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id      BIGINT NOT NULL,
  author_id    BIGINT NOT NULL,
  content      TEXT   NOT NULL,
  likes        INT    NOT NULL DEFAULT 0,
  is_adopted   TINYINT NOT NULL DEFAULT 0 COMMENT '是否被采纳: 0否 1是',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_post (post_id),
  CONSTRAINT fk_answer_post   FOREIGN KEY (post_id)   REFERENCES gossip_posts(id)
  -- 注：不加 author_id → users 外键，使管理端可物理删除用户后仍保留其回答
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='打听回答表';

-- ============================================================
-- 13. 八卦点赞表 gossip_likes（v1.4，帖子/回答点赞去重）
-- ============================================================
CREATE TABLE gossip_likes (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL COMMENT '点赞用户ID',
  post_id    BIGINT COMMENT '点赞的帖子ID（与answer_id二选一）',
  answer_id  BIGINT COMMENT '点赞的回答ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_post (user_id, post_id),
  UNIQUE KEY uk_user_answer (user_id, answer_id),
  KEY idx_post (post_id),
  KEY idx_answer (answer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='八卦点赞表';

-- ============================================================
-- 14. 通知表 notifications
-- ============================================================
CREATE TABLE notifications (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  text         VARCHAR(500) NOT NULL,
  type         VARCHAR(30) NOT NULL DEFAULT 'info',
  is_read      TINYINT NOT NULL DEFAULT 0 COMMENT '0未读 1已读',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_read (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知表';

-- ============================================================
-- 15. 反馈工单表 feedback_tickets
-- ============================================================
CREATE TABLE feedback_tickets (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT COMMENT '可为空（匿名反馈）',
  content      TEXT   NOT NULL,
  type         VARCHAR(20) NOT NULL DEFAULT 'other' COMMENT '反馈类型：bug/suggestion/report/other',
  contact      VARCHAR(200) COMMENT '联系方式（选填）',
  status       ENUM('open','replied','closed') NOT NULL DEFAULT 'open',
  admin_reply  TEXT,
  replied_at   DATETIME COMMENT '管理员回复时间',
  user_read    TINYINT  NOT NULL DEFAULT 1 COMMENT '用户是否已读回复：0未读/1已读',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME COMMENT '最后更新时间',
  KEY idx_status (status),
  CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='反馈工单表';

-- ============================================================
-- 15.1 反馈工单会话消息表 feedback_messages（P1 用户追问）
-- 首次提交存在 feedback_tickets.content，本表只存其后的往返消息
-- ============================================================
CREATE TABLE feedback_messages (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  ticket_id   BIGINT NOT NULL COMMENT '所属工单',
  sender_type ENUM('user','admin') NOT NULL COMMENT '发送方',
  content     TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ticket (ticket_id),
  CONSTRAINT fk_msg_ticket FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='反馈工单会话消息表';

-- ============================================================
-- 16. 大学吐槽记录表 school_complaints（v1.5 大学吐槽榜）
-- v1.5: 大学吐槽榜（每条吐槽含 16 维评分 JSON，学校排名由 SQL 聚合）
-- 注: 已并入主建表段（v1.6 无残留 ALTER），上方 DROP 段已按依赖反序删除旧表
CREATE TABLE school_complaints (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_name VARCHAR(100) NOT NULL COMMENT '学校名称',
  user_id     BIGINT COMMENT '吐槽人ID（可为空）',
  content     VARCHAR(500) COMMENT '吐槽留言',
  metrics     JSON NOT NULL COMMENT '16维评分 {key: 分值0-10}',
  score       DECIMAL(2,1) NOT NULL COMMENT '平均吐槽分（16维均值）',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_school (school_name),
  KEY idx_created (created_at),
  CONSTRAINT fk_bl_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='大学吐槽记录表';

-- ============================================================
-- 17. 页面浏览埋点表 page_views（v2.3 管理员工作台「页面热度榜」）
-- 仅记录已登录学生的学生端页面切页；游客与管理员不落库。
-- 不建 users 外键（与 user_likes 同策略），用户注销时由
-- UserPurgeMapper.deletePageViews 显式清理。
-- ============================================================
CREATE TABLE page_views (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT COMMENT '浏览用户（当前仅记录登录学生，保留 NULL 以兼容未来游客统计）',
  page_key   VARCHAR(32) NOT NULL COMMENT '页面标识：plaza/teamplaza/helpplaza/rankhall/gossip/blacklist/mytasks/publish/profile',
  role       VARCHAR(16) COMMENT '记录时的角色：student',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_page_time (page_key, created_at),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生端页面浏览记录（工作台热度榜数据源）';

-- ============================================================
-- 18. 每日签到表 daily_checkins（v2.4）
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_checkins (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL COMMENT '用户ID',
  check_date DATE   NOT NULL COMMENT '签到日期',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, check_date),
  KEY idx_user (user_id),
  CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日签到表';

-- ============================================================
-- 20. 权限管理（学生协管员）：user_permissions / permission_audit
--     两段式「用户 → 权限点」，无角色层；权限点写死在代码里（PermCode）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_permissions (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL COMMENT '被授权用户ID',
  perm_code  VARCHAR(32) NOT NULL COMMENT '权限点：content_review / data_dashboard',
  granted_by BIGINT NOT NULL COMMENT '授权操作人ID',
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_perm (user_id, perm_code),
  KEY idx_perm_code (perm_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户权限点（当前状态，唯一权威源）';

CREATE TABLE IF NOT EXISTS permission_audit (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  operator_id    BIGINT NOT NULL COMMENT '操作人ID',
  target_user_id BIGINT NOT NULL COMMENT '被操作用户ID',
  perm_code      VARCHAR(32) NOT NULL COMMENT '权限点',
  action         VARCHAR(8)  NOT NULL COMMENT '动作：grant / revoke',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_perm_audit_time (created_at, id),
  KEY idx_perm_audit_target (target_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限授予/收回审计（按人一条）';

-- ============================================================
-- 19. 成就特效系统（v2.5）：titles / achievements /
--     user_achievements / user_equip —— 【暂时下线，整节已注释】
--
-- 下线原因：线上数据库未执行 migrate-achievement.sql，
--   后端每次请求都会查这 4 张表导致报错。
-- 现状：后端代码已抽到 backend/achievement-pending/（不参与编译），
--   前端页面已抽到 js/achievement-page.css / js/achievement-page.js（不加载）。
-- 恢复：取消本节注释 + 放开 init.sql 顶部 4 行 DROP 注释，
--   并执行 backend/sql/migrate-achievement.sql（线上增量）。
--
-- 原内容（特效是代码定义的静态资源，无对应数据表，
--   故 user_equip 直接存 key 字符串而非 item_id）：
-- ============================================================

-- -- 19.1 称号定义
-- CREATE TABLE titles (
--   id          BIGINT PRIMARY KEY AUTO_INCREMENT,
--   title_key   VARCHAR(48) NOT NULL COMMENT '称号标识，如 t-steady',
--   name        VARCHAR(20) NOT NULL COMMENT '称号文本，如「雷打不动」',
--   style_class VARCHAR(32) NOT NULL COMMENT '样式：title-plain/title-gold/title-neon/title-flame/title-holo',
--   rarity      ENUM('N','R','SR','SSR','UR') NOT NULL DEFAULT 'N' COMMENT '档次（仅用于排序与展示）',
--   sort_order  INT NOT NULL DEFAULT 0,
--   created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   UNIQUE KEY uk_title_key (title_key)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='称号定义';

-- -- 19.2 成就定义
-- CREATE TABLE achievements (
--   id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
--   ach_key            VARCHAR(48)  NOT NULL COMMENT '成就标识，如 ach_checkin_1',
--   name               VARCHAR(40)  NOT NULL COMMENT '成就名',
--   category           VARCHAR(20)  NOT NULL COMMENT 'checkin/publish/complete/team/rating/gossip/invite/complaint/meta',
--   description        VARCHAR(200) NOT NULL COMMENT '条件描述（前端展示）',
--   cond_type          VARCHAR(32)  NOT NULL COMMENT '判定类型',
--   cond_value         INT          NOT NULL COMMENT '阈值',
--   reward_effect_key  VARCHAR(64)  NULL COMMENT '奖励特效 key（deco 类名）',
--   reward_effect_slot VARCHAR(16)  NULL COMMENT '特效槽位 aura/cloak/outfit/frame/charm/skin',
--   reward_title_key   VARCHAR(48)  NULL COMMENT '奖励称号 key',
--   sort_order         INT NOT NULL DEFAULT 0,
--   enabled            TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
--   created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   UNIQUE KEY uk_ach_key (ach_key),
--   KEY idx_cat_sort (category, sort_order, enabled)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成就定义';

-- -- 19.3 用户成就解锁记录
-- CREATE TABLE user_achievements (
--   id          BIGINT PRIMARY KEY AUTO_INCREMENT,
--   user_id     BIGINT NOT NULL,
--   ach_id      BIGINT NOT NULL,
--   unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   is_read     TINYINT  NOT NULL DEFAULT 0 COMMENT '0未读 1已查看解锁弹窗',
--   UNIQUE KEY uk_user_ach (user_id, ach_id) COMMENT '幂等：同一用户同一成就只能解锁一次',
--   KEY idx_user_unread (user_id, is_read),
--   CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id),
--   CONSTRAINT fk_ua_ach  FOREIGN KEY (ach_id)  REFERENCES achievements(id)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户成就解锁记录';

-- -- 19.4 用户当前穿戴（7 槽位）
-- CREATE TABLE user_equip (
--   user_id    BIGINT PRIMARY KEY,
--   aura_key   VARCHAR(64) NULL COMMENT '光环',
--   cloak_key  VARCHAR(64) NULL COMMENT '披风',
--   outfit_key VARCHAR(64) NULL COMMENT '服装',
--   frame_key  VARCHAR(64) NULL COMMENT '边框',
--   charm_key  VARCHAR(64) NULL COMMENT '挂件',
--   title_key  VARCHAR(48) NULL COMMENT '称号',
--   skin_key   VARCHAR(64) NULL COMMENT '调色皮肤',
--   updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   CONSTRAINT fk_ue_user FOREIGN KEY (user_id) REFERENCES users(id)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户当前穿戴的装扮（7 槽位，存 key）';

-- -- 19.5 种子数据：称号（24 条）
-- INSERT INTO titles (title_key,name,style_class,rarity,sort_order) VALUES
-- ('t-newbie','早起的蛋','title-plain','N',10),
-- ('t-tasker','任务达人','title-plain','N',20),
-- ('t-buddy','靠谱搭子','title-plain','N',30),
-- ('t-sharp','一针见血','title-plain','N',40),
-- ('t-guide','引路人','title-plain','N',50),
-- ('t-frank','有话直说','title-plain','N',60),
-- ('t-diligent','勤勉不辍','title-gold','R',110),
-- ('t-lord','一方诸侯','title-gold','R',120),
-- ('t-worker','黄金打工人','title-gold','R',130),
-- ('t-goldsign','金字招牌','title-gold','R',140),
-- ('t-steady','雷打不动','title-neon','SR',210),
-- ('t-mentor','桃李满门','title-neon','SR',220),
-- ('t-core','团队核心','title-neon','SR',230),
-- ('t-partner','最佳拍档','title-neon','SR',240),
-- ('t-brain','智囊','title-neon','SR',250),
-- ('t-model','劳模蛋','title-flame','SSR',310),
-- ('t-allround','全能蛋','title-flame','SSR',320),
-- ('t-hexa','六边形蛋','title-flame','SSR',330),
-- ('t-star','星辰不眠','title-holo','UR',410),
-- ('t-legend','传奇蛋','title-holo','UR',420),
-- ('t-acclaim','众望所归','title-holo','UR',430),
-- ('t-genius','智多星','title-holo','UR',440),
-- ('t-network','人脉王','title-holo','UR',450),
-- ('t-veteran','元老','title-holo','UR',460);

-- -- 19.6 种子数据：成就（30 条）
-- INSERT INTO achievements (ach_key,name,category,description,cond_type,cond_value,reward_effect_key,reward_effect_slot,reward_title_key,sort_order) VALUES
-- ('ach_checkin_1','初来乍到','checkin','累计签到 1 天','checkin_total',1,'a-moon','aura',NULL,10),
-- ('ach_checkin_3','早起的蛋','checkin','累计签到 3 天','checkin_total',3,'f-cloud','frame','t-newbie',20),
-- ('ach_checkin_streak_7','小有坚持','checkin','连续签到 7 天','checkin_streak',7,'ch-cap','charm',NULL,30),
-- ('ach_checkin_15','勤勉不辍','checkin','累计签到 15 天','checkin_total',15,'of-scarf','outfit','t-diligent',40),
-- ('ach_checkin_streak_30','雷打不动','checkin','连续签到 30 天','checkin_streak',30,'a-thunder','aura','t-steady',50),
-- ('ach_checkin_100','星辰不眠','checkin','累计签到 100 天','checkin_total',100,'a-cosmos','aura','t-star',60),
-- ('ach_publish_1','初出茅庐','publish','发布第 1 个任务','publish_count',1,'cl-cloth','cloak',NULL,110),
-- ('ach_publish_5','任务达人','publish','累计发布 5 个任务','publish_count',5,'ch-bolt','charm','t-tasker',120),
-- ('ach_publish_15','一方诸侯','publish','累计发布 15 个任务','publish_count',15,'f-flow','frame','t-lord',130),
-- ('ach_publish_30','桃李满门','publish','累计发布 30 个任务','publish_count',30,'cl-dragon','cloak','t-mentor',140),
-- ('ach_complete_1','热心肠','complete','完成第 1 个任务','complete_count',1,'of-uniform','outfit',NULL,210),
-- ('ach_complete_5','靠谱搭子','complete','累计完成 5 个任务','complete_count',5,'ch-cat','charm','t-buddy',220),
-- ('ach_complete_15','黄金打工人','complete','累计完成 15 个任务','complete_count',15,'of-armor','outfit','t-worker',230),
-- ('ach_complete_30','劳模蛋','complete','累计完成 30 个任务','complete_count',30,'cl-flame','cloak','t-model',240),
-- ('ach_complete_60','传奇蛋','complete','累计完成 60 个任务','complete_count',60,'of-rune','outfit','t-legend',250),
-- ('ach_team_1','并肩作战','team','首次组队完成','team_count',1,'cl-feather','cloak',NULL,310),
-- ('ach_team_5','团队核心','team','组队完成 5 次','team_count',5,'ch-wing','charm','t-core',320),
-- ('ach_team_10','最佳拍档','team','组队完成 10 次','team_count',10,'sk-ice','skin','t-partner',330),
-- ('ach_rating_five_1','好评如潮','rating','首次收到 5 星评价','rating_five_count',1,'sk-flame','skin',NULL,410),
-- ('ach_rating_five_10','金字招牌','rating','累计收到 10 条 5 星评价','rating_five_count',10,NULL,NULL,'t-goldsign',420),
-- ('ach_rating_quality','众望所归','rating','口碑均分 4.8 以上且评价数达 20','rating_quality',20,'f-star','frame','t-acclaim',430),
-- ('ach_gossip_1','一针见血','gossip','首次回答被采纳','gossip_adopted_count',1,'of-lab','outfit','t-sharp',510),
-- ('ach_gossip_10','智囊','gossip','累计被采纳 10 次','gossip_adopted_count',10,'a-ember','aura','t-brain',520),
-- ('ach_gossip_30','蛋总智多星','gossip','累计被采纳 30 次','gossip_adopted_count',30,'cl-galaxy','cloak','t-genius',530),
-- ('ach_invite_1','引路人','invite','成功邀请 1 位好友','invite_count',1,'f-rainbow','frame',NULL,610),
-- ('ach_invite_5','人脉王','invite','成功邀请 5 位好友','invite_count',5,'ch-crown','charm','t-network',620),
-- ('ach_complaint_1','有话直说','complaint','首次参与大学吐槽','complaint_count',1,'sk-night','skin','t-frank',710),
-- ('ach_meta_cat_4','全能蛋','meta','在 4 个不同分类中达成成就','meta_category_count',4,'f-dragon','frame','t-allround',810),
-- ('ach_meta_ach_20','六边形蛋','meta','累计解锁 20 个成就','meta_ach_count',20,NULL,NULL,'t-hexa',820),
-- ('ach_meta_days_365','元老','meta','注册满 365 天','register_days',365,'sk-gold','skin','t-veteran',830);

-- ============================================================
-- 初始数据说明
-- ============================================================
-- 默认管理员账号（admin@example.com / ********）由后端启动时自动创建
-- （DataInitializer 用 BCrypt 动态加密密码，保证哈希一定可验证）
-- 若需要在数据库层手工创建，请使用后端生成的 BCrypt 哈希，勿硬编码已知哈希

-- ============================================================
-- 验证查询
-- ============================================================
SELECT '=== 建表完成 ===' AS info;
SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'eggworld';
SELECT '=== 管理员账号（首次启动后端后应存在）===' AS info;
SELECT id, nickname, email, role FROM users WHERE role = 'admin';
