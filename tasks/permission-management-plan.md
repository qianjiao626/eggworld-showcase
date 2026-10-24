# 实现计划：权限管理（学生协管员）

> 关联：[规格](permission-management-spec.md)（已评审通过）｜[`PROJECT_RULES.md`](../PROJECT_RULES.md) 2.1 变更流程
> 分支：`feat/permission-management`（从 `gitee/main` 切出）
> 任务清单即本文件「任务清单」一节（本项目无外部看板）。

## 概览

按已通过的规格，把「后端权限数据 + 门控 → 管理接口 → 后台权限管理页 → 学生协管入口」逐条打通，
每个阶段末设一个检查点。**含数据库结构变更**，故实现阶段必须随代码 PR 一起提交迁移文档。

## 架构决策

- **权限数据**：新增 `user_permissions`（当前状态）+ `permission_audit`（审计，按人一条）；独立表而非 `users` 加列（规格 Q1）。
- **门控收敛**：新增 `@RequirePermission` 注解；`AdminAspect` 放行 `isModerator() || 持权`；`LoginUser.permissions` 由 `JwtInterceptor` **每请求回库加载**（复用 `sub_admin` 的即时生效范式）。
- **不改现有角色语义**：主 / 副管理员对所有权限点隐式通过 —— 现有后台行为不变。
- **前端门控收敛**：`enterManagerView()` / `switchRole()` 里**写死的导航白名单**改为读 `permissions`。
- **数据看板原样复用**现有工作台板块（规格 Q3）；不做只读精简版。
- **新建 `js/admin-permissions.js`**，须同步 `backend/build-release.ps1` 清单与 HTML 引用。

## 任务清单

### 阶段 1：地基（后端数据 + 门控）

- [ ] **Task 1 · 权限数据层（迁移 + 实体 / Mapper）**
  - 验收：`backend/sql/migrate-user-permissions.sql` **幂等**（仿 `migrate-sub-admin.sql`）建 `user_permissions`、`permission_audit`；`init.sql` 同步；实体 `UserPermission` / `PermissionAudit` + Mapper 就位。
  - 验证：本地隔离库**连跑两次不报错**；`cd backend && mvn -o compile`。
  - 依赖：无
  - 涉及文件：`backend/sql/migrate-user-permissions.sql`、`backend/sql/init.sql`、`entity/*.java`、`mapper/*.java`
  - 规模：S

- [ ] **Task 2 · 权限门控（注解 + 切面 + 每请求加载）**
  - 验收：`@RequirePermission("content_review")` 生效——无权限学生 **403**；`admin` / `subadmin` **隐式通过**；持权学生通过；授权后**无需重登**即时生效。
  - 验证：新增单测（403 / admin 通过 / subadmin 通过 / 持权通过）；`mvn -o test`。
  - 依赖：Task 1
  - 涉及文件：`annotation/RequirePermission.java`、`aspect/AdminAspect.java`、`common/LoginUser.java`、`interceptor/JwtInterceptor.java`、测试
  - 规模：M

> **检查点 1**：`mvn -o test` 全绿；门控行为符合上述四态。

### 阶段 2：管理接口

- [ ] **Task 3 · 授权 / 收回（批量）Service + 接口**
  - 验收：`POST /api/admin/permissions/grant|revoke`，body `{userIds:[...], permCode}`；逐人处理，返回 `{success, skipped, failed:[{userId,reason}]}`；**按人写审计**；**幂等**（重复授权=跳过）；不做整体回滚。
  - 验证：单测覆盖 **批量部分失败**（用户不存在）、**幂等**、**审计落库**；`mvn -o test`。
  - 依赖：Task 1、Task 2
  - 涉及文件：`controller/AdminPermissionController.java`、`service/...`、`dto/...`、测试
  - 规模：M

- [ ] **Task 4 · 用户列表 + 审计查询接口**
  - 验收：`GET /api/admin/permissions/users`（keyword / permCode / status / 分页，带**每人权限状态**）；`GET /api/admin/permissions/audit`（分页、时间倒序）。
  - 验证：单测；`mvn -o test`。
  - 依赖：Task 1
  - 涉及文件：controller / service / dto / mapper、测试
  - 规模：M

> **检查点 2**：后端接口全绿（`mvn -o test`）；用 curl / 前端试调一次确认返回结构。

### 阶段 3：后台「权限管理」页

- [ ] **Task 5 · 页面骨架 + 入口 + 列表 / 搜索 / 筛选（Web）**
  - 验收：`#adminNav` 第 7 项「权限管理」**仅主管理员可见**；搜索（用户名 / 昵称）+ 筛选 chip（权限点 × 状态，**复用现有 chip 样式**）+ 列表（勾选框 / 头像 / 昵称 / 状态 tag）+ 分页。
  - 验证：`node --check js/admin-permissions.js`；本地浏览器手点。
  - 依赖：Task 4
  - 涉及文件：`growth-schoolv3.html`、`js/admin-permissions.js`
  - 规模：M

- [ ] **Task 6 · 勾选批量授收 + 操作条 + 结果反馈 + 审计弹层**
  - 验收：勾选后操作条浮出并显示人数（勾 1 = 单授 / 单收）；执行后**逐行**反馈成功 / 跳过 / 失败；审计按钮 → **弹层**（分页倒序）；二次确认用**站点自定义弹窗**（禁原生 `confirm`）。
  - 验证：手点 + 新增前端回归测试（`node --test tests/*.cjs`）。
  - 依赖：Task 5、Task 3
  - 涉及文件：`js/admin-permissions.js`、`tests/*.cjs`
  - 规模：M

- [ ] **Task 7 · 该页移动端适配**
  - 验收：窄屏列表纵向堆叠、筛选 chip 横滑、**操作条吸在底部导航之上**；**360 / 390 / 430 无横向溢出**；移动端专属样式写在媒体查询 / 容器查询内。
  - 验证：浏览器三宽度手点 + 截图。
  - 依赖：Task 6
  - 涉及文件：`growth-schoolv3.html`、`js/admin-permissions.js`
  - 规模：S

> **检查点 3**：后台「搜索 → 筛选 → 勾选 → 授予 / 收回 → 看审计」端到端走通；多宽度表现已记录。

### 阶段 4：学生端

- [ ] **Task 8 · `permissions` 下发 + 前端门控收敛**
  - 验收：登录响应 / 用户信息接口返回 `permissions`；前端把 `enterManagerView()` / `switchRole()` 的写死白名单改为**读 permissions**。
  - 验证：手点（有 / 无权限账号）；`node --test tests/*.cjs`。
  - 依赖：Task 2、Task 4
  - 涉及文件：后端 controller / dto、`growth-schoolv3.html`
  - 规模：M

- [ ] **Task 9 · Web「协管」tab + 轻量工作台**
  - 验收：`#studentNav` 新增 `data-page="cowork"`，**仅 `permissions` 非空时显示**；内容按权限裁剪（仅审核 → 审核队列；仅看板 → 复用数据看板；两者 → 页内子 tab）；无权限者不可见、强行调用受限接口 403。
  - 验证：前端回归 + 手点。
  - 依赖：Task 8
  - 涉及文件：`growth-schoolv3.html`、`js/*.js`、`tests/*.cjs`
  - 规模：M

- [ ] **Task 10 · 移动端「我的」页入口卡**
  - 验收：**不动底栏 4 格**，在「我的」页顶部放「协管工作台」入口卡（仅持权者可见）；点进＝同一轻量工作台；普通用户完全无感。
  - 验证：手点三宽度 + 截图。
  - 依赖：Task 9
  - 涉及文件：`growth-schoolv3.html`
  - 规模：S

> **检查点 4**：学生端端到端——**授权 → 入口出现（Web tab / 移动入口卡）→ 工作台可用 → 收回 → 入口消失**。

### 阶段 5：收尾

- [ ] **Task 11 · 文档与迁移文档**
  - 验收：`docs/backend-handoff.md` 同步新接口 / 新表；`releases/迁移文档/YYYY-MM-DD_<关键词>.md` **按 `_模板.md` 逐节填满**（含 DB 变更脚本 / 备份命令 / 执行顺序 / 可勾选验证清单 / 回滚）；`backend/build-release.ps1` 清单同步 `js/admin-permissions.js`。
  - 验证：逐条对照 `PROJECT_RULES.md` 2.2 与 `releases/上线文档.md` 4.3–4.5。
  - 依赖：全部
  - 涉及文件：`docs/backend-handoff.md`、`releases/迁移文档/...`、`backend/build-release.ps1`
  - 规模：S

> **检查点 5（完成）**：规格第 12 节全部勾选；`mvn -o test` + `node --test tests/*.cjs` 全绿；交人评审。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 改 `growth-schoolv3.html`（共享热点文件） | 高 | 改前 `git pull`；只做小范围可回滚改动；同一时间只允许一人改 |
| 改门控波及现有后台 | 高 | 保留 `isModerator()` 隐式通过；用回归测试钉死 admin / subadmin 行为 |
| 数据库结构变更 | 中 | 迁移文档随 PR；本地隔离库先验；上线前备份 |
| 复用工作台 / 审核接口被 `@AdminOnly` 挡住协管员 | 中 | 明确把相关接口门控改为 `@RequirePermission`，并在规格第 4 节列清 |
| 新增 js 未同步 `build-release.ps1` | 低 | Task 11 明确列为验收项 |

## 并行机会

- 阶段 3 前端可在**阶段 2 接口契约确定后**并行推进。
- 阶段 4 依赖 Task 8（`permissions` 下发）完成，不能与阶段 3 交叉动 `growth-schoolv3.html`（热点文件，串行）。

## 待定

- **上线名**（`YYYY-MM-DD_<关键词>`）待定，上线前确定，与 `build-deploy.ps1 -Name` 同名。
