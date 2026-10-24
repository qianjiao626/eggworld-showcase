# AGENTS.md

## 项目定位
蛋蛋校园：面向大学生的校园社交与任务协作网站。当前前端以 `growth-schoolv3.html` 为主，后端为 Spring Boot + MySQL。

## 认知使用与 token 纪律（2026-10-07 起，默认按此执行）
目标是少花 token、少返工；除非任务本身要求通读，否则不要整份读大文件。
- **先查索引再读源码**：`aoci_search`（关键词/标签）→ `aoci_get_entries`（只取相关条目）→ 再 `read` 带 `offset/limit` 的必要行段（单次 ≤200 行）。
- **不通读**：`growth-schoolv3.html`（880 KB）、`js/dormitory-facts.js`（2.5 MB 生成数据）、`js/*.min.js`、`assets/**`、`backend/target/**`；`PROJECT_RULES.md`、`releases/上线文档.md`、迁移文档模板只读需要的那一节。
- **命令输出取尾部**：测试/构建只看结尾摘要（`| Select-Object -Last N`），不要把全量日志灌进上下文。
- **验证脚本固化复用**：视觉验证用 `output/announcement-style/verify-*.cjs`（一条命令 + 一张截图），不要每轮重新发明 CDP 写法。
- **维护只做一次**：一批改动稳定（提交完、测试过）后跑一次 `aoci_maintain`；纯只读问答/查版本不跑。
- **不进对话**：`aoci.txt` / `aoci.code.txt` / `aoci.meta.txt` / `.aoci/**` 是产物与治理资产，由工具按需读取，不要整份贴进上下文。

### 运行限额（硬约束）

每次工具调用都必须有边界，不要反复读大文件。

| 项目 | 限额 | 超限动作 |
| --- | --- | --- |
| 单文件读取 | ≤200 行，优先 `offset`/`limit` | 停；先用 Grep 定位 |
| 同一文件重读 | 1 次，除非文件已改动 | 停；重新确认需求 |
| Grep 输出 | ≤50 条匹配，只取命中行 / 少量上下文 | 收窄 pattern 或路径 |
| 构建输出 | 只取错误行（`ERROR` / `BUILD FAILURE` / 失败用例），≤40 行 | 不要贴全量日志 |
| 测试输出 | 只看摘要与失败项（`\| Select-Object -Last N`） | 不跑无关全量套件 |
| 单任务工具调用 | 软上限 30 次 | 停，复述需求，给出更短路径 |
| 连续无新信息 | 连续 3 次绕同一点 | 立即停止并重新评估 |

工作规则：
1. 先定位（Grep/Glob），再小范围 Read；绝不通读。
2. 一次只读一个文件的相关片段；独立调用并行发出。
3. 一批改动只构建/验证一次，只跑受影响的测试。
4. 超限时：停下复述已理解的需求，确认没有误解，再选最简路径或直接提问。
5. 最小改动：复用现有接口，不做无需要的抽象；能用脚本断言就不靠人眼看一堆截图。
6. 不重复验证已完成的工作；不重读、不重跑、不重截已通过的内容。
7. 超出预算：报告卡点、已花代价与建议的下一步，而不是继续消耗 token。

### 执行纪律（每次开工先读；来自真实翻车教训）

- **时间预算**：单次工具调用超过约 2 分钟转后台继续；约 10 分钟没有可验证的交付物就停下报告，不要硬磨。
- **子代理**：单个子代理任务控制在约 10 分钟内，必须有中间交付（构建或测试检查点）。约 8 分钟仍无检查点就向它要；给不出就中断、收回自己做。绝不把多小时的重构整体丢给一个子代理。
- **大改动**（删功能、动 10+ 文件）：先备份（`git diff` + 未跟踪文件落到 `output/backup/`），再分阶段（入口 → 渲染与状态 → 测试与文档），每个阶段结束都保持构建/测试绿色。
- **视觉验证**：用已固化的 `output/announcement-style/verify-*.cjs`（一条命令 + 一张截图），不要每轮重新发明 CDP 写法；截图/导出物放 `output/`（已 gitignore）。GUI 截图不要用 `Start-Process`（本环境会挂），用 PowerShell `.NET Process.Start`。
- **构建/测试**：合并 `main` 前必跑 `cd backend && mvn -o compile`；后端测试 `mvn -o test`；前端 `node --test tests/*.cjs`。只报错误行与失败项，不盲目跑全量套件。
- **端到端前后先清 8080**：`mvn spring-boot:run` fork 的 java 子进程不会被 StopCommand 杀掉，否则请求会打到旧代码上（详见「踩坑记录」）。
- **权限拒绝**：先判断是沙箱写边界还是 ACL 问题，再决定是否重试；不要重复执行同一条被拒命令。
- **不重复验证**：已通过的不重读、不重跑、不重截图。
- **可见交付**：每次等待都要以用户可核对的东西收尾——构建输出、测试结果或截图；否则停下说明原因。

## 修改规则
- **先读 [`PROJECT_RULES.md`](PROJECT_RULES.md)**（文档位置 + 变更流程的项目共识），再动手；新文档必须按其中的"文档地图"落位。
- 先读 [`tasks/first-collaboration-plan.md`](tasks/first-collaboration-plan.md) 与相关 API/流程文档，再改代码。
- **分支按主题建，不按任务建**（同一主题的小改动进同一个分支、复用已有分支、合并后立即删除）；
  **`main` 只能通过 PR 合并（上线同样先走 PR）**，不要直接改或推送 `main`。
- **攒批提 PR**：不要「改一点提一个」，改动先攒在分支上，等负责人说「提 PR」再推 + 建 PR（见 [`PROJECT_RULES.md`](PROJECT_RULES.md) 2.1 第 7 步）。
- **合并 `main` 前必跑 `cd backend && mvn -o compile`**（离线编译，几秒）—— 「合并漂移导致 `main` 编译不过」已重复发生 3 次。
- **git 命令合并成一条跑**（`git status; git diff; git log -5` 一次执行），别拆成多次调用；长提交信息用 `git commit -F <UTF-8 文件>`。
- **要上线的改动：迁移文档与代码进同一个 PR**（`releases/迁移文档/YYYY-MM-DD_<关键词>.md`），不要等上线前才补。
  一次上线含多个 PR 时，由上线执行方以上线名汇总、变更清单逐轮列清（见 [`PROJECT_RULES.md`](PROJECT_RULES.md) 2.1 第 5 步、2.3.1、2.3.2）。
- **迁移文档一律复制 [`releases/迁移文档/_模板.md`](releases/迁移文档/_模板.md) 起稿并逐节填满**（固定规范，不要自创结构、不要缺节）：
  - 抬头必须含：类型（`仅前后端文件` / `含数据库变更`）、关联文档、**部署包目录**、**上线前 `gitSha`（实测）**、
    「上线后线上版本：待上线验证通过后回填」、**对比基底**（最近 `release/*` tag；线上那版没有 tag 时必须写显式 `-Base`）
  - 变更清单每行写清 **`仓库文件 → 服务器绝对路径`**，并标明「参与部署 / 仅测试」；未改动的 `js/`、`assets/` 也要写明「不上传」
  - 「文件删除」无则写「本次无删除」；「数据库变更」无则写「无」，有则写**脚本（含服务器 `/home/xiaos/eggworld/sql/` 路径）+ 库备份命令（`mysqldump -u eggworld` → `~/eggworld/backup/db/`，`chmod 600` 并抽样验证可读）+ 执行顺序（先建表、再切 jar）**；
    线上库账号 `eggworld`（密码不写文档）；**永远不执行 `init.sql`**（线上已另存 `~/eggworld/backup/init.sql.READONLY-禁止执行`）
  - 服务器路径一律以线上实际结构为准（jar `/home/xiaos/eggworld/eggworld.jar`、前端 `/home/xiaos/eggworld/xs/`、脚本 `/home/xiaos/eggworld/sql/`、
    备份 `/home/xiaos/eggworld/backup/<日期>-<标识>/` 与 `/home/xiaos/eggworld/backup/db/`）——完整目录见 [`releases/迁移文档/_模板.md`](releases/迁移文档/_模板.md) 顶部速查
  - 部署步骤**必须含「本地生成增量部署包」这一步**（`powershell -ExecutionPolicy Bypass -File backend\build-deploy.ps1 -Name "<与文档同名的上线名>"`，
    在 PR 合并进 `main` 后执行；默认以最近 `release/*` tag 为基线，线上那版没 tag 时显式 `-Base`；核对包内「部署说明.md」的删除清单），
    再写服务器侧动作：备份（普通用户、禁 `sudo`、验证可读）→ 库迁移 → 上传 → 重启 → `/api/health` 版本自查 → 删除项默认不执行
  - 验证清单写成**可勾选项**（含权限边界、协作者成果未回退、多宽度）；回滚方案写清要恢复的旧文件与**不可逆**的资金变动
  - 规范细则见 [`releases/上线文档.md`](releases/上线文档.md) 4.3 / 4.4 / 4.5；缺项会被上线执行方退回
  - 上线验证通过后，回填抬头「上线后线上版本」与 [`releases/发布记录.md`](releases/发布记录.md)
- 助手**可以**做：建分支、改文件、提交、推送分支、跑只读核对（如 `backend\check-live.ps1`）；
  **PR 可代建，但不主动提** —— 攒在分支上，等负责人说「提 PR」再推 + 建 PR。
  代建 PR 时用 [`.gitee/PULL_REQUEST_TEMPLATE.md`](.gitee/PULL_REQUEST_TEMPLATE.md) 填正文，并报出 **PR 链接 + 可合并状态**。
  代建方式：令牌**从仓库下的 `local-only/gitee.token`（单行，已 gitignore）读进内存**，再用 Gitee OpenAPI
  （`POST /api/v5/repos/{owner}/{repo}/pulls`）建 PR；没有该文件时给不出 PR 链接，改为交付「建 PR 链接 + 标题 + 正文」，由人点创建
  —— 令牌**只在内存中使用，不打印、不落盘、不进仓库**（读法与示例见 [`PROJECT_RULES.md`](PROJECT_RULES.md) 2.8）。
  ⚠️ 用 Gitee API 代建时的实测坑（09-23 首踩、09-24 按实测修正；完整版见 [`PROJECT_RULES.md`](PROJECT_RULES.md) 2.8）：
  ① 含中文的标题 / 正文**必须从 UTF-8 文件读**，别在命令行里写中文（传递中会乱码）；
  ② **正文控制在 2000 字节内**（实测 1770 通过、2325 被拒），超了返回 400，细节放迁移文档；
  ③ **payload 文件必须无 BOM**（`[Text.Encoding]::UTF8` 写文件会带 BOM，同样 400），用 `System.Text.UTF8Encoding($false)`；
  ④ 本机 `Invoke-RestMethod` / `Invoke-WebRequest` 连不上 Gitee API（报 `Unable to connect`，并非网络故障）→ **改用 `curl.exe`**；
  ⑤ 核对响应要按 UTF-8 解码后再比较，否则会把正确中文误判成乱码。
- **仓库远端（2026-09-23 起）**：主远端为 `gitee` = `https://gitee.com/xiaoshuai02/eggworld.git`（日常推送走它）；
  `origin` = GitHub，保留作备份。**不带参数的 `git pull` / `git push` 走的是「当前分支的 upstream」**：
  `main` 已显式跟踪 `gitee/main`（2026-09-24 设置），**其它分支不保证** → 仍请显式写 `git push gitee <分支>`
  （本机一次性设置见 [`PROJECT_RULES.md`](PROJECT_RULES.md) 2.8）。
  GitHub 侧 PR 模板仍在 `.github/PULL_REQUEST_TEMPLATE/default.md`，与 Gitee 那份内容一致。
- 助手**不可擅自**做：**合并 PR**、直推 `main`、打 `release/*` tag、改线上（服务器 / 数据库 / 邮件配置）、
  **删除分支**（本地或远端，须先列清单、由人确认后执行）
  —— 这些必须由人确认后执行。完整流程见 [`PROJECT_RULES.md`](PROJECT_RULES.md) 第二节。
- 共享大文件 `growth-schoolv3.html` 只做小范围、可回滚修改，避免无关格式化。
- 前端样式遵守 [`PROJECT_RULES.md`](PROJECT_RULES.md) **2.7 的浏览器支持基线**（Baseline Widely available 直接用、不写降级、不做 UA 判断）；
  **移动端专属改动必须写在媒体查询 / 容器查询内**，改共用规则后两端都要验。
- 不提交密码、JWT、数据库转储、真实邮箱配置或本地运行时目录。
- 不连接正式数据库；本地联调使用 `D:\CodexData\local\eggworld` 隔离环境。
- 后端改动必须补测试；修 bug 先写能复现问题的回归测试。
- 不改变任务状态机、蛋蛋币规则或数据库结构，除非需求明确批准。

## 功能验证流程（每个新功能 / 兼容扩展必做）
- **先补可运行的回归测试**：前端优先 `tests/*.test.cjs`（静态结构 / 契约断言），需要真实交互的用 `tests/*.browser.cjs`；后端补 JUnit。测试要能钉住新行为，并覆盖周边内容——与既有页面结构、样式作用域、缓存版本号、接口契约的关系，而不只是新增的那一行。
- **用真实浏览器跑一遍**：布局类改动同时看正常宽度与窄屏（移动端）；确认共用规则改动没有影响另一端；检查受影响的主题、样式作用域与导出/分享路径。
- **记录实际验证了什么、还剩什么限制**：没跑过的不要写成已验证。
- **把验证中发现的解析/布局问题固化成断言**：补有意义的自动化回归检查，而不是只留一张截图；截图与导出物放 `output/`（已 gitignore）。
- **测试全绿 ≠ 功能正确**：本仓库前端测试多为静态结构断言，覆盖不到新交互。新交互必须先补一条能钉住它的测试，再用真实浏览器点一遍 / 读 computed style / 打接口。
- **关联 issue**：处理 Gitee / GitHub issue 时，在完成提交里引用 issue 编号；不要自动回复报告者，收尾时给维护者一份回复草稿。

## 验证
- 命令清单见 [`PROJECT_RULES.md`](PROJECT_RULES.md) 第 2.2 节：后端 `cd backend && mvn -o test`；前端 `node --test tests/*.cjs`。
- 后端：`backend` 目录执行 Maven 测试与打包。
- 前端：检查 HTML/JS 语法与关键流程；有真实浏览器/手机验证时才报告为已验证。
- 报告必须区分已实现、已验证、未验证。

<!-- aoci:begin -->
## AOCI 仓库认知

AOCI 为本仓库维护一个稳定、可版本化、可增量更新的仓库级认知层，供模型跨任务复用对系统的理解。

`aoci.txt` 是面向模型的结构化认知索引。它以每个受管理文件、数据库表或其他受管理对象一条独立 Entry 的方式，用符号标签与 F/R/A/S 语义表达对象的核心职责、重要关系、对外契约，以及理解或修改系统时必须知道的非显然约束和设计决策。

Header、目录段和全部 Entry 共同组成完整仓库索引，可以覆盖前端、后端、配置、数据库结构及其他受管理内容。受管理内容发生变化时，通常只需维护受影响的认知条目，不需要重新生成整个索引。

AOCI 提供系统架构、对象职责、重要关系、对外契约和关键约束的高密度视图。

### 工作原理

AOCI 采用“模型生成、模型读取”的认知闭环。

Header、Entry 和 Curation 语义的创作只按当前机器签发的 Plan 与实时 Guide 执行；由 Host 模型基于当前绑定证据独立完成。

Entry 的语义必须来自模型对真实证据的理解。不得仅依据路径、文件名、扩展名、AST、符号列表、依赖扫描、正则、固定模板或规则引擎推导、预填、拼接或改写索引语义。

对 Fresh Bootstrap，只按当前机器签发的 Plan 和实时 Guide 执行。当它们要求创作时，Host 模型创作 Root、Meta、Tag 和 F/R/A/S，提供 authoring-run 声明，并把它绑定到 Plan、Evidence 与完整 Candidate。不得要求 AOCI 填写 `origin=host_model`、制造 Receipt 或把程序生成的 Framework 当作语义。本文件不自行重建 Onboarding 流程。内部批次不是用户决策；只有遇到既有批准边界或真实的安全、漂移、CAS、Recovery 条件才停止。

### 最小使用入口

- `aoci_rules`：取得当前AOCI版本的会话运行合同。
- `aoci_overview`：建立或恢复本仓库的完整认知。
- `aoci_maintain`：受管理对象达到最终稳定状态后检查认知是否需要维护。
- `aoci_update_entry`：提交与当前证据和源码摘要绑定的完整语义更新批次。
- `aoci_report`：仅当当前布局和工具状态支持时，在证据不足、无法可靠生成语义时登记待办，不猜写。

其他MCP工具、CLI命令、参数和专项流程，以当前工具说明、Guide和 `--help` 返回内容为准，不在本文件中重复完整手册。

本区块只规定仓库接入、认知使用和收尾原则。`aoci_rules` 承载当前会话合同，Guide实时输出承载当前Plan的执行顺序与停点，工具Schema、Spec和Validator承载机器结构与判据；Prompt、Description、README和静态文档不能覆盖这些机器事实。

### 建立、生成和恢复认知

1. 每个新的 Agent Run 开始时，应先判断：

   - 本仓库是否已经存在可用的完整AOCI索引；
   - 当前上下文中是否已有与本仓库根、当前索引版本和当前AOCI服务相匹配，并且模型仍可可靠使用的完整仓库认知。

2. 仓库已经存在可用的完整索引，但当前Run没有可靠完整认知时，先调用 `aoci_rules`，再调用 `aoci_overview`。

   完整认知仍可靠时直接复用。局部不确定本身不要求机械重读系统全貌。

   本Run从已知Host上下文压缩恢复时（包括宿主注入的压缩摘要），必须把此前模型认知视为不可靠。压缩handoff不得保留或摘要正式Whole-Index，也不得保留或摘要任何Overview Header、Entry、Chunk、Challenge或Attestation正文；只能保留安全续接所需的receipt身份、未完成write或Recovery状态，以及立即重载指令。复制进handoff的Whole-Index语义或receipt不能证明恢复后模型的当前认知可靠。若当前上下文已无法可靠保留运行合同，先调用 `aoci_rules`。继续业务任务前，使用 `refresh_reasons=["context_compaction"]` 和新的 `refresh_event_id` 调用普通完整Whole-Index `aoci_overview`（不设置 `check_only` 或设为false）；不得使用 `check_only` 或认知probe。原样跟随每个 `next_cursor` 直到 `completed=true`，确认交付，并且只基于新交付正文提交一次Attestation。完成这次新的完整传输后，即使Attestation为partial或fail也消费该generation，并按既有合同继续source-bound任务，不再自动调用第二次Overview。

   AOCI可以针对 `context_compaction`、项目 `cognition_refresh_threshold` 下的机器 `semantic_threshold` 或主要 `phase_transition` 提供checkpoint与认知状态事实。只需要这些紧凑事实时使用 `check_only=true`；这些事实只向Agent提供建议，不替模型决定是否需要系统全貌。

   Agent显式调用普通 `aoci_overview`（未设置 `check_only` 或为false）时，只要能形成一致的CognitionSet，AOCI必须完整交付请求scope。不得因为已有receipt、阈值未达到或没有待处理刷新原因而抑制正文。正式认知Dirty或Stale时仍交付正文，但必须标记不可靠。存在未决恢复或无法形成一致snapshot时失败关闭，不返回混合正文。

   普通Overview返回 `continuation_required=true` 时，必须原样提交 `next_cursor` 并自动继续到 `completed=true`。不得询问用户、开始业务任务或给出阶段性系统结论。Host截断、缺块、重复、乱序、cursor失败、Index变化或`chunk_tokens`变化时停止本次认知链。Attestation完成前不得用Memory、源码、Spec、`aoci.txt`、历史会话、scope、search或Entry读取修补或补充Whole-Index认知。Challenge ordinal是正式Entry序列中的1-based位置；Header内容、注释、空行、Section/Overview/Chunk Marker、Receipt与Metadata均不计数，Chunk Receipt ordinal使用同一序列。Attestation必须原样回绑本次Challenge发布的当前`index_sha256`、`entry_sequence_sha256`与`entry_count`；旧Index、旧Entry序列、旧数量或旧Attestation均无效。完整链结束后只正式提交一次既有模型认知Attestation；同一响应只允许一次不改变语义答案的JSON Schema或字段格式修正。对象、Tag或F不匹配即失败且认知吸收不确定，不得语义重试或旁路补答。首次认知失败时还不得执行Root/Meta、Migration、全局布局或其他未重新绑定的系统级决策。上下文压缩刷新若传输完整、认知身份不变、治理对齐且没有Recovery或第三方冲突，即使Attestation为partial或fail也消耗该refresh generation，并继续原任务，不再自动重读Overview。`system_mastery_percent`只自评系统框架——架构、职责、强关系、稳定外部契约以及高熵安全和维护约束——不表示完整实现或运行实况知识；机器索引覆盖率必须分开。默认只向用户输出由本次真实覆盖率、Challenge、块数、Token和掌握度生成的规定成功或失败一句话。Host截断时提示用户把 `overview_delivery.chunk_tokens` 设置为更小的合法值后重新开始，不得自动修改。

   加法认知等级必须与严格证明字段分开解释。`delivery_verified`表示已加载Index且Host交付已确认，但完整认知验证仍未完成；应表达为“已加载且交付已验证”，不得描述为“没有认知”或“没有理解系统”。`cognition_verified`要求Attestation通过（Challenge至少80%的ordinal完全正确且对象身份至多失手一处），`cognition_governed`还要求治理对齐。通用完整读取失败句只用于真实交付故障。

   当Overview响应包含可选`cognition-state/v2`投影时，必须分别解释各维度。其Level止于`model_cognition_usable`；`strict_attestation_verified`、`governance_aligned`与`current_system_cognition_reliable`都是独立状态，绝不参与该Level。ordinal、对象身份、Tag或核心F不匹配可以导致严格Attestation失败，而模型认知仍然可用；不得仅凭这种不匹配就宣称模型没有理解系统。只有`current_system_cognition_reliable=true`允许无保留地声称当前完整系统认知可靠。投影缺失时继续使用上述Legacy解释。

   普通的只读审计、分析、检查、不修改代码或不提交、不push，不自动等于严格零写入，也不改变上述认知有效性判断。Codex Memory和历史Skill只能辅助恢复经验、用户偏好与调查方向，不能替代与当前仓库根、索引摘要、AOCI服务身份和认知范围匹配的当前认知收据；项目AGENTS和当前AOCI身份在AOCI状态上优先于历史Memory。

   只有用户明确禁止Ledger、元数据、`.aoci`运行资产及任何文件写入时，才按严格零写入处理。若必要的认知建立与该边界冲突，必须报告冲突并请求用户裁决或建议使用隔离副本，不得静默以Memory替代当前仓库认知。

3. 仓库没有可用的完整索引，或当前只有最小骨架、Header不完整、Entries未完成、必要Curation尚未裁决时，如果需要建立正式完整AOCI索引，先取得 `aoci_rules`，然后进入当前AOCI Guide。由Guide依据仓库真实状态决定下一阶段并完成必要安全步骤。

   `aoci_maintain` 不替代索引建立流程。

   不在本文件中自行重建或硬编码完整索引生成状态机。

4. 在长程任务中，模型负责保留当前认知收据并正确使用刷新门禁：

   - Host报告上下文压缩或模型已知系统全貌丢失时，执行上述强制 `context_compaction` 重载规则；AOCI不能自行推断Host事件；
   - 进入真正的主要阶段时声明 `phase_transition`，不得把函数、测试运行或小步骤当作阶段；
   - 在有用的稳定检查点通过 `check_only=true` 取得机器语义计数；
   - 除已知压缩的强制重载外，由Agent判断当前任务是否需要再次显式获取指定scope或完整Overview；
   - 在维护和对齐完成前，保留AOCI报告的Dirty或Stale可靠性状态。

### 任务收尾与认知维护

5. 纯只读问答、分析、版本核验，或没有产生受AOCI管理对象变化的任务，不需要调用维护工具。当前AOCI版本是任意`aoci_overview` check_only或`aoci_maintain`响应里的`cognition_receipt.mcp_service_version`；二进制路径是项目`.mcp.json`里的`command`，CLI不必在PATH上。

6. 发生受AOCI管理对象变化时，待其达到本次任务的最终稳定状态后，只调用一次 `aoci_maintain`。不要在每次中间修改后逐文件维护。

7. 若维护结果返回真实语义候选，Host 模型必须基于每个候选绑定的对象和必要证据，独立创作完整标签与F/R/A/S更新。通过 `aoci_update_entry` 一次提交当前机器签发批次的完整候选集合，同时原样保留每项 `source_sha256`、`candidate_id` 与对应domain批次身份。`max_entries`只限制单次请求和原子事务，不限制logical plan、Whole-Index或Managed Scope。`remaining`非零时，在当前批次成功Apply后重新调用Maintain并从新preimage继续；绝不能为满足transport上限缩减Index覆盖或自行截取返回批次。

   没有足够证据且当前布局支持 `aoci_report` 时，使用它而不猜测、套用模板或为消除待办而生成缺乏证据的认知。

8. 必须遵守工具返回的结构化状态和安全边界：

   - `repair_required`：只修复明确命中的候选，再重新提交当前机器签发的完整批次；
   - `stopped`：结束当前写入尝试并检查 `failed_step`、错误、正式写入证据与Recovery。auto模式下，已证明零写入则记录closure并重新Plan；完整Intent和可证明postimage则Resume；策略要求Rollback且preimage可证明则精确恢复后重新Plan。只有证据不足、第三方正式字节冲突、需要审批或外部动作，或命中其他真实安全边界时，才停止整个用户任务；
   - 冲突、审批、人工裁决、权限和安全信号不得忽略；
   - 已经对齐后不得重复维护或重复写入；`refresh_ready_for_overview` 是checkpoint事实，由Agent决定是否为下一阶段请求普通完整Overview。

   维护完成后如果又修改了任何受管理对象，之前的维护结果失效，应在新的最终稳定状态重新完成收尾。

9. 用户只限制业务文件范围，但没有明确禁止仓库托管资产时，AOCI托管资产可以在收尾阶段为保持认知一致而更新，并应在审计和提交中与业务文件区分。

   用户明确禁止修改 `aoci.txt`、`.aoci`、元数据或任何额外文件时，以用户限制为准，不得写入，并如实报告剩余不一致。

### 专项流程

初始化、完整索引生成、Header生成、Entries生成、数据库结构索引、Curation、人工评审和故障恢复，只按当前AOCI Guide或工具在对应阶段返回的指令、命令和安全停点执行。

不预加载、不猜测，也不自行重建这些专项流程。平台调用方式、请求格式、批次上限、审批规则、索引格式细节和恢复步骤由对应Guide、工具说明、模型Prompt和CLI帮助按需提供。
<!-- aoci:end -->
