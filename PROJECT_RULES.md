# 项目规范 · 文档位置与变更流程

> **本文件是项目共识**：多人（含 AI 助手）修改与发布时，以它为准。
> 配套阅读：[COLLABORATION.md](COLLABORATION.md)（怎么协作）、[AGENTS.md](AGENTS.md)（AI 入口）、[releases/上线文档.md](releases/上线文档.md)（上线操作细节）。
>
> 最近更新：2026-09-14 —— 第二节由「上线流程」扩写为「变更流程」：新增**代码变更的测试命令清单**与**纯文档变更流程**，
> 并明确 **`main` 只能通过 PR 合并**（上线同样先走 PR）；
> 新增 **2.6「与线上版本的同步」**（三处锚点：线上 `gitSha` ↔ `release/*` tag ↔ 发布记录，配合 `backend\check-live.ps1` 自检）；
> 2.3.2 增加上线前置：**线上 `gitSha` 对应的提交必须已推送到远端**（不允许「先上线、后补提交 / 补 tag」）；
> 2.1 明确 PR 分工：建 PR 由执行方负责（**助手可代建**并报出可合并状态），**合并只由人确认后执行**；
> 新增 **2.7 前端样式与浏览器支持基线**（Baseline Widely available 直接用、不做 UA 判断；移动端专属改动只写在媒体查询 / 容器查询内）。
>
> 2026-09-14 增补：**要上线的改动，迁移文档必须随 PR 一起提交**（不要等上线前才补）——
> 已同步到 **0 一句话规则**、**2.0 表格注**、**2.1 第 5 步**、**2.3.1 第 2 条**、**2.3.2 首项**、**一、禁止清单**。
>
> 2026-09-15 增补（上线可靠性，来自一次服务器文件治理时发现的坑）：
> **备份必须能被读回**（禁 `sudo` 建备份目录，**假回滚点比没备份更危险**）→ 2.3.1-4 / 2.3.3 / 2.3.5；
> **文件删除按归档判据**（别处有副本的**直接删**，服务器 `archive/` 只是中转站）→ 2.3.1-5 / 2.3.4；
> 迁移文档抬头记**上线前 / 上线后 `gitSha`**、变更清单写**服务器绝对路径**→ [上线文档 4.3 / 4.4](releases/上线文档.md)。
>
> 2026-09-23 增补：**主远端切换为 Gitee**（`origin` = GitHub 保留作异地备份）——
> 新增 **2.8「远端与 PR 平台」**（两个远端分工、一律显式 `git push gitee <分支>`、PR 模板位置、代建 PR 的三条实测编码坑）；
> 0 节表格与 2.1 第 1 步同步更新。
>
> 2026-09-24 增补（**分支与 PR 节奏** —— 补齐 2026-09-18 那条一直没落地进 `main` 的规则，起因是当天连开了三个同主题的小 PR）：
> **分支按主题建，不按任务建** —— 同主题小改动进同一分支、已有同主题分支就复用、**合并后立即删除**（见 2.1 第 2 步）；
> **攒批提 PR** —— 不要「改一点提一个」，改动先攒在分支上，等负责人说「提 PR」再推 + 建 PR（见 2.1 第 7 步）；
> **合并前必跑 `cd backend && mvn -o compile`** —— 「合并漂移导致 `main` 编译不过」已重复发生 3 次（见 2.2）；
> **git 命令合并成一条跑**、**长提交信息用 `git commit -F <UTF-8 文件>`**（见 2.1 第 6 步）。
> 已同步到 **0 表格 / 2.1 / 2.2 / 2.4**，以及 [`COLLABORATION.md`](COLLABORATION.md)、[`AGENTS.md`](AGENTS.md)。

## 0. 一句话规则

| 场景 | 规则 |
|---|---|
| **开工前** | `git fetch --all --tags` + 跑 `backend\check-live.ps1`，确认线上 `gitSha` = 最近 tag = 发布记录（见 2.6） |
| **写文档** | 先查第一节的文档地图再建文件；**根目录只放"入口与规范"，不堆散文档** |
| **改代码** | 建分支（**按主题，不按任务**）→ 跑第二节的测试清单 → PR 合入 `main`；**任何角色都不直推 `main`** |
| **要上线的代码变更** | **迁移文档随 PR 一起提交**（`releases/迁移文档/YYYY-MM-DD_<关键词>.md`）；不要等上线前才补（见 2.1-5、2.3.1） |
| **只改文档**（不碰代码） | 同样走分支 + PR，但**不出迁移文档、不跑测试、不打 tag**；规范类文件须另一方确认 |
| **建分支** | **一个主题一个分支，不是一个任务一个分支**；同主题后续改动**复用原分支**；合并后**立即删除**（见 2.1-2） |
| **建 PR / 合并** | **攒批提 PR**（别改一点提一个）；执行方建 PR（**助手可代建但不主动提**，等负责人说「提 PR」，并须报出链接与可合并状态）；**合并由人决定，助手不代合并** |
| **推送到哪个远端** | **主远端 `gitee`**（日常推进它）；`origin` 是 GitHub 备份。PR 走 Gitee、模板 `.gitee/PULL_REQUEST_TEMPLATE.md`；代建方式与实测坑见 **2.8** |
| **上线** | **先 commit，再打包；先验证，再打 tag；备份必须能读回；旧文件先不删** |
| **线上动库 / 配置** | **必须单独授权 + 先备份**，不与代码上线混在一次 |

---

## 一、文档地图（什么信息写在哪）

| 信息类型 | 唯一位置 | 示例 | 进部署包 |
|---|---|---|---|
| 项目入口 / 新人上手 | [`README.md`](README.md)（根） | 技术栈、目录结构、本地启动、打包发布 | ❌ |
| **项目规范（本文）** | [`PROJECT_RULES.md`](PROJECT_RULES.md)（根） | 文档位置、变更流程 | ❌ |
| 协作方式 | [`COLLABORATION.md`](COLLABORATION.md)（根） | 分支、PR、热点文件、授权 | ❌ |
| AI / 工具入口 | [`AGENTS.md`](AGENTS.md)（根） | 让 AI 先读哪些文件、红线 | ❌ |
| **上线操作手册** | [`releases/上线文档.md`](releases/上线文档.md) | 发布物路径、上传命令、回滚命令 | ❌ |
| **每次上线的迁移文档** | `releases/迁移文档/YYYY-MM-DD_<做了什么>.md`，**复制 [`_模板.md`](releases/迁移文档/_模板.md) 起稿** | 本次改了什么、怎么上线、怎么回滚 | ❌ |
| 发布总账 | [`releases/发布记录.md`](releases/发布记录.md) | 每次上线一行 | ❌ |
| 待办 / 已知问题 | [`TODO/TODO.md`](TODO/TODO.md) | 还没做的事、已记录的坑 | ❌ |
| 施工计划 / 阶段汇报 | `tasks/` | 某轮的方案与进展报告 | ❌ |
| 接口 / 数据模型 / 交接说明 | [`docs/backend-handoff.md`](docs/backend-handoff.md) | 接口清单、表结构 | ❌ |
| 产品需求（PRD） | [`docs/蛋蛋世界-PRD-v2.0.md`](docs/蛋蛋世界-PRD-v2.0.md) | 产品需求文档 | ❌ |
| 任务流程 / 专项说明 | [`docs/growth-school-task-flows.md`](docs/growth-school-task-flows.md)、[`docs/email-quota.md`](docs/email-quota.md) | 流程分析、邮件额度 | ❌ |
| 历史迁移计划 | [`docs/迁移计划.md`](docs/迁移计划.md) | 一/二/三轮上线迁移方案 | ❌ |
| 历史版本与已归档报告 | `archive/` | `archive/growth-schoolv1/v2.html`；`archive/tasks/`（已完结的阶段报告/交接说明）、`archive/todo/`（已完成的工单） | ❌ |
| 本地临时文件 | `local-only/`（已 gitignore） | 参考资料、截图、旧备份 | ❌ |
| 部署包（产物） | `releases/deploy/<上线名>/`（已 gitignore） | jar + 前端 + 说明 | — |

### 禁止清单
- ❌ 在仓库**根目录**新增散文档（`xxx-计划.md`、`xxx-note.md` 之类）→ 应进 `tasks/`、`TODO/` 或 `releases/迁移文档/`
- ❌ 把本地临时文件放根目录 → 放 `local-only/`
- ❌ 把"本次上线做了什么"只写在聊天/提交信息里 → **必须落成迁移文档**
- ❌ **等 PR 合并后才补迁移文档 / 上线前临时撰写** → 要上线的改动**在 PR 阶段就写好并随 PR 提交**（见 2.1 第 5 步）
- ❌ 在 `js/`、`assets/` 之外随意新增前端资源目录（会破坏打包映射）
- ❌ 提交任何密钥类文件（`application-local.yml` / `application-prod.yml` 等）

### 三个快速判断
1. **"这次上线改了什么？"** → `releases/迁移文档/` 里当天的文件
2. **"线上现在跑的是哪一版？"** → `release/*` tag + `releases/发布记录.md`
3. **"这个新文档放哪？"** → 查上表；表格没有的类型，先与协作者商定再建

---

## 二、变更流程（代码 / 文档 / 服务器侧）

> 详细命令与发布物路径见 [`releases/上线文档.md`](releases/上线文档.md)；本节是**必做清单**，两者冲突时以本文为准。

### 2.0 三类变更怎么走

| 变更类型 | 例子 | 分支 + PR | 本地测试 | 迁移文档 | 进部署包 | 打 tag |
|---|---|---|---|---|---|---|
| **代码变更** | 后端 Java、前端 `growth-schoolv3.html` / `js/`、`backend/sql/*.sql` | ✅ | ✅（见 2.2） | ✅ **随 PR 提交**（见下表注） | ✅ | ✅ |
| **纯文档变更** | `docs/`、`TODO/`、`tasks/`、`releases/` 记录回填 | ✅ | ❌ | ❌ | ❌ | ❌ |
| **服务器侧变更** | 线上库数据修复、nginx、邮件配置 | — | ❌ | 视情况 | ❌ | ❌ |

> ⚠️ **迁移文档的提交时间点（固定）**：只要这次改动会**随下一次上线发布**，就**在 PR 阶段写好并随 PR 一起提交**
> （放 `releases/迁移文档/`，命名 `YYYY-MM-DD_<关键词>`）。上线时只做**核对与补充**，不再临时撰写。
> 理由：临时补写时，上线执行方必须把「上次 tag 之后累计带上的所有改动」重新梳理一遍，
> 否则迁移文档与部署包的实际内容对不上（2026-09-14 真实发生过：一次上线累计带上了另外两个 PR）。
> 纯文档变更（不上线）仍**不出**迁移文档。

> **`main` 只能通过 PR 合并** —— 任何角色（含主管理员）都不直接推送 `main`（`gitee` 与 `origin` 两个远端都不行）。
> 上线同样先走 PR：**先把改动合并进 `main`，再打包、上传、验证、打 tag**。
> ⚠️ 服务器侧变更**必须单独授权**（见 [COLLABORATION.md](COLLABORATION.md)），并先备份。

### 2.1 统一前置（所有变更都做）

1. `git fetch --all --tags` —— 先看协作者有没有新分支/新提交，**不要假设这是单人仓库**；
   `gitee`（主）与 `origin`（备份）两个远端都要拉（远端约定见 **2.8**）
2. **建分支（按主题，不按任务）**：`feat/<短名>`、`fix/<短名>`、`docs/<短名>`、`chore/<短名>`
   （**不要在 `main` 上直接改**）
   - ⚠️ **不要一个任务建一个分支** —— 分支是**主题**的容器，不是任务的容器。
     同一主题下的多个小改动（连续微调、同批文档回填、同一模块的连带修复）**都进同一个分支**
   - **复用优先**：手上已有同主题分支就继续用，**不要新开**；只有主题确实不同才建新分支
   - **合并后立即删除**：PR 合并进 `main` 后，本地与远端分支都要删
     （`git branch -d <分支>` + `git push gitee --delete <分支>`），不留僵尸分支
   - 判断标准：**"这两个改动会不会在同一次评审里一起看？"** 会 → 同一个分支
3. 改 → 自测
4. 验证：代码变更见 **2.2**，纯文档变更见 **2.4**
5. **要上线的改动：先写迁移文档**（`releases/迁移文档/YYYY-MM-DD_<关键词>.md`）——**固定做法：复制
   [`releases/迁移文档/_模板.md`](releases/迁移文档/_模板.md) 起稿并逐节填满**（结构不要自创、不要缺节；
   逐项要求见 [上线文档 4.3 / 4.4 节](releases/上线文档.md)，运营侧固定项见 [AGENTS.md](AGENTS.md) 修改规则）
   —— 它和代码**进同一个提交 / 同一个 PR**；纯文档变更（不上线）跳过此步
6. `git commit`（按文件逐个 add，先 `git status` 确认；一个任务一个提交）
   - ⚠️ **git 命令合并成一条跑**：`git status; git diff; git log -5` 用 `;` 串起来**一次执行**，
     不要拆成多次工具调用 —— 每次调用的输出都会进上下文且**不会消失**，后续每轮都要重发
   - ⚠️ **长提交信息用 `git commit -F <UTF-8 文本文件>`**；不要在 `-m` 里嵌双引号 ——
     Windows PowerShell 会在双引号处截断、把后半段当成 pathspec，导致提交**静默失败**（2026-09-14 真实踩过）
     （临时文本文件可放已 gitignore 的 `local-only/`，用后即删）
7. **攒批，不着急提 PR** —— 改动先留在本地分支上继续累积（同一主题可以有多条提交）；
   攒到**一批可评审的完整改动**、或**由负责人说「提 PR」**时，再推送并建 PR：
   - `git push -u gitee <分支>`
   - 标题写清模块 + 动作；正文按 [`.gitee/PULL_REQUEST_TEMPLATE.md`](.gitee/PULL_REQUEST_TEMPLATE.md)（主远端 Gitee）填
     —— GitHub 侧仍可用 [`.github/PULL_REQUEST_TEMPLATE/default.md`](.github/PULL_REQUEST_TEMPLATE/default.md)，两份内容保持一致
     （变更目的 / 修改范围 / 验收与验证 / 协作确认）
   - **建 PR 是执行方的责任**；由 AI 助手代建时，它必须把「PR 链接 + 可合并状态（`mergeable_state`）」报出来
   - ⚠️ **不要「改一点就提一个 PR」** —— 频繁 PR 会淹没评审、也让人看不清改动全貌。
     典型该攒的信号：一句话的需求微调、单处样式调整、同主题的连续小修
8. **由人（另一方）确认后合并 `main`** —— **AI 助手不得代执行合并**
9. **合并后删除分支**（本地 + 远端）：`git branch -d <分支>`、`git push gitee --delete <分支>` —— 不留僵尸分支

> 🤖 **助手职责边界（固定）**
> - **可做**：建分支 / 改文件 / 提交 / 推送分支 / 跑只读核对（如 `check-live.ps1`）；
>   **PR 可代建，但不主动提** —— 攒在分支上，等负责人说「提 PR」再推 + 建 PR
> - **不可擅自做**：**合并 PR**、直推 `main`、打 `release/*` tag、改线上（服务器 / 数据库 / 邮件配置）
>   —— 这些必须由人确认后执行
> - **不可擅自做**：**删除分支**（本地或远端）—— 属不可逆操作，须先列出待删清单、由人确认后执行

> ⚠️ 含中文的 `.ps1` 必须存为 **UTF-8 with BOM**；用编辑工具改过之后必须复核：
> `[System.IO.File]::ReadAllBytes($p)[0..2]` 应为 `239,187,191`。
> ⚠️ `git commit` 信息里**不要嵌双引号**（Windows PowerShell 会截断导致提交静默失败），用「」；长信息改用 `-F <UTF-8 文件>`。

### 2.2 代码变更：本地测试与验证（命令清单）

**后端**

| 改了什么 | 必须执行 |
|---|---|
| 任何 `backend/src/main/java/**` | `cd backend && mvn -o test` |
| 仅改资源 / 依赖（`resources/`、`pom.xml`） | `cd backend && mvn -o compile` 兜底编译 |
| **合并 `main` 前（任何后端改动）** | **`cd backend && mvn -o compile`** —— 见下方说明 |
| **修 bug** | **先写能复现问题的回归测试**（先红后绿），再改代码 |
| 接口路径 / 参数 / 响应、表结构、业务规则 | 同步 [`docs/backend-handoff.md`](docs/backend-handoff.md)（接口清单以 Controller 为准） |
| 数据库结构 | 新增 `backend/sql/migrate-<说明>.sql`；**线上库禁止执行 `init.sql`**（含 `DROP TABLE`） |

**前端**

| 改了什么 | 必须执行 |
|---|---|
| `js/**`、`growth-schoolv3.html` 的脚本 | `node --test tests/*.cjs`（前端回归）；改过的 `js/*.js` 逐个 `node --check` |
| 页面结构 / 样式 | 关键流程手点一遍（如：注册 → 登录 → 发布 → 认领 → 配对 → 完成 → 评价） |
| 影响布局 | 记录 **360 / 390 / 430** 三个宽度的表现（PR 前清单要求） |
| 新增 `js/` 外联文件 | 同步 `backend/build-release.ps1` 的文件清单（否则全量包会少文件） |
| 动 `growth-schoolv3.html` | **先 `git pull`**（共享热点文件，同一时间只允许一人改）；只做小范围、可回滚改动，避免无关格式化 |

> ⚠️ **合并前必跑 `mvn -o compile`（离线编译，几秒）** —— 「合并漂移导致 `main` 编译不过」已重复发生 **3 次**
> （2026-09-17、09-18 两次），每次都要「发现 → 修 → 再修 → 补迁移文档」，一个问题产生 3-4 次提交。
> 根因是**合并前没编译**：两个分支各自能编译，合并后出现重复方法 / 重载歧义。合并前跑一次编译，能把这类问题挡在合并之前。

**报告口径**：必须区分 **已实现 / 已验证 / 未验证**；只有做过真实浏览器 / 手机验证才能报「已验证」。

> 样式与响应式的具体约定（浏览器支持基线、移动端 / 桌面端怎么区分）见 **2.7**。

### 2.3 上线（发布）流程

> 上线 = 代码变更的"发布阶段"，在 2.1 + 2.2 完成、且**改动已合并进 `main`** 之后才进入这里。

#### 2.3.1 五条总原则

1. **先 commit，再打包** —— 否则 jar 内 `gitSha` 会带 `-dirty`，与 tag 对不上，版本锚点失效
2. **每次上线一份迁移文档**，文件名 = 本次上线名（`YYYY-MM-DD_<关键词>`）；
   内容应在**代码 PR 阶段就写好并随 PR 提交**（见 2.1 第 5 步），上线时只做**核对与补充**，不临时撰写
3. **上线验证通过后才打 tag**
4. **备份必须能被读回** —— 用普通用户建（禁 `sudo`）、备份后立刻验证可读。
   **假回滚点比没备份更危险**：以为有备份，出事时读不到（见 2.3.3）
5. **旧文件先不删** —— 留作回滚材料，稳定后再单独清理；清理按 2.3.4 的**归档判据**（不是凡删必归档）

#### 2.3.2 上线前（本地）

- [ ] **核对**迁移文档（应已在 PR 阶段随代码提交）→ `releases/迁移文档/YYYY-MM-DD_<关键词>.md`（模板见上线文档 4.4 节）
  - 文件名与本次**上线名**不一致时统一改成上线名（`build-deploy.ps1 -Name` 与它同名）
  - **一次上线包含多个 PR 时**：以上线名新建或合并为一份，变更清单**逐轮列清**；各 PR 自带的迁移文档要链接进来，
    并把「对比基底 + 相对线上 tag 的累计差异」写清楚 —— `build-deploy.ps1` 默认以最近 `release/*` tag 为基底，
    所以**上次上线之后合并进 `main` 的所有改动都会被打进包**，清单必须覆盖到（2026-09-14 真实发生过）
  - 缺迁移文档的历史 PR（合并时没带）：由本次上线执行方补齐并在「本次范围」里说明来源
- [ ] 确认**对比基底**：
  - 默认 `build-deploy.ps1` 会取最近一个 `release/*` tag（= 线上正在跑的版本）
  - ⚠️ 若线上版本**没有 tag**（如协作者单独发个人分支），必须显式 `-Base <commit>`
- [ ] 与协作者对齐：涉及 `growth-schoolv3.html`（共享热点文件）、正式发布、数据库 / 邮件配置变更 → **须授权**
- [ ] PR 已合并进 `main`；本地 `git checkout main` + `git pull`，确认**工作区干净**、`HEAD` 就是要发布的那个提交
- [ ] **确认线上 `gitSha` 对应的提交已推送到远端**（跑 `backend\check-live.ps1`，或手工核对）：

  ```powershell
  curl -s https://dsxnb.com/api/health          # 取线上 gitSha
  git cat-file -e "<线上 gitSha>^{commit}"       # 本地/远端能否找到该提交
  ```

  - 找不到 → 说明发布方用了**本地未推送**的提交构建，后果见 2.6.3：
    **算不出增量基线、无法 review、无法回滚**（2026-09-14 真实发生过一次）
  - ⚠️ **不允许「先上线、后补提交 / 补 tag」** —— 中间那段窗口里线上版本无法自证，
    别人也不敢打包上线（基线不可信）
- [ ] 生成部署包：
  ```powershell
  powershell -ExecutionPolicy Bypass -File backend\build-deploy.ps1 -Name "<本次上线名>" [-Base <ref>]
  ```
- [ ] 核对包内「部署说明.md」：上传清单 / **删除清单** / jar 内版本信息
- [ ] 复验 jar 不含敏感配置：`jar tf …\eggworld.jar | findstr application`（应只有 `application.yml`）

#### 2.3.3 上线中（服务器）

- [ ] **备份旧文件**（jar、index.html、本次要覆盖的外联文件；有库变更时含 dump）
  - 位置：`~/eggworld/backup/<日期>-<标识>/`；库 dump 放 `~/eggworld/backup/db/` 并 `chmod 600`
  - ⚠️ **用普通用户（`xiaos`）创建，禁止 `sudo` 建目录 / 拷文件** —— `sudo` 建的目录属主是 root、权限 `700`，
    出事时 `xiaos` 读不到，**等于没有备份**（2026-09-14 真实发生过：两个 backup 目录 `root:root drwx------`）
  - 备份后**立刻验证可读**：`ls -l` 属主应为 `xiaos`；抽样 `test -r <文件>`、`tar tzf` / `head -1` 能正常打开
  - 保留：`backup/` 只留**最近 3 次**上线的备份目录，更早的按 2.3.4 的**归档判据**处理（可回滚材料以 git / 重新打包为准）
- [ ] 按「部署说明.md」上传
  - ⚠️ **有新增目录时先传静态资源（如 `assets/`），再传 HTML** —— 否则中间态会出现图片 404
- [ ] `ssh xiaos@dsxnb.com 'systemctl restart eggworld'`
- [ ] 「部署说明.md」的删除项：**默认本次不执行**，留作回滚（确需执行时先确认已稳定）

#### 2.3.4 上线后

- [ ] **版本自查**：`curl -s https://dsxnb.com/api/health`，`gitSha` 应等于本次 commit
- [ ] 后台登录 → 侧栏底部「版本 · commit」应与上面一致
- [ ] 按迁移文档「验证清单」逐项确认（图片 / 关键页面 / 权限边界 / 协作者成果未回退）
- [ ] **打 tag 并推送**（此时 `main` 已是最新，只需推 tag）：
  ```bash
  git tag -a release/YYYY-MM-DD -m "<本次上线名>"
  git push gitee --tags
  ```
- [ ] 回填 `releases/发布记录.md`（结果 ✅、commit、迁移文档链接）**与迁移文档抬头**
  - 抬头里「上线前线上版本」/「上线后线上版本」两个 `gitSha` 都要有值，让文档**自证已上线**
    （否则日后只能靠 jar mtime 反推，2026-09-14 真实发生过）
- [ ] 观察稳定后，再执行旧文件清理（单独一次，不要和上线混在一起）。**归档判据**——服务器空间有限，**不是凡删必归档**：
  - **别处有副本的**（前端文件、jar：`git` 或重新打包就能拿回）→ **直接删，不归档**
  - **只存在于服务器的**（库 dump、他人项目文件、手工运维快照）→ 先归档再删：
    `tar czf ~/eggworld/archive/<名>-<日期>.tar.gz <路径>` → 刷新 `archive/SHA256SUMS` → 登记到迁移文档「文件删除」一节
  - 服务器 `archive/` 只是**中转站**：异地备份（`scp` 到本地 `D:\CodexData\local\eggworld\server-archive\`）并核对 SHA256 后，
    服务器侧**最多保留最近 1 个批次**，更早的可删 —— **长期留存以异地为准**，否则 `archive/` 只会越堆越大

#### 2.3.5 回滚

- **动手前先确认备份可读**（`ls -l` 属主 + `test -r`）—— 读不到就先停下来找异地 / 归档副本，别在线上继续试
- 还原备份的 jar / index.html / 外联文件 → `systemctl restart eggworld`
- **不在服务器上改数据库或配置**来回滚（数据库只能靠发布前的 dump）
- 回滚后同样要回填 `releases/发布记录.md`

### 2.4 纯文档变更流程（不上线）

适用：只改 `docs/`、`TODO/`、`tasks/`、`releases/`（记录回填 / 迁移文档）、根目录规范类文档，**不碰任何可运行代码**。

- 前置与 2.1 相同：`git fetch` → 建分支（`docs/<短名>`，**按主题建、同主题复用**）→ 改 → commit →
  **攒批**（同主题的小改动攒在一起，别改一点提一个）→ 负责人说「提 PR」时再 push + PR → 双方确认后合 `main` → **合并后删分支**
- **不出迁移文档、不进部署包、不打 tag、不重启服务**
- **不跑** `mvn -o test` / `node --test`（没有代码改动，跑了也不能证明什么）
- 验证方式（照做即可）：
  1. **事实核对**：文档里写的接口 / 字段 / 表 / 文件路径，逐条对照代码或实际文件（用 `Grep` 查代码、`Read` 读目标文件）
  2. **引用不失效**：全仓库 `grep` 确认没有文档指向已删除 / 已改名的文件；**若重排了章节号，必须回头修掉按节号引用的地方**
  3. **改动范围**：`git status` 只出现本次预期的文件；确认**不含** `.ps1`、不含 `application-*.yml`
  4. 若改了行为性描述（"某接口已实现 / 未实现"），必须写明**核对依据与日期**
- ⚠️ **规范类文件必须由另一方确认后才合并**：`PROJECT_RULES.md`、`COLLABORATION.md`、`AGENTS.md`、`releases/上线文档.md`、`README.md`
- 合并后**无需任何上线动作**；若后续要上线，按 2.3 单独走

### 2.5 服务器侧变更（库 / nginx / 邮件配置）

- **必须单独授权**（见 [COLLABORATION.md](COLLABORATION.md)），**不与代码上线混在一次**
- 动手前先备份：库 → `mysqldump`；配置 → 复制旧文件
- **不在服务器上改数据库或配置**来回滚；数据库只能靠发布前的 dump 恢复
- 变更后回填 `releases/发布记录.md` 或对应迁移文档的「数据库变更」一节

### 2.6 与线上版本的同步

> 目的：任何时候都能回答「线上跑的是哪一版」「它是不是 `main` 上的某一版」「上次之后改了什么」。
> **三个锚点必须始终一致**：线上 `gitSha`（`/api/health`）↔ `release/*` tag ↔ `releases/发布记录.md`。
> 具体命令见 [`releases/上线文档.md`](releases/上线文档.md) 第二节第 0 步。

#### 2.6.1 开工前（每次动代码 / 上线前）

```powershell
git fetch --all --tags                                    # 本地 origin/* 可能过期，协作者新分支会看不见
powershell -ExecutionPolicy Bypass -File backend\check-live.ps1
```

- 输出「一致」→ 可继续开工
- 输出「不一致」→ **先按 2.6.3 处理，不要直接开工**

#### 2.6.2 上线前的同步检查

- [ ] `git fetch --all --tags`
- [ ] 线上 `gitSha` 是否**落在某个 `release/*` tag 上**？
  - **在** → 该 tag 就是打包基线（`build-deploy.ps1` 的默认行为，正确）
  - **不在**（他人分支发布 / 线上被手工改过）→ 必须显式 `-Base <线上 gitSha>`，且先确认本地能找到该 commit：
    ```powershell
    git branch -a --contains <线上 gitSha>   # 找不到说明没 fetch 到，先找发布方确认分支
    ```
- [ ] 核对「发布记录.md」的**线上库已执行脚本**列，确认本次要执行的 `migrate-*.sql` 与顺序

#### 2.6.3 别人发布后 / 发现不一致时（回收动作）

1. `git fetch --all --tags`，定位线上 `gitSha` 所在的分支
2. 把该提交并入 `main`（走正常 PR）
3. 在 `releases/发布记录.md` 补记一行，并注明 `无 tag / 仅个人分支`
4. **无 tag 的发布要补 tag**：由发布方打 `release/YYYY-MM-DD` 指向线上 `gitSha`
   —— 没有 tag 就算不出增量基线，下一次打包会错
5. 关闭「发布记录.md」里对应的「待确认」项

#### 2.6.4 线上有仓库没有的改动（手工 hotfix）

- **禁止直接覆盖**：先 `scp` 把线上文件拉回本地 `diff` 出差异 → 把差异落成提交 → 走正常 PR
- 跳过这一步就上线，等于**静默回退**别人的修复

#### 2.6.5 线上库的版本锚点

- 记在 `releases/发布记录.md` 的**「线上库已执行脚本」**列（每行同时记录代码版本与库版本）
- 只增不改：新增结构变更一律写成 `backend/sql/migrate-<说明>.sql`；**线上库永远不执行 `init.sql`**
- 拿不准时登服务器用 `show tables` / `show columns` 核实，不要靠记忆

### 2.7 前端样式与浏览器支持基线

**浏览器支持基线**：**Baseline Widely available 的特性可直接用，不写降级**；只有非 widely available 的才按其指南补 fallback。
（用户是大学生、均为现代浏览器；不为此引入 polyfill，也不写 UA 判断。）

**移动端 / 桌面端怎么"区分"**：`growth-schoolv3.html` 目前是**一套 DOM + 响应式 CSS**（约 2034 行 CSS 中仅 11 处 `@media`、占 4.1%），**没有两套页面** —— 保持这个形态，别拆两套。区分靠**粒度**，优先级如下：

| 优先级 | 手段 | 说明 |
|---|---|---|
| 1 | 能力 / 偏好查询 | `@media (hover:none) and (pointer:coarse)`、`prefers-reduced-motion`、`prefers-color-scheme` —— 比"猜设备"可靠 |
| 2 | **容器查询 `@container`** | 按**组件自身宽度**适配，改动不外溢（Baseline widely，2023-02 起） |
| 3 | 内在尺寸 + 流式 | `flex: 1 1 250px`、`minmax()`、`clamp()`、`repeat(auto-fit, …)` —— 用更少的断点 |
| 4 | 视口断点 `@media(max-width:…)` | 只用于**页面级**布局切换（如侧栏 → 底部横条）；别用它去修组件内部 |

- **移动端专属改动必须写在媒体查询 / 容器查询里**；写在它们外面的规则**两端共用**，改 padding / 字号 / 颜色会同时影响桌面端
- 改共用规则后**两端都要验**（至少 390 + 1440），并按 2.2 记录 360 / 390 / 430
- ⚠️ `body.side-compact` 目前由 JS 按 `vh < 640` 切换（`growth-schoolv3.html` L6099-L6100），语义等价于纯 CSS 的 `@media (max-height: 640px)`，建议逐步改掉
- ❌ 不要用 `overflow:hidden` 掩盖溢出（在源头修，如给 `img` 显式 `display:block`）
- ❌ 不要用 UA 判断设备；❌ 不要用 `flex-direction:*-reverse` / `order` 重排**可交互**元素（会破坏 Tab 键顺序）

### 2.8 远端与 PR 平台（2026-09-23 起：主远端 Gitee）

**两个远端的分工**

| 远端名 | 地址 | 定位 |
|---|---|---|
| `gitee` | `https://gitee.com/xiaoshuai02/eggworld.git` | **主远端** —— 日常 `fetch` / `push` / PR 都走它 |
| `origin` | `https://github.com/2795895564/eggworld.git` | GitHub，**保留作异地备份**；需要时 `git push origin <分支>` |

- ⚠️ **`git pull` / `git push` 不带参数走的都是「当前分支的 upstream」**，与主远端是谁无关：
  - `main` 的 upstream **已显式指向 `gitee/main`（2026-09-24 设置）** → 在 `main` 上 `git pull` / `git push` 直接走 Gitee，
    不会再出现「主远端明明是 Gitee、`git pull` 却去连 github.com 干等约 21 秒超时」（2026-09-24 实测）
  - **其它分支不保证**（克隆遗留的 upstream 可能仍指向 `origin` / GitHub）→ 一律显式写 `git push gitee <分支>`；
    想让 GitHub 也有备份再补一条 `git push origin <分支>`
- 迁移方式（已执行）：`--all` 推全部分支、`--tags` 推全部 tag（**tag 必须一起推**，否则版本锚点又断一次）；
  两个远端的分支清单应保持一致，可用 `git ls-remote --heads <远端>` 对账
- 补齐历史分支用 `git push gitee` 加显式 refspec（`refs/remotes/origin/<分支>:refs/heads/<分支>`）；
  ⚠️ 注意 `refs/remotes/origin/HEAD` 的短名是 `origin` 而不是 `origin/HEAD`，过滤时要用完整 refname，否则会构造出不存在的源

**本机一次性设置（每台机器各做一次，协作者同样要做）**

```powershell
git branch --set-upstream-to=gitee/main main   # 让 main 的 pull / push 走 Gitee
```

- 为什么：不带参数的 `pull` / `push` 走的是「当前分支的 upstream」，克隆自带的是 `origin`（GitHub）→
  `git pull` 会去连 github.com，干等约 21 秒后 `Failed to connect`（2026-09-24 实测）
- 校验：`git branch -vv` 里 `main` 那一行显示 `[gitee/main]`；`git status` 首行为 `## main...gitee/main`
- 副作用：`main` 的 ahead/behind 对比基准由 `origin/main` 变为 `gitee/main`（GitHub 备份仍可用 `git push origin <分支>` 显式推）
- ⚠️ 换机器 / 重装后要重做一次；**其它分支不会因此改变**，照旧显式写远端名

**助手代建 PR 用的令牌（可选，每台机器各自准备）**

- 位置：`local-only/gitee.token`（相对仓库根；`local-only/` 已在 `.gitignore` —— **不入库、不进部署包**）
- 内容：只有一行 Gitee 私人令牌（Gitee → 设置 → 私人令牌，勾选 `projects` 权限）
- 用途：助手代建 PR 时**只在内存中读取**（不打印、不落盘、不进仓库）；
  没有这个文件时助手给不出 PR 链接，只能交付「建 PR 链接 + 标题 + 正文」由人创建
- **读取方式（2026-09-24 实测，助手照做）**：从文件读进内存变量，**不写进任何 payload / 临时文件**：

  ```powershell
  $t = ([IO.File]::ReadAllText((Resolve-Path 'local-only\gitee.token'))).Trim()
  if ($t.Length -lt 20) { throw 'gitee.token 读出来是空的 / 太短，先核对路径' }
  curl.exe -s -o "$env:TEMP\pr-resp.json" -w "HTTP %{http_code}`n" -X POST `
    "https://gitee.com/api/v5/repos/xiaoshuai02/eggworld/pulls" `
    --data-urlencode "access_token=$t" `
    --data-urlencode "title@$env:TEMP\pr-title.txt" `
    --data-urlencode "head=<分支名>" --data-urlencode "base=main" `
    --data-urlencode "body@$env:TEMP\pr-body.md"
  ```

  - 标题 / 正文才落文件（UTF-8 无 BOM，见下方实测坑 1、3），**令牌只作为命令行参数传入**
  - 汇报 / 日志里只写「已从 `local-only/gitee.token` 读取」，**不打印令牌值**
  - 用完删掉临时文件（标题 / 正文 / 响应）；令牌文件本身留在本机，不要删、不要提交
- ⚠️ 不要贴进聊天 / 文档 / 提交信息；一旦外传立刻到 Gitee 撤销重发

**PR**

- PR 在 **Gitee** 创建；描述模板 `.gitee/PULL_REQUEST_TEMPLATE.md`
  （GitHub 侧 `.github/PULL_REQUEST_TEMPLATE/default.md`，**两份内容保持一致**，改一份要同步另一份）
- 建 PR 是执行方的责任；**助手代建**时用 Gitee OpenAPI（`POST /api/v5/repos/{owner}/{repo}/pulls`）；
  私人令牌**只在内存中使用、不打印、不落盘、不进仓库**。没有令牌时交付「建 PR 链接 + 标题 + 正文」由人创建
- **合并只由人确认后执行**（Gitee 上同样适用）；文档里引用旧 PR 时注意区分平台（#58/#59/#60 在 GitHub）

**代建 PR 的实测坑**（2026-09-23 首次踩、09-24 按实测修正，务必照做）

1. **含中文的标题 / 正文必须从 UTF-8 文件读**：`[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)`。
   PowerShell 5.1 的 `Get-Content -Raw` 对无 BOM 文件按 ANSI 读；**命令行里的中文字面量也会在传递中乱码** ——
   所以标题与正文都先落到文件里再读，不要在命令里写中文
2. **正文控制在 2000 字节内**（是字节，不是字符）：实测 **1770 字节通过、2325 字节被拒**，超了直接返回 `400`；
   详细内容放迁移文档，PR 正文只留结论与验证结果
3. **传给 Gitee 的 payload 文件必须无 BOM**：`[IO.File]::WriteAllText($p,$json,[Text.Encoding]::UTF8)` 会写出 BOM，
   JSON 开头多一个 `\ufeff` → 服务端解析失败，同样返回 `400`。
   用 `New-Object System.Text.UTF8Encoding($false)` 写（写完可核对前三字节应为 `123,...` 而不是 `239,187,191`）
4. **本机 `Invoke-RestMethod` / `Invoke-WebRequest` 连不上 Gitee API**：报 `Unable to connect to the remote server`，
   很容易被误判成"网络问题"（实际 `curl.exe` 同一时刻正常）。
   稳妥做法：用 **`curl.exe`** 发 `application/x-www-form-urlencoded` 请求（`--data-urlencode`）；
   **令牌从 `local-only/gitee.token` 读进内存后作为参数传**（不写进任何 payload 文件，读法见上文「助手代建 PR 用的令牌」），
   只有标题 / 正文落临时文件（系统临时目录，或已 gitignore 的 `local-only/`），**用后立即删除**
5. **核对服务端内容要按 UTF-8 解码后再比较**：直接打印 `Invoke-RestMethod` 的字段、或按 ANSI 读 `curl` 的输出，
   都会把**正确的中文误判成乱码**（已被误导过一次）。
   稳妥做法：取原始字节（`RawContentStream`，或 `curl -o` 存文件后 `[IO.File]::ReadAllBytes`）再 `[Text.Encoding]::UTF8.GetString()`

---

## 三、三类典型发布的差异（上线视角）

| 情况 | 额外动作 |
|---|---|
| **只改前端** | 不用重打 jar；只需上传 `index.html` / `js/` / `assets/` 中变更的文件 |
| **含数据库变更** | 迁移文档必须写清 SQL 与执行顺序；**上线前先备份库**；线上库禁止执行 `init.sql` |
| **协作者单独发分支** | 他们的发布不进 `main`、可能无 tag → 需在 `releases/发布记录.md` 补记一行并注明"无 tag / 仅个人分支"，同时更新主线的版本基底认知 |

---

## 四、权威性与修改规则

- 本文与 [`releases/上线文档.md`](releases/上线文档.md) 的关系：
  **本文 = 规范与清单（做什么、放哪里）；上线文档 = 操作手册（具体命令、路径、回滚脚本）**。
  两者冲突时，以本文为准，并回来修正上线文档。
- 本文与 [`COLLABORATION.md`](COLLABORATION.md) 的关系：
  **本文 = 变更流程与必做清单；COLLABORATION = 协作边界、授权与热点文件**。
  两者在"是否可直推 `main`"上必须一致 —— 均为**禁止直推，`main` 只能通过 PR 合并**（含上线）。
- 以下文件属**规范类**，修改需与协作者确认后提交：
  `PROJECT_RULES.md`、`COLLABORATION.md`、`AGENTS.md`、`releases/上线文档.md`、`README.md`
- 新增"文档类型"或"目录"前，先更新本文的文档地图，再建目录。
