# 蛋蛋世界 · 后端交接文档（接口清单 + 数据模型）

> 文档版本：v2.2 ｜ 最近校正：2026-10-02（高并发与安全加固部分为分支待发布，非线上状态）
> 校正依据：`backend/src/main/java`（Controller + JwtInterceptor + Service）、`backend/sql/*.sql`、`growth-schoolv3.html`（前端展示规则）
> 定位：本项目**接口清单 / 数据模型 / 交接说明**的唯一权威文档（见 [PROJECT_RULES.md](../PROJECT_RULES.md) 的「文档地图」）

## 文档边界（先看这里）

| 你要找什么 | 去哪里 |
|---|---|
| 项目入口、技术栈、本地启动、目录结构 | [README.md](../README.md) |
| 上线流程、发布物路径、回滚命令 | [PROJECT_RULES.md](../PROJECT_RULES.md)、[releases/上线文档.md](../releases/上线文档.md) |
| 待办与已知问题 | [TODO/TODO.md](../TODO/TODO.md) |
| 每次上线改了什么 | `releases/迁移文档/YYYY-MM-DD_*.md` |
| 历史迁移方案（一/二/三轮） | [迁移计划.md](迁移计划.md) |
| 施工计划（历史，已落地） | [tasks/backend-implementation-plan.md](../tasks/backend-implementation-plan.md) |

## 本次合并说明（2026-09-14）

1. 原 `tasks/backend-api.md` 的接口清单已**并入本文后删除**，两份接口文档不再并存。
2. 本文第二节既有接口清单**直接按代码重新生成**（共 **82** 条；宿舍目录另新增 9 条，见第十节），并修正了原文档会误导人的两处标注：`/api/gossip/*`、`/api/users/me/notifications` 曾被写作"未实现"，实际均已实现。
3. 原 v1.0（2026-08-23）写于项目仍是"纯前端 Demo"阶段，其中 6 个章节已作废，本次不再保留，去向见第七节。

---

## 一、基础约定

### 1.1 请求信息

| 项 | 说明 |
|----|------|
| 本地 Base URL | `http://localhost:8080` |
| 线上 Base URL | `https://dsxnb.com`（同域，Nginx 反代到后端；前端静态资源在 `/xs/`） |
| 统一前缀 | 所有接口以 `/api` 开头 |
| 请求头 | `Content-Type: application/json` |
| 鉴权头 | `Authorization: Bearer <token>`（登录后获取） |

### 1.2 统一响应体

```json
{ "code": 200, "msg": "ok", "data": { } }
```

| code | 含义 |
|------|------|
| 200 | 成功 |
| 400 | 业务校验错误（如验证码错误；`msg` 可直接展示给用户） |
| 401 | 未登录 / token 过期 |
| 403 | 无权限（含账号已被封禁、仅发布者可见等） |
| 404 | 资源不存在 |
| 409 | 冲突（邮箱已注册 / 昵称已被使用） |
| 429 | 应用限流（本轮分支新增：实际 HTTP 429，同时返回 `Retry-After` 秒数） |
| 500 | 服务端错误 |

> - **本轮分支变更，待发布**：API 配额、验证码发送冷却/容量预算、聊天每秒发送额度返回实际 **HTTP 429**，响应体 `code=429`，并携带 `Retry-After`。其他既有 `BusinessException` 仍沿用其业务错误码，不把所有 400 改为 429。
> - 被封禁账号的任何请求（含匿名可读接口，只要带了 token）返回 **403**，封禁即时生效。

### 1.3 鉴权与匿名可读规则

拦截器 [JwtInterceptor](../backend/src/main/java/com/eggworld/interceptor/JwtInterceptor.java) 拦截全部 `/api/**`，分三档：

1. **完全公开（无需 token）**
   `GET /api/health`、`POST /api/auth/login`、`POST /api/auth/register`、`POST /api/auth/reset-password`、`POST /api/auth/send-code`
2. **GET 匿名可读**（列表/详情；带 token 时仍解析登录态，用于 liked / myClaimStatus 等个性化字段）
   - `/api/gossip/posts`、`/api/gossip/posts/{id}`、`/api/gossip/rankings`
   - `/api/complaints/**` 的全部 GET
   - `/api/tasks`、`/api/tasks/{id}`（不含 `my-published` / `my-claimed`）
   - `/api/users/by-nickname`
   - `/api/dormitories`、`/api/dormitories/images/{id}`、`/api/dormitories/notes`（文字匿名读取为 2026-10-03 本分支待发布修复，见 10.4）
   > 未登录访客在任务广场/详情**只能看到 `approved` 任务**，避免枚举审核中内容。
3. **埋点**：`POST /api/track/page` 游客可调用（不报错，仅登录学生落库）

其余接口一律需要登录。

### 1.4 分页参数

列表分页一般使用 `page`、`size`，默认值仍以各 Controller 为准（常见为 1 / 20），不统一重设所有默认值。**本轮分支待发布**的全局边界：`page=1..10000`，`size/limit=1..100`；重复同名参数、非法文本、零、负数、超限或溢出均在业务查询前返回实际 HTTP 400。MyBatis-Plus 另设 `maxLimit=100`；接口已有更小上限仍保留（如聊天历史最多 50）。这些边界不代表无分页全量接口也已被分页化。响应 `data` 通常为 MyBatis-Plus 分页结构：

```json
{ "records": [ ], "total": 0, "size": 20, "current": 1, "pages": 0 }
```

---

## 二、接口总览（既有 82 条；宿舍目录另新增 9 条；本轮分支另增 unread-count 1 条）

### 2.1 健康检查与认证（5）

| # | 方法 | 路径 | 说明 | 鉴权 |
|---|------|------|------|------|
| 1 | GET | `/api/health` | 健康检查，返回 `{status, version, gitSha, buildTime}` | 公开 |
| 2 | POST | `/api/auth/send-code` | 发送邮箱验证码 | 公开 |
| 3 | POST | `/api/auth/register` | 注册（含初始蛋/邀请码） | 公开 |
| 4 | POST | `/api/auth/login` | 登录 | 公开 |
| 4a | POST | `/api/auth/reset-password` | 忘记密码：邮箱验证码校验通过后重设密码 | 公开 |

### 2.2 我的信息 `/api/users/me`（16，均需登录）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 5 | GET | `/api/users/me` | 我的完整信息（五维/角色/排名） |
| 6 | PUT | `/api/users/me` | 更新我的资料 |
| 7 | GET | `/api/users/me/stats` | 我的五维属性 |
| 8 | GET | `/api/users/me/characters` | 我的角色解锁状态 |
| 9 | PUT | `/api/users/me/characters/switch` | 切换当前角色（须已解锁） |
| 10 | GET | `/api/users/me/point-logs` | 我的蛋蛋币流水（分页 + `type` 筛选） |
| 11 | GET | `/api/users/me/ratings` | 我收到的评价（分页 + 均分） |
| 12 | GET | `/api/users/me/given-ratings` | 我给出的评价 |
| 13 | PUT | `/api/users/me/ratings/{id}/reply` | 回复我收到的评价（≤200 字） |
| 14 | GET | `/api/users/me/invites` | 我的邀请记录 |
| 15 | GET | `/api/users/me/notifications` | 我的通知（分页 + 未读数） |
| 15a | GET | `/api/users/me/notifications/unread-count` | 仅我的未读总数（本轮分支新增，待发布，见 11.1） |
| 16 | PUT | `/api/users/me/notifications/read` | 标记通知已读（id 为空 = 全部） |
| 17 | GET | `/api/users/me/skills` | 我的技能标签 |
| 18 | PUT | `/api/users/me/skills` | 全量更新技能标签 |
| 18a | POST | `/api/users/me/password` | 自助修改登录密码（校验当前密码，**无需邮箱验证码**） |

### 2.3 用户公开信息 `/api/users`（4）

| # | 方法 | 路径 | 说明 | 鉴权 |
|---|------|------|------|------|
| 19 | GET | `/api/users/by-nickname?nickname=` | 用户公开主页（脱敏字段，跨用户查看） | 匿名可读 |
| 20 | GET | `/api/users/rankings?cat=all` | 神蛋榜单（`all` 经验榜 / `rich` 富豪榜 / 分类榜） | 需登录 |
| 21 | POST | `/api/users/{id}/like` | 认可点赞（一人一次） | 需登录 |
| 22 | POST | `/api/users/{id}/invite-task` | 邀请对方发布教学任务（发通知） | 需登录 |

### 2.4 任务 `/api/tasks`（16）

| # | 方法 | 路径 | 说明 | 鉴权 |
|---|------|------|------|------|
| 23 | POST | `/api/tasks` | 发布任务 | 需登录 |
| 24 | GET | `/api/tasks` | 任务广场（筛选 + 分页） | 匿名可读 |
| 25 | GET | `/api/tasks/{id}` | 任务详情 | 匿名可读 |
| 26 | GET | `/api/tasks/my-published` | 我发布的任务 | 需登录 |
| 27 | GET | `/api/tasks/my-claimed` | 我认领的任务 | 需登录 |
| 28 | POST | `/api/tasks/{id}/claim` | 认领 / 报名（含联系方式） | 需登录 |
| 29 | GET | `/api/tasks/{id}/claimers` | 认领者列表（仅发布者） | 需登录 |
| 30 | POST | `/api/tasks/{id}/pair` | 选人（可分批多选：教学/求助/组队同一套） | 需登录 |
| 31 | POST | `/api/tasks/{id}/submit` | 认领者提交完成 | 需登录 |
| 32 | POST | `/api/tasks/{id}/confirm` | 发布者确认完成（**仅组队/官方任务**：一次确认全队/全部） | 需登录 |
| 32.1 | POST | `/api/tasks/{id}/claims/{claimerId}/confirm` | **逐个确认完成**（仅教学/求助：每个完成者单独结算） | 需登录 |
| 33 | POST | `/api/tasks/{id}/cancel` | 取消任务 | 需登录 |
| 34 | POST | `/api/tasks/{id}/rate` | 提交评价 | 需登录 |
| 35 | GET | `/api/tasks/{id}/rate-targets` | 可评价对象（任务卡片展示"已评价"用） | 需登录 |
| 35.1 | POST | `/api/tasks/{id}/renew` | 重新发布过期任务（只改截止，免审核） | 需登录 |
| 35.2 | POST | `/api/tasks/{id}/remind-publisher` | 广场上「催一下发布者」 | 需登录 |
| 35.3 | POST | `/api/tasks/{id}/edit` | 修改任务内容（改完需重新审核） | 需登录 |
| 35.4 | POST | `/api/tasks/{id}/close-recruit` | 结束招募（组队）/ 结束认领（教学、求助）：不等选满也开工 | 需登录 |
| 35.5 | GET | `/api/tasks/{id}/teammates` | 我的搭子：本队成员与联系方式（仅本队成员） | 需登录 |

### 2.5 八卦 / 打听 `/api/gossip`（9）

| # | 方法 | 路径 | 说明 | 鉴权 |
|---|------|------|------|------|
| 36 | GET | `/api/gossip/posts` | 打听列表（`tag` + 分页） | 匿名可读 |
| 37 | GET | `/api/gossip/my-posts` | 我发布的打听 | 需登录 |
| 38 | GET | `/api/gossip/posts/{id}` | 打听详情 | 匿名可读 |
| 39 | POST | `/api/gossip/posts` | 发布打听（冻结悬赏 `bounty`） | 需登录 |
| 40 | POST | `/api/gossip/posts/{id}/like` | 点赞打听 | 需登录 |
| 41 | POST | `/api/gossip/posts/{id}/answers` | 回答打听 | 需登录 |
| 42 | POST | `/api/gossip/posts/{id}/answers/{aid}/like` | 点赞回答 | 需登录 |
| 43 | POST | `/api/gossip/posts/{id}/adopt?answerId=` | 采纳回答（发放悬赏给回答者） | 需登录 |
| 44 | GET | `/api/gossip/rankings` | 打听榜 | 匿名可读 |

### 2.6 大学吐槽榜 `/api/complaints`（7）

| # | 方法 | 路径 | 说明 | 鉴权 |
|---|------|------|------|------|
| 45 | GET | `/api/complaints/rankings?metric=` | 学校排名（`all` 总榜 / 指定维度） | 匿名可读 |
| 46 | GET | `/api/complaints/stats` | 页面统计（收录高校/总数/平均分/我的次数） | 匿名可读 |
| 47 | GET | `/api/complaints/school?name=` | 学校详情（聚合 + 16 维均分 + 最近留言） | 匿名可读 |
| 48 | GET | `/api/complaints/wall?limit=` | 吐槽墙（最近 N 条） | 匿名可读 |
| 49 | POST | `/api/complaints` | 提交吐槽（每人限 2 次，+10 币 +10 经验） | 需登录 |
| 50 | GET | `/api/complaints/mine` | 我的吐槽列表（用于"修改评分"） | 需登录 |
| 51 | PUT | `/api/complaints/{id}` | 修改自己某条吐槽的评分与留言（不发奖、不占次数） | 需登录 |

> ⚠️ 拦截器对 `/api/complaints/**` 的**全部 GET 都放行**（`/mine`、`/stats` 也在其内），
> 但这两个接口依赖当前登录用户，未登录调用拿不到有效数据。

### 2.7 反馈工单 `/api/feedback`（5）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 52 | POST | `/api/feedback` | 提交反馈工单 |
| 53 | GET | `/api/feedback/mine` | 我的工单（分页） |
| 54 | GET | `/api/feedback/mine/summary` | 我的未读工单数 |
| 55 | POST | `/api/feedback/{id}/read` | 标记工单已读 |
| 56 | POST | `/api/feedback/{id}/follow-up` | 追加追问 |

### 2.8 埋点（3）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 57 | POST | `/api/track/page` | 页面浏览上报（游客可调，仅登录学生落库） |
| 57b | POST | `/api/track/session-start` | 会话开始（登录和匿名均可，写入 visitor_sessions） |
| 57c | POST | `/api/track/heartbeat` | 心跳（每 30 秒，更新 last_active_at 和 page_count） |

`pageKey` 白名单（后端强校验，非法值静默丢弃）：
`plaza` / `teamplaza` / `helpplaza` / `rankhall` / `gossip` / `blacklist` / `mytasks` / `publish` / `profile`

`session-start` 请求体：`{ sessionId, visitorId, referrer?, uaDevice?, newVisitor }`
`heartbeat` 请求体：`{ sessionId }`

### 2.9 管理后台 `/api/admin`（25）

权限两档（见 [AdminOnly.java](../backend/src/main/java/com/eggworld/annotation/AdminOnly.java) / [ModeratorOnly.java](../backend/src/main/java/com/eggworld/annotation/ModeratorOnly.java)）：
- **副管理员档**（`@ModeratorOnly` = 主管理员 + 副管理员）：5 条
- **主管理员档**（`@AdminOnly`）：20 条

| # | 权限 | 方法 | 路径 | 说明 |
|---|------|------|------|------|
| 58 | 副管理员 | GET | `/api/admin/stats?range=today\|7d\|30d` | 工作台聚合统计（缺省/非法值按 `7d`） |
| 59 | 副管理员 | GET | `/api/admin/tasks?status=` | 任务列表（`closed`/`completed`/`abnormal`/`active`/`pending`） |
| 60 | 副管理员 | GET | `/api/admin/tasks/pending` | 待审核任务 |
| 61 | 副管理员 | POST | `/api/admin/tasks/{id}/approve` | 审核通过 → `approved` |
| 62 | 副管理员 | POST | `/api/admin/tasks/{id}/reject` | 审核驳回（退回冻结币） |
| 63 | 副管理员 | POST | `/api/admin/tasks/{id}/feature` | 切换任务优质标签（0↔1） |
| 63b | 副管理员 | POST | `/api/admin/tasks/{id}/remind-pairing` | 一键提醒发布者完成配对（邮件按发布者汇总，同一发布者每天最多一封；当天已提醒过返回提示文案） |
| 63c | 副管理员 | POST | `/api/admin/tasks/remind-pairing/all` | 一键提醒**所有**有待确认配对报名的发布者（口径同每天 10:00 的定时任务；返回「已发送 N 位 / 今天已提醒过 M 位 / 账号不可用 K 位」文案） |
| 63d | 主管理员 | GET | `/api/admin/tasks/manage?status=&type=&keyword=&page=&size=` | 任务管理列表（治理视角，**含已屏蔽/已删除**；`status` 另支持 `hidden`/`deleted`/`suspended`/`featured`） |
| 63e | 主管理员 | POST | `/api/admin/tasks/{id}/hide` | 屏蔽任务（`hidden=1`，前台不可见、可恢复；**reason 必填**） |
| 63f | 主管理员 | POST | `/api/admin/tasks/{id}/restore` | 恢复任务（`hidden=0` 并清空处置原因；reason 选填） |
| 63g | 主管理员 | POST | `/api/admin/tasks/{id}/delete` | 逻辑删除（`deleted=1`；**reason 必填**） |
| 63h | 主管理员 | POST | `/api/admin/tasks/{id}/return-review` | 退回审核（`status='pending'` 并解除屏蔽；reason 选填） |
| 63i | 主管理员 | GET | `/api/admin/task-governance-logs?taskId=&page=&size=` | 处置流水（`action`: `hide`/`restore`/`delete`/`return_review`） |
| 64 | 主管理员 | GET | `/api/admin/point-logs/summary?range=` | 资金：按流水类型汇总 |
| 64 | 主管理员 | GET | `/api/admin/point-logs?range=&type=&minAbs=&keyword=` | 资金：全局流水明细（分页） |
| 65 | 主管理员 | GET | `/api/admin/frozen-coins` | 资金：冻结清单 |
| 66 | 主管理员 | GET | `/api/admin/page-views/detail?pageKey=&range=` | 页面热度明细（PV/UV + 访问最多用户） |
| 66b | 副管理员档 | GET | `/api/admin/user-activity?range=` | 用户活跃统计（DAU/WAU/MAU、留存、时段、漏斗） |
| 67 | 主管理员 | GET | `/api/admin/ratings/hidden` | 被隐藏的评价列表（风险下钻） |
| 68 | 主管理员 | GET | `/api/admin/users?keyword=&createdFrom=` | 用户管理列表（昵称/邮箱搜索 + 注册时间下限） |
| 69 | 主管理员 | GET | `/api/admin/users/{id}/overview` | 用户总览（资料 + 行为统计） |
| 70 | 主管理员 | GET | `/api/admin/users/{id}/tasks?role=published\|claimed` | 用户发布/认领的任务 |
| 71 | 主管理员 | GET | `/api/admin/users/{id}/ratings` | 用户收到的评价 |
| 72 | 主管理员 | GET | `/api/admin/users/{id}/given-ratings` | 用户给出的评价 |
| 73 | 主管理员 | GET | `/api/admin/users/{id}/point-logs?type=` | 用户蛋蛋币流水 |
| 74 | 主管理员 | POST | `/api/admin/ratings/{id}/hide` | 隐藏不当评价（隐藏后不计口碑与条数） |
| 75 | 主管理员 | POST | `/api/admin/users/{id}/ban` | 封禁（登录与已有 token 立即失效；管理员不可被封禁） |
| 76 | 主管理员 | POST | `/api/admin/users/{id}/unban` | 解封 |
| 77 | 主管理员 | POST | `/api/admin/users/{id}/reset-password` | 重置用户登录密码 |
| 78 | 主管理员 | POST | `/api/admin/users/{id}/delete` | 物理删除用户及其关联数据（不可恢复，保留其发布的任务与打听） |
| 79 | 主管理员 | POST | `/api/admin/users/{id}/sub-admin?enable=` | 设为 / 撤销副管理员 |
| 80 | 主管理员 | GET | `/api/admin/feedback?status=` | 反馈工单列表 |
| 81 | 主管理员 | POST | `/api/admin/feedback/{id}/reply` | 回复工单 |
| 82 | 主管理员 | POST | `/api/admin/feedback/{id}/close` | 关闭工单 |

> 副管理员在**数据库**中以 `users.sub_admin = 1` 标记（`role` 仍为 `student`）；拦截器每次请求按库中状态归一角色，
> 因此"设为 / 撤销副管理员"无需等 token 过期即生效。

---

## 三、接口详情（关键请求 / 响应）

### 3.1 发送验证码

`POST /api/auth/send-code`

```json
{ "email": "user@qq.com" }
```

- 同邮箱默认 60 秒冷却；分支加固后超限返回 HTTP 429 + `Retry-After`（其他验证码业务错误仍依接口处理）。验证码默认 5 分钟有效、一次性，完整配额见 11.4。
- 发信通道为腾讯云邮件推送 SES（模板发信）；本地未配置时不发送邮件，只记录不含邮箱/验证码的诊断。禁止从日志获取验证码；本地测试使用邮件桩。生产需核实 SES 配置。
- 邮件额度与通道选型见 [email-quota.md](email-quota.md)。

### 3.2 注册

`POST /api/auth/register`

```json
{
  "email": "user@qq.com",
  "code": "123456",
  "password": "test123456",
  "nickname": "蛋蛋用户",
  "inviteCode": "EGG123456"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| email | ✓ | 邮箱（唯一，冲突返回 409） |
| code | ✓ | 6 位验证码 |
| password | ✓ | 6-20 位，且同时包含字母和数字 |
| nickname | ✓ | 最长 20 字（唯一，冲突返回 409） |
| inviteCode | ✗ | 邀请码（选填，绑定邀请关系） |

注册成功后自动：创建用户 + 五维 + **随机抽一个初始蛋**（6 大分类中随机，解锁并设为当前角色）+ 100 蛋蛋币奖励 + 生成专属邀请码。
初始蛋由服务端随机决定，请求体不接受指定；前端在注册成功自动登录后弹「解锁新角色」弹窗告知抽到的蛋。

### 3.3 登录

`POST /api/auth/login`

```json
{ "email": "user@qq.com", "password": "test123456" }
```

响应：

```json
{
  "code": 200,
  "data": {
    "token": "eyJhbGciOi...",
    "user": { "id": 2, "nickname": "蛋蛋用户", "rank": 2, "total": 3, "...": "" }
  }
}
```

### 3.3.1 忘记密码（登录页邮箱找回）

`POST /api/auth/reset-password`（公开）

```json
{ "email": "user@qq.com", "code": "123456", "password": "newPass456" }
```

| 字段 | 必填 | 说明 |
|------|------|------|
| email | ✓ | 注册邮箱 |
| code | ✓ | 6 位邮箱验证码（复用 `/api/auth/send-code`，一次性） |
| password | ✓ | 新密码：6-20 位，且同时包含字母和数字 |

- 校验通过后旧密码立即失效；**邮箱不存在与验证码错误返回同一文案**（`邮箱或验证码不正确`），避免变成账号存在性探针。
- 已签发的 JWT 仍有效（token 无版本号，无法回收）；接口按邮箱走 `auth` 预算限流。

### 3.3.2 自助修改密码（我的信息）

`POST /api/users/me/password`（需登录）

```json
{ "oldPassword": "test123456", "newPassword": "newPass456" }
```

必须提供当前密码确认本人操作，**不要求邮箱验证码**；只更新 `users.password_hash`，不影响其它字段。改完旧密码立即失效，当前已登录的 token 仍可用。

### 3.4 我的完整信息

`GET /api/users/me`

响应 `data`（UserProfileVO）：

```json
{
  "id": 2, "nickname": "蛋蛋用户", "email": "user@qq.com", "role": "student",
  "school": "杭州电子科技大学", "major": "软件工程", "city": "杭州", "grade": "大三", "age": 21,
  "bio": "自我介绍", "mbtiType": "INTJ", "mbtiGroup": "NT",
  "points": 100, "exp": 0, "likes": 0, "reputation": 0.0,
  "eggCategory": "study", "eggRarity": "N", "inviteCode": "EGG123456",
  "createdAt": "2026-08-30T10:00:00",
  "rank": 2, "total": 3,
  "stats": { "knowledge": 0, "skills": 0, "charm": 0, "money": 0, "reputation": 0 },
  "characters": [
    { "category": "study", "unlocked": true, "count": 0, "current": true },
    { "category": "game", "unlocked": false, "count": 0, "current": false }
  ]
}
```

> `rank` = 经验值高于我的人数 + 1；`total` = 全站用户数（前端"你已超过 X%"用）。

### 3.5 更新资料

`PUT /api/users/me`（字段均可选，只更新非空）

```json
{
  "nickname": "新昵称", "school": "学校", "major": "专业", "city": "城市",
  "grade": "年级", "age": 21, "bio": "简介", "mbtiType": "INTJ"
}
```

- `mbtiType` 自动推导 `mbtiGroup`
- 切换当前角色请用 `PUT /api/users/me/characters/switch`（body: `{ "category": "study" }`，须已解锁）
- ⚠️ 邮箱不可通过此接口修改（登录凭证）

### 3.6 蛋蛋币流水

`GET /api/users/me/point-logs?page=1&size=50&type=earn`

响应 `data.records`（PointLog）：

```json
{ "id": 1, "userId": 2, "type": "reward", "label": "新用户注册奖励", "delta": 100, "balance": 100, "taskId": null, "createdAt": "..." }
```

| type | 含义 |
|------|------|
| earn | 收入 |
| spend | 支出 |
| freeze | 冻结（发布求助/组队、认领组队） |
| refund | 退回 |
| reward | 奖励 |

### 3.7 我收到的评价

`GET /api/users/me/ratings?page=1&size=20`

响应 `data`：

```json
{
  "avg": 4.5, "count": 2,
  "records": [
    { "id": 1, "taskId": 10, "taskTitle": "任务标题", "raterId": 3,
      "raterNickname": "评价者", "score": 5, "comment": "很棒", "createdAt": "..." }
  ]
}
```

回复评价：`PUT /api/users/me/ratings/{id}/reply`，body `{ "content": "谢谢" }`（仅被评价者可回复，≤200 字，不影响评分）。

### 3.8 技能标签

- `GET /api/users/me/skills` → `data: ["Python", "高数"]`（按用户排序返回）
- `PUT /api/users/me/skills` → 全量替换，数组顺序即排序：

```json
{ "skills": ["Python", "高数", "PPT制作"] }
```

### 3.9 邀请记录

`GET /api/users/me/invites`

```json
{
  "count": 1, "earned": 20,
  "records": [
    { "inviteeId": 4, "inviteeNickname": "新用户", "status": "rewarded",
      "reward": 20, "createdAt": "...", "rewardedAt": "..." }
  ]
}
```

| status | 含义 |
|--------|------|
| pending | 被邀请人已注册，尚未发布首个任务 |
| rewarded | 被邀请人已发布首个任务，邀请人 +20 币 |

### 3.10 发布任务

`POST /api/tasks`

```json
{
  "title": "高数辅导",
  "description": "教一次高数期末重点",
  "taskType": "teach",
  "skillCategory": "study",
  "skillSub": "高数",
  "reward": 10,
  "claimMode": "single",
  "maxClaimers": null,
  "requirements": "每周一次",
  "contact": "wx:xxxx",
  "signupDeadline": null,
  "completeDeadline": null
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| title | ✓ | 最长 50 字 |
| taskType | ✓ | `teach` 教学 / `help` 求助 / `team` 组队 / `reward` 官方任务 |
| skillCategory | ✓ | study/job/side/hobby/game/life |
| reward | ✓ | ≥ 1 |
| claimMode | ✗ | single（默认）/ multiple |
| maxClaimers | **组队必填** | 最大认领人数（`< 1` 报错） |
| contact | ✗ | 发布者联系方式（配对后对认领者可见） |

**关键规则**：

- `reward` 型（蛋总官方任务）**仅管理员 / 副管理员可发布**，发布成功全站通知
- 管理员 / 副管理员发布的任务**直接 `approved`**；普通用户发布为 `pending` 待审核
- 冻结规则按类型不同，见 5.1

响应：`data: <taskId>`

### 3.11 认领 / 报名
`POST /api/tasks/{id}/claim`

```json
{ "contact": "wx:claimer" }
```

| 规则 | 说明 |
|------|------|
| 不能认领自己的任务 | 400 |
| 仅 `approved` 可认领 | 400 |
| 不可重复认领 | 400 |
| 名额限制 | `single` 已满 → 400；`multiple` **报名不限人数**（`max_claimers` 只约束入选人数，见 3.13.1） |
| teach 余额校验 | 认领者余额 ≥ `reward`（提交完成时扣款，此处提前校验） |

- `contact`（认领者联系方式）选填，配对后展示给发布者。
- 认领后：`reward` 型直接 `in_progress`（首个认领者使任务进入进行中）；其余为 `pending_pairing` 等待发布者配对。

### 3.11.1 报名截止口径与「重新发布」

**报名截止的唯一口径**（前端展示与后端校验共用，`TaskService.effectiveSignupDeadline`）：

| 情况 | 截止时间 |
|------|----------|
| 任务填了 `signupDeadline` | 用它 |
| 没填 + `reward`（官方任务） | 长期有效（`null`，不限制） |
| 没填 + `teach`/`help` | 任务**发布时间 + 30 天**当天 23:59:59 |
| `team`（无论填没填） | **无截止（长期招募）**，见下 |
| 连发布时间都没有 | 不限制 |

- 截止后 `POST /api/tasks/{id}/claim` 返回 400「报名已截止」
- 定时任务（`DeadlineScheduler`，每 5 分钟）：截止前 3 天 / 1 天提醒发布者；**截止即**处理——已有入选者（任务已开始）→ 不退回、转 `full` 按现有人数开工；无人入选 → 下架 `expired` + 退回尚未花掉的冻结资金。详见 [3.13.1](#3131-招募闭环教学--求助--组队同一套)
- **组队型没有报名截止**（2026-09-21 起）：`effectiveSignupDeadline` 对 `team` 一律返回 `null`，**忽略库里可能残留的显式截止**；组队因此不会走上面这条截止路径，改由 `DeadlineScheduler.expireTeam` 的 **90 天兜底**收口（未满员就一直挂在广场、一直可报名）
- `GET /api/tasks?status=expired` 只返回「过期 3 天内」的（`updated_at` 窗口），用于广场置灰展示；**访客仍强制只看 `approved`**
- `GET /api/tasks?status=full` 只返回「满员 / 结束认领 7 天内」的（`updated_at` 窗口），用于广场置灰展示「已满员」；**访客仍强制只看 `approved`**

`POST /api/tasks/{id}/renew` —— 重新发布过期任务（`expired` → `approved`，**免审核直接上线**）

```json
{ "signupDays": 30 }
```

| 规则 | 说明 |
|------|------|
| 只能重新发布自己的任务 | 403 |
| 仅 `expired` 状态可重新发布 | 400 |
| 过期超过 30 天不可重新发布 | 400（请发布新任务） |
| 只允许改报名截止 | 请求体只有 `signupDays`，**没有任何内容字段**，从接口层面杜绝借"重新发布"改内容绕过审核 |
| 重新冻结 | 按发布时口径（help=悬赏、team=10、teach/reward=0）；余额不足整体回滚 |
| 管理员知情 | 免审核上线后通知所有主管理员 |

`POST /api/tasks/{id}/remind-publisher` —— 广场上对已过期任务「催一下发布者」

- 仅 `expired` 状态可催（400）
- 通知发布者「有人想认领但已过期，可重新发布」；**同一文案 24 小时内只发一次**
- 发布者自己点自己不提醒

### 3.11.2 任务修改与重新审核（第二期）

`POST /api/tasks/{id}/edit` —— 发布者改任务内容（请求体与发布任务一致，但**不含 `taskType`**）

```json
{
  "title": "高数辅导（改）",
  "description": "...",
  "requirements": "...",
  "skillCategory": "study",
  "skillSub": "高数",
  "reward": 20,
  "claimMode": "multiple",
  "maxClaimers": 3,
  "contact": "wx:xxxx",
  "signupDeadline": "2026-10-05T23:59:59",
  "completeDeadline": null
}
```

> `taskType` 不可改：改了会翻转蛋蛋币方向与冻结口径。`team` 型的 `reward` 固定 10（忽略传入值）。

按下单时的任务状态分流：

| 任务当时状态 | 行为 |
|------|------|
| `pending`（首次未审） | **直接改本体**，不产生新一轮审核；只是通知管理员「审核中心看到的是最新版本」 |
| `approved`（无人认领） | 生成一条 `pending` 修改稿，任务退回 `pending` 重审，**审核期间广场看不到** |
| `expired`（无人认领） | 生成修改稿，任务**保持 `expired`**（本来就在下架状态）；审核通过后带新内容复活为 `approved` |

| 拒绝条件 | 结果 |
|------|------|
| 非发布者本人 | 403 |
| 已有认领记录（`task_claims` 存在） | 400「请先取消任务后重新发布」 |
| 已有 `pending` 修改稿 | 400「请等审核结果」 |
| 其它状态（`in_progress`/`completed`/`cancelled`/`rejected`） | 400 |
| 有修改稿在审时调 `renew` | 400（避免旧稿审过用旧内容覆盖新截止） |

审核侧：

- `POST /api/admin/tasks/{id}/approve`：有 `pending` 修改稿时 = **采纳修改稿**（新值写回任务并上线；`help` 型报酬变动时补/退冻结差额），**不再重复发「首次审核 +5 经验」**
- `POST /api/admin/tasks/{id}/reject`：请求体可选

```json
{ "reason": "描述里有联系方式广告" }
```

| 情形 | 结果 |
|------|------|
| 驳回的是修改稿 | 丢弃修改；`pending` 的**按原内容恢复上线**，`expired` 的**保持过期下架**；原因转达发布者 |
| 驳回的是首次审核 | 任务 `rejected` + 退回冻结币（原因同样转达） |

- `GET /api/admin/tasks/pending` 每条记录会带 `pendingRevision`（非空 = 修改稿，可渲染「修改前 / 修改后」对比）

任务治理（管理后台「任务管理」页，**仅主管理员**）：

- `hidden` 与 `deleted` 是 `tasks` 上的**独立列**，刻意不复用 `status` —— 后者是认领/评价依赖的工作流状态机，屏蔽只影响前台可见性。
- 前台可见性收口：任务广场列表 / 任务详情 / 认领三处都显式过滤 `deleted = 0 AND hidden = 0`（`tasks` 表没有配 `@TableLogic`，不写就不会生效）。详情页对**发布者本人**例外，仍可打开自己已被处置的任务。
- `in_progress` / `full` / `submitted` / `completed` 的任务**不允许删除或退回审核**（会打断认领与蛋蛋币结算），提示引导改用「屏蔽」。
- 请求体统一为 `{ "reason": "..." }`（≤200 字）：`hide` / `delete` **必填**，`restore` / `return-review` 可省略。
- 每次处置往 `task_governance_log` **追加**一条流水（含处置时的标题快照、操作人、时间、原因）；`tasks.governance_reason` 只保留**最近一次**原因，屏蔽/删除时写入、恢复/退回审核时清空。

前端配套字段（`GET /api/tasks/my-published`）：

| 字段 | 说明 |
|------|------|
| `pendingRevision` | 该任务在审的修改稿（非空则卡片显示「修改稿审核中」） |
| `lastRejectedRevision` | 仅当**最近一次已审的修改稿结果是驳回**时才有（卡片显示原因 + 「再改一次」）；之后重新提交或改稿通过会自动消失；已有 `pendingRevision` 时不返回 |

数据表：`task_revisions`（新增，见 [migrate-task-revisions.sql](../backend/sql/migrate-task-revisions.sql)）。

### 3.12 认领者列表（仅发布者）

`GET /api/tasks/{id}/claimers`

```json
[
  { "claimId": 1, "claimerId": 4, "nickname": "认领者", "school": "学校",
    "status": "in_progress", "selected": 1, "contact": "wx:claimer" }
]
```

> `contact` 仅配对后（`in_progress` / `submitted`）返回；`pending_pairing` 返回 null。

### 3.13 确认配对

`POST /api/tasks/{id}/pair`

```json
{ "claimerIds": [4] }
```

| 规则 | 说明 |
|------|------|
| 仅发布者可配对 | 403 |
| 仅 `approved` 可配对 | 400 |
| 通用（教学/求助/组队） | **可分批多选**：选中者入选（`in_progress`），**未选中的留在候选池**（仍 `pending_pairing`，可下次继续选）；名额按「已入选人数 + 本次选中」算，超出报错 |
| 教学 / 求助 | 教学不涉及冻结；求助**按入选人数冻结**：发布时已冻第 1 份，第 2 位起每人补冻一份（余额不足整体回滚） |
| 组队 | 每个入选者**各冻结 10 币**出资（余额不足整体回滚） |
| 满员 | 已入选人数达到上限（`single` 恒为 1；`multiple` 取 `max_claimers`，为空 = 不限）→ 任务转 `full`（停止报名）；候选池里的人统一 `rejected` 并通知 |

### 3.13.1 招募闭环（教学 / 求助 / 组队同一套）

任务的招募节奏由**已入选人数**驱动，不由报名人数驱动：

```
approved(招募中，报名不限人数) ──选满上限 / 发布者点「结束认领(招募)」/报名截止且已有人入选──▶ full(已满员·报名已关闭) ──全部完成──▶ completed
                                        │
报名截止且无人入选 ──▶ expired(下架 + 退回尚未花掉的冻结资金)  ；候选池里的人统一 cancelled
```

- **报名（`claim`）**：`multiple` **报名不限人数**（`max_claimers` 只约束入选人数）；`single` 仍只允许 1 人；`full` 时报「该任务已满员，报名已关闭」
- **入选判据**：`task_claims.selected = 1` 且 `status ∈ (in_progress, submitted, completed)` —— 也是「任务是否已开始」的唯一判据
- **`full` 的广场展示**：`GET /api/tasks?status=full` 仍返回（`updated_at` 在 7 天内），前端置灰显示「已满员」；超过 7 天自动从广场收起，任务本身继续走提交 / 确认 / 互评
- **到期（`DeadlineScheduler`，每 5 分钟）**：
  - 已有人入选（任务已开始）→ **不退回**，置 `full` 按现有人数开工，通知发布者与已入选者
  - 无人入选（哪怕有人报名）→ 置 `expired` + 退回尚未花掉的冻结资金 + 候选池 `cancelled` + 通知可「重新发布」
  - **组队型不走本路径**：它没有报名截止，只要没满员就长期招募；超过 90 天仍未成队才由 `expireTeam` 下架退 10
- **`POST /api/tasks/{id}/close-recruit`**（发布者）：任务须 `approved` 且**已入选 ≥ 1 人**（0 人时应走 `cancel`），否则 400；成功 → `full`，候选池 `rejected` 并通知。组队叫「结束招募」，教学/求助叫「结束认领」（同一接口，前端按类型显示文案）
- **完成与结算**：
  - **教学 / 求助（可多人）**：每个入选者各自提交 → 发布者**逐个确认**（`POST /api/tasks/{id}/claims/{claimerId}/confirm`）、各自结算；**名单里没有待确认的人时任务收尾**：仍 `in_progress` 的入选者置 `rejected`（未完成）并通知，任务转 `completed`，发布者经验在此只加一次
  - **组队**：团队整体提交 + 发布者一次确认全队（`POST /api/tasks/{id}/confirm`）
  - **官方奖励任务**：一次确认所有已提交者，各得一份（平台发币）
- **`POST /api/tasks/{id}/cancel`**：`approved` / `full` / `in_progress` 均可取消；求助退回**尚未花掉的份数**（`max(1, 已入选人数) − 已确认完成人数`）× 悬赏，组队退回发布者与已入选搭子各 10，教学不涉钱

### 3.13.2 我的搭子（仅本队成员）

`GET /api/tasks/{id}/teammates` —— 仅 `team` 型；**发布者本人或已入选搭子**可看，其他人 403

```json
{
  "taskId": 7, "title": "组队任务", "status": "full", "maxClaimers": 3, "memberCount": 2,
  "canSeeAllContacts": false,
  "publisher": { "userId": 1, "nickname": "发布者", "school": "学校", "contact": "wx:pub" },
  "members": [
    { "userId": 4, "nickname": "搭子", "school": "学校", "contact": "wx:claimer", "self": true, "status": "in_progress" },
    { "userId": 5, "nickname": "另一搭子", "school": "学校", "contact": null, "self": false, "status": "in_progress" }
  ]
}
```

> **联系方式可见性（后端强制脱敏）**：
> - **发布者**：`canSeeAllContacts=true`，可见全队所有人的联系方式
> - **队内搭子**：`canSeeAllContacts=false`，**只能看到「自己 + 发布者」的**，其他队友的 `contact` 一律返回 `null`（前端因此也不会有可复制的内容）
> - 发布者联系方式（`publisher.contact`）对全队可见；没有填过联系方式时返回 `null`

### 3.14 提交完成 / 确认完成 / 取消

- `POST /api/tasks/{id}/submit`（认领者）
  - 教学型：此刻认领者 `-reward`，发布者 `+reward`（认领者付费，**每人各付一份**）
  - 组队型：所有被选中认领者一并进入 `submitted`（团队整体提交）
- `POST /api/tasks/{id}/claims/{claimerId}/confirm`（发布者，**教学 / 求助**逐个确认）
  - 求助型：把这一份悬赏发给该完成者（`+reward`）；教学型的钱在提交时已各付各收
  - 每条确认后给该完成者经验/角色计数/五维；**名单里没有待确认的人时收尾**：仍 `in_progress` 的入选者置 `rejected`（未按期提交）并通知，任务转 `completed`，发布者经验此时只加一次；候选池统一 `rejected`
- `POST /api/tasks/{id}/confirm`（发布者，**仅组队 / 官方任务**）
  - 组队型：一次确认全队，确认时不立即发钱，进入 3 天互评期；到期固定退每人 80% 出资（8 币），评价仅影响口碑
  - 官方任务型：所有已提交的认领者各 `+reward`（平台发币）
  - 经验奖励：发布者 + 所有参与认领者按 5.1 增加经验、角色计数 +1、对应五维 +1（上限 10）
  - 教学/求助调用本接口 → 400「请逐个确认完成」
- `POST /api/tasks/{id}/cancel`（发布者）
  - 教学型：发布 48 小时内可取消；**无冻结，不退款**
  - 求助型：退回**尚未花掉的份数** `max(1, 已入选人数) − 已确认完成人数` × `reward`（发布时冻了第 1 份，之后每入选一人补冻一份）
  - 组队型：退回发布者 10，并退回已入选搭子各 10

### 3.15 提交评价

`POST /api/tasks/{id}/rate`

```json
{ "rateeId": 4, "score": 5, "comment": "很棒" }
```

| 规则 | 说明 |
|------|------|
| 仅任务完成后可评 | 400（非组队任务为"完成后 7 天评价窗口"内） |
| 仅参与双方（发布者/认领者）可评 | 403 |
| 不能评自己 | 400 |
| 防重复 | 同一任务同一对只能评一次 |
| 口碑值 | 提交后重算被评价者口碑（收到评价均分） |

可评价对象：`GET /api/tasks/{id}/rate-targets`（任务卡片展示"待评价"用）。

> 被隐藏的评价（管理员治理）不计入口碑与条数。

---

## 四、数据模型

### 4.1 权威来源（建库/迁移只看这里）

> ⚠️ 线上库**不要执行 `init.sql`**（含 `DROP TABLE`）。增量脚本按文件名顺序执行，每次执行的记录见 `releases/迁移文档/`。

- [backend/sql/init.sql](../backend/sql/init.sql) —— 建库脚本，**18 张表**
- [backend/sql/migrate-*.sql](../backend/sql/) —— 增量脚本

**18 张表**：

| 表 | 用途 |
|---|---|
| `users` | 用户主表（role / sub_admin / banned / deleted / points / exp / egg_category / egg_rarity / invite_code） |
| `user_stats` | 五维属性（knowledge / skills / charm / money / reputation） |
| `user_characters` | 角色解锁状态（6 分类，`is_current`） |
| `user_skills` | 技能标签（带排序） |
| `invite_records` | 邀请关系与奖励状态 |
| `user_likes` | 认可点赞（一人一次） |
| `tasks` | 任务主表（含 `rate_deadline` / `settled`） |
| `task_claims` | 认领记录（`selected` / `status` / 双方联系方式） |
| `ratings` | 评价（含治理字段 `visible` / `is_auto`） |
| `point_logs` | 蛋蛋币流水 |
| `gossip_posts` | 打听帖子（`bounty` / `coin_status` / `adopted_answer_id`） |
| `gossip_answers` | 打听回答 |
| `gossip_likes` | 打听 / 回答点赞 |
| `notifications` | 站内通知 |
| `feedback_tickets` | 反馈工单 |
| `feedback_messages` | 工单消息（时间线 / 追问） |
| `school_complaints` | 大学吐槽榜 |
| `page_views` | 页面浏览埋点 |
| `visitor_sessions` | 访客会话记录（含匿名，用于 DAU/留存/时段分析） |
| `daily_active_stats` | 每日活跃聚合快照（DailyStatsScheduler 每日 04:05 写入） |

**增量脚本**：

| 脚本 | 作用 |
|---|---|
| `migrate-bl.sql` | 新建 `school_complaints`（吐槽榜） |
| `migrate-page-views.sql` | 新建 `page_views` |
| `migrate-visitor-sessions.sql` | 新建 `visitor_sessions` + ALTER `page_views` 加 session_id / visitor_id |
| `migrate-daily-active-stats.sql` | 新建 `daily_active_stats` |
| `migrate-feedback-timeline.sql` | `feedback_tickets` 时间线字段 |
| `migrate-feedback-followup.sql` | 新建 `feedback_messages` |
| `migrate-rating-governance.sql` | `ratings` 治理字段（隐藏 / 自动评价） |
| `migrate-sub-admin.sql` | `users.sub_admin` |
| `migrate-user-ban.sql` | `users.banned` |
| `migrate-user-delete.sql` | 用户物理删除（解除相关外键） |

### 4.2 初版设计稿表结构（2026-08-23，**勿据此建库**）

> 以下 DDL 是项目最早的设计稿，**与实现已有差异**：设计 11 张表，实现 18 张表；实现另有 `sub_admin` / `banned` / `deleted`、
> `ratings` 治理字段、`tasks.rate_deadline` / `settled` 等。保留在此仅为追溯当初的表设计意图，
> **建库请用 4.1 的 `init.sql`**。差异明细可从 `init.sql` 与本节的对照看出。

#### 4.2.1 用户表 `users`

```sql
CREATE TABLE users (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  nickname        VARCHAR(50) NOT NULL UNIQUE COMMENT '昵称',
  email           VARCHAR(100) COMMENT '邮箱',
  phone           VARCHAR(20) COMMENT '手机号',
  password_hash   VARCHAR(255) COMMENT '密码哈希',
  role            ENUM('student','admin') DEFAULT 'student',
  school          VARCHAR(100) COMMENT '学校',
  major           VARCHAR(100) COMMENT '专业',
  city            VARCHAR(50) COMMENT '城市',
  grade           VARCHAR(20) COMMENT '年级',
  age             INT COMMENT '年龄',
  bio             TEXT COMMENT '个人简介',
  mbti_type       VARCHAR(4) COMMENT 'MBTI类型',
  mbti_group      VARCHAR(2) COMMENT 'MBTI分组: NT/NF/SJ/SP',
  points          INT DEFAULT 100 COMMENT '蛋蛋币余额',
  exp             INT DEFAULT 0 COMMENT '经验值',
  likes           INT DEFAULT 0 COMMENT '获赞数',
  reputation      DECIMAL(2,1) DEFAULT 0.0 COMMENT '口碑值（评价均分）',
  egg_category    VARCHAR(20) COMMENT '蛋类型分类',
  egg_rarity      ENUM('N','R','SR','SSR','UR') DEFAULT 'N',
  invite_code     VARCHAR(20) COMMENT '邀请码',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### 4.2.2 用户统计表 `user_stats`（五维属性）

```sql
CREATE TABLE user_stats (
  user_id        BIGINT PRIMARY KEY,
  knowledge      DECIMAL(2,1) DEFAULT 0 COMMENT '学识值 0-10',
  skills         DECIMAL(2,1) DEFAULT 0 COMMENT '打工值 0-10',
  charm          DECIMAL(2,1) DEFAULT 0 COMMENT '魅力值 0-10',
  money          DECIMAL(2,1) DEFAULT 0 COMMENT '搞钱值 0-10',
  reputation     DECIMAL(2,1) DEFAULT 0 COMMENT '口碑值 0-5',
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.3 任务表 `tasks`

```sql
CREATE TABLE tasks (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  title           VARCHAR(200) NOT NULL COMMENT '任务标题',
  description     TEXT COMMENT '任务描述',
  task_type       ENUM('teach','help','team','reward') NOT NULL COMMENT '任务类型',
  skill_category  VARCHAR(50) COMMENT '技能大类',
  skill_sub       VARCHAR(50) COMMENT '技能子类',
  reward          INT DEFAULT 10 COMMENT '蛋蛋币金额',
  claim_mode      ENUM('single','multiple') DEFAULT 'single' COMMENT '认领模式',
  max_claimers    INT COMMENT '最大认领人数',
  requirements    TEXT COMMENT '参与要求',
  publisher_id    BIGINT NOT NULL COMMENT '发布者ID',
  contact         VARCHAR(200) COMMENT '发布者联系方式',
  status          ENUM('pending','approved','rejected','in_progress','completed','cancelled','expired','full') DEFAULT 'pending',
  signup_deadline DATETIME COMMENT '报名截止',
  complete_deadline DATETIME COMMENT '完成截止',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publisher_id) REFERENCES users(id)
);
```

#### 4.2.4 任务认领表 `task_claims`

```sql
CREATE TABLE task_claims (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id         BIGINT NOT NULL,
  claimer_id      BIGINT NOT NULL COMMENT '认领者ID',
  status          ENUM('pending_pairing','in_progress','submitted','completed','rejected','cancelled') DEFAULT 'pending_pairing',
  claimer_contact VARCHAR(200) COMMENT '认领者联系方式',
  selected        BOOLEAN DEFAULT FALSE COMMENT '是否被发布者选中',
  paired_at       DATETIME COMMENT '配对确认时间',
  submitted_at    DATETIME COMMENT '提交完成时间',
  completed_at    DATETIME COMMENT '最终完成时间',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_claimer (task_id, claimer_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (claimer_id) REFERENCES users(id)
);
```

#### 4.2.5 评价表 `ratings`

```sql
CREATE TABLE ratings (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id      BIGINT NOT NULL,
  rater_id     BIGINT NOT NULL COMMENT '评价者ID',
  ratee_id     BIGINT NOT NULL COMMENT '被评价者ID',
  score        INT NOT NULL COMMENT '1-5星',
  comment      TEXT COMMENT '文字评价',
  rater_role   ENUM('publisher','claimer') NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rating (task_id, rater_id, ratee_id) COMMENT '防重复评价',
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

#### 4.2.6 蛋蛋币流水表 `point_logs`

```sql
CREATE TABLE point_logs (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  type         VARCHAR(50) NOT NULL COMMENT '类型: earn/spend/freeze/refund/reward',
  label        VARCHAR(200) COMMENT '描述',
  delta        INT NOT NULL COMMENT '变动金额（正增加负减少）',
  balance      INT COMMENT '变动后余额',
  task_id      BIGINT COMMENT '关联任务ID',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.7 打听/八卦表

```sql
CREATE TABLE gossip_posts (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  publisher_id BIGINT NOT NULL,
  bounty       INT DEFAULT 1 COMMENT '悬赏蛋蛋币',
  coin_status  ENUM('frozen','awarded','refunded') DEFAULT 'frozen',
  adopted      BOOLEAN DEFAULT FALSE,
  adopted_answer_id BIGINT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  deadline     DATETIME COMMENT '30天后自动退回',
  is_permanent BOOLEAN DEFAULT TRUE COMMENT '提问永久保留',
  FOREIGN KEY (publisher_id) REFERENCES users(id)
);

CREATE TABLE gossip_answers (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id      BIGINT NOT NULL,
  author_id    BIGINT NOT NULL,
  content      TEXT NOT NULL,
  likes        INT DEFAULT 0,
  is_adopted   BOOLEAN DEFAULT FALSE,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES gossip_posts(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);
```

#### 4.2.8 通知表 `notifications`

```sql
CREATE TABLE notifications (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  text         VARCHAR(500) NOT NULL,
  type         VARCHAR(30) DEFAULT 'info',
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.9 反馈工单表 `feedback_tickets`

```sql
CREATE TABLE feedback_tickets (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT,
  content      TEXT NOT NULL,
  contact      VARCHAR(200) COMMENT '联系方式（选填）',
  status       ENUM('open','replied','closed') DEFAULT 'open',
  admin_reply  TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.10 角色解锁表 `user_characters`

```sql
CREATE TABLE user_characters (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  category     VARCHAR(20) NOT NULL COMMENT 'study/job/side/hobby/game/life',
  unlocked     BOOLEAN DEFAULT FALSE,
  count        INT DEFAULT 0 COMMENT '该分类完成任务数',
  is_current   BOOLEAN DEFAULT FALSE COMMENT '是否当前使用',
  UNIQUE KEY uk_user_cat (user_id, category),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 五、核心业务规则（按代码校正）

### 5.1 蛋蛋币流转

| 任务类型 | 出资方与时机 | 金额 |
|---------|-------------|------|
| `teach` 教学 | 发布**不冻结**；**认领者提交完成（submit）** 时认领者 → 发布者 | `reward`（认领时预校验余额） |
| `help` 求助 | 发布时发布者冻结；**确认完成（confirm）** 时给被选中认领者 | `reward` |
| `team` 组队 | 发布时发布者冻结；**配对时每个被选中认领者各冻结**；confirm 后不直接结算 | 固定每人 10（`TEAM_DEPOSIT`） |
| `reward` 官方任务 | 发布**不冻结**（平台发币）；confirm 时认领者获得 | `reward`；仅管理员/副管理员可发布 |

- **组队互评结算**：confirm 后进入 `TEAM_RATE_DAYS = 3` 天互评期（写入 `tasks.rate_deadline`）；
  到期固定退还每人 **80%（8 币）**；未评价、1 分与 5 分退款一致，评价仅影响口碑。
  `settled=0 → 1` 的数据库条件更新在发钱前执行，退款与标记在同一事务中提交。
- **发布金额校验**：`reward ≤ 10000`；team 发布入库强制为 10，不代表可自定义奖励。
- **审核驳回退款**：统一 `TaskService.frozenAmountOf`：help 退 reward，team 退 10，teach/reward 不退款；只有 pending 条件更新成功才发经验或退款。
- **取消退回**：`help` 退发布者 `reward`；`team` 退发布者 10 + 已配对认领者各 10；`teach` 无冻结、不退款。
- **超时退回**：`help` 发布满 3 天无人认领 → 状态 `expired` 并退回悬赏；教学型不适用。
  `team` **不适用**（2026-09-21 起）：组队是长期招募，没有报名截止，也没有 3 天自动退回，
  改由 `DeadlineScheduler.expireTeam` 的 `TEAM_RECRUIT_FALLBACK_DAYS = 90` 天兜底收口。
  兜底时钟锚定 `max(created_at, updated_at)`：重新发布后 `updated_at` 刷新，兜底期随之重算。
- **打听悬赏**：发布时冻结 `bounty`，采纳回答时发放给回答者。
- **经验**：任务确认完成时，发布者与所有参与认领者各 +10（该任务分类角色已解锁则 ×1.2 → +12）；
  任务审核通过 +5；吐槽榜首次提交 +10。
- ⚠️ **定时任务现状**：`RefundScheduler` 只处理任务超时（`help` 3 天；`team` 已移出，见上），
  **打听"30 天无人回答自动退回"未实现**（同字段 `gossip_posts.deadline` 已在表中）。

### 5.2 状态机

```
任务：pending(待审核) → approved(已通过) → in_progress(进行中) → completed(已完成)
多人认领（教学/求助/组队）：approved(招募中) → full(已满员/报名已关闭) → completed(已完成)   ← 见 3.13.1
异常态：rejected(驳回) / cancelled(取消) / expired(超时退回)

认领：pending_pairing(待配对) → in_progress(进行中) → submitted(已提交) → completed(已完成)
异常态：rejected(未被选中 / 候选池落选 / 未按期提交) / cancelled(任务取消或下架)
```

要点：

- 管理员 / 副管理员发布的任务**直接 `approved`**；普通用户 `pending` 待审核
- `reward` 型认领即 `in_progress`，**无需配对**（首个认领者使任务进入进行中）
- 教学/求助/组队的多人认领配对后**不立即离开招募**：未选满时保持 `approved` 继续接报名，选满上限（或发布者结束认领 / 截止时已有人入选）才转 `full`
- ⚠️ 初版设计稿中组队型独有的 `confirmer_confirmed(搭子已确认)` 状态**未实现**，
  四种任务类型共用上面这一条状态流转

### 5.3 邀请奖励

- 被邀请人注册（带 `inviteCode`）→ 记录 `pending`
- 被邀请人发布**首个任务** → 邀请人 +20 币，记录 `rewarded`

### 5.4 等级 / 稀有度（前端展示规则）

后端只持久化 `exp` 与 `egg_rarity`，**等级与稀有度由前端推导**，阈值定义在 `growth-schoolv3.html`：

| 等级 | 经验值范围 | 名称 |
|------|-----------|------|
| 1 | 0-99 | 新手蛋 |
| 2 | 100-299 | 进阶蛋 |
| 3 | 300-599 | 达人蛋 |
| 4 | 600-999 | 大神蛋 |
| 5 | 1000+ | 传奇蛋 |

| 稀有度 | 完成任务数 | 颜色 |
|--------|-----------|------|
| N | 0+ | #C0C0C0 |
| R | 5+ | #4A90D9 |
| SR | 15+ | #9B59B6 |
| SSR | 30+ | #FFD700 |
| UR | 50+ | #FF6B6B |

### 5.5 技能分类（6 大类）

| 分类 | 字段值 | 图标 | 颜色 |
|------|--------|------|------|
| 学业技术 | study | 📖 | #E91E63 |
| 就业技能 | job | 💼 | #2196F3 |
| 副业技能 | side | 💰 | #FFD700 |
| 兴趣爱好 | hobby | 🎯 | #9C27B0 |
| 游戏搭子 | game | 🎮 | #4CAF50 |
| 生活互助 | life | 🤝 | #FF6B6B |

> 技能分类 → 五维属性的映射与前端 `STAT_MAP` 保持一致（见 `ClaimService`）。

### 5.6 关键约束速查

| 规则 | 说明 |
|------|------|
| 不能认领自己的任务 | 发布者无法认领自己发布的任务 |
| 多人认领报名不限人数 | 教学/求助/组队的 `multiple` 都是「报名不限人数」；`max_claimers` 只约束入选人数，选满 / 结束认领 / 截止时已有人入选 → 任务转 `full`（见 3.13.1） |
| 完成结算口径 | 教学/求助逐个确认、各自结算（组队是整体确认；官方任务一次给所有已提交者） |
| 联系方式可见性 | 仅在确认配对后（`in_progress` / `submitted`）双方可见，其余返回 null；组队另有「我的搭子」面板 `GET /api/tasks/{id}/teammates`（仅本队成员） |
| 蛋蛋币不足不可发布/认领 | `help` 发布时校验冻结额；`teach` 认领时校验 `reward`；`team` 配对时校验 10 |
| 评价不可重复 | 同一任务同一对评价者→被评价者只能评一次 |
| 封禁即时生效 | 被封禁账号登录与已有 token 立即失效（403） |
| 管理员不可被封禁 | `ban` 接口对管理员账号不生效 |

---

## 六、前端对接参考

### 6.1 页面 ID 与模块

| 页面ID | 模块名 | 说明 |
|--------|--------|------|
| `page-plaza` | 技能变现 | 教学型任务广场 |
| `page-teamplaza` | 组队共创 | 组队型任务广场 |
| `page-helpplaza` | 求助中心 | 求助型任务广场 |
| `page-rankhall` | 神蛋榜单 | 排行榜 |
| `page-gossip` | 八卦吃瓜 | 打听 / 问答 |
| `page-blacklist` | 大学吐槽榜 | 高校评分（埋点 pageKey = `blacklist`） |
| `page-mytasks` | 我的任务 | 已发布 + 已认领任务 |
| `page-publish` | 发布任务 | 任务发布表单 |
| `page-profile` | 我的信息 | 个人信息页 |
| `page-dashboard` | 管理后台 | 管理员工作台 |
| `page-users` | 用户管理 | 管理员管理用户 |
| `page-feedback` | 反馈管理 | 管理员处理工单 |

### 6.2 角色与权限

后端权限只有注解这一层（见 2.9）：

| 角色 | 说明 |
|------|------|
| `student` | 普通学生；另有 `sub_admin=1` 的副管理员，库中 `role` 仍为 `student` |
| 副管理员（`subadmin`） | 可访问 `@ModeratorOnly` 接口（工作台统计、任务列表、审核中心） |
| `admin` | 主管理员，可访问全部 `/api/admin/**` |

前端侧的「角色可见页面」与菜单显隐由 `js/admin-workbench.js`、`js/user-actions.js` 控制，
按角色显示（副管理员默认只见工作台 / 官方任务 / 审核中心）。

### 6.3 前端调用方式

前端为单页 `growth-schoolv3.html` + `js/` 外联脚本（无框架），接口调用统一走 `js/` 中的
`window.apiGet` / `window.apiPost` 等封装（自动注入 token、统一错误提示）。
任务流程与状态流转的前端视图见 [growth-school-task-flows.md](growth-school-task-flows.md)。

---

## 七、已作废章节索引（原 v1.0）

以下章节写于项目仍是"纯前端 Demo"阶段，本次合并已移除；如需追溯，从 git 历史取回：

| 原章节 | 作废原因 | 现在看哪里 |
|---|---|---|
| 一、项目现状概览（纯前端 Demo） | 项目已上线，描述失效 | [README.md](../README.md) |
| 二、上线工作清单 P0/P1/P2 | 已完成 | [PROJECT_RULES.md](../PROJECT_RULES.md) |
| 五、前端需要改造的变量对照表 | 行号对应 `growth-school.html`，文件已更名为 `growth-schoolv3.html` 且已全部改造 | 前端源码 `js/` 与 `growth-schoolv3.html` |
| 七、静态资源清单 | 图片已迁至 `assets/`（7 张 `char-eggy-*.jpg` + `logo-char.png`） | [README.md](../README.md) 目录树 |
| 九、给后端同事的交接文件清单 | 交接已完成 | — |
| 十、上线部署步骤 | 已细化为现行流程 | [releases/上线文档.md](../releases/上线文档.md) |

---

## 八、成就特效系统（2026-09-15，分支待验收，未上线）

施工依据：`TODO/工单-成就特效系统.md`。废弃商城工单不实施。详细验收见 `tasks/成就特效系统-交付报告.md`；数据库上线操作见 `releases/迁移文档/2026-09-15_成就特效系统.md`。

### 8.1 接口与权限

统一使用现有 JWT、Result 包装。用户身份只取 UserContext，不接受请求体指定他人的 userId。未登录实测 HTTP 401；业务拒绝沿用 HTTP 200 + 非 200 的 code，不要只判断 HTTP 状态。

| 方法 / 路径 | 返回 / 约束 |
|---|---|
| GET /api/achievements | 启用成就 + 本人 progress/target/unlocked/unlockedAt + 奖励信息 |
| GET /api/achievements/mine | 本人已解锁成就，保留已停用定义对应的既得奖励 |
| GET /api/achievements/unread | 未读解锁列表；id 是 user_achievements.id，不是 achievements.id |
| POST /api/achievements/{id}/read | 标记本人的解锁记录已读；他人的 id 不生效 |
| GET /api/deco/catalog | effects/titles、每项 unlocked/sourceAchName、汇总数量；前端穿戴页过滤未解锁项 |
| GET /api/users/me/equip | 本人当前七槽 + 称号名称/样式，未穿戴可为 null |
| PUT /api/users/me/equip | 请求如 {"slot":"aura","key":"a-moon"}；key:null 卸下；返回更新后的全部穿戴 |
| GET /api/admin/achievements | 仅主管理员 AdminOnly；普通用户实测业务 code=403 |
| PUT /api/admin/achievements/{id} | 仅主管理员；enabled 0/1、condValue 1..1000000、sortOrder 0..1000000，三项必填；不开放改奖励 key |

穿戴必须同时满足：槽位合法、key 白名单、前缀匹配、本人已解锁。七槽 aura/cloak/outfit/frame/charm/title/skin；对应前缀 a-/cl-/of-/f-/ch-/t-/sk-。存储为七个 *_key 字符串列，非 item_id。单条 upsert 只更新选定槽位，防止并发不同槽互相覆盖。

### 8.2 表与增量迁移

- 新增 titles、achievements、user_achievements、user_equip；24 称号、30 成就。28 特效属于代码白名单，没有商城商品表。
- 增量 `backend/sql/migrate-achievement.sql` 不含 USE/CREATE DATABASE/ALTER/DROP/TRUNCATE；调用方显式选择库。只建表和幂等写定义种子，不改余额、流水或原业务表。
- 重跑保留运营已配置的 enabled/cond_value/sort_order，也保留解锁和穿戴。名称、说明及奖励定义仍同步权威种子，已上线后变更这部分须单独评审。
- `init.sql` 已同步四表与种子；只供新库初始化，含 DROP，永远禁止线上执行。
- UserPurgeMapper / AdminService 先清理 user_achievements、user_equip、daily_checkins，再删用户。签到表清理由真实注销回归暴露并补齐。

### 8.3 触发、统计、事务

工单8个接入点：签到、任务发布、任务确认完成（同时评估complete/team）、真实可见评价、回答采纳、邀请奖励到账、学校吐槽，以及每日扫描。完成场景同时评估发布者和已完成认领者。

统一 evaluateAfterCommit：业务提交后调用 evaluateQuietly，评估由 REQUIRES_NEW 事务隔离；user_achievements + 解锁通知同事务，异常记录日志、不回滚主业务。唯一键 uk_user_ach(user_id,ach_id) + DuplicateKeyException 防重；数据库并发验证仅一条解锁、一条通知。

每次按分类评估同时加载 meta；普通成就先评估，元成就后评估。每日 04:00（运行环境时区）全用户兜底扫描，用于存量补发、失败补偿、注册天数和20解锁元成就。扫描当前未分页，规模增长前须评估批处理。签到日期使用 Asia/Shanghai；最近120天窗口覆盖工单最高连签条件。

complete_count = 已完成认领数 + 本人发布且已完成任务数。team_count 统计组队参与/发布；评分只统计 visible=1 且 is_auto=0 的真实评价；质量门槛为至少指定条数且均分>=4.8。这不是组队退款门槛，不改原资金规则。

### 8.4 全站展示契约

装扮对象字段：aura/cloak/outfit/frame/charm/title/skin/titleName/titleStyle。内部 userId 不序列化。常见 VO 用 deco；TaskVO 用 publisherDeco；认领者列表行用 deco。

DecoService.loadDecos 对收集并去重的用户ID一次 JOIN 查询；DecoResponseAdvice 对任务、帖子/回答、吐槽、邀请等响应统一收集后回填，失败降级。榜单在 UserService 对整页批量加载，不在循环内查装扮。匿名吐槽用于查装扮的 decorationUserId 标为 JsonIgnore，不返回身份。

生产渲染由原版 js/deco.js + js/deco-integration.js 安全适配；动态 key 不拼入 HTML，白名单正则后 classList.add；称号名称只用 textContent，styleClass 白名单。只使用本地固定格式图片路径。列表/成就缩略图走 light，不创建 fx-rays/fx-wave/r-orbit；形象区使用完整效果和 fx-field。九层 z-index=0..8，披风3、立绘5、服装6。

### 8.5 已知缺口（不可当作全部通过）

1. 接入点10通知：现表只有收件人 user_id、纯文本 text 等，没有 actorId/结构化昵称；未绑定发起人称号，不能把收件人当发起人、也不能按昵称猜人。需补充通知身份模型后完成。
2. 种子中 t-guide 已定义但30成就没有任何一条发放它：24称号仅23个具有当前获取路径。遵循工单未擅自增加第31个成就或换奖励。
3. 浏览器手机尺寸模拟不是微信真机测试。完整的已验证/未验证边界见交付报告。


*文档结束。接口以 `backend/src/main/java` 为准，表结构以 `backend/sql/init.sql` 为准；发现不一致请先改代码再回来校正本文。*

---

## 九、聊天室（2026-09-18）

> 状态：分支 `feat/chatroom` 开发中；尚未合并、未上线、未执行线上迁移。
> 迁移文档：`releases/迁移文档/2026-09-18_聊天室完整功能.md`。

### 9.1 接口

| 方法 / 路径 | 返回 / 约束 |
|---|---|
| GET /api/chat/conversations | 我的会话列表 + 未读、@未读、最后消息摘要 |
| POST /api/chat/conversations/direct | 创建/复用私聊；好友或任务参与者才允许，黑名单优先 |
| GET /api/chat/conversations/{id}/messages | 历史分页，`beforeId` + `size`（最多 50） |
| POST /api/chat/conversations/{id}/messages | 发送文字，最长 1000；支持 replyToId、mentionUserIds、clientMsgId 幂等 |
| POST /api/chat/messages/{id}/recall | 本人消息 2 分钟内可撤回，正文清空、状态 recalled |
| POST /api/chat/conversations/{id}/read | 标记会话已读；`messageId` 可指定已读位置 |
| GET/POST /api/chat/friend-requests | 好友申请列表 / 发起申请 |
| POST /api/chat/friend-requests/{id}/{accept\|reject} | 处理本人收到的申请 |
| DELETE /api/chat/friends/{id} | 双向删除好友 |
| POST/DELETE /api/chat/follows/{id} | 关注 / 取消关注 |
| POST/DELETE /api/chat/blocks/{id} | 拉黑 / 解除拉黑；拉黑会断开好友和关注 |
| POST /api/chat/groups | 创建群；每个用户最多 5 个群，群上限 200 人 |
| GET /api/chat/groups/search | 搜索公开群 |
| POST /api/chat/groups/{id}/join | 加入公开群；私密群拒绝 |
| POST /api/chat/groups/{id}/leave | 退群；群主必须转让或解散 |
| POST /api/chat/groups/{id}/members/{userId} | 群主/管理员邀请成员 |
| DELETE /api/chat/groups/{id}/members/{userId} | 踢人；群主可踢管理员，群管理员不能踢管理员 |
| POST /api/chat/groups/{id}/admins/{userId}?enabled= | 群主设置/取消管理员，最多 3 名 |
| DELETE /api/chat/groups/{id} | 群主解散群 |
| POST /api/chat/reports | 举报消息/会话，接入现有反馈工单 |
| POST /api/admin/chat/mutes/global | 主/副管理员全站禁言，按分钟数 |
| POST /api/admin/chat/mutes/conversation/{id} | 会话内禁言；仅会话 owner/admin |
| POST /api/admin/chat/mutes/{id}/revoke | 解除禁言并写审计 |
| GET /api/admin/chat/reports | 查看举报，支持 status 过滤 |
| POST /api/admin/chat/reports/{id}?status=&ticketId= | 处理举报，可关联反馈工单 |
| GET/POST/PUT/DELETE /api/admin/chat/sensitive-words | 仅主管理员维护敏感词 |

### 9.2 WebSocket / STOMP

- 端点：`/ws/chat`，连接时在 STOMP `CONNECT` 头带 `Authorization: Bearer <JWT>`。
- 订阅：`/topic/chat.{conversationId}`，事件类型 `message`、`recall`、`read`。
- 发送：通过 `POST /api/chat/conversations/{id}/messages` 走既有业务校验；**本轮分支待发布**的入站规则拒绝全部客户端 STOMP `SEND`，不得向 `/topic` 注入或绕过 REST 业务流程。
- 多设备：同一账号可多连接；本轮默认每账号最多 5 个连接、每连接 128 个订阅（完整参数见 11.3）。已读位置写 `chat_read_states`，并通过 topic 广播。
- 断线补齐：客户端携带 `beforeId` 拉历史；正式消息 ID 由数据库自增生成。
- 第一版客户端依赖本地 `js/vendor/sockjs.min.js`、`js/vendor/stomp.umd.min.js`，不走 CDN。

### 9.3 数据模型与保留

新增 15 张 `chat_*` 表；消息热表 `chat_messages`，冷归档 `chat_messages_archive`，已读 `chat_read_states`，社交关系 `chat_friends/chat_follows/chat_blocks`，群与成员 `chat_groups/chat_group_members`，治理 `chat_mutes/chat_reports/chat_sensitive_words/chat_audit_logs`。

默认保留：公共频道 90 天、私聊/群聊 180 天、已读回执 90 天；撤回正文立即清空；处罚、举报、审计至少 365 天；每日 03:30 分批归档清理，单批默认 1000 条，失败只记录日志。用户注销时解除聊天关系、解散其群并把消息发送者匿名化，不删除群聊上下文。

### 9.4 权限与安全

- 前端隐藏按钮不代表权限通过；所有发送、加入、管理动作均由 `ChatPermissionService` 后端判定。
- 私聊准入：好友或已选任务参与者；陌生人、黑名单拒绝。任务关系完成后保留，取消/拒绝保留 7 天规则由后续任务关系查询统一扩展。
- 消息内容只做纯文本存储；前端使用 `textContent`，不把 key 或消息拼进 `innerHTML`。
- 单条 1000 字符；进程内每秒 3 条；敏感词命中 review 提示、block 拒绝。
- 管理操作写 `chat_audit_logs`，业务上不允许删除审计。
- 第一版不支持图片、语音、视频、文件，也不新增聊天室成就。

### 9.5 已知边界

1. WebSocket 使用 Spring 简单内存 broker，当前单体单实例；多实例需要单独设计共享限流/验证码状态、跨节点消息及定时任务去重，本轮未引入 Redis 或外部 broker。
2. 归档清理目前按热表批次执行，管理员监控页只提供日志，不做独立容量仪表盘。
3. 真实微信 WebView、iOS/Android 真机和线上规模性能尚未验证。
4. 通知发起人称号问题仍属于现有通知模型边界，聊天室不扩大该模型。

## 十、高校宿舍目录与图片审核（2026-09-23，分支开发/未上线）

### 10.1 接口与权限

- `GET /api/dormitories?school=`：匿名可读单校资料与已审核照片；有登录态时仍会解析 JWT。
- `GET /api/dormitories/images/{id}`：仅已审核照片匿名可读。
- `POST /api/dormitories`：登录用户 multipart 上传，字段 `school`、`files`；每批最多 5 张，单张最大 5 MB，仅接受 JPG/PNG/WebP 且校验文件签名。
- `GET /api/dormitories/mine`：登录用户查看本人提交记录。
- `GET /api/dormitories/reviewer/me`、`GET /api/dormitories/review/pending`：审核员状态与待审队列。
- `GET /api/dormitories/review/images/{id}`、`POST /api/dormitories/review/{id}`：只有 `dormitory_reviewers.active=1` 的专用审核员可查看待审图并审核；与主管/副管理员权限隔离。
- `PUT /api/dormitories/reviewers/{userId}?active=`：仅主管理员可指定/撤销审核员。驳回原因可不填，最多 500 字。

### 10.2 数据与持久化

- 增量迁移：`backend/sql/migrate-dormitory-directory.sql`；新增 `dormitory_profiles`、`dormitory_reviewers`、`dormitory_images`，含少量官方来源住宿费记录。
- 图片持久化目录由 `eggworld.dormitory.upload-dir` 配置，生产默认 `/home/xiaos/eggworld/uploads/dormitory`；部署时需确认该目录持久化且备份。
- 审核中的图片前端用 Authorization 请求转 Blob 展示，不使用没有认证头的 `<img src>`。
- 全量目录名单由 `js/bl-schools.js` 提供；显示名统一添加“蛋蛋世界的”前缀。名单覆盖学校不代表已有宿舍资料。

### 10.3 发布边界

以上仅为开发分支说明；未线上执行迁移、未部署、未合并。发布须先备份数据库与上传目录，再执行迁移并部署前后端；详见 `releases/迁移文档/2026-09-23_宿舍目录与图片审核.md`。当前真实浏览器多屏检查仍待完成。

### 10.4 宿舍上传与信源页内阅读补充（2026-10-03，待发布）

本节补充本批修复，不改变 10.1–10.3 的历史记录；不表示旧迁移或本批代码已在生产环境落地。

- **公开读取**：`GET /api/dormitories/notes?school=` 在无 token 时可读；现有服务仅返回 `status=approved` 的文字，单校最多 50 条。精确匹配此 GET 路径，不开放子路径、POST、本人记录或审核接口；带 token 的封禁账号仍返回 403。
- **上传与异常处理**：图片/文字各自防重复点击；HTTP 或业务失败、非 JSON 响应不按成功处理，保留当前页面草稿且不自动重试。切换学校（含 A→B→A）后旧请求不得覆盖当前内容或误清草稿；晚到 401 不清除更新后的登录 token。成功只清理仍属于该次提交的草稿。
- **个人记录会话隔离**：使用无登录态副作用的局部读取；无 token 时不再请求受保护记录。token 与读取代次共同阻止旧账号成功/失败/401 或乱序响应覆盖新记录，读取失败不会伪装为空历史。
- **信源页内阅读**：已有 `sourceContent` 在宿舍资料卡内直接展示，来源与日期可见；原站链接是可选溯源入口。北大、兰大补充的内容为历史查阅要点转述，不是全文转载或本轮重新核验；无正文证据的学校不造内容。
- **验证口径**：本地宿舍测试 `node --test tests/dormitory*.test.cjs` 129/129；同步最新 `gitee/main`（`d897fa63fbe073fd3f5363de33941e33e145f152`）后，前端全仓 359 项中 350 通过、9 跳过、0 失败；后端 `mvn -o test` 443/443 通过并完成 `mvn -o compile`；模拟 API 的真实 Chromium 15 组检查通过（360/390/430/1440 宽度）。尚未进行真实后端完整 E2E、真机或线上验证。
- **本批无数据库变更**：不重跑旧 SQL，不改任务状态机、审核奖励金额或资金规则。客户端锁不是跨标签页/跨设备的服务端幂等，失败草稿也不承诺刷新后恢复。
- 发布/回滚、线上 `gitSha` 待核、旧 413 网关配置前置检查详见 [2026-10-03 迁移文档](../releases/迁移文档/2026-10-03_宿舍上传修复与信源页内阅读.md)。本批已提交并推送 `codex/dormitory-content`（功能修复至 `03d0c33`），基于已包含 PR #25 的 `gitee/main`（`d897fa6`）；尚未创建 PR、没有本批 PR 编号，未合并和上线。PR 表单按无 API token 兜底流程交接人工创建。

## 十一、高并发与安全加固（2026-10-02，分支待发布）

> 实现位于 `codex/docs-performance-security`；已完成本地提交，未推送、未建 PR、未合并 main、未部署、未上线。本节只描述分支契约，不代表生产已启用。工单与证据分别见 `tasks/2026-10-02_高并发与安全加固工单.md`、`tasks/2026-10-02_高并发与安全加固验证报告.md`。

### 11.1 新增通知角标接口及前端兼容

`GET /api/users/me/notifications/unread-count`：必须登录，无请求体，不接受指定他人 userId；从 `UserContext` 取得本人身份。仅执行本人未读数 COUNT，不读取通知正文或列表。

```json
{ "code": 200, "msg": "ok", "data": { "unread": 0 } }
```

- `unread` 是非负 long，按完整未读总数计，不是当前页记录数；原通知列表及标记已读接口保持。
- 页面可见且已登录时正常每 15 秒刷新 count；打开面板/翻页才取列表。隐藏或登出暂停；失败指数退避含抖动，最多 120 秒。
- 合并重复请求，token/版本隔离旧账号响应；count 等待已有列表请求，避免旧快照把较新未读数覆盖。失败不虚报已读。
- 为适配全局上限，原 size=200 的客户端调用改为每页 100；我的任务继续分页取齐；收到的评价最多两页，保留原 200 条覆盖范围。
- **发布顺序**：先发布含新接口的后端，再更新 HTML/聊天 JS；不单独上线新 HTML 配旧后端。回滚也按同一批文件成套恢复。

### 11.2 单实例接口预算

配置前缀 `eggworld.traffic`，默认 `window-seconds=60`、`max-keys=20000`；固定窗口、每键从首次占用计时，未使用令牌桶，也没有额外突发桶。窗口边界可能出现短时双倍额度，须在容量测试中计入。过期键机会清理，键容量耗尽按 429 拒绝，重启会清空进程状态。

| 子配置 | 路由分类 | account | ip | global |
|---|---|---:|---:|---:|
| `read` | 其余 GET/HEAD（含搜索列表） | 600 | 6000 | 30000 |
| `write` | 其余写方法 | 120 | 1200 | 6000 |
| `auth` | `/api/auth/*`，不含 send-code | 30 | 120 | 1200 |
| `verify-code` | `/api/auth/send-code` | 10 | 120 | 600 |
| `upload` | 其余 multipart 请求 | 20 | 200 | 1000 |

数值为每个窗口上限；配置键例：`eggworld.traffic.read.account`。`/api/health` 与 OPTIONS 放行。JWT 校验前扣 IP/全局预算，JWT 后对有 `UserContext` 的请求扣账号预算；失败请求可能已消耗前序预算，不退回。

匿名登录/注册没有账号上下文，另在 Controller 中、密码计算等昂贵业务前共享**归一化邮箱**预算（trim + 小写后 SHA-256 作 key，不在限流键中保存明文邮箱），默认 30 次/60秒，沿用 `auth.account`。send-code 的匿名请求不使用 JWT 账号额度，另外叠加 11.4 的邮箱冷却及邮件全局预算。`Retry-After` 使用整数秒；客户端应提示稍后重试，不能立即无限重发。

**代理/上传边界**：代码不直接读 `X-Forwarded-For` / `X-Real-IP`，使用 `getRemoteAddr()`。真实部署若其值仍是反向代理地址，所有用户将共用该 IP 预算；必须由 OPS-01 确认容器的可信代理链和源站防绕过配置，不能通过无条件信任自报转发头解决。本轮未改/验证 Nginx。MVC 限流在 multipart 解析之后，不能保护此前的上传接收、TLS 或带宽成本。IP 额度高于账号额度仅是保守初值，不是校园共享出口已无误伤的证明。

### 11.3 实时通道鉴权、参数与客户端行为

| `eggworld.websocket` 子配置 | 默认 | 含义 |
|---|---:|---|
| `max-connections` | 2000 | 单实例登记的连接上限，不是承诺容量 |
| `max-connections-per-user` | 5 | 每账号 STOMP 连接上限 |
| `max-subscriptions-per-connection` | 128 | 每连接订阅上限 |
| `max-subscription-attempts-per-minute` | 256 | 每连接进入授权查询的 SUBSCRIBE 尝试上限；取消订阅不返还额度 |
| `message-size-limit` | 16384 | 入站消息体上限，字节 |
| `send-buffer-size-limit` | 262144 | 每连接发送缓冲上限，字节 |
| `send-time-limit-ms` | 10000 | 发送耗时限制，毫秒 |
| `time-to-first-message-ms` | 10000 | 等待首帧限制，毫秒 |

- CONNECT/STOMP 校验 JWT、账号存在、未逻辑删除且未封禁；SUBSCRIBE 只接受 `/topic/chat.<正整数>` 并校验会话活跃、有效成员及唯一 subscription id。允许必要心跳、UNSUBSCRIBE 和 DISCONNECT，拒绝客户端业务 SEND/事务及任意订阅目的地。
- SUBSCRIBE 和出站统一调用 `requireReadableConversation`：一次即时 JOIN 同时确认账号存在、未逻辑删除且未封禁、会话 active、成员 active，替代三次独立查询；不缓存授权结果。无匹配行或查库异常均拒绝授权（fail-closed）；CONNECT 的独立账号检查保留。
- 出站按收件人的 session + subscription 绑定重新授权。退群、踢出、封禁或逻辑删除账号后的新出站事件不再仅依赖首次订阅结果。
- 在权限 SQL 之前限制每连接每分钟的 SUBSCRIBE 尝试次数，单调时钟固定窗口，取消订阅不返还查询预算；超限按 STOMP 策略错误拒绝。该预算随连接关闭而消失，不能约束反复重建连接、跨账号或握手洪泛；这些仍需边缘/连接建立速率限制，不能宣称完整抗 CC。
- **严格边界**：授权点是 `clientOutboundChannel` 的 `preSend`，不是队列出队瞬间；已经通过检查并排队的帧不在本轮即时撤回保证中。每个收件人的出站授权仍执行一次即时 JOIN，广播总查询量仍随接收者数量增长。本地隔离 smoke 已在最多 64 个真实收件连接下观察到无 WebSocket 错误、无未清积压，但未覆盖慢消费者、30 分钟稳定性、生产连接池表现和多实例广播。
- 已知会话消息就地更新未读、@、预览和顺序；最近 1000 个消息事件 ID 去重，未知会话刷新按 250ms 合并。在途列表响应不能覆盖更新的实时状态。
- 账号切换/登出清缓存、替换 STOMP 客户端并隔离旧回调；SockJS 重连新建 transport。STOMP ERROR 停止自动重试并提示刷新/登录，避免权限错误重连风暴。
- 超过 128 个会话订阅的账号、真实手机弱网、多标签页耗尽额度仍须实测，不以单元测试宣称兼容全部场景。
- 聊天 REST 发送维持每账号滚动 1 秒最多 3 条；内存追踪最多 20000 个发送者并机会回收，超限走 HTTP 429。该参数目前为代码常量，另叠加 API write 预算。

### 11.4 验证码发送的并发语义

| `eggworld.mail` 子配置 | 默认 | 含义 |
|---|---:|---|
| `code-expire-minutes` | 5 | 有效期分钟；如调整须同步邮件模板文案 |
| `code-resend-interval-seconds` | 60 | 同邮箱发送冷却秒数 |
| `max-code-entries` | 10000 | 进程内缓存条目上限 |
| `code-sends-per-minute` | 300 | 实际获准发送任务的全局每分钟预算 |

邮箱名额在缓存锁内原子预留，锁外执行邮件调用，不串行阻塞其他邮箱；同邮箱 sending 状态阻止重复发信。成功码仍只允许消费一次，最多 5 次错码；消费/错码不会清除发送冷却。失败或超时保留冷却且该次验证码不能消费，避免不确定发送结果形成无限快速重试。

定时（60 秒）及机会清理过期条目，sending 条目不提前清除。

新增 `[VERIFY_CODE_QUOTA]` 聚合诊断：有指标变化时最多每 60 秒输出一行，空闲不重复输出。字段为缓存条目/容量、窗口占用/配额、发送中数量、累计预留、冷却/容量/全局预算拒绝、发送异常及过期清理数量；不含邮箱、验证码、Token 或用户维度。累计计数在进程重启后归零，`admittedTotal` 不是实际投递成功数；仅内部日志，不开放公网监控接口、不代表已部署监控平台。日志观测不退还或重置现有预算。

单实例重启丢失验证码，不宣称跨节点一致。未配置 SES/模板的既有本地降级仍不发真实邮件，**不再向日志写邮箱或验证码**；测试由桩/隔离缓存取合成码。生产必须确认真实邮件配置有效，缺配置的降级不是可用的线上发信方案。

### 11.5 查询优化与仍需验证的成本

- 任务页批量查询发布者、按任务聚合认领/入选人数、批量查询本人状态；联系方式隐藏同时作用于 `TaskVO.contact` 和嵌套 `task.contact`，返回副本不污染原实体。
- 聊天历史批量读发送者并禁用无需返回的 total COUNT；会话列表批量读会话/最后消息/私聊对象。历史最多 50 的业务上限保持。
- 未读/提及计数使用单条参数化批量 UPDATE，排除发送者和 inactive 成员；仍会更新接收成员对应的多行并产生锁，不等于 O(1) 数据库工作。
- 官方频道成员检查改为批量读取：已有 active 成员时固定 2 次查询（频道 + 当前用户成员），无写入/显式行锁；inactive 成员合并为 1 次限定 userId/channelIds 的恢复更新，保留原恢复/人数口径，不清未读、禁言或偏好字段。
- 首次加入才按频道 ID 升序锁定会话、当前读重查成员，确实缺失才插入并增加人数。`listConversations` 入口显式开启 READ_COMMITTED 事务，避免内部调用绕过事务代理，也避免等待另一请求提交后仍从旧快照返回空列表；直接调用 ensure 仍有事务。成员与人数更新失败一起回滚。
- 首次加入仍逐个写入，并会争用热门频道行锁；锁持续到列表事务结束。只减少常规读路径的查询往返，未测首登洪峰/连接池占用/长事务影响，也未修正历史计数数据。
- 会话列表仍可能全量、敏感词仍每次发送查询、出站授权仍按收件人查询。无生产执行计划、锁等待、连接池/CPU/GC 数据，不能承诺在线人数或抗 DDoS 能力。完整未验证项以验证报告为准。

### 11.6 接续验收与实时授权补漏

- 自定义实时授权 JOIN 显式保留 `users.deleted = 0`，不能假定 MyBatis 的通用逻辑删除配置会自动附加到手写 SQL。CONNECT 也显式拒绝 deleted=1；账号删除后的新订阅与旧订阅下一次出站授权均拒绝。隔离 MySQL/连接单测已先红后绿，不新增字段或迁移。
- 重复、非法订阅标识、超过订阅配额先在内存拒绝，避免无效请求触发额外权限 SQL；通过预检的订阅仍实时鉴权，之后二次校验容量。此优化不等于已具备完整 WebSocket 帧级防洪泛能力。
- 统一复测入口 `backend/test-perf-security.ps1` 的 Mysql 模式包含 3307 自动入群隔离子类；Smoke / Soak 模式分别运行 30 秒 / 1800 秒稳定阶段。没有通用目标地址参数，不允许用于生产压测。
- 负载报告区分计划投放、窗口成功完成和含排空吞吐，并记录调度、工作队列延迟与驱动拒绝；应用和驱动仍共用 JVM，不能据此宣布生产容量或最大在线人数。完整结果/中止记录以验证报告为准。

### 11.7 本轮本地复测结果与发布边界

- 统一入口的五种模式均已验证：`Regression` 后端 425 通过、前端 297 总/294 通过/3 跳过；`Mysql` 57 总/56 通过/1 跳过；`Microbench` 通过；`Smoke` 与 `Soak` 均完成。
- Soak 使用 warmup、10/30/60 RPS 阶段，再以约 8 RPS 持续 1800 秒；累计 16000 请求、64 个真实 STOMP 收件连接，`driverRejectedRequests=0`、`unfinishedRequests=0`、`pendingBroadcasts=0`、`webSocketErrors=0`。
- Soak 资源采样 378 次；最高堆使用约 115,725,664 bytes，最高线程数约 158，`poolWaiting` 最大值为 0，`sqlMapperOver100ms` 和 `Slow_queries` 最大值为 0；`Innodb_row_lock_waits` 累计最高为 1。
- 结果文件：`D:\CodexData\local\eggworld\perf-sec-load-3f826a80-9024-4499-b75d-86ab60e22ce6.json`；运行日志：`D:\CodexData\local\eggworld\perf-sec-run-soak-20261002-205113.log`。
- 以上是本机隔离环境的核心 HTTP/STOMP/MySQL 混合负载长稳证据，不是整站容量验收，不代表固定在线人数、生产性能、DDoS/CC/“ROIS”防护，也没有完成优化前后完整可比容量基线。
- 本轮未推送、未创建 PR、未合并 `main`、未部署、未上线；生产 Nginx/WAF/CDN/云高防、源站防绕过、多实例广播、慢消费者、真实手机/微信 WebView、弱网及共享校园出口仍需独立授权和现场证据。

## 十二、模块可用性闸：职业测评 / 宠物系统 / 猫舍「本轮不建表」（2026-10-07）

### 12.1 接口前缀与缺表时的响应

- 受影响前缀：`/api/career-test/**`（职业测评）、`/api/pets/**`（宠物系统）、`/api/cats/**`（猫舍与猫舍审核）。
- 需求：线上**不新增**这三组表（`migrate-career-test.sql` / `migrate-pet.sql` / `migrate-cat-room.sql` 本轮不执行），前端入口与面板也已从工作台隐藏。
- 行为：`interceptor/ModuleAvailabilityInterceptor`（`config/WebMvcConfig.java` 注册，`order=20`，跑在 JWT 之后）按前缀探测核心表
  `career_test_reports` / `pets` / `cat_rooms` 是否存在（`information_schema`，结果缓存 60s），**不存在时统一返回 body `code:404` +「该功能暂未开放」**。
- 因此：缺表不再抛 `Table 'eggworld.X' doesn't exist`（那种错误经全局兜底会变成 `code:500` 并把表名/SQL 回显给调用方）；补跑脚本后**无需重启**，缓存过期即自动放行；探测本身失败（连不上库等）时**放行**，让真实故障在业务层暴露。
- 不碰库的接口不受影响：`GET /api/career-test/meta`、`GET /api/career-test/questions`（题库在 jar 内 `resources/career/*`）、`GET /api/pets/shop`（内存目录）。

### 12.2 注销清理由缺表容错

- 原实现：`AdminService.deleteUser` 在同一事务里调用 7 条新模块清理语句（`pets`、`pet_inventory`、`career_test_reports`、`cat_reputation`、`cat_votes`、`cat_adoptions`、`cat_reviewers`），缺表会让**整次注销失败**。
- 现实现：`purgeOptional(table, action)` 只吞 MySQL「表不存在」（错误码 `1146` / SQLState `42S02` / 消息含 `doesn't exist`）并记 WARN；**其它错误仍上抛**，表补上后自动恢复严格清理语义。

### 12.3 放出这三个模块的步骤

1. 执行 `migrate-career-test.sql`、`migrate-pet.sql`、`migrate-cat-room.sql`（执行前按原流程审计 `cat_reward_grants` 唯一键与库备份）。
2. 等 60s 缓存过期（或重启服务），模块闸自动放行 —— **不需要改代码**。
3. 前端按上线文档第七节第 19 条恢复工作台入口与面板（`#page-lab` 的 `.lab-shell` / `.lab-list` / `.lab-panel` 与 `js/chatroom.css` 的 lab 适配）。
4. 注意：闸只解决「缺表报错」；这三个模块的接口始终是**登录可达**的，补表后即使没有 UI 入口也能直连调用（含扣费），若需硬关需另加开关（本轮未加）。

## 十三、修改任务（改稿）加强：图片与表单对齐（2026-10-07）

- `POST /api/tasks/{id}/edit`（请求体 `EditTaskDTO`）新增两个字段：
  - `proofImageId`（Long，选填）：改成这张证明图（值为 `task_proof_images.id`，先经 `POST /api/tasks/proof-images` 上传取得）；
  - `clearProofImage`（Boolean，选填）：`true` 表示本次修改**移除**证明图；与 `proofImageId` 同时给出时**以「移除」为准**；
  - 两者都不给 = **沿用任务当前那张**（服务层把三种意图解析成最终值写入 `task_revisions.proof_image_id`）。
- 审核侧：待审记录里的 `pendingRevision.proofImageId` 即「通过后会用的那张图」（NULL = 通过后没有图）；`TaskMapper.applyRevisionIfRevisable` 采纳时写回 `tasks.proof_image_id`（此前刻意不写，2026-10-07 起开放）。
- 「待审核任务直接改本体」那条路径同样会写 `tasks.proof_image_id`（不产生改稿记录）。
- 联系方式：与发布同口径 —— 仅当 `eggworld.features.task-auto-group=false`（旧流程）且任务类型非 `reward` 时必填；否则选填。教学 / 组队在新流程下前端不收集联系方式，改由系统自动建群。
- 库：`task_revisions.proof_image_id` 已并入 `backend/sql/migrate-task-proof-image.sql`（条件式 `ALTER`，脚本数不变）。
- 已知边界：`proofImageId` **未校验归属**（与发布一致，知道别人图片 id 可挂到自己任务上）；另外**上线前若存在 `status='pending'` 的旧改稿**，其新列为 NULL，采纳后会把任务的证明图置空 —— 先审完再上线，或上线后立即处理。
