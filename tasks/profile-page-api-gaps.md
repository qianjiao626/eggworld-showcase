# 「我的信息」页面 · 后端接口缺口清单

> 生成日期：2026-08-30 ｜ **最近复核：2026-09-14**（逐条对照后端代码与前端接线）
> 分析对象：前端 [growth-schoolv3.html](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html) 的 `page-profile`（我的信息）页
> 后端现状：`backend/` 目录已实现认证 / 用户 / 任务 / 八卦 / 吐槽榜 / 后台 / 反馈接口
>
> ⚠️ **复核说明（2026-09-14）**：本文成文于 2026-08-30，当时列出的 4 项"后端需新增"能力**均已实现**。
> 第一节速览表与第二节各模块结论已就地更新为当前状态，行号链接已同步到 2026-09-14 版本的前端源码。
> **唯一仍成立的缺口见第二节第 5 项。**

---

## 一、结论速览（2026-09-14 复核后）

| # | 页面模块 | 后端状态 | 说明 |
|---|---------|---------|------|
| 1 | 角色展示 / 五维 / 已解锁角色 | ✅ 已实现 | `GET /api/users/me` |
| 2 | 切换角色 / 修改 MBTI | ✅ 已实现且已接线 | `PUT /api/users/me/characters/switch`、`PUT /api/users/me { mbtiType }` |
| 3 | 排名展示（你已超过 X%…） | ✅ 已实现 | `GET /api/users/me` 返回 `rank` / `total` |
| 4 | 邀请好友 | ✅ 已实现且已接线 | `invite_records` 表 + `GET /api/users/me/invites` |
| 5 | 个人资料编辑 | ⚠️ **部分缺失（唯一剩余）** | `email` 后端不接收，前端仍在提交 |
| 6 | 自我介绍 | ✅ 已实现 | `PUT /api/users/me { bio }` |
| 7 | 技能标签 | ✅ 已实现且已接线 | `user_skills` 表 + `GET/PUT /api/users/me/skills` |
| 8 | 互评记录 | ✅ 已实现且已接线 | `GET /api/users/me/ratings`、`POST /api/tasks/{id}/rate` |
| 9 | 蛋蛋币明细 | ✅ 已实现 | `GET /api/users/me/point-logs` |
| 10 | 等级与参数说明 | ✅ 无接口依赖 | 前端本地计算 |

**复核结论：** 原文"后端需新增 4 个能力（排名 / 邀请 / 技能标签 / 评价查询 + 评价提交配套）"**已全部实现**；
剩余真实缺口只有 **1 项：个人资料邮箱**（见第二节第 5 项，已登记 `TODO/TODO.md`）。

---

## 二、逐模块明细（2026-09-14 复核）

### 1. 角色展示（当前角色 / 稀有度 / 蛋蛋币 / 经验 / 称号 / 五维 / 已解锁角色）

- **前端调用**：`GET /api/users/me` → [applyUserData()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L3212) 映射 `stats`、`characters`
- **后端现状**：[UserController.java](file:///d:/code/projects/all/backend-handoff-package/backend/src/main/java/com/eggworld/controller/UserController.java#L38-L48) 已实现，返回五维 + 角色解锁状态
- **结论**：✅ 已实现，无需改动

### 2. 切换角色 / 修改 MBTI

- **前端现状（已接线）**：
  - [confirmCharSelect()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L3573-L3601) → [applyCharSwitch()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L3564-L3571) 调 `PUT /api/users/me/characters/switch`（后端校验解锁 + 同步 `egg_category`）
  - MBTI 有变化时调 `PUT /api/users/me { mbtiType }`（[L3590](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L3590)）
- **后端现状**：[UpdateProfileDTO.java](file:///d:/code/projects/all/backend-handoff-package/backend/src/main/java/com/eggworld/dto/UpdateProfileDTO.java#L32-L37) 支持 `mbtiType`（自动推导分组）；角色切换另有 `PUT /api/users/me/characters/switch`
- **结论**：✅ 已接线并持久化，刷新不再丢失
  > 原文判为"⚠️ 前端未接线"，该结论已失效。

### 3. 排名展示（"你已超过 X% 的学习伙伴" / "当前排名第 X 名 / 共 X 人"）

- **后端现状**：[UserProfileVO.java](file:///d:/code/projects/all/backend-handoff-package/backend/src/main/java/com/eggworld/dto/UserProfileVO.java#L39-L43) 已含 `rank`（经验值高于我的人数 + 1）与 `total`（全站用户数）
- **前端现状**：[applyUserData()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L3232-L3233) 读取 `u.rank` / `u.total`，[refreshProfile()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L8995) 渲染
- **结论**：✅ 已实现，mock 值（85 / 3486）已被真实数据取代
  > 原文判为"❌ 缺失 / UserProfileVO 没有 rank、total 字段"，该结论已失效。

### 4. 邀请好友（邀请码 / 已邀请数 / 已获得蛋蛋币 / 邀请记录）

- **后端现状**：已有 `invite_records` 表与 `GET /api/users/me/invites`（`InviteService`）；
  绑定关系在注册时建立，被邀请人发布首个任务后邀请人 +20 蛋蛋币
- **前端现状（已接线）**：[loadInvites()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4567-L4572) 拉取统计、
  [openInviteModal()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4577-L4592)、
  [renderInviteHistory()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4597) 均走接口
- **备注**：`USER.invites` 字段在 `applyUserData()` 中仍被置空（[L3238](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L3238)），
  但邀请数据已改用独立变量 `inviteData` + 接口加载，因此**不再"永远为空"**；该字段属遗留，可清理
- **结论**：✅ 已实现且已接线
  > 原文判为"❌ 缺失 / 无邀请记录表、无任何邀请接口"，该结论已失效。

### 5. 个人资料编辑（邮箱 / 学校 / 城市 / 专业 / 年级 / 年龄）

- **前端调用**：[saveProfile()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4677-L4698) 提交
  `email / school / city / major / grade / age`（见 [L4685-L4688](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4685-L4688)）
- **后端现状**：[UpdateProfileDTO.java](file:///d:/code/projects/all/backend-handoff-package/backend/src/main/java/com/eggworld/dto/UpdateProfileDTO.java) **没有 `email` 字段**，
  提交邮箱会被静默忽略；其余字段均支持
- **结论**：⚠️ **部分缺失 —— 本文唯一仍成立的缺口**。邮箱是登录凭证，建议二选一：
  - 前端去掉邮箱编辑（只读展示），或
  - 后端加独立接口 `PUT /api/users/me/email`（需二次验证，MVP 可先只读）
  - 已登记：`TODO/TODO.md` 第 7 条

### 6. 自我介绍

- **前端调用**：[saveBio()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4718) → `PUT /api/users/me { bio }`
- **后端现状**：✅ 已实现（`UpdateProfileDTO.bio` → `UserService.updateProfile`）
- **结论**：✅ 已实现

### 7. 技能标签

- **后端现状**：已有 `user_skills` 表与 `GET /api/users/me/skills`、`PUT /api/users/me/skills`
- **前端现状（已接线）**：加载在 [refreshProfile() L9001](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L9001)（`apiGet('/api/users/me/skills')`）；
  保存在 [saveSkills()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4981-L4984)（`apiPut('/api/users/me/skills')`）
- **结论**：✅ 已实现且已接线，刷新不再丢失
  > 原文判为"❌ 缺失 / 无技能标签表、无相关接口"，该结论已失效。

### 8. 互评记录（收到的评价 / 平均分 / 评价列表）

- **后端现状**：已有 `RatingService` 与 `GET /api/users/me/ratings`（含均分）、`POST /api/tasks/{id}/rate`、
  `PUT /api/users/me/ratings/{id}/reply`（回复评价）
- **前端现状（已接线）**：[ensureReceivedRatings()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4743-L4746) 拉取列表；
  提交评价 [submitRating()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4427) 已带 `taskId` + `rateeId`
  （[L4438](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4438) / [L4460](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L4460)）
- **结论**：✅ 已实现且已接线（原 `renderMyRatings()` 已由 `ensureReceivedRatings()` 取代）
  > 原文判为"❌ 缺失 / 无 entity、mapper、service、controller"，该结论已失效。

### 9. 蛋蛋币明细（明细记录 Tab）

- **前端调用**：[renderPointLogs()](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L9088) → `GET /api/users/me/point-logs?page=1&size=50`
- **后端现状**：[UserController.pointLogs()](file:///d:/code/projects/all/backend-handoff-package/backend/src/main/java/com/eggworld/controller/UserController.java#L70-L76) 已实现分页查询
- **结论**：✅ 已实现

### 10. 等级与参数说明

- **前端现状**：纯静态说明 + 基于 `USER.exp` 本地计算称号（等级阈值定义在 [growth-schoolv3.html L3819](file:///d:/code/projects/all/backend-handoff-package/growth-schoolv3.html#L3819)）
- **后端现状**：无接口依赖
- **结论**：✅ 无需改动

---

## 三、原「待办汇总」的复核结果（2026-09-14）

### 原「后端已实现」—— 全部维持

| 能力 | 接口 | 现状 |
|------|------|------|
| 评价查询 | `GET /api/users/me/ratings` | ✅ |
| 评价提交 | `POST /api/tasks/{id}/rate` | ✅ |
| 排名数据 | `GET /api/users/me` 追加 `rank` / `total` | ✅ |
| 技能标签 | `GET/PUT /api/users/me/skills` | ✅ |

### 原「后端待实现（剩余）」—— 复核后

| 原条目 | 复核结果 |
|--------|---------|
| P2 邀请好友 | ✅ **已实现**：`invite_records` 表 + `GET /api/users/me/invites` + 奖励逻辑 |
| P2 邮箱修改 | ⚠️ **仍未处理** → 见第二节第 5 项，已登记 `TODO/TODO.md` 第 7 条 |

### 原「前端需接线」—— 复核后 4/5 已接线

| 模块 | 复核结果 |
|------|---------|
| 切换角色 / 修改 MBTI | ✅ 已接线（`applyCharSwitch()` + `PUT /api/users/me { mbtiType }`） |
| 个人资料邮箱 | ⚠️ 仍提交 `email`（后端静默忽略，待处理） |
| 互评记录 | ✅ 已接线（`ensureReceivedRatings()`） |
| 技能标签 | ✅ 已接线（`GET` 加载 + `PUT` 保存） |
| 评价提交 | ✅ 已接线（已带 `taskId` + `rateeId`） |

### ⚠️ 已删除的误导性提示（防误操作）

原文有一段："`user_skills` 为新表，若数据库已初始化需手动执行新增建表语句（见 init.sql 第 12 节），**或重新导入 init.sql**。"

**该做法会造成清库**：`init.sql` 含 `DROP TABLE`，按
[PROJECT_RULES.md](../PROJECT_RULES.md) 的规定，**线上库禁止执行 `init.sql`**。
数据库变更请用增量脚本 `backend/sql/migrate-*.sql`（清单见 [docs/backend-handoff.md](../docs/backend-handoff.md) 第四节）。

---

## 四、结论

- 本文原列的后端缺口**已全部补齐**，仅剩「个人资料邮箱」1 项待决策。
- 本文的"缺口清单"使命基本结束；后续若再核对页面与接口的差异，建议直接以
  [docs/backend-handoff.md](../docs/backend-handoff.md)（接口唯一权威）为基准，避免第三份清单再次过时。
