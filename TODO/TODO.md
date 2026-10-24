# TODO

1、管理员在学生端我的信息页面中的头像为管理员专用头像char-eggy-hermit.jpg

---

## 成就系统（2026-09-18 记录）

9、**成就特效系统已整体抽离下线（待线上执行 SQL 后恢复）**

线上数据库**没有执行** `backend/sql/migrate-achievement.sql`，
`titles` / `achievements` / `user_achievements` / `user_equip` 四张表不存在；
而原实现里 `DecoResponseAdvice`（全局响应增强）与 `UserService` 会在**每次请求**时查这些表，
导致线上接口报错。故整条链路暂时下线。

- **后端**：28 个文件（含测试）已移到 `backend/achievement-pending/`，**不参与编译、不进 jar**；
  各 Service 的 `evaluateAfterCommit` 调用、`UserService` 的 deco 注入、`UserController` 的 `/equip`、
  `AdminService` 注销清理、7 个 VO 的 `deco` 字段均已回退
- **前端**：成就页 DOM/CSS/JS 抽到 `js/achievement-page.css` + `js/achievement-page.js`；
  `js/deco.css` / `js/deco.js` / `js/deco-integration.js` 保留但主文件**不再加载**；
  导航项隐藏、`go('achievements')` 拦住并提示「暂未开放」
- **SQL**：`init.sql` 第 19 节与顶部 4 行 DROP、`migrate-achievement.sql` 整节，均已注释并附说明
- **打包脚本**：`backend/build-release.ps1` 外联清单已移除 3 个 deco 文件
- **测试**：`tests/achievement.contract.cjs` 改为校验「下线状态」

**恢复步骤见 [`backend/achievement-pending/README.md`](../backend/achievement-pending/README.md)**（含逐层清单）。

验证：`cd backend && mvn -o test`（166 通过）；`node --test tests/*.cjs`（99 通过 / 2 跳过）。

---

## 发布 / 协作相关（2026-09-14 记录）

2、**打包会夹带本地密钥（已修复 2026-09-14）**

`mvn package` 曾会无条件打包 `backend/src/main/resources/application-local.yml`（含 SMTP 授权码），
使 jar 内出现 `BOOT-INF/classes/application-local.yml` 并随部署上传到服务器。

- 已发生：2026-09-13 那次上线（协作者在 `releases/迁移文档/2026-09-14_第一轮完整修复上线.md` 第 3 节指出）
- 已缓解：协作者 2026-09-14 用「干净源码归档构建」清掉了线上那一份
- **已修复**：`backend/pom.xml` 的 `<resources>` 显式排除 `application-local.yml` / `application-prod.yml`（2026-09-14）
- **已实测**：`mvn -o clean package -DskipTests` 后 jar 内只剩 `BOOT-INF/classes/application.yml`，本地源文件不受影响
- ⚠️ 该排除依赖 **clean 打包**：不带 `clean` 时 `target/classes` 里的旧副本仍会被打进包。
  两个打包脚本（`build-deploy.ps1` / `build-release.ps1`）都用 `clean package`，安全
- 回归命令：`jar tf <jar> | findstr application`（不应出现 `application-local.yml`）

3、**协作规范（协作者建立，需遵守）**

见 `COLLABORATION.md`（在协作分支 `fix/first-round-usability` 上，本仓库主线此前不知情）：

- 禁止直接推送 `main`；**分支按主题建、攒批提 PR**（不是「一个任务一个 PR」）；合并由双方确认后完成
- `growth-schoolv3.html` 是**共享热点文件**，同一时间只允许一人修改，另一人改后先拉取再继续
- 正式发布、数据库迁移、邮件配置变更**必须单独授权**
- PR 前清单：说明改了什么/未改什么、后端测试构建已跑、前端关键流程已查、360/390/430 宽度已记录、无密钥/无生产数据

4、**内容重复已合并（2026-09-14 完成）**

- `tasks/backend-api.md`（接口清单）已**并入 [docs/backend-handoff.md](../docs/backend-handoff.md) 后删除**。
  合并时发现该文件自身也已过时（只列 37 条，且把实际已实现的 `/api/gossip/*`、`/api/users/me/notifications`
  标成"未实现"），因此接口清单**按实际 Controller 重新生成**，现为 **82 条**；表结构章节也补上了
  "以 `backend/sql/init.sql`（18 张表）为准，原 DDL 为初版设计稿"的说明。
- `tasks/todo.md`（22KB 后端施工计划）**不是待办**，而是已落地的历史施工单 → 已改名为
  `tasks/backend-implementation-plan.md`，文首加历史状态说明，消除与本文的命名冲突。

5、**`tasks/` 暂缓归位（有协作约束）**

按 `PROJECT_RULES.md` 的文档地图，`tasks/` 是"施工计划与阶段汇报"的正式位置，**本轮保留不动**。
原因：协作者的 `AGENTS.md` 硬编码了 `tasks/first-collaboration-plan.md`，且他们仍在往 `tasks/` 写入；
整体搬迁会让他们下一个分支再次目录分叉。若后续要与协作者商定统一，再决定是否并入 `docs/`。

6、**`tasks/profile-page-api-gaps.md` 已复核并就地更新（2026-09-14 完成）**

该文档（「我的信息」页面后端接口缺口清单，成文 2026-08-30）的"缺口"已逐条对照后端代码与前端接线复核，
**10 项里 9 项已实现**；原列 4 项"后端需新增"能力（排名 / 邀请 / 技能标签 / 评价查询 + 评价提交）**全部已实现且前端已接线**。

- 已就地更新第一节速览表与第二节各模块结论，行号链接同步到当前前端源码
- 已删除一段**误导性提示**：原文写"`user_skills` 为新表…或**重新导入 init.sql**"——
  `init.sql` 含 `DROP TABLE`，照做会**清库**（违反 `PROJECT_RULES.md`"线上库禁止执行 init.sql"），
  已改为指向增量脚本 `backend/sql/migrate-*.sql`
- 原第三节「待办汇总」保留为复核对照表
- 剩余真实缺口**仅 1 项**：个人资料邮箱 → 见第 7 条

7、**`saveProfile()` 提交的邮箱后端不接收（2026-09-14 记录，待决策）**

`growth-schoolv3.html` 的 `saveProfile()`（L4677-L4698）会把 `email` 一并 PUT 给 `/api/users/me`，
但后端 `UpdateProfileDTO` **没有 `email` 字段**（邮箱是登录凭证，设计上不可改），该字段被**静默忽略**
——用户以为改了邮箱、实际没改，界面也无任何提示。

- 方案 A（推荐）：前端把邮箱输入框改为只读展示，`saveProfile()` 不再提交 `email`
- 方案 B：后端加独立接口 `PUT /api/users/me/email`（需二次验证；MVP 可不做）

⚠️ 方案 A 要动 `growth-schoolv3.html`（`COLLABORATION.md` 点名的协作热点文件），需与协作者对齐后单独一个分支/PR。
细节见 `tasks/profile-page-api-gaps.md` 第二节第 5 项。

8、**前端响应式改进（可选，2026-09-14 登记）**

现状（已实测）：`growth-schoolv3.html` 约 2034 行 CSS 中，`@media` 块只有 **11 处 / 83 行（4.1%）**，
其余约 **96% 是移动端与桌面端共用规则** —— 改共用样式会同时影响两端，目前靠人肉两端验证兜底。
**没有两套 DOM / 两套页面**（这是对的，业界主流也如此），但区分粒度偏粗。

可选改进方向（不急，按需做）：

- **把一部分 `@media` 下沉为 `@container`**：按组件自身宽度适配，改动不外溢（Baseline widely，2023-02 起）
- **减少断点**：用 `clamp()` / `minmax()` / `repeat(auto-fit, …)` 的流式布局替代部分硬断点
- **`body.side-compact` 改纯 CSS**：现在由 JS 按 `vh < 640` 切换（`growth-schoolv3.html` L6099-L6100），
  语义等价于 `@media (max-height: 640px)`，改掉可免 JS 时序影响

约定已写入 `PROJECT_RULES.md` **2.7**（含浏览器支持基线：Baseline Widely available 直接用、不写降级、不做 UA 判断）。

⚠️ `growth-schoolv3.html` 是协作热点文件，且这类改动面大，需与协作者对齐后单独开分支 / PR。

10、**线上缺 `release/*` tag，发布记录也缺若干行（2026-09-25 更新：已给当时线上版本补打 `release/2026-09-24` → `4815b52` 并回填发布记录；剩余欠账为 09-20 / 09-21 / 09-22 的发布记录行）**

`backend\check-live.ps1` 自检报「存在不一致」（`PROJECT_RULES.md` 2.6.1）：

- 线上 `version` = `2026-09-23_宿舍目录_聊天室修复_广场横幅签到与新手指引`，`gitSha` = `a36169f`，`buildTime` = `2026-09-24T10:41:40Z`
  （2026-09-24 `curl -s https://dsxnb.com/api/health` 实测）
- 该提交**本地与远端都能找到**（`git cat-file -t a36169f` → `commit`）—— 能 review、能回滚，问题只在锚点
- 最近的 `release/*` tag 是 `release/2026-09-18`（→ `117758c`），**线上那版不在任何 tag 上**
- `releases/发布记录.md`：2026-09-24 已补 `2026-09-23` 一行；更早的 09-20 / 09-21 / 09-22 各行仍缺

⚠️ **2026-09-22 那版（`082923f`）已被 09-23 版覆盖，不再需要补 tag** —— 按「tag 只指向线上正在跑的那一版」
（[`releases/上线文档.md`](../releases/上线文档.md) 4.6），补 tag 的目标改为**当前线上版本**。

影响（`PROJECT_RULES.md` 2.6.2 / 2.6.3）：

- `backend\build-deploy.ps1` 默认以**最近一个 `release/*` tag** 为基线 → 在补 tag 之前，
  **任何打包都必须显式 `-Base a36169f`**，否则增量文件清单与包内「部署说明.md」的删除清单都会错
- 线上版本无法自证，别人不敢基于它打包上线

建议动作（由 09-23 那次的发布方执行，见 2.6.3 第 3、4 条）：

```bash
git tag -a release/2026-09-23 -m "2026-09-23_宿舍目录_聊天室修复_广场横幅签到与新手指引" a36169f
git push gitee release/2026-09-23
```

补完 tag 且发布记录有对应行后，`check-live.ps1` 才可能三处一致。

⚠️ 打 `release/*` tag 属于**必须由人确认后执行**的动作，助手不代办。

> 2026-09-24 另注：当天的**纯前端替换**（移动端黑榜页改版，`index.html` 已核对与 `main` 一致）不产生新版本、**不打 tag** ——
> 线上 `gitSha` 仍是 `a36169f`。回填见 [`releases/迁移文档/2026-09-24_移动端黑榜页头部精简与吸底操作条.md`](../releases/迁移文档/2026-09-24_移动端黑榜页头部精简与吸底操作条.md)。

> 2026-09-25 另注（**已处理，上文 114-136 行描述的是 09-24 时点状态**）：经负责人确认，已给**当时线上版本**
> `4815b52`（`version=2026-09-24_safe-http-url修复`、`buildTime=2026-09-24T15:34:23Z`）补打
> `release/2026-09-24` 并 `git push gitee release/2026-09-24`，同时在 `releases/发布记录.md` 补上对应行 ——
> 三处锚点（线上 `gitSha` ↔ `release/*` tag ↔ 发布记录）恢复一致，后续打包不再需要显式 `-Base`。
> 09-23 版（`a36169f`）已被该版覆盖，按「tag 只指向线上正在跑的那一版」**不再补打 tag**；
> 仍欠的是 09-20 / 09-21 / 09-22 的**发布记录行**（同样不补 tag）。

> 2026-09-26 另注：本批上线（`439bd8c` = `2026-09-25_宿舍图文内容`，含 `!14` 审核卡修复与文字审核加固）已打
> `release/2026-09-26` 并回填 `releases/发布记录.md`，三处锚点再次一致（`check-live.ps1` 实测）。
> 仍未补的仍是上面那三个日期的发布记录行。
