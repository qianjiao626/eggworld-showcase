# 任务认领模型 · 详细测试用例

> 初稿日期：2026-08-30；组队资金断言更新：2026-09-15
> 本文是测试说明，不代表已执行；本批实测结果见 `team-security-report.md`。业务拒绝沿用 HTTP 200 + JSON code=400。
> 覆盖：教学/求助/组队三类任务的蛋蛋币流转、组队固定出资与到期退还80%、配对限制、取消退款
> 工具：Postman（验证码用例已有，注册按现流程）
> 所有建号、改时间及 SQL 仅限隔离本地测试数据库，禁止向生产执行。

---

## 一、前置条件

1. 已执行 [init.sql](file:///d:/code/projects/all/backend-handoff-package/backend/sql/init.sql) 迁移段（`invite_records` 表 + `invite_code` 唯一索引）
2. 后端已重启（JDK 17），前端已硬刷新
3. 管理员账号已存在：`admin@eggworld.com / admin123`
4. 准备 4 个测试账号（每个初始 100 币），可用随机邮箱注册：

| 账号 | 邮箱 | 用途 |
|------|------|------|
| PubA | `puba_xxx@test.com` | 发布者 |
| ClaimB | `claimb_xxx@test.com` | 认领者 B |
| ClaimC | `claimc_xxx@test.com` | 认领者 C |
| ClaimD | `claimd_xxx@test.com` | 认领者 D（名额测试用） |

每个账号注册一次（`POST /api/auth/register`，含验证码）。

## 二、公共步骤（每个用户执行一次）

1. 登录拿 token：`POST /api/auth/login`，body：

```json
{ "email": "puba_xxx@test.com", "password": "test123456" }
```

2. 后续所有请求带 Header：`Authorization: Bearer <token>`
3. 查询当前余额：`GET /api/users/me`（响应 `data.points`）

---

## 场景 1：教学任务 —— 认领者付费给发布者（修复回归）

**目的**：验证发布教学任务**不冻结**发布者币（此前 bug：发布冻结+取消退回=白干）

**步骤**（PubA 发布，ClaimB 认领）：

| # | 角色 | 请求 | Body / 说明 |
|---|------|------|------------|
| 1 | PubA | `POST /api/tasks` | 见下方① |
| 2 | Admin | `POST /api/admin/tasks/{id}/approve` | 审核通过 |
| 3 | ClaimB | `POST /api/tasks/{id}/claim` | 认领 |
| 4 | PubA | `GET /api/tasks/{id}/claimers` | 取 ClaimB 的 claimerId |
| 5 | PubA | `POST /api/tasks/{id}/pair` | `{"claimerIds":[<ClaimB的id>]}` |
| 6 | ClaimB | `POST /api/tasks/{id}/submit` | 提交完成 |
| 7 | PubA | `POST /api/tasks/{id}/confirm` | 确认完成 |

① 发布教学任务：

```json
{
  "title": "【测试】高数辅导1小时",
  "description": "教一次高数期末重点",
  "taskType": "teach",
  "skillCategory": "study",
  "skillSub": "高数",
  "reward": 10,
  "claimMode": "single",
  "contact": "wx:pubA"
}
```

**断言**：

| 检查点 | 期望 |
|--------|------|
| 步骤 1 后 PubA 余额 | **100（不变，不冻结）** ← 本次修复核心 |
| 步骤 6 后 ClaimB 余额 | 100 − 10 = **90** |
| 步骤 6 后 PubA 余额 | 100 + 10 = **110** |
| 步骤 7 后余额 | 不再变化 |
| 任务状态 | `completed` |
| PubA / ClaimB 经验值 | 各 +1 |

**验证 SQL**：

```sql
SELECT id, title, task_type, reward, status FROM tasks WHERE title LIKE '【测试】高数辅导%';
SELECT user_id, type, delta, balance, label FROM point_logs ORDER BY id DESC LIMIT 6;
```

期望 point_logs 关键两条：ClaimB `spend -10`、PubA `earn +10`，且**没有** PubA 的 `freeze -10`。

---

## 场景 2：求助任务 —— 发布者悬赏给认领者

**目的**：验证求助任务发布者出资、完成者获得

**步骤**（PubA 发布，ClaimB 认领）：

```json
{
  "title": "【测试】求带Python作业",
  "taskType": "help",
  "skillCategory": "study",
  "skillSub": "Python",
  "reward": 20,
  "claimMode": "single",
  "contact": "wx:pubA"
}
```

流程同场景 1（发布 → admin 审核 → ClaimB 认领 → PubA 配对 → ClaimB 提交 → PubA 确认）。

**断言**：

| 检查点 | 期望 |
|--------|------|
| 发布后 PubA 余额 | 100 − 20 = **80（冻结悬赏）** |
| 确认后 ClaimB 余额 | 100 + 20 = **120** |
| 确认后 PubA 余额 | **80（不变，冻结已释放给认领者）** |
| 任务状态 | `completed` |

---

## 场景 3：组队任务 —— 每人出资 10、到期退 8

**目的**：验证组队多人配对、忽略外部 reward、原 3 天互评期到期退 80%

**步骤**（PubA 发布组队，B、C 报名，配对选 2 人）：

```json
{
  "title": "【测试】组队刷四六级听力",
  "taskType": "team",
  "skillCategory": "hobby",
  "skillSub": "英语四六级",
  "reward": 30,
  "claimMode": "multiple",
  "maxClaimers": 2,
  "contact": "wx:pubA"
}
```

| # | 角色 | 请求 | Body / 说明 |
|---|------|------|------------|
| 1 | PubA | `POST /api/tasks` | 发布，reward 归一为 10，冻结 10 |
| 2 | Admin | `POST /api/admin/tasks/{id}/approve` | 审核 |
| 3 | ClaimB | `POST /api/tasks/{id}/claim` | 报名 |
| 4 | ClaimC | `POST /api/tasks/{id}/claim` | 报名 |
| 5 | PubA | `GET /api/tasks/{id}/claimers` | 取 B、C 的 id |
| 6 | PubA | `POST /api/tasks/{id}/pair` | `{"claimerIds":[<B>, <C>]}` ← 多选 |
| 7 | ClaimB | `POST /api/tasks/{id}/submit` | 团队整体提交 |
| 8 | PubA | `POST /api/tasks/{id}/confirm` | 确认完成 |

**断言**：

| 检查点 | 期望 |
|--------|------|
| 发布后 PubA 余额 | 100 − 10 = **90** |
| 配对后 ClaimB、ClaimC 认领状态 | 均 `in_progress`（`GET /api/tasks/{id}/claimers`） |
| 步骤 7（B 提交）后 C 的状态 | 也变 `submitted`（团队整体提交） |
| 确认后 ClaimB 余额 | 100 − 10 = **90**（配对冻结；确认时不退款） |
| 确认后 ClaimC 余额 | 100 − 10 = **90**（确认时不退款） |
| 确认后 PubA 余额 | **90** |
| 3 天互评期到期、调度结算后 A/B/C | 各 **98**；各有一条 refund +8，settled=1 |
| 任务状态 | `completed` |
| B、C 经验值 | 各 +1 |

---

## 场景 4：组队外部金额不能改变出资与退款

同场景 3，分别传 reward=31、9999。两次均落库 reward=10，A 发布冻结10，B/C 配对各冻结10；确认后余额各90，互评期到期各退8，余额各98。分别覆盖不互评、5分、1分，退款一致，1分仍降低口碑。reward=10001 应返回业务 code=400。

---

## 场景 5：组队报名满员拦截

**目的**：验证 maxClaimers 上限

**步骤**：复用场景 3 的任务（maxClaimers=2，B、C 已报名），ClaimD 再报名。

**断言**：`POST /api/tasks/{id}/claim`（D）→ `400`，msg=`报名人数已满`。

---

## 场景 6：教学/求助强制单选

**目的**：验证非组队任务配对不能多选

**步骤**：教学任务有 2 个认领者（可另开任务让 B、C 都认领），PubA 配对传 2 个 id。

**断言**：`POST /api/tasks/{id}/pair` `{"claimerIds":[<B>,<C>]}` → `400`，msg=`该任务只能选择一位认领者`。

---

## 场景 7：组队超选拦截

**目的**：验证组队配对人数不超过 maxClaimers

**步骤**：maxClaimers=2 的任务有 3 人报名（B、C、D），pair 传 3 个 id。

**断言**：`400`，msg=`选择人数超过最大认领人数`。

---

## 场景 8：取消任务退款（求助/组队退，教学不退）

**目的**：验证取消退款只针对冻结过的任务类型

**子场景 A（求助）**：

| # | 步骤 | 期望 |
|---|------|------|
| 1 | PubA 发布 help（reward=20） | 余额 80 |
| 2 | PubA `POST /api/tasks/{id}/cancel` | 成功 |
| 3 | 查余额 | **100（退回冻结 20）** |

**子场景 B（教学）**：

| # | 步骤 | 期望 |
|---|------|------|
| 1 | PubA 发布 teach（reward=10） | 余额 **100（不冻结）** |
| 2 | PubA `POST /api/tasks/{id}/cancel` | 成功 |
| 3 | 查余额 | **100（无冻结无需退）** |

**验证 SQL**：

```sql
SELECT type, delta, label FROM point_logs WHERE user_id=<PubA> AND task_id=<id> ORDER BY id;
```

---

## 场景 9：自动退回定时任务（可选）

**目的**：验证 3 天无人认领自动退款（help/team）

**步骤**：

```sql
-- 把 help 任务创建时间改为 3 天前（模拟超时）
UPDATE tasks SET created_at = DATE_SUB(NOW(), INTERVAL 4 DAY) WHERE id = <任务id>;
```

等待定时任务执行（每小时扫描一次，或重启后端观察日志），或手动触发。

**断言**：任务状态 → `expired`；PubA 余额 help +reward / team +10（`refund` 流水）；**teach 任务不会被扫描**（不涉及）。

---

## 三、全场景资金汇总表

| 场景 | 发布者 PubA | 认领者 B | 认领者 C |
|------|------------|---------|---------|
| S1 教学 reward=10 | 100→110 (+10) | 100→90 (−10) | — |
| S2 求助 reward=20 | 100→80 (冻结) | 100→120 (+20) | — |
| S3 组队 reward=30（存为10） | 100→90→98 | 100→90→98 | 100→90→98 |
| S4 组队 reward=31/9999（存为10） | 100→90→98 | 100→90→98 | 100→90→98 |

> 注：每场景建议用全新任务，账号余额可复用累计；也可每个场景注册新账号保证绝对干净。

## 四、常见失败排查

| 现象 | 原因 |
|------|------|
| 组队第 2 人报名报"已被认领" | 发布时漏了 `claimMode:"multiple"`（不传默认 single） |
| 配对报"该认领者不存在或不可配对" | 认领者状态不是 `pending_pairing`（已被处理过） |
| teach 发布后余额少了 | 后端未重启，还是旧逻辑（冻结所有类型） |
| 前端配对提示奇怪 | 未硬刷新，前端还是旧版 `claimerId` 传参 |
