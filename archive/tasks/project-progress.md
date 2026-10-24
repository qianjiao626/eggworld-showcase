# 蛋蛋世界 - 项目进展梳理

> 更新时间：2026-09-01
> 定位：校园技能分享平台（MVP），单文件前端 + Spring Boot 3 后端

---

## 一、项目概况

| 项目 | 内容 |
|------|------|
| 项目名称 | 蛋蛋世界（校园技能分享平台） |
| 技术栈 | 前端：单文件 HTML+JS（growth-schoolv3.html）<br>后端：Java 17 / Spring Boot 3.3 / MyBatis-Plus / MySQL 8 / JWT / BCrypt / Spring Mail |
| 当前状态 | 核心功能全部对接完成，邮件真实发信已配置，进入部署阶段 |
| 部署目标 | 国内轻量云服务器，域名 dsxnb.com，子路径 /xs/，Nginx 反代 |

---

## 二、项目结构

```
backend-handoff-package/
├── growth-schoolv3.html          # 前端单文件（全部页面+交互）
├── backend/
│   ├── sql/init.sql              # 数据库完整初始化（v2.0，16 张表一键建库）
│   ├── deploy/                   # 部署配置（systemd / Nginx / prod 配置）
│   └── src/main/java/com/eggworld/
│       ├── controller/           # 9 个 Controller（48+ 接口）
│       ├── service/              # 业务层（14 个 Service）
│       ├── entity/               # 16 个实体（对应 16 张表）
│       ├── mapper/               # MyBatis-Plus Mapper
│       ├── dto/                  # 请求/响应对象
│       ├── common/               # 统一响应、异常处理、JWT、用户上下文
│       ├── config/               # 配置类（WebMvc/拦截器/初始化器）
│       └── job/                  # 定时任务（自动退回）
└── tasks/                        # 过程文档（接口/差距/测试用例等）
```

---

## 三、模块完成总览

| 模块 | 状态 | 说明 |
|------|------|------|
| 认证（邮箱验证码注册/登录） | ✅ 完成 | 真实 SMTP 发信，60s 防刷，JWT 7 天 |
| 用户信息/五维属性/角色 | ✅ 完成 | 资料 CRUD、五维增长、角色解锁 |
| 技能标签 | ✅ 完成 | 持久化 + sort_order 排序 |
| 任务系统 | ✅ 完成 | 发布/审核/认领/配对/提交/确认/取消，三类资金流 |
| 官方奖励任务（reward） | ✅ 完成 | 管理员免审核、认领即开始、全站通知、发币 |
| 蛋蛋币与流水 | ✅ 完成 | 行锁事务、冻结/结算/退回、3 天自动退回 |
| 评价体系 | ✅ 完成 | 星级+评语、已评价展示、口碑重算 |
| 邀请注册 | ✅ 完成 | 邀请码、注册绑定、首任务奖励 |
| 通知系统 | ✅ 完成 | 业务动作触发、已读管理、未读徽标 |
| 跨用户主页 | ✅ 完成 | 真实数据名片、五维/技能/统计 |
| 点赞/邀请发布任务 | ✅ 完成 | 一人一次、防重复、目标用户通知 |
| 排行榜 | ✅ 完成 | 8 大榜单、管理员不上榜、点击弹名片 |
| 八卦吃瓜 | ✅ 完成 | 帖子/回答/点赞/采纳、悬赏流转、八卦蛋榜 |
| 我的打听 | ✅ 完成 | 我的任务页管理回答与采纳 |
| 大学吐槽榜 | ✅ 完成 | 16 维评分、学校排名、吐槽墙、每人限 2 次 |
| 管理后台 | ✅ 完成 | 任务审核、用户管理、工单、官方任务管理 |
| 多账号会话 | ✅ 完成 | token 存 sessionStorage，多标签页互不干扰 |
| 邮件（SMTP） | ✅ 完成 | QQ 邮箱真实发信，配置已入 application.yml |

---

## 四、各模块详情

### 1. 认证与账号（/api/auth）
- **发送验证码**：`POST /send-code`，6 位数字码，内存缓存 5 分钟，同邮箱 60s 防刷，QQ 邮箱 SMTP 真实发信
- **注册**：`POST /register`，校验验证码+邮箱唯一，BCrypt 加密，事务创建用户 + 五维初始化 + 6 个角色（默认 game 解锁）+ 赠送 100 蛋蛋币
- **登录**：`POST /login`，签发 JWT（含 userId/role/nickname，7 天有效）
- 前端注册页：MBTI 选择 + 初始蛋抽卡（3 次重抽），资料（学校/专业/城市/年级/年龄）选填

### 2. 用户信息（/api/users/me）
- 查询/更新资料：`GET`/`PUT`
- 五维属性：`GET /stats`（knowledge/skills/charm/money 0-10 + reputation 0-5）
- 角色解锁：`GET /characters`（6 类，按分类完成任务数增长）
- 技能标签：`GET/PUT /skills`（sort_order 排序）
- 蛋蛋币流水：`GET /point-logs`
- 收到/给出评价：`GET /ratings`、`GET /given-ratings`
- 邀请记录：`GET /invites`

### 3. 任务系统（/api/tasks）
- **四类任务**：teach（教学，认领者付费→发布者）/ help（求助，发布者悬赏冻结）/ team（组队，多人平分）/ reward（官方奖励，平台发币）
- **状态机**：pending → approved → pending_pairing → in_progress → submitted → completed；cancelled/expired
- **接口**：发布 / 广场列表（类型+分类+关键词+分页）/ 详情 / 我的发布 / 我的认领 / 认领 / 认领者列表 / 配对（组队多选平分，余数给第一个）/ 提交 / 确认 / 取消 / 评价
- **资金安全**：PointService 行锁（SELECT...FOR UPDATE）事务，求助/组队 3 天无人认领自动退回（定时任务）

### 4. 官方奖励任务（reward）
- 仅管理员发布，免审核直接 approved
- 认领即进行中（无需配对），多人可参与，首个认领者推进任务状态
- 完成后给所有已提交认领者发奖励，管理后台确认发放

### 5. 八卦吃瓜（/api/gossip）
- 帖子：发布（冻结悬赏）/ 列表（按标签筛选）/ 详情 / 点赞（一人一次）/ 我的打听
- 回答：回答（防自问自答/重复/已采纳）/ 点赞 / 采纳（发悬赏给回答者+通知）
- 30 天无人采纳自动退回（惰性检查）
- 八卦蛋榜：按回答获赞聚合，管理员排除

### 6. 大学吐槽榜（/api/complaints）
- 16 维评分（食堂/管理/实习/就业等），JSON 存储，SQL 聚合排名
- 总榜 + 16 个维度榜 + 学校详情 + 吐槽墙（昵称脱敏）
- 每人限吐槽 2 次，提交 +10 蛋蛋币 +10 经验

### 7. 排行榜（/api/users/rankings）
- 8 大榜单：经验榜/富豪榜/学识榜/打工榜/魅力榜/搞钱榜/口碑榜/人气榜
- 全部过滤 role='student'（管理员不上榜）
- 点击用户 → 弹出真实名片（跨用户主页）

### 8. 跨用户主页（/api/users）
- `GET /by-nickname`：按昵称查公开信息（五维/技能/统计/likedByMe）
- `POST /{id}/like`：认可点赞，一人一次，唯一约束防重复
- `POST /{id}/invite-task`：邀请发布教学任务，目标用户收通知

### 9. 通知系统（/api/users/me/notifications）
- 触发场景：任务认领/配对/提交/确认/取消/审核/评价、回答我的打听、采纳、被点赞、被邀请
- 官方任务发布 → 全站通知
- 未读徽标 + 全部已读

### 10. 管理后台（/api/admin）
- 工作台聚合统计：`GET /api/admin/stats?range=today|7d|30d`（运营/任务/资金/风险/趋势/页面热度；副管理员服务端仅下发任务+趋势）
- 页面浏览埋点：`POST /api/track/page`（匿名可调，仅登录学生落库）
- 任务审核：待审核列表 / 通过 / 驳回（驳回退冻结币）
- 用户管理：列表 + 搜索
- 反馈工单：列表 / 回复 / 关闭
- 官方任务管理：发布/查看认领者/确认发放
- JWT role=admin 校验（@AdminOnly）

### 11. 反馈（/api/feedback）
- 提交反馈（登录可选）

---

## 五、数据库（18 张表）

| 表 | 说明 |
|----|------|
| users | 用户（邮箱/密码哈希/角色/资料/MBTI/蛋属性/邀请码） |
| user_stats | 五维属性 |
| user_characters | 角色解锁（6 分类） |
| user_skills | 技能标签（sort_order） |
| invite_records | 邀请记录 |
| user_likes | 用户点赞（去重） |
| tasks | 任务 |
| task_claims | 任务认领 |
| ratings | 评价 |
| point_logs | 蛋蛋币流水 |
| gossip_posts | 打听帖子（tag 分类） |
| gossip_answers | 回答 |
| gossip_likes | 八卦点赞（去重） |
| notifications | 通知 |
| feedback_tickets | 反馈工单 |
| school_complaints | 大学吐槽 |
| feedback_messages | 反馈工单会话消息（用户追问/管理员回复） |
| page_views | 学生端页面浏览埋点（工作台页面热度榜数据源，v2.3） |

> init.sql 为 v2.0 完整版，18 张表一键建库，历史迁移段已合并。全表 utf8mb4。

---

## 六、部署方案与状态

### 拓扑
```
用户浏览器 → https://dsxnb.com/xs/ (Nginx)
    ├── /xs/  → 前端静态文件（index.html = growth-schoolv3.html）
    └── /xs/api/* → 反代 127.0.0.1:8090/api/* → Spring Boot jar（systemd 守护）
```

### 配置文件（backend/deploy/）
| 文件 | 说明 |
|------|------|
| application-prod.yml | 生产配置（SMTP 已填；端口需改 8090；DB 密码/JWT secret 待填） |
| eggworld.service | systemd 服务（JDK17 路径 + jar + prod profile） |
| nginx.conf | Nginx 子路径反代（HTTP + HTTPS 模板） |

### 待办
- [ ] application-prod.yml 端口 8080 → **8090**（对齐 nginx 反代）
- [ ] 填生产 MySQL 密码、JWT secret（openssl rand 生成）
- [ ] 服务器装 JDK 17 / MySQL 8 / Nginx
- [ ] `mvn clean package` 打包 jar
- [ ] 上传 jar + prod 配置 + 前端 index.html
- [ ] 执行 init.sql（v2.0）
- [ ] systemd 注册 + Nginx 配置 + 域名解析/备案（HTTPS 需备案）

---

## 七、未完成 / 待定事项

| 事项 | 优先级 | 说明 |
|------|--------|------|
| 部署上线 | 高 | 上述部署流程 |
| 协商取消 | 中 | 当前发布者直取消，v2 为"申请取消→对方同意" |
| 待批改管理 | 中 | 成果提交 + 管理员批改评分（当前用互评闭环） |
| 头像上传 | 中 | 用户头像文件上传 |
| 数据统计 | 低 | 管理后台用户增长/任务统计 |
| 大学吐槽榜种子数据 | 低 | 当前仅用户提交数据 |
| 后端单元测试 | 低 | 目前以接口实测为主 |

---

## 八、已知注意事项（踩坑记录）

1. **环境**：本机编译需先设 `$env:JAVA_HOME='D:\env\jdk\jdk17'`（旧文档写的 `D:\env\sdk\jdk-17` 已不存在，会报 JAVA_HOME not defined correctly）
2. **前端调试**：改动后需 Ctrl+F5 硬刷新（浏览器缓存旧版 HTML 曾多次造成"没生效"假象）
3. **数据库**：MySQL 8 不支持 `ADD COLUMN IF NOT EXISTS`，需动态 SQL 判重
4. **邮件**：smtps 协议下 JavaMail 只读 `mail.smtps.*` 前缀；SMTP 不可达时连接超时配置避免请求卡死
5. **排行榜**：管理员（role=admin）不能上榜，榜单查询需过滤 role='student'
6. **资金**：所有余额变动走 PointService 行锁事务，禁止裸 UPDATE
7. **字符集**：全表 utf8mb4，否则 emoji 入库报错
8. **多标签页**：token 存 sessionStorage（隔离），不要用 localStorage
9. **注册邀请码**：仅 URL `?invite=` 参数预填，localStorage 残留已处理
