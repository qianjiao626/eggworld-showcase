# 方案与实现记录 · 管理端用户列表「邀请人数」与按邀请数排序

> 关联：[PR #13](https://github.com/2795895564/eggworld/pull/13)、[迁移文档](../../releases/迁移文档/2026-09-14_管理员用户列表邀请人数与按邀请数排序.md)、
> [PROJECT_RULES.md](../../PROJECT_RULES.md) 2.1 / 2.3
> 状态：**Phase 1 已实现**（后端 + 前端 + 测试）；Phase 2 见第五节

## 一、需求

管理后台「用户管理」页能查看**每个用户邀请了多少人**，并**按这个数排序**（找出拉人最多的用户）。

## 二、现状勘察（实现前的事实）

| 层面 | 事实 |
|---|---|
| 数据 | 已有 `invite_records(inviter_id, invitee_id UNIQUE, status ENUM('pending','rewarded'), reward, created_at, rewarded_at)`，索引 `uk_invitee`、`idx_inviter` → 按邀请人聚合**可走索引，无需新索引** |
| 口径 | 详情弹窗（`AdminService.overview`）已算 `inviteCount = COUNT(status='rewarded')`，注释为"成功邀请注册人数（邀请奖励已发放）"→ **复用同一口径**，避免列表与详情打架 |
| 接口 | `GET /api/admin/users?keyword&createdFrom&page&size` → `Page<AdminUserVO>`；排序写死 `created_at DESC` |
| 前端 | `#page-users` 为定宽 7 列表格 + 横向滚动；`renderUsers()` 一次拉 `page=1&size=100`，无排序、无分页控件；搜索框未接 `keyword` |
| ⚠️ 隐蔽依赖 | 用户表格布局实际由 **`js/user-actions.js` 运行时注入的样式**决定（`width:100% + min-width:1080px` + 逐列 `flex-basis`）→ 加列必须同时改这个文件，否则新列被压成 16px（实测踩到） |

## 三、Phase 1 实现（已交付）

### 3.1 口径

| 字段 | 含义 | 展示 |
|---|---|---|
| `inviteCount` | `status='rewarded'` 条数 = **有效邀请**（被邀请人已发布首个任务、奖励已发） | 列主数字，排序依据 |
| `invitePendingCount` | `status='pending'` 条数 = **待发**（已注册未激活） | 主数字下一行小字「待发 N」，`0` 时不显示 |

### 3.2 后端

- **`AdminUserMapper`（新增）**：注解式 `@Select` 分页查询，一条 SQL 同时完成
  「过滤 → 按派生表聚合邀请数 → 排序 → 分页」：
  - `LEFT JOIN (SELECT inviter_id, SUM(status='rewarded') rewarded, SUM(status='pending') pending FROM invite_records GROUP BY inviter_id)`
  - 显式列名（**不含 `password_hash`**）；原生 SQL 绕开 MyBatis-Plus 的逻辑删除，故显式写 `u.deleted = 0`
  - `ORDER BY` 用 `<choose>` 白名单切换，**每种排序都带次级键 `u.created_at DESC`**（否则同分页会重复/漏行）
- **排序参数白名单**（`AdminService.normalizeUserSort`）：只放行 `invite_desc` / `invite_asc`，其余（含空、含注入串）一律回落 `created_desc` → 外部字符串**永不直接进 SQL**
- 关键词：全空白按"不筛"处理并 `trim()`（与前端搜索框留空语义一致）
- 接口：`GET /api/admin/users` 新增 `sort`（默认 `created_desc`，向后兼容）
- 权限不变：仍是 `@AdminOnly`（副管理员看不到本页）

### 3.3 前端

- 表格新增「邀请」列（90px），主数字 + 可选「待发 N」；点数字打开该用户详情弹窗
- 排序入口两个、共享同一状态：筛选行 chip「按注册时间 / 按邀请数 ▼」+ 表头「邀请」可点击；
  重复点「按邀请数」在 降序 ↔ 升序 切换，chip 文案与表头箭头（▼/▲）同步
- `renderUsers()` 请求带 `&sort=`；**服务端排序**（不是只排当前页，避免"看起来最高的其实在第 2 页"）
- 布局：`growth-schoolv3.html` 的 `.c-invite{width:90px}` + `js/user-actions.js` 注入样式新增
  `.c-invite{flex:0 0 90px}` 且行宽保底 `min-width` 1080 → **1170px**

### 3.4 测试与验证

- 后端：`AdminServiceListUsersTest`（新增 4 例）= 排序白名单回落（含注入串）/ invite 排序透传 /
  空白关键词 → null 且关键词 trim / 分页与 `createdFrom` 透传 + 返回记录含邀请数字段；`mvn -o test` **20/20 通过**
- 前端：`node --test tests/*.cjs` **49/49 通过**
- 浏览器实测（本地静态服务 + 注入模拟数据，管理页需管理员登录 + 无本地后端）：
  - 桌面 1190px：行宽 1170、列宽 `220/200/160/80/160/**90**/110/150`、邀请列文本 `37 人`+`待发 5`、
    操作列装饰（`查看 封禁 ⋯`）未受影响、页面横向溢出 0（表格内部可横滑）
  - 排序交互：初始 `created_desc` → 点「按邀请数」`invite_desc` → 再点 `invite_asc`（箭头 ▲）→ 点「按注册时间」回 `created_desc`；点邀请数字能打开详情弹窗
  - 移动端 360 / 390 / 430（iframe 定宽）：**页面横向溢出 0**，表格在表内横滑，邀请列 90px
- 未验证项：SQL 的 ORDER BY / 聚合语义（单测无数据库）；真实登录态下的观感与真数值

## 四、为什么不用别的做法

| 方案 | 结论 |
|---|---|
| 前端排序（只排当前页 100 条） | ❌ 会给出错误印象；且换页后失效 |
| 给 `users` 加 `invite_count` 计数字段 | ❌ 引入结构变更 + 回填 + 一致性维护，收益不足（本次明确不动数据库） |
| 先查用户页、再批量查计数、Java 内排序 | ⚠️ 可行（等价契约），但排序需全量取数、内存分页；数据量上去会退化 → 作为备选，未采用 |
| 派生表 LEFT JOIN 聚合 + SQL 排序（**采用**） | ✅ 一条查询、走 `idx_inviter`、分页与排序都在 SQL 层、接口形状不变 |

## 五、Phase 2 可选（未做）

1. 列表分页控件（当前固定前 100 条）
2. 搜索框接后端 `keyword`（接口已支持），实现「搜某人 → 看他的邀请数」闭环
3. 详情弹窗内列出「他邀请的人」（含激活状态与时间）
4. 导出 CSV / 邀请榜排行（与「神蛋榜单」打通）
5. 若用户量增长到万级：改走"分页用户 + 批量计数 + 数据库侧排序键"或加 `(inviter_id, status)` 复合索引（需单独授权 + `migrate-*.sql`）
