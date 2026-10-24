# 猫咪公园 · 管理与繁育交互 测试报告（2026-10-10）

- **被测范围**：分支 `feat/cat-park-breeding`（提交 `9847ce3` + 本轮修复）——猫咪公园服务端权威模块（`/api/cat-park` 9 端点）+ 前端 `window.catPark` 社交区
- **测试环境**：本地隔离库（`D:\env\MySQL` 3306 / `eggworld` 库，迁移脚本已应用），后端 `mvn -o spring-boot:run`（8080）；owner 绑定：cat3→u6(test1)、cat4→u9(小帅)、cat5→u10(截止测试生)；u4(aaa) 为发起方
- **结论**：**发现并修复 1 个产品级缺陷 + 1 个接口改进**；修复后三层测试全绿（后端 570/570、前端 432 项 0 失败、端到端 45/45）。业务规则拦截全部生效、状态实时同步、操作全程可回溯。

## 一、需求映射与覆盖范围

| 需求场景 | 实际系统落点 | 覆盖情况 |
|---|---|---|
| 猫咪信息录入（品种/年龄/健康/血统） | 目录猫由迁移 SQL 固定种子（5 只）；个体属性（性别/成熟度/好感度/血统 parentUids）在引擎存档 | ✅ 目录完整性、种子中文编码、血统字段写入均测 |
| 档案查询 | `GET /cats`（品种/性别/归属/好感度/冷却）、`GET .../received`、`GET .../sent` | ✅ |
| 状态更新 | 互动升好感、申请状态流转（pending→accepted/rejected）、领取后代、冷却回写 | ✅ |
| 分类筛选 | stray/owned 两类目录猫 + 前端三 tab（猫咪/待处理/我的申请） | ✅ |
| 繁育配对规则校验 | 好感度≥Lv.2、48h 冷却（目标猫+发起猫双权威）、归属校验、重复 pending 拦截 | ✅ |
| 繁育计划创建 | 繁育申请（`POST .../requests`，返回 requestId） | ✅ |
| 孕期记录 | **差异说明**：本系统繁育为「同意即裁决后代」模型，无独立孕期阶段；孕期语义由 `handled_at`（繁育成功时间）+ 48h 冷却期承载 | ⚠️ 按实际模型测 |
| 幼崽出生登记 | `POST .../claim` 幂等领取 → 前端 `addCatFromPark` 物化进存档（防抖回写服务端） | ✅ |
| 繁育关联关系建立 | `breeding_requests` 全字段留痕（requester/target/uid/offspring/handledAt/claimedAt）；小猫 `parentUids/parentOwnerNames` 写入族谱 | ✅ |

## 二、测试分层与用例矩阵

**第 1 层 · 后端单测**（`CatParkServiceTest`，23 项全过）：好感度阈值与前端对齐、流浪猫领养无前置、自有猫不可领养、Lv.1 拦截、目标猫/发起猫冷却、owner 未绑定、自猫申请、重复 pending、并发同意二次复查、后代裁决、领取越权/未通过/已领取/竞态、每日互动节流。

**第 2 层 · 前端单测**（`cat-park-breeding.test.cjs` 5 项 + 全量 432 项 0 失败）：前后端好感度阈值一致性（防漂移）、park tab 渲染 hook 接线、bridge API 面完整、存档物化必经后端。

**第 3 层 · 端到端**（真实 HTTP，本地库）：
- 基础轮 19 项：5 猫目录 → Lv.1 拦截 → 互动升 Lv.2 → 申请+owner 实时通知 → 越权同意 403 → 同意+后代裁决+发起方结果通知 → 48h 冷却拦截 → 幂等领取 → 流浪猫无前置领养
- 扩展轮 26 项（本轮新增）：
  - 异常：未登录 401、不存在猫/申请 404、空 uid 拦截
  - 边界：owner 对自己猫申请/互动拦截、Lv.1 前置引导文案
  - 冲突：重复 pending 拦截、被拒后重新申请不误伤、同猫并行申请仅第一个同意成功、第二个被冷却复查拦下
  - 一致性：冷却剩余 ∈(40h, 48h+2s]（DATETIME 秒级取整容差）
  - 可回溯：received/sent 含昵称、猫名、handledAt、claimedAt、offspringBreedId
  - 防刷：第 11 次/日互动被上限拦截

## 三、发现的问题与处置

### P1（产品缺陷，已修复）并发同意被拦后申请永久卡 pending
- **现象**：owner 同意第二个申请被冷却复查拦下后，该申请状态仍是 `pending`（期望 `rejected`）。
- **根因**：`acceptRequest` 冷却失败路径先 `UPDATE status='rejected'` 再 `throw BusinessException`；`@Transactional` 对 RuntimeException 回滚，把 rejected 标记一起吞掉。发起方永远看到「等待回应」，可反复重试同意，形成脏状态。
- **复现**：u4 对 cat5 用两个不同繁育猫各发一申请 → u10 先同意第一个（成功）→ 再同意第二个 → 查 `GET .../received`，第二个仍 pending。
- **修复**：拦下时不抛异常，改为正常返回 `{status:'rejected', blockedByCooldown:true, msg}`（事务提交保留 rejected + 通知发起方）；前端 `doHandle` 识别该返回如实 toast，不再误报「已同意」。
- **回归**：单测 `acceptAutoRejectsWhenTargetCooldownRecheckFails` 改为断言正常返回；e2e [D] 断言 `blockedByCooldown=true` 且 received 中状态为 rejected。**修复后复跑全过。**

### P2（接口改进，已修复）申请创建未返回 requestId
- **现象**：`POST .../requests` 成功响应只有 status/猫名/昵称，发起方无法直接定位自己的申请（前端只能拉列表找）。
- **修复**：插入后同事务回查 pending 申请 id 一并返回；单测补断言。

### P3（测试脚本自身问题，已修，非产品 bug）
- 断言正则 `/等待回应/` 未匹配实际文案「等待**对方**回应」；
- 冷却剩余断言未容忍 MySQL DATETIME 秒级取整（48h 可多 <1s）。

## 四、验证标准逐项核对

| 标准 | 结果 |
|---|---|
| 交互反馈及时 | ✅ 拦截均带明确中文提示（前置引导/冷却剩余/越权）；通知经轮询 15s 内可见 |
| 数据一致性 | ✅ 冷却剩余、等级、申请状态三方（cats/received/sent）一致；余额/存档权威不变 |
| 业务规则拦截生效 | ✅ 好感度门槛、48h 双权威冷却、并发复查、越权、重复申请、每日节流全部实测拦下 |
| 操作结果可回溯 | ✅ 全链路留痕（created/handled/claimed/offspring/双方昵称） |
| 无页面卡顿/数据异常 | ✅ 接口毫秒级返回（行锁 + 覆盖索引）；P1 脏状态修复后无残留 pending |

## 五、遗留与说明
- 浏览器移动端 UI 实测（登录态依赖真实验证码，本地无法注册）未做，留待负责人真机验证；渲染层已由前端单测覆盖接线与 API 面。
- owner 绑定当前为本地测试账号（6/9/10），上线前须按迁移 SQL 使用说明改为真实账号。
- e2e 脚本位于 `output/cat-park-e2e/`（gitignore，本地复跑：重置 `breeding_requests`/`cat_affinity`/`last_breed_time` → 起后端 → `node e2e.cjs` → `node e2e-extended.cjs`）。

## 六、结果汇总
| 层 | 数量 | 结果 |
|---|---|---|
| 后端单测（全量） | 570 | ✅ 0 失败（CatParkServiceTest 23） |
| 前端单测（全量） | 432 | ✅ 0 失败（9 跳过为浏览器专用） |
| 端到端基础轮 | 19 | ✅ 全过 |
| 端到端扩展轮 | 26 | ✅ 全过（修复 P1 后复跑） |
