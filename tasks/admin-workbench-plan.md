# 管理员工作台改造方案（施工文档）

> 目标：把当前只有 2 张 KPI 卡的「工作台」升级为**数据监控型仪表盘**，并新增**学生端页面点击量**采集与热度排行。
> 施工方式：按本文档第 7 节任务清单逐项实施，每项完成后勾选。

---

## 1. 背景与现状

`page-dashboard`（[growth-schoolv3.html](../growth-schoolv3.html) 第 1717–1737 行）目前仅有：

- 面包屑 + 搜索 + 铃铛
- 标题行 +「待审核」「发布任务」两个按钮
- 2 张 KPI 卡：待审核任务数、待处理反馈数

后端无任何聚合统计接口，页面点击量**零埋点**（无表、无接口、`go()` 内无上报）。

## 2. 范围界定

**做：**

- 新增聚合统计接口 `GET /api/admin/stats`
- 新增页面浏览埋点：表 + 公开写接口 + 前端上报
- 重写工作台页面：KPI 条 + 趋势 + 任务分布 + 资金 + 风险治理 + 页面热度排行
- 图表采用**本地化 Chart.js**（运行时零外网请求）
- 视觉升级为「专业仪表盘感」，但保留站点既有色板与圆角语言

**不做：**

- 不统计管理端页面点击
- 不统计未登录访客
- 不记录停留时长
- 不改动用户管理 / 审核中心 / 反馈工单 / 官方任务等既有页面

## 3. 数据口径定义

### 3.1 通用前提

- 「学生」= `users.role = 'student'`，且 `users.deleted = 0`
- 「待处理工单」= `feedback_tickets.status = 'open'`（注意：不是前端筛选用的 `pending`，前端 `filterFbTickets('pending')` 已做 `open → pending` 映射）
- 时间范围参数 `range`：`today` / `7d` / `30d`

### 3.2 指标清单

| 板块 | 指标 | 口径 | 是否随 range 变 |
|---|---|---|---|
| 运营 | 注册蛋蛋 | 学生计数 | 否（快照） |
| 运营 | 今日新增 | `users.created_at >= 今日 00:00` | 否（快照） |
| 运营 | 副管理员数 | `users.sub_admin = 1` | 否 |
| 任务 | 待审核 | `tasks.status='pending' AND deleted=0` | 否 |
| 任务 | 进行中 | `tasks.status='in_progress'` | 否 |
| 任务 | 已完成 | `tasks.status='completed'` | 否 |
| 任务 | 待配对 | `task_claims.status='pending_pairing'` | 否 |
| 任务 | 已提交待确认 | `task_claims.status='submitted'` | 否 |
| 任务 | 区间内发布 | `tasks.created_at` 落在 range 内 | 是 |
| 任务 | 完成率 | `completed / (completed + cancelled + expired)`，分母为 0 时返回 0 | 否 |
| 任务 | 异常量 | `rejected + cancelled + expired` | 否 |
| 资金 | 流通总量 | `SUM(users.points) WHERE deleted=0` | 否 |
| 资金 | 区间发放 | `SUM(delta) WHERE created_at∈range AND type IN ('earn','reward')` | 是 |
| 资金 | 区间支出 | `SUM(-delta) WHERE created_at∈range AND type='spend'` | 是 |
| 资金 | 冻结中 | `SUM(tasks.reward) WHERE status IN ('pending','approved','in_progress')` + `SUM(gossip_posts.bounty) WHERE coin_status='frozen' AND deleted=0` | 否 |
| 风险 | 已封禁 | `users.banned = 1` | 否 |
| 风险 | 待处理工单 | `feedback_tickets.status='open'` | 否 |
| 风险 | 待处理举报 | 同上 + `type='report'` | 否 |
| 风险 | 被隐藏评价 | `ratings.visible = 0` | 否 |
| 风险 | 黑榜吐槽 | `COUNT(school_complaints)` | 否 |
| 趋势 | 新增用户 | 按 bucket 分组计数 | 是 |
| 趋势 | 发布任务 | 按 bucket 分组计数 | 是 |
| 页面热度 | PV | `COUNT(*) GROUP BY page_key` | 是 |
| 页面热度 | UV | `COUNT(DISTINCT user_id) GROUP BY page_key` | 是 |

### 3.3 趋势分桶规则

- `range=today` → 24 个桶，按小时（`HOUR(created_at)`）
- `range=7d` → 7 个桶，按天（`DATE_FORMAT(created_at,'%m-%d')`）
- `range=30d` → 30 个桶，按天

无数据的桶补 0，保证前端折线连续。

### 3.4 点击量口径

- **统计对象**：已登录、`role='student'` 的用户，在学生端页面之间的切页
- **排除**：`admin` / `subadmin` 自身操作、未登录访客、管理端页面（`ADMIN_PAGES`）
- **PV**：每次 `go(pageKey)` 成功切页记 1 次（同一页面重复进入重复计）
- **UV**：同一用户在 range 内进入同一页面只计 1 次（`COUNT(DISTINCT user_id)`）

### 3.5 前端页面名映射（前端维护，后端只存 key）

| page_key | 名称 |
|---|---|
| plaza | 技能变现 |
| teamplaza | 组队共创 |
| helpplaza | 求助中心 |
| rankhall | 神蛋榜单 |
| gossip | 八卦吃瓜 |
| blacklist | 大学黑榜 |
| mytasks | 我的任务 |
| publish | 发布任务 |
| profile | 我的信息 |

---

## 4. 后端设计

### 4.1 新表 `page_views`

新增文件 `backend/sql/migrate-page-views.sql`，并同步追加到 `backend/sql/init.sql`（表数 16 → 17）。

```sql
CREATE TABLE IF NOT EXISTS page_views (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT NULL COMMENT '浏览用户（当前仅记录登录学生，保留 NULL 以兼容游客）',
  page_key   VARCHAR(32) NOT NULL COMMENT '页面标识：plaza/rankhall/...',
  role       VARCHAR(16) NULL COMMENT '记录时的角色：student',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_page_time (page_key, created_at),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生端页面浏览记录（工作台热度榜数据源）';
```

### 4.2 埋点接口

`POST /api/track/page`，请求体 `{ "pageKey": "plaza" }`。

约束：

- **匿名可调**：`JwtInterceptor` 中把该路径加入"解析登录态但不强制"的分支（与八卦/吐槽榜等匿名读接口同策略），游客调用返回 200 而非 401
- 只有 `role='student'` 且已登录时才落库，其余（游客 / admin / subadmin）**静默丢弃**
- `pageKey` 必须命中后端白名单（上表 9 个 key），非法值静默丢弃
- 单条 insert，失败不影响前端（前端 fire-and-forget）
- 返回 `Result.ok()`

安全说明：不信任前端传入的任何身份信息，`user_id` 一律从 JWT 上下文（`UserContext.userId()`）取。

数据一致性：`page_views` **不建 users 外键**（与 `user_likes` 同策略），用户注销时由
`UserPurgeMapper.deletePageViews` 在 `AdminService.deleteUser` 中显式清理。

### 4.3 统计接口

`GET /api/admin/stats?range=today|7d|30d`，`range` 缺省 `7d`，非法值按 `7d` 处理。

权限用 `@ModeratorOnly`（副管理员也要看工作台），但**服务端按角色裁剪**：
仅主管理员（`isAdmin`）才会收到 `overview / coin / risk / pageViews`，副管理员只下发
`task / trend`。不依赖前端隐藏，避免副管理员绕过界面读受限数据。

### 4.4 VO 结构

```java
AdminStatsVO {
  OverviewVO   overview;   // totalUsers, todayNewUsers, subAdminCount
  TaskStatsVO  task;       // pendingReview, inProgress, completed, abnormal,
                           // pendingPairing, submitted, publishedInRange, completionRate
  CoinStatsVO  coin;       // circulating, issuedInRange, spentInRange, frozen
  RiskStatsVO  risk;       // bannedUsers, openTickets, openReports,
                           // hiddenRatings, complaints
  TrendVO      trend;      // labels[], newUsers[], publishedTasks[]
  List<PageViewStatVO> pageViews; // pageKey, pv, uv（按 pv 降序）
}
```

实现落地说明（与初稿的差异）：

- `PageViewStatVO` 与 `CountBucketVO` 作为**独立顶层 DTO** 放在 `dto` 包，前者同时用作
  `AdminStatsMapper` 的聚合返回类型，避免 Map 松散结构
- `OverviewVO / TaskStatsVO / CoinStatsVO / RiskStatsVO / TrendVO` 为 `AdminStatsVO` 内部类
- `risk` 不含 "冻结中的打听悬赏条数"：该指标与 `coin.frozen` 语义重复，按第 3.2 节指标清单
  只保留 `coin.frozen`（金额）
- `completionRate` 使用 `Double`，值域 0–100，保留 2 位小数；分母为 0 时返回 `0.0`
- `abnormal = cancelled + expired`（`rejected` 任务已退回冻结币，不属于"已通过后的失败"）

### 4.5 实现要点

- 新增 `PageView` 实体 + `PageViewMapper`（`extends BaseMapper<PageView>`）
- 聚合查询用 MyBatis 注解式 `@Select`（与 `UserMapper.selectByIdForUpdate` 保持一致，项目**无 mapper XML**）
- 按天/按小时分组趋势、PV/UV 分组统计需自定义 `@Select`
- 统计逻辑建议新增 `AdminStatsService`，避免 `AdminService` 继续膨胀
- 完成率返回 `BigDecimal` 保留 4 位或在 VO 中返回 0–100 的 `Double`，前端统一按百分比展示

---

## 5. 前端设计

### 5.1 文件组织

沿用项目既有约定（`js/` 下外联 JS，避免主文件继续膨胀）：

- 新增 `js/admin-workbench.js`：工作台渲染、range 切换、埋点上报、图表初始化
- 新增 `js/chart.umd.min.js`：Chart.js 本地副本
- `growth-schoolv3.html` 中：
  - `<head>` 内 `<script src="js/chart.umd.min.js"></script>`（**放在 `js/admin-workbench.js` 之前**）
  - `<head>` 内 `<script src="js/admin-workbench.js"></script>`
  - 重写 `page-dashboard` 的 section 结构（仅保留容器骨架，内容由 JS 渲染）
  - [go(id)](../growth-schoolv3.html) 内加一行埋点调用

### 5.2 页面结构

```
page-dashboard
├── topbar        面包屑 · range 切换(今日/7日/30日) · 刷新 · 铃铛
├── title-row     标题 + 「待审核」「发布任务」按钮（保留）
├── ① kpi-row     6 张快照卡：注册蛋蛋 / 今日新增 / 流通蛋蛋币 / 待审核 / 待处理工单 / 已封禁
├── ② 趋势区      双折线（新增用户 / 发布任务），随 range 变
├── ③ 任务分布    环形图：待审核 / 进行中 / 已完成 / 异常
├── ④ 资金 3 宫格 区间发放 / 区间支出 / 冻结中
├── ⑤ 风险与治理 列表：待处理举报 / 被隐藏评价 / 黑榜吐槽 / 封禁用户
└── ⑥ 页面热度    排行榜：页面名 + PV + UV + 占比条，Top1 高亮
```

### 5.3 权限适配

- `USER.role === 'subadmin'`：仅渲染 ①（待审核）、②、③，隐藏资金/风险/热度三块
- `USER.role === 'admin'`：全部渲染
- 前端显隐只是"界面一致性"，真正的权限边界在服务端（见 4.3）：副管理员拿不到受限板块数据
- **必须保留** `applyPendingCount()` / `pendingBadge` 的既有联动，避免破坏侧边导航徽标与「待审核」按钮文案：
  工作台把 `stats.task.pendingReview` 写回全局 `pendingCount` 后调用 `applyPendingCount()`，
  这样侧栏徽标、标题副文案、「待审核」按钮文案与 KPI 卡四处数字保持一致
  （顺带修掉了"未进过审核中心时待审核数显示 0"的既有问题）
- KPI 区域不再使用旧的 `#dashPending` / `#dashFeedback`：六个指标统一由 stats 渲染；
  旧 ID 若不存在，既有 `applyPendingCount` / `updateFeedbackBadge` 里的 `if (el)` 守卫会自动跳过，无需改动主文件

### 5.4 埋点接入

**实现方式**：不修改主 HTML 的 `go()`，而是在 `js/admin-workbench.js` 的 `init()` 里
包装 `window.go`（沿用项目"外联 JS 运行时覆盖、不膨胀主文件"的既有做法）：

```js
window.go = function (id) { origGo.apply(this, arguments); wbTrack(id); if (id === 'dashboard') wbLoad(); };
```

上报条件：`USER.registered === true && USER.role === 'student'` 且 `id` ∈ `STUDENT_PAGES`。

**必须用 `fetch(..., { keepalive: true })`，不能用 `navigator.sendBeacon`**：
本站登录态是 `Authorization: Bearer <token>` 请求头，而 `sendBeacon` 无法设置自定义请求头，
用它上报会导致后端拿不到 token、登录学生被误判为游客而丢弃。`keepalive` 同样能保证
请求在页面卸载后继续发出。

上报失败一律静默（不阻塞切页、不弹错），不做批量缓冲（校园级数据量，单条上报足够简单可靠）。

### 5.5 视觉规范（专业仪表盘感）

| 项 | 规范 |
|---|---|
| 圆角 | 卡片 `12px`（较现有 16–18px 收敛） |
| 卡片 | 白底 + `1px solid #E8E8EF`，**去阴影** |
| 数字 | 主数字 `28px / 700`，`font-variant-numeric: tabular-nums` |
| 板块标识 | 左侧 `2px` 色条：运营蓝 `#4C9FD8` / 任务橙 `#F2B134` / 资金金 `#D4A017` / 风险红 `#FF6B6B` |
| 图标 | 工作台内部用线性 SVG（`stroke-width:1.7`，`fill:none`），emoji 仅保留在侧边导航 |
| 图表 | 单色系，主色 `#4C9FD8`；网格线 `#F0F0F5` 虚线；禁用 3D 与彩虹渐变 |
| 环比 | 中性灰箭头，**不用红绿**（避免与「资金支出=红」语义冲突） |
| 层级 | 标题 `13px/600` 深色 + 副标 `12px var(--muted)` |

### 5.6 现代 Web 最佳实践对照（来自 modern-web-guidance 指南）

**布局（`guides/css/css-layout.md`）**

- 工作台用 **CSS Grid** 定义骨架，KPI 条与卡片网格用 `repeat(auto-fit, minmax(...))`，避免写死列数与媒体查询
- 间距统一用 `gap`，不用子元素 margin
- 长文本容器加 `min-inline-size: 0` 防止 flex 子项溢出
- 用逻辑属性（`inline-size` / `padding-block` 等）

**性能（`guides/performance/interactions-in-complex-layouts.md`）**

- 工作台各区块加容器隔离，减少重绘波及范围：

```css
.wb-block {
  content-visibility: auto;
  contain-intrinsic-size: auto 240px;
}
@supports not (content-visibility: auto) {
  .wb-block { contain: layout style paint; }
}
```

- Chart.js 实例在切换 range 时复用（`chart.data` 更新 + `chart.update()`），**不要每次重建 canvas**

**无障碍（`guides/accessibility/accessibility.md`）**

- 页面热度榜用**语义化表格**：`<caption>` + `<th scope="col">`，让屏幕阅读器可读
- 图表提供等价数据：环形图/折线图旁提供可展开的 `<details>` 数据表（「查看数据表」）
- 装饰性 SVG 加 `aria-hidden="true"`；有意义的图形加 `role="img"` + `<title>`
- 状态不只用颜色区分：封禁/风险等同时给文字标签
- range 切换按钮用 `<button>` + `aria-pressed` 表达选中态
- 保留 `:focus-visible` 可见焦点环
- 数字对比度满足 4.5:1（正文）/ 3:1（大号数字与图标）

**动效（`guides/accessibility/accessibility.md` §10）**

```css
@media (prefers-reduced-motion: reduce) {
  .wb-block, .kpi { animation: none; transition: none; }
}
```

- Chart.js 入场动画在 `prefers-reduced-motion: reduce` 下关闭（`options.animation = false`）

---

## 6. 接口契约示例

`GET /api/admin/stats?range=7d`

```json
{
  "code": 200,
  "data": {
    "overview": { "totalUsers": 128, "todayNewUsers": 6, "subAdminCount": 1 },
    "task": { "pendingReview": 3, "inProgress": 5, "completed": 42, "abnormal": 7,
              "pendingPairing": 2, "submitted": 1, "publishedInRange": 18,
              "completionRate": 85.71 },
    "coin": { "circulating": 8640, "issuedInRange": 320, "spentInRange": 180, "frozen": 260 },
    "risk": { "bannedUsers": 1, "openTickets": 2, "openReports": 1,
              "hiddenRatings": 0, "complaints": 12, "frozenBounties": 4 },
    "trend": { "labels": ["09-06","09-07","09-08","09-09","09-10","09-11","09-12"],
               "newUsers": [2,5,3,8,4,6,6],
               "publishedTasks": [1,3,2,6,3,4,5] },
    "pageViews": [ { "pageKey": "plaza", "pv": 320, "uv": 45 } ]
  }
}
```

---

## 7. 实施任务清单

> 状态：✅ 已完成并验证 ｜ ⬜ 待办（含阻塞说明）

### 阶段一：后端

- [x] T1 新增 `backend/sql/migrate-page-views.sql`，并在 `init.sql` 追加 `page_views` 建表（表数 17 → 18）
- [x] T2 新增 `entity/PageView.java`、`mapper/PageViewMapper.java`
- [x] T3 新增 `dto/AdminStatsVO.java` + `dto/PageViewStatVO.java` + `dto/CountBucketVO.java`
- [x] T4 新增 `dto/TrackPageDTO.java` + `service/PageViewService.java`（白名单 + 角色校验 + 静默丢弃）
- [x] T5 新增 `controller/TrackController.java`，实现 `POST /api/track/page`；`JwtInterceptor` 增加匿名放行分支
- [x] T6 新增 `mapper/AdminStatsMapper.java`（原子聚合 SQL）+ `service/AdminStatsService.java`（分桶/补零/裁剪）
- [x] T7 `AdminController` 增加 `GET /api/admin/stats`
- [x] T8 编译验证：`$env:JAVA_HOME='D:\env\jdk\jdk17'; mvn -q clean compile -DskipTests`
- [x] T8b 附加：`UserPurgeMapper.deletePageViews` + `AdminService.deleteUser` 中显式清理（隐私一致性）

### 阶段二：前端基建

- [x] T9 本地化 `js/chart.umd.min.js`（Chart.js 4.4.1 UMD，205 KB）
- [x] T10 `growth-schoolv3.html` 引入两个新脚本（chart 在前）
- [x] T11 重写 `page-dashboard` 的 HTML 骨架（顶栏 + range 切换 + 六个容器）

### 阶段三：前端逻辑

- [x] T12 `js/admin-workbench.js`：数据拉取 + KPI 渲染
- [x] T13 趋势双折线 + 任务分布环形图（含 `prefers-reduced-motion` 处理、实例复用）
- [x] T14 资金 3 宫格 + 风险与治理列表
- [x] T15 页面热度榜（语义化表格 + 占比条 + Top1 高亮）
- [x] T16 range 切换（今日/7日/30日）与手动刷新
- [x] T17 副管理员权限裁剪
- [x] T18 埋点上报（包装 `window.go`，`fetch keepalive`）
- [x] T19 样式规范落地（圆角/描边/数字/色条/着色，运行时注入）
- [x] T20 图表等价数据表（`<details>`）+ SVG/canvas `role="img"` 标注

### 阶段四：联调验收

- [x] T21 后端接口自测：admin token 请求 `today / 7d / 30d / 非法值`，分桶数 24 / 7 / 30 / 7 全部正确
- [x] T22 埋点负路径验证：游客与 admin 上报均返回 200 且不落库
- [x] T23 PV/UV 聚合验证：造 4 条记录 → `plaza PV=3 UV=2`、`gossip PV=1 UV=1`，按 PV 降序
- [x] T24 埋点正路径验证：学生账号浏览器实测切页 → `POST /api/track/page` 四次全部 200，
      库中新增 plaza/rankhall/gossip/profile 四条；库聚合与 `/api/admin/stats` 返回完全一致
- [x] T25 浏览器端整页验证（实测数据如下，无 JS 报错）
- [x] T26 三处修复 + 复验（见下方「修复记录」）
- [x] T27 数据逻辑与图表重构（见下方「第二轮：指标与图表重构」）
- [ ] T28 第三轮：让数据"有用"（下钻 / 联动 / 资金详情 / 趋势可配置）—— 见下方「第三轮」

### 第三轮：让数据「有用」（设计已定，分批施工）

起因：工作台此前是**纯展示**——8 张 KPI 只有 2 张能点，6 张图全部无下钻，风险列表与热度榜都是死数字。
数据没有替用户缩短"看完之后去哪办事"这一步。

#### 3.1 复核中发现的两个事实问题（必改）

| # | 问题 | 证据 / 结论 |
|---|---|---|
| 1 | **「待配对」对管理员是恒为 0 的死数字** | `ClaimService` 明确：奖励型（官方任务）认领即进行中、无需配对；`pair()` 只允许**发布者**操作。故官方任务不产生 `pending_pairing`，学生任务的配对归学生发布者，不归管理员 |
| 2 | **「净投放」口径算错** | 原定义 `(earn+reward) − spend`。但 `earn/spend` 是同一笔钱的两端（用户间转移），**不改变币总量**；只有 `reward`（平台赠币/充值）才真正增发。反例：A 在窗口内 `earn 50`、B 的 `spend` 在窗口外 → 会算出"净投放 +50"，而平台一分钱没印 |

**修正后的资金口径**

| 指标 | 定义 | 含义 |
|---|---|---|
| 平台投放（区间） | `SUM(delta) WHERE type='reward'` | 平台真正印的币，唯一影响总量与币值的项 |
| 任务流转（区间） | `SUM(delta) WHERE type='earn'` | 用户间转移规模，反映**活跃度**而非资金风险 |
| 冻结中（快照） | 进行中任务悬赏 + 冻结中的打听悬赏 | 托管中的钱 |
| 流通总量（快照） | `SUM(users.points)` | 拆解式：`注册赠币 + 任务/邀请净往来 − 冻结中` |

#### 3.2 下钻与联动清单

| 元素 | 去处 | 成本 | 批次 |
|---|---|---|---|
| 待审核任务 | 审核中心 | 已有 | 1 |
| 官方任务待确认（新口径：奖励型任务中存在 `submitted` 认领的数量） | 官方任务管理（现成「确认完成发币」按钮） | 低 | 1 |
| 待处理工单 | 反馈工单页 | 已有 | 1 |
| 风险·待处理举报 | 反馈工单页 + 自动筛 `report` | 低（复用 `filterFbByType`） | 1 |
| 风险·已封禁用户 | 用户管理 + 自动筛已封禁 | 低（复用 `filterUsers('banned')`） | 1 |
| 注册蛋蛋 | 用户管理 | 已有 | 1 |
| 平台投放 / 任务流转 / 冻结中 | 资金详情弹窗 | 中（2 个新接口） | 1 |
| 技能大类 / 任务类型 | 发官方任务页 + **预填该分类** | 低（`go('newgroup')` + `adminSelectedSkillCat`/`adminTaskType`） | 1 |
| 今日新增 | 用户管理 + 按日期筛 | 中（`/api/admin/users` 加日期参数） | 2 |
| 任务完成率 | 已完成/异常任务列表 | 中（按状态查任务列表） | 2 |
| 页面热度 Top1 | 该页面 PV 明细 | 中（新增接口） | 2 |
| 风险·被隐藏评价 | 隐藏评价列表 | 中（新增接口） | 2 |

「平台健康度」数字（全站待配对 / 待确认提交）按用户要求保留，但不放 KPI 行（会把"一眼看到要处理什么"冲淡），
改放在**任务状态分布块的副文案**里，并明确标注「发布者侧 · 非你待办」。

KPI 改为两组共 7 张：
- **你的待办**（可点）：待审核任务 / 官方任务待确认 / 待处理工单
- **平台概览**（快照）：注册蛋蛋 / 今日新增 / 平台投放 / 任务完成率

#### 3.3 资金详情弹窗（入口：资金概览卡右上「详情」按钮）

| 段 | 内容 | 需要的接口 |
|---|---|---|
| 类型汇总 | 平台投放 / 任务收入 / 任务支付 / 冻结 / 退回，各列笔数与金额 | `GET /api/admin/point-logs/summary?range=` |
| 流水明细 | 分页表格：时间 / 用户 / 类型 / 金额 / 变动后余额 / 关联任务；筛选：类型、时间范围、金额阈值、用户关键词；每条可点进用户详情 | `GET /api/admin/point-logs?type=&start=&end=&minAmount=&keyword=&page=&size=` |
| 冻结清单 | 任务标题 / 发布者 / 金额 / 冻结时间 / **已冻结天数** / 当前状态 | `GET /api/admin/frozen-coins` |

#### 3.4 趋势可配置

- **指标池 8 条**：新增用户、发布任务（已有）；完成任务（`task_claims.completed_at`）、页面 PV（`page_views`）、新增评价（`ratings`）、新增打听（`gossip_posts`）为新增；资金投放、任务流转（口径修正后）
- **属性**：选线 1–3 条 + 累计/增量切换（累计由前端对增量累加，零后端成本）
- **存储**：`localStorage`（key `egg_wb_trend_cfg`），零后端改动
- **接口改造**：`AdminStatsVO.trend` 由固定两个数组改为 `series: [{key, data}]` 八条全返回
  （约 8×30 个数字，几 KB），前端按配置挑线渲染

#### 3.5 施工批次

- [x] **批次 1**：口径修正、KPI 重排（待办 3 + 概览 4）、低成本下钻、发官方任务预填联动、
      趋势可配置（含 series 改造）、资金详情弹窗（3 个新接口 + 2 个新 DTO）
- [x] **批次 2**：今日新增按日期筛、任务完成率→任务列表、页面热度→单页明细、隐藏评价列表

#### 3.7 批次 2 落地清单

**接口**

| 接口 | 权限 | 说明 |
|---|---|---|
| `GET /api/admin/users?...&createdFrom=` | `@AdminOnly` | 用户列表新增注册时间下限（今日新增下钻） |
| `GET /api/admin/tasks?status=&page=&size=` | `@ModeratorOnly` | 任务列表；`status` 支持 `closed`(已完成+异常) / `completed` / `abnormal` / `active` / `pending` / 空=全部 |
| `GET /api/admin/page-views/detail?pageKey=&range=` | `@AdminOnly` | 单页 PV/UV + 按桶趋势 + 访问最多用户 Top10 |
| `GET /api/admin/ratings/hidden?page=&size=` | `@AdminOnly` | 被隐藏的评价（联表带评价关系与任务标题） |

新增 DTO：`PageViewDetailVO`(含 VisitorVO)、`PageViewTotalsVO`、`AdminHiddenRatingVO`；
新增 Mapper：`AdminDetailMapper`。

**前端**

| 项 | 行为 |
|---|---|
| 弹窗框架 | 抽出通用 `ensureModal/showModal/hideModal/renderTabs/pagerHtml/wirePager`，资金/任务/页面/评价四类弹窗共用；ESC 关闭**最上层**弹窗 |
| 全新弹窗 | 任务列表（6 个状态 tab + 分页）、页面热度明细（趋势图 + Top 访问者）、被隐藏的评价（分页） |
| 下钻机制重构 | `pendingDrill` 由「筛选项字符串」改为「回调函数」，可承载复合动作（如清状态+套筛选） |
| 用户管理页 | 注入「仅今日新增」chip；`wbDrillUsers()` 会先清掉该条件，避免从别处过来莫名只剩今天 |
| 热度榜 | 表格页面名与图表条形均可点 → 页面热度明细弹窗 |

**批次 2 接口自测（8081 实例）**

| 项 | 结果 |
|---|---|
| `tasks?status=closed` | total=4，与 `completionBase` 一致；行含标题/类型/状态/悬赏/发布者/认领数 |
| `page-views/detail?pageKey=plaza&range=7d` | pv=3 / uv=1 / 7 桶 / 数列合计 3（与 pv 自洽）/ Top 访问者 1 人（3 次） |
| `ratings/hidden` | total=0（当前确实没有被隐藏的评价，前端显示空态） |
| `users` vs `users&createdFrom=今日` | 全部 4（含管理员，属既有行为）/ 今日 0，与 KPI「今日新增 0」一致 |

#### 3.9 补充：KPI「新增用户」跟随 range

复核时确认的「同屏混用两套时间口径」问题：KPI「今日新增」固定看今天，而下面的趋势/资金按 近 7 日 / 近 30 日，
切换 range 时上面不动下面动，容易误读。

- 后端：`OverviewVO.todayNewUsers` → **`newUsersInRange`**，按 range 窗口计算（今日 / 近 7 日 / 近 30 日）
- 前端：KPI 标题随 range 变为「今日新增 / 近 7 日新增 / 近 30 日新增」，副文案显示实际起止日期（今日仍显示「今日 00:00 起」）
- 下钻一致性：点该卡跳用户管理时，注册时间筛选**同步按 range 设置**（今日 / 近 7 日 / 近 30 日），
  用户管理页的筛选 chip 文案也随之变化（「仅今日新增」/「仅近 7 日新增」/「仅近 30 日新增」）——
  否则点「近 7 日新增」却只筛出今天的用户

#### 3.8 补充：任务状态链补全「等待认领」

复核时发现 `tasks.status='approved'`（审核已通过、已上线、还没人认领）是统计盲区：
任务通过审核后既不显示在「进行中」，也只在有人认领后才重新出现，中间空窗看不到。

- 后端：`TaskStatsVO` 新增 `pendingClaim = COUNT(tasks WHERE status='approved')`
- 前端：KPI「平台概览」组新增**「等待认领」**卡（可点 → 任务列表弹窗，预筛 `approved`）
- 任务列表弹窗状态 tab 增加「等待认领」
- 按要求**不改环形图**（保持 6 段）

补全后任务主状态链：`待审核 → 等待认领 → 进行中 → 待确认 → 已完成 / 异常`。
当前数据下 `approved` 为 0（现有 5 个任务：1 待审核 + 4 已完成），属结构补全。

#### 3.6 批次 1 落地清单

**接口（`/api/admin`，均为 `@AdminOnly`）**

| 接口 | 说明 |
|---|---|
| `GET /point-logs/summary?range=` | 按流水类型汇总（笔数 / 净额 / 规模） |
| `GET /point-logs?range=&type=&minAbs=&keyword=&page=&size=` | 全局流水明细，联表带用户昵称与任务标题 |
| `GET /frozen-coins` | 冻结清单（任务悬赏 + 打听悬赏，含已冻结天数） |

**`/api/admin/stats` 字段变更**

```
coin:   - issuedInRange, spentInRange, netInRange
        + platformIssuedInRange(reward 净额), taskTurnoverInRange(earn 净额)
task:   + officialPendingConfirm（官方任务待确认，管理员真待办）
trend:  由 { labels, newUsers, publishedTasks } 改为 { labels, series[8] }
        series key: newUsers / publishedTasks / completedTasks / pageViews /
                    platformIssued / taskTurnover / newRatings / newGossip
```
注：`coinFlow[]` 字段随「资金流向」独立图表一并移除（并入资金详情）。

**前端交互**

| 项 | 行为 |
|---|---|
| KPI 分组 | 「你的待办」3 张全可点；「平台概览」4 张快照（注册蛋蛋/平台投放也可点） |
| 下钻 | 待审核→审核中心；官方任务待确认→官方任务管理；待处理工单/举报→反馈工单页（举报自动筛 `report`）；已封禁→用户管理（自动筛） |
| 数据→动作 | 技能大类/任务类型分布图**点条形**或数据表「发该类任务」→ 跳发布页并预填分类 |
| 趋势配置 | 8 条指标池 chips 任选 ≤3 条 + 累计/增量切换，配置存 `localStorage: egg_wb_trend_cfg` |
| 资金详情 | 概览卡「详情 ›」→ 弹窗三 tab：类型汇总 / 流水明细（类型+金额+用户筛选、分页、点用户进详情）/ 冻结清单（≥7 天高亮） |
| 平台健康度 | 全站待配对/待确认移到任务状态分布块副文案，标注「发布者侧 · 非你待办」 |

**下钻筛选的实现要点**：目标页数据是异步加载的，若跳转后立即调用筛选会被随后的渲染覆盖。
故采用「登记待用筛选 + 包装目标页 render 函数，在其 Promise resolve 后套用」的方式
（`wrapRenderForDrill`）。

**批次 1 浏览器实测（2026-09-12）**

| 项 | 实测结果 |
|---|---|
| KPI 分组 | 两组标题「你的待办」「平台概览」；7 张卡数值与可点击性与设计一致（待办 3 张 + 注册蛋蛋 + 平台投放可点；今日新增、任务完成率不可点） |
| 下钻·举报 | 点风险行「待处理举报工单」→ 反馈工单页，`[🚨 举报]` chip 变 `active` ✅ |
| 下钻·已封禁 | 点风险行「已封禁用户」→ 用户管理页，`[已封禁]` chip 变 `active` ✅ |
| 下钻·官方任务 | 点 KPI「官方任务待确认」→ 官方任务管理（面包屑正确）✅ |
| 下钻·审核 | 点 KPI「待审核任务」→ 审核中心 ✅ |
| 数据→动作 | 点 canvas 条形**与**数据表「发该类任务 ›」两条路径均生效：跳发布页 + 技能分类选中 + 任务类型「奖励型」选中 ✅ |
| 趋势·选线 | 8 条指标池；默认选中 2 条；第 4 次点击被拒绝并提示「最多同时看 3 条趋势」✅ |
| 趋势·累计 | 切换后数据表变单调不减的累计值 ✅ |
| 趋势·持久化 | 刷新后 `localStorage.egg_wb_trend_cfg` 保留，选线与累计态均被记住 ✅ |
| 范围切换 | 趋势表行数 24 / 7 / 30；平台投放 今日 0 → 7日 +100 → 30日 +200 ✅ |
| 资金详情·汇总 | 5 行类型；近 7 日：平台投放 1笔/+100、任务收入 3笔/+30、任务支付 3笔/-30、冻结与退回 0 |
| 资金详情·流水 | 共 7 条；筛「平台投放」→ 1 条；「重置」恢复；分页控件正常 |
| 资金详情·跳用户 | 点流水行「详情」→ 资金弹窗关闭 + 用户详情弹窗打开 ✅ |
| 资金详情·冻结 | 共 1 条合计 10 币（1 条 >7 天）：asdasd / aaa / 10 / 2026-09-05 / 7 天 / 待审核 |
| ESC 关闭 | 资金详情弹窗可关 ✅ |
| console | 干净加载与全流程**零 error / 零 warning**；37+ 条 `/api` 请求 0 条 4xx/5xx；无 Chart.js 报错 |

复验中发现并已修正的措辞问题：分类分布数据表 caption 原写「共 5 个」，易被误读为 5 个类别
（实际是 3 类 / 5 个任务）。已改为「3 类 / 共 5 个任务」。

复验中确认的**既有问题**（非本次改动引入，未修改）：
- 主站「用户详情」弹窗 `#adminUserModal` 不支持 ESC 关闭（工作台资金弹窗已支持）。
- 主站技能大类 chip 的选中态用内联 `background` 而非 `active` 类，且各类别自带配色（属设计如此）。

### 第二轮：指标与图表重构（2026-09-12）

起因：复核工作台后确认了 5 个数据逻辑问题与「图表太少」。

**修正的指标口径**

| 变更 | 原因 |
|---|---|
| KPI 去掉「流通蛋蛋币」，改为「净投放 = 区间发放 − 区间支出」 | 原指标 ≈ 注册数 × 100（3 学生 290 中 200 为注册赠币），几乎不携带独立信息；净投放直接反映"平台在不在印钱"，是唯一有决策含义的资金指标 |
| 「流通总量」降级到资金板块内，并给出恒等拆解式 | 让数字不再是黑盒：`流通 = 注册赠币 + 任务/邀请净往来 − 冻结中`（当前 300 + 0 − 10 = 290） |
| KPI 补入「待配对」「待确认提交」「任务完成率」 | 前两者是后端已算但前端从未展示的真待办；完成率此前也算而未用 |
| 完成率附分母说明（已完成 x / 已完结 y，y = 已完成 + 异常） | 原「100%」在小样本下易被读成"任务都成功了" |
| KPI 重排为"待办优先"：待审核 / 待配对 / 待确认提交 / 待处理工单 / 注册蛋蛋 / 今日新增 / 净投放 / 完成率 | 让一眼看到"现在要去处理什么" |
| 删除标题行的「待审核」按钮 | 工作台内「待审核」原本有 3 个入口（标题副文案 + 标题行按钮 + KPI 卡），外加侧栏徽标共 4 个；KPI 卡可点击符合看板习惯，标题行按钮与"数据监控"定位冲突 |

**新增图表（2 → 6 张）**

| 图表 | 数据源 |
|---|---|
| 资金流向（发放/支出 双柱，按 range 分桶） | `coinFlow`（新增，point_logs 按天/按小时聚合） |
| 任务类型分布（横向条形） | `taskTypes`（新增，tasks.task_type 快照聚合） |
| 技能大类分布（横向条形） | `skillCategories`（新增，tasks.skill_category 快照聚合） |
| 页面热度横向条形 | 复用既有 `pageViews` |

版式：KPI ×8 → 趋势(2)+状态分布(1) → 资金流向(2)+任务类型(1) → 资金概览(1)+技能大类(1)+风险治理(1) → 页面热度(3)。

**新增/变更的接口字段**

```
coin:  + netInRange, registrationGrant, taskNetFlow
task:  + completionBase
新增:  coinFlow[] (label, issued, spent)   -- 随 range 分桶
新增:  taskTypes[] / skillCategories[]     -- 快照分布，label 为英文 key，文案由前端映射
```

**踩坑记录**

- MySQL 8.4 的 `only_full_group_by` 下，`GROUP BY <SELECT 里的别名>` 对
  `SUM(CASE WHEN ...)` 这类语句会报 `Expression #1 of SELECT list is not in GROUP BY clause`。
  已把所有分桶查询统一改为 `GROUP BY <完整表达式>`（`GROUP BY DATE_FORMAT(created_at, '%m-%d')`）。
  原先只带 `COUNT(*)` 的趋势查询恰好能过，属于侥幸，一并改正以免生产库行为不一致。

### 浏览器实测记录（2026-09-12）

环境：后端重启后跑新代码（8080），前端经本地静态服务打开（`API_BASE` 判定与 `file://` 一致）。

| 项 | 实测结果 |
|---|---|
| KPI 6 张卡 | 注册蛋蛋 3 / 今日新增 0 / 流通蛋蛋币 290 / 待审核 1 / 待处理工单 2 / 已封禁 0 |
| 平台趋势 | canvas 非空白；数据表 7 行（09-06~09-12，新增 0,0,1,0,0,1,0；发布 0,0,1,0,0,0,2），与接口一致 |
| 任务状态分布 | canvas 非空白；待审核 1 / 进行中 0 / 已完成 4 / 异常 0（合计 5） |
| 资金概览 | 近 7 日发放 130 / 支出 30 / 冻结中 10；切到 30 日后发放变 230、标签同步变「近 30 日」 |
| 风险与治理 | 5 行：待处理举报 0 / 待处理工单 2 / 被隐藏评价 0 / 黑榜吐槽 0 / 已封禁 0 |
| 页面热度榜 | 空表占位「该时间范围内暂无浏览记录」（当时库中无埋点数据，符合预期） |
| 范围切换 | 数据表行数 今日 24 / 30日 30 / 7日 7，选中态 `aria-pressed` 正确，状态文案「已更新（…）」正确 |
| console | 页面自身**零报错、零警告** |

埋点正路径实测（学生 `2795895564@qq.com` 浏览器切 4 个页面）：

| page_key | PV | UV |
|---|---|---|
| plaza | 3 | 1 |
| gossip | 2 | 1 |
| profile | 1 | 1 |
| rankhall | 1 | 1 |

四次 `POST /api/track/page` 响应均为 200，库中聚合与接口返回一致。

### 修复记录

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 管理员登录后被新手弹窗的全屏遮罩拦住，工作台内所有点击无反应且无提示 | [info-popup.js](../js/info-popup.js) 的 `maybeShowForFirstLogin` 只按 userId 去重，未排除管理角色 | 增加管理角色跳过（`isAdmin` 已覆盖主/副管理员），且不写"已看过"标记 |
| 2 | 登录弹窗密码框内按 Enter 不提交 | [login-remember.js](../js/login-remember.js) 把输入区包成 `<form>` 时移除了内联 `onkeydown`，改依赖表单隐式提交，该路径在弹窗结构中不可靠 | 移除内联处理器后显式注册 keydown 监听，`preventDefault` 后走 `form.requestSubmit()`，保证只触发一次 |
| 3 | **本次自引入的 bug**：副管理员会看到全为 0 的资金/风险/热度区块 | `USER.isAdmin` 在主站对副管理员**也为 true**（[growth-schoolv3.html](../growth-schoolv3.html#L3125-L3126)），我误用它判断主管理员 | 前端改为按 `role === 'admin'` 严格判断主管理员，与后端 `LoginUser.isAdmin()` 口径对齐 |

复验结果：管理员登录后 `#infoPopupOverlay` **不存在于 DOM**，可立即点击「30日」并生效；密码框回车可提交登录（未点按钮）；学生切页四次上报全部 200。

> 复验过程中浏览器工具自身的两点噪声（非页面缺陷，记录以免误读）：
> 工具的 `browser_click` 点击输入框不会移动 DOM 焦点，需用 `browser_type` 才有真实焦点
> （这也是复验项 1 首次回车"无效"的唯一原因）；工具主动 `location.reload()` 会打断
> 在途请求，产生 `net::ERR_ABORTED`（其中一条正是 `keepalive` 的埋点上报被导航打断）。

---

## 8. 验收标准

1. 工作台展示 6 张 KPI、趋势双折线、任务分布环形、资金 3 宫格、风险列表、页面热度榜
2. range 切换后趋势与页面热度随之变化，KPI 保持当前快照不变
3. `role='student'` 用户切页后 `page_views` 落库；`admin`/`subadmin`/游客不落库
4. 副管理员看不到用户/资金/风险/热度区块
5. 现有侧边导航徽标（待审核、反馈、用户数）与「待审核」按钮文案仍正常
6. 无外网请求（Chart.js 本地加载），断网环境下图表正常渲染
7. 键盘 Tab 可遍历 range 按钮与刷新按钮，且焦点可见
8. `prefers-reduced-motion: reduce` 下无入场动画

## 9. 部署注意事项

- 新增文件 `js/chart.umd.min.js`、`js/admin-workbench.js` 需与 `index.html` 一起上传到 Nginx 的 `/xs/`，**遗漏会导致图表区空白**
- 首次部署前需在生产库执行 `migrate-page-views.sql`
- 生产配置改动（端口 8090、DB 密码、JWT secret）属既有待办，不在本次范围

## 10. 已定默认决策（可推翻）

| 决策 | 取值 | 备注 |
|---|---|---|
| 环比箭头颜色 | 中性灰 | 避免与「资金支出=红」冲突 |
| KPI 是否随 range 变 | 不变（快照） | 只有趋势与热度榜随 range 变 |
| today 趋势分桶 | 按小时 24 桶 | 7d/30d 按天 |
| 埋点是否批量缓冲 | 否 | 单条 sendBeacon，简单可靠 |
| 图表库 | 本地化 Chart.js | 运行时零外网 |
