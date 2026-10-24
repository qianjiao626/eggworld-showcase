# 规格：权限管理（学生协管员）

> **状态**：已评审通过（2026-10-13）；实现计划见 [`permission-management-plan.md`](permission-management-plan.md)
> **位置**：按 `PROJECT_RULES.md` 第一节「文档地图」——"施工计划 / 阶段汇报" 落 `tasks/`。
> **来源**：由 2026-10-13 的需求访谈逐轮确认后落成（用户 → 权限点，两段式）。
> **关联文档**：[`docs/backend-handoff.md`](docs/backend-handoff.md)（接口 / 表结构，改动时同步）、[`PROJECT_RULES.md`](PROJECT_RULES.md) 2.1 变更流程。

---

## 1. 目标（Objective）

主管理员在后台新增「权限管理」页，**按列表勾选**给学生**单个 / 批量**授予、收回**权限点**；被授权的学生获得「协管工作台」入口，进去是**按其权限裁剪**的轻量工作台。

- **用户**：授权方 = 主管理员（该页仅主管理员可见）；受益方 = 从活跃学生中选出的协管员。
- **为什么现在做**：审核 / 看数据的活需要学生分担，但现有 `@AdminOnly` / `@ModeratorOnly` 两层角色太粗，无法只给单项能力。
- **成功的样子**：管理员能独立完成「搜人 → 勾权限 → 授予 / 收回」；学生端入口与内容按权限显隐；后端真实校验，改前端绕不过。

## 2. 权限模型（核心设计）

- **两段式**：`用户 → 权限点`，**不引入角色层**。
- **权限点枚举写死在代码里**（运营不能自造）：先上两个
  - `content_review`（内容审核）
  - `data_dashboard`（数据看板）
- **主管理员 / 副管理员对所有权限点隐式通过** —— 保证「不动现有主 / 副管理员逻辑」。
- **不做数据范围切分**：拥有 `data_dashboard` 即可看全站数据。

> 现有范式可直接复用：`users.role ∈ ('admin','student')`，副管理员是独立标志位 `sub_admin`；
> [JwtInterceptor](../backend/src/main/java/com/eggworld/interceptor/JwtInterceptor.java) 每次登录态请求**回库重判**角色（见 `writeForbiddenIfBanned`），
> 所以「授权即时生效、无需重登」有现成做法 —— 权限点照抄这套即可。

## 3. 数据模型与迁移

新增 `backend/sql/migrate-user-permissions.sql`（**幂等**，仿 [`migrate-sub-admin.sql`](../backend/sql/migrate-sub-admin.sql) 写法），并同步进 `backend/sql/init.sql`（新库用；**线上库永远不执行 `init.sql`**）。

```sql
-- 当前授权状态（唯一权威源）
user_permissions(
  id BIGINT PK AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  perm_code VARCHAR(32) NOT NULL,
  granted_by BIGINT NOT NULL,
  granted_at DATETIME NOT NULL,
  UNIQUE KEY uk_user_perm (user_id, perm_code)
)

-- 审计（按人一条）
permission_audit(
  id BIGINT PK AUTO_INCREMENT,
  operator_id BIGINT NOT NULL,
  target_user_id BIGINT NOT NULL,
  perm_code VARCHAR(32) NOT NULL,
  action VARCHAR(8) NOT NULL,      -- grant | revoke
  created_at DATETIME NOT NULL
)
```

## 4. 后端接口与门控

- **新注解** `@RequirePermission(permCode)`；在 [`AdminAspect`](../backend/src/main/java/com/eggworld/aspect/AdminAspect.java) 增加校验：
  `isModerator() || 持有该权限点` → 通过，否则 403。
- **[`LoginUser`](../backend/src/main/java/com/eggworld/common/LoginUser.java)** 增加 `Set<String> permissions`；`JwtInterceptor` 每请求回库加载（沿用 `sub_admin` 的即时生效范式）。
- **新接口**（全部 `@AdminOnly`，建议独立 `AdminPermissionController`）：
  - `GET  /api/admin/permissions/users?keyword=&permCode=&status=&page=&size=` → 分页用户列表 + 每人权限状态
  - `POST /api/admin/permissions/grant`  `{userIds:[...], permCode}` → 逐人授权，返回 `{success, skipped, failed:[{userId,reason}]}`
  - `POST /api/admin/permissions/revoke` `{userIds:[...], permCode}` → 同上
  - `GET  /api/admin/permissions/audit?page=&size=` → 审计列表（时间倒序）
- **用户侧**：登录响应 / 用户信息接口增加 `permissions` 字段，供前端入口显隐。
- **受限既有接口**：审核中心相关接口挂 `@RequirePermission("content_review")`、工作台数据接口挂 `@RequirePermission("data_dashboard")`。
- 改接口 / 表 → 同步 [`docs/backend-handoff.md`](docs/backend-handoff.md)。

## 5. 前端（Web + 移动端）

### 5.1 后台「权限管理」页（Web）

- 入口：`#adminNav` 第 7 项 `data-page="permissions"`，**仅主管理员可见**。
- **顶栏**：搜索框（用户名 / 昵称）+ 右上「审计记录」按钮。
- **筛选 chip**：`权限点`（全部 / 内容审核 / 数据看板）× `状态`（全部 / 已授权 / 未授权）——**复用工作台已有筛选 chip 样式**。
- **用户列表**：`勾选框` + 头像 + 昵称(username) + 该权限点状态 tag；分页。
- **底部操作条**：`授予选中 N 人` / `收回选中 N 人`（有选中才浮出；勾 1 人即单授 / 单收）。
- **结果反馈**：`成功 a · 跳过 b · 失败 c`，失败 / 跳过**逐行列原因**，不做整体回滚。
- **审计**：按钮 → **弹层**（复用站点自定义弹窗），分页、时间倒序，不占页面主体。

### 5.2 后台「权限管理」页（移动端）

- `#adminNav` 移动端横滑可见；列表窄屏堆叠；**操作条吸在底部导航之上**。

### 5.3 学生「协管」入口（Web）

- `#studentNav` 新增 `data-page="cowork"`，默认 `display:none`；**仅当 `permissions.length > 0` 时显示**。
- 内容按权限裁剪：仅 `content_review` → 审核队列；仅 `data_dashboard` → 数据看板；两者都有 → 页内顶部子 tab 切换。

### 5.4 学生「协管」入口（移动端）

- **不动底栏 4 格**：在 **「我的」页顶部**放一张「协管工作台」入口卡 —— 沿用「退出」按钮从底栏移入「我的信息」页顶部的先例。
- 点进＝同一轻量工作台，窄屏纵向堆叠。

### 5.5 门控收敛

- 把 [`enterManagerView()`](../growth-schoolv3.html) / `switchRole()` 里**写死的导航白名单**，改成**读 `permissions`**；前后端门控收敛到同一份权限数据。

### 5.6 样式约束（去 AI 味，硬约束）

- 只用现有 token（`--bg --ink --muted --border --primary` 及 `.tag-*`）与现有组件；**不新增配色 / 圆角 / 阴影体系**。
- 禁：渐变、玻璃拟态、emoji 满屏、无意义插画、hero 大标题。
- 移动端专属样式写在媒体查询 / 容器查询内（[`PROJECT_RULES.md`](PROJECT_RULES.md) 2.7）。

## 6. 技术栈（Tech Stack）

后端 Spring Boot 3.3.4 / JDK 17 / MyBatis-Plus / MySQL；前端单页 `growth-schoolv3.html` + `js/` 外联脚本（无框架）。

## 7. 命令（Commands）

```powershell
cd backend && mvn -o test                 # 任何 Java 改动
cd backend && mvn -o compile              # 合并 main 前必跑
node --test tests/*.cjs                   # 前端回归
node --check js/<改过的文件>.js            # 逐个语法检查
powershell -ExecutionPolicy Bypass -File backend\build-deploy.ps1 -Name "<上线名>"   # PR 合并进 main 后
```

## 8. 目录结构（Project Structure）

- 后端：`backend/src/main/java/com/eggworld/{controller,service,mapper,entity,dto,annotation,aspect,common}`
- 迁移：`backend/sql/migrate-user-permissions.sql`（+ 同步 `backend/sql/init.sql`）
- 前端：`growth-schoolv3.html`、新增 `js/admin-permissions.js`（**须同步 `backend/build-release.ps1` 文件清单 + HTML 引用**）
- 测试：后端 `backend/src/test/java/...`；前端 `tests/*.cjs`

## 9. 代码风格（Code Style）

- 后端：沿用现有 `Result.ok(...)` / `BusinessException(code,msg)` 范式；Mapper 用 MyBatis-Plus。
- 前端：沿用现有 `toast()` 与站点自定义确认弹窗（**禁止原生 `alert/confirm`**），命名与 `js/admin-workbench.js` 风格一致。

## 10. 测试策略（Testing Strategy）

- **后端**（`mvn -o test`）：覆盖——授权 / 收回**幂等**；**批量部分失败**（含用户名不存在、重复授权跳过）；**权限校验**（无权限 403、admin/subadmin 隐式通过）；审计落库。
- **前端**（`node --test tests/*.cjs`）：覆盖——入口 tab / 卡片**按权限显隐**（有 / 无权限两态）；批量操作结果渲染。
- **布局**：记录 **360 / 390 / 430 / 1440** 四个宽度表现（PR 前清单要求）。
- 报告口径：区分**已实现 / 已验证 / 未验证**。

## 11. 边界（Boundaries）

- **Always**：走分支 + PR；补测试；改接口 / 表同步 `docs/backend-handoff.md`。
- **Ask first**：**数据库结构变更（本项目需单独授权）**；**改 `growth-schoolv3.html`（共享热点文件，须先 `git pull`、同一时间只允许一人改）**；新增 `js/` 外联文件要同步 `build-release.ps1`。
- **Never**：直推 `main`；改线上（服务器 / 库 / 邮件配置）；执行 `init.sql`；提交密钥 / 数据库转储。

## 12. 成功标准（Success Criteria）

- [ ] 主管理员可在「权限管理」页**搜索 / 筛选 / 勾选批量**授予或收回，结果**逐行**反馈。
- [ ] 审计可点开查（谁 · 给谁 · 权限 · 时间 · 动作）。
- [ ] 被授权学生 **Web 出现「协管」tab、移动端「我的」页出现入口卡**；未授权用户不可见。
- [ ] 无权限者直接调受限接口返回 **403**（绕过前端无效）。
- [ ] 主管理员 / 副管理员**原有行为不变**。
- [ ] 视觉与站点一致（无新增设计体系）。
- [ ] 后端 `mvn -o test`、前端 `node --test tests/*.cjs` 全绿；360 / 390 / 430 / 1440 已记录。

## 13. 假设（Assumptions，错了请纠正）

1. 权限点先只有 `content_review`、`data_dashboard`；后续加权限点 = 加代码枚举 + 一行迁移，不建角色。
2. 主管理员 / 副管理员对所有权限点隐式通过。
3. 审计按「每人一条」记录，不做批量汇总条。
4. 授权后**即时生效**（每请求回库），无需重新登录。
5. 权限点存 `user_permissions` **独立表**（而非在 `users` 加列）—— 已采纳（见第 14 节 Q1）。
6. 数据范围不切分：`data_dashboard` = 看全站数据。

## 14. 已决策（2026-10-13 评审）

- **Q1**：用 `user_permissions` **独立表**（不在 `users` 加列）—— 好加权限点、天然配审计。
- **Q2**：审计**暂不做**保留上限 / 清理策略。
- **Q3**：「协管工作台」的数据看板**原样复用**现有工作台板块（不做只读精简版）。
- **Q4**：撤销权限后，其**历史审核动作保留**（仅记审计，不回滚）。

## 15. 后续（Next）

评审通过 → 用 `planning-and-task-breakdown` 出 `tasks/plan.md` 与任务清单 → 按 `test-driven-development` 增量实现。

> ⚠️ 本次**含数据库变更**：实现阶段必须**随代码 PR 一起提交** `releases/迁移文档/YYYY-MM-DD_<关键词>.md`（见 `PROJECT_RULES.md` 2.1 第 5 步）。
