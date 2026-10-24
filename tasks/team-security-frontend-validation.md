# 组队退款文案与前端安全验证记录

日期：2026-09-15。状态：**本地实现与前端验证完成；未提交、未 push、未上线**。

## 1. 范围与隔离

- 仓库：`D:\桌面文件\蛋蛋校园第二版\eggworld`；分支：`fix/team-refund-security`；开始时核对 `origin/main = 90ae23e`。
- 已阅读 `AGENTS.md`、`PROJECT_RULES.md`、`tasks/first-collaboration-plan.md` 及未跟踪工单 `TODO/工单-组队出资退还规则调整.md`。
- 本子任务只编辑 `growth-schoolv3.html`、`tests/team-security.test.cjs`、`tests/team-security.browser.js` 与本文件。共享工作区中的 backend、部署、其他测试与文档改动属于其他执行者，未修改或撤销。
- 按委派的独立前端子任务执行：先写失败回归，再修复，再运行生产渲染函数和真实点击；最终跨任务/全分支独立审查由主助手整合。本会话未另行启动审查子代理。
- 保持任务状态机、金额运算、定时器、API 调用、结算标记及判断不变；本次前端变动仅限文案和输出上下文转义。
- Python 静态服务仅绑定 `127.0.0.1:4173`；浏览器独立 session `teamsecurity`。
- 所有 `/api/**` 在浏览器 context 层本地 mock；除 `127.0.0.1:4173` 静态资源外，所有外部请求（含分享新窗口）均 `route.fulfill`，不放行至生产。页面产生的 `/api/track/page` POST 同样已 mock，不能将其报告为“没有任何 POST”；测试断言无业务写请求。
- 浏览器：本机 **Microsoft Edge 153.0.4234.32**。默认 Chrome 路径不存在，使用已安装 Edge，没有安装浏览器或改配置。

## 2. 先红后绿的证据

1. 修改 HTML **之前**运行 `node --test tests/team-security.test.cjs`：27 项中 **25 失败、2 通过**。F1–F23、退款旧文案、关联属性/技能邀请入口失败；已有脚本语法与 `jsArgAttr` 合约通过。
2. 完成主修复后：27 项全部通过。
3. 发现工单未列出的组队横幅仍称“双方确认完成后蛋蛋币到账”，先新增测试，得到 **27 通过、1 失败**，再修改横幅文案。
4. 增加双方角色/settled 分支测试后，发现旧 `teamConfirmComplete` 提示仍承诺全额 reward 到账及通用“确认后即可结算”。先新增回归得到 **29 通过、1 失败**，再仅修改这三句提示。
5. 最终专项：**30 项通过，0 失败、0 跳过**。包括 F1–F23、重复落点计数、inline script 编译、`jsArgAttr` 无外围引号、关联属性与技能邀请、结算角色/标记分支、遗漏的即时到账文案回归。

## 3. 主体变更 4：14 项逐项核对

工单原行号已偏移；下表使用当前文件行号。没有照抄工单第 3 项可能暗示立即退还的表述，统一明确 **双方确认完成后进入 3 天互评期，期满退还 80%；互评仅影响口碑**。

| 工单项 | 当前行 | 已实现/证据 |
| --- | --- | --- |
| 1 | 3292 | 类型说明改为 3 天互评期结束后退还 80% 出资；四尺寸发布页截图可见。 |
| 2 | 3319 | 发布须知资金说明移除均分门槛，明确 3 天窗口。 |
| 3 | 3319 | 删除默认 4 分结算；改为期满退款、互评仅影响口碑。 |
| 4 | 7753 | 广场详情 coinLabel 移除评分门槛，明确完成任务且 3 天互评期结束。A-2 实际点击详情渲染。 |
| 5 | 8159 | 配对提示明确完成任务且 3 天互评期结束后退还 80%；源代码检查。配对确认流程本次不提交。 |
| 6 | 8285 | 发布者 completed：未结算显示 3 天互评窗口，settled=1 显示“出资已退还。”；生产函数 VM 四分支测试。 |
| 7 | 8294 | 参与者 completed：同上；生产函数 VM 四分支测试。 |
| 8 | 8518 | 我的任务详情 coinLabel 同步；A-3 与四尺寸详情截图验证。 |
| 9 | 9223 | 注释同步为完成任务且 3 天互评期结束；固定 10 的代码不动。 |
| 10 | 9402 | 限定人数发布提示明确 3 天窗口，源代码检查。 |
| 11 | 9404 | 不限人数发布提示同上；四尺寸浏览器检查真实文本。 |
| 12 | 9480 | 发布者确认后的卡片提示改为“3 天后退还 80% 出资”；静态回归，未触发旧确认流程。 |
| 13 | 9501 | 完成通知改为“3 天后退还 80% 出资”；静态回归，未触发旧确认流程。 |
| 14 | 9502 | 完成 toast 同上；静态回归，未触发旧确认流程。 |

额外的同类文案漏项（仍仅文案）：3015 组队横幅；8281 已提交提示改为中性的“请确认任务完成情况”；9442、9445 旧参与者确认提示不再承诺 reward 全額/即时到账，明确 3 天后退 80%。均未改控制流或到账逻辑。

## 4. 附录 A.1：F1–F23（按每行，不按标题“16 项”）

所有行均有同名 `F<number> production sinks are encoded` 回归；“浏览器证据”指在本地真实 Edge 中执行原站函数/真实 DOM 点击，不是另外重写一个测试渲染器。

| 编号 | 修复 | 浏览器证据 / 边界 |
| --- | --- | --- |
| F1 | 详情标题 `escapeHtml(name)` | A-2：生产广场卡片“详情”按钮点击；标题载荷为纯文本，攻击节点 0。 |
| F2 | 描述 `escapeHtml(descEl.textContent)` | A-2：同一次实际点击；描述载荷纯文本。 |
| F3 | `escapeHtml(requirements).replace(/\n/g,'<br>')` | A-2：两行要求保留，恰好 1 个真实 br；攻击节点 0。 |
| F4 | `escapeHtml(task.requirements).replace(...)` | 我的任务生产详情入口；恰好 1 个真实 br，script/img 字符串纯文本。 |
| F5 | 我的打听回答昵称 | `loadMyGossip` + 实际点击“我的打听”tab；`myGossipList` 纯文本。 |
| F6 | 学校详情留言昵称 | `showBlSchoolDetail` + mock 接口评论；纯文本。 |
| F7 | 两分支 podium 昵称 | 普通榜/八卦榜各 4 人、2 人，覆盖两分支；昵称纯文本。 |
| F8 | 两分支列表昵称 | 同上，4 人/2 人覆盖两分支；昵称纯文本。 |
| F9 | 邀请头像首字 | `openInviteModal` 拉取 mock 邀请，再原函数渲染；首字 `<` 不形成节点。 |
| F10 | 邀请昵称 | `inviteHistoryList` 显示完整载荷，攻击节点 0。 |
| F11 | 管理端 MBTI | `renderUsers` 接收恶意 MBTI；`usersTableBody .c-school` 纯文本，无管理写操作。 |
| F12 | 两处技能子类文本 | `fetchPlazaInto/buildApiTaskCard` 与 `loadReviewTasks/buildReviewCard` 均实际渲染 script 载荷为纯文本。 |
| F13 | 我的任务详情分类/子类 | `showMyTaskDetail`：子类 script 载荷纯文本；分类通常由受控映射得到。 |
| F14 | 邀请发任务昵称 `jsArgAttr` | 实际点击 gossip 回答“邀请发任务”，带反斜杠/引号载荷的昵称完整到达目标弹窗。 |
| F15 | 技能发布 onclick `jsArgAttr` | 四组载荷真实点击；原 `publishFromSkill -> goPublish` 在描述输入框保留完整技能。 |
| F16 | 技能删除 onclick `jsArgAttr` | 同四组载荷真实点击 ×；`tempSkills.length === 0`。 |
| F17 | 技能 title 和标签正文转义 | 四组技能正常显示并可点击，未生成攻击节点、无 JS 异常；源码检查 title 使用 `escapeHtml`。 |
| F18 | 已选、个人资料、用户卡显式/隐藏技能 | 原技能编辑、`renderSkillProfile`、用户卡 7 个技能，实际点击“更多”后隐藏技能仍为纯文本。 |
| F19 | 八卦榜用户名 onclick `jsArgAttr` | `renderGossipTopList` 后真实点击，带反斜杠/引号昵称完整进入 `showUserEggModal`。 |
| F20 | 学校总榜 onclick `jsArgAttr` | `renderBlRankList` 后真实点击恶意校名，详情显示原字符串。 |
| F21 | 单指标校榜 onclick `jsArgAttr` | `showBlMetricRank` 后真实点击，关闭排名弹窗并打开对应学校详情，校名完整。 |
| F22 | 学校联想 addLabel 转义 | 实际 fill 学校搜索框、等待原联想组件下拉项、真实点击新增；`BL_SELECTED_SCHOOL` 等于原载荷。 |
| F23 | 两处 `noopener,noreferrer` | QQ 与微博实际分享按钮均产生真正的新窗口，分别在 popup 页面内读取 `window.opener === null`。目的页由 context route 本地返回，不访问第三方。 |

关联同源漏点：任务卡 `data-skill-cat` / `data-skill-sub` 用 HTML 属性转义；邀请技能的 `toggleInviteTaskSkill` 用 `jsArgAttr`，正文用 `escapeHtml`。这些与工单相同输入链，未改变功能；邀请技能四组载荷真实点击后原值往返通过。

`escapeHtml` / `jsArgAttr` 本体保持不变。要求字段严格**先 escapeHtml，再替换换行**；onclick 模板仍负责外围单引号，`jsArgAttr('plain') === 'plain'` 已验证。

## 5. A-1 至 A-6：载荷与结果

| 验收 | 实际输入/动作 | 结果 |
| --- | --- | --- |
| A-1 | 昵称 `<img src=x onerror=alert(1)>`；榜单四组合、我的打听、学校留言、邀请记录、用户卡 | 全部保留原文本，各目标内 `img[src="x"],script` 数量 0。 |
| A-2 | 标题/描述同上；要求为该载荷 + 换行 + `第二行 <script>alert(2)</script>`；API mock -> 生产卡片 -> 真实详情点击，再原我的任务详情 | 无 alert；两种详情要求各恰好 1 个 br。 |
| A-3 | 子类 `<script>alert(3)</script>` | 广场卡、我的任务详情及审核卡均为纯文本。 |
| A-4 | `x')"`、`\')`、`\');alert(9);//`、img 载荷；逐个真实点发布、删除、邀请技能 | 4 组 × 3 种动作通过；描述/选择结果原值往返，无 JS/console error。没有提交任务/保存技能 API。 |
| A-5 | 吐槽学校输入 img 载荷，等待原 `eggBindSchoolSuggest` 结果并点新增 | 下拉纯文本，选中值完整，无攻击执行；仅内存新增，没有提交吐槽。 |
| A-6 | 点击原 QQ、微博分享按钮，不替换 `window.open` | 两个真实 popup 的 opener 均为 null；第三方页面由本地 mock 响应。 |

额外 onclick 昵称/校名载荷使用 `\');alert(7);//"`（八卦榜、学校两榜）和 `\');alert(8);//"`（回答邀请）。实际点击后目标字符串完整，无执行。

## 6. 布局与截图

在相同真实 Edge 中设置 CSS viewport，height=900；布局并非真实手机测试。等待详情过渡动画结束后测量并截图。发布页滚动至退款说明，截图包含真实 3 天窗口提示。

| 宽 | 发布页 scrollWidth | 详情 left/right | 详情 clientWidth/scrollWidth | 结果 |
| --- | --- | --- | --- | --- |
| 1440 | 1440 | 440 / 1000 | 560 / 560 | 无横向溢出 |
| 360 | 360 | 0 / 360 | 360 / 360 | 无横向溢出 |
| 390 | 390 | 0 / 390 | 390 / 390 | 无横向溢出 |
| 430 | 430 | 0 / 430 | 430 / 430 | 无横向溢出 |

本地截图目录（不在仓库，不提交）：

`C:\Users\梁惠\.codex\visualizations\2026\09\13\01a09a4d-1e5a-7541-9e93-1501ab1f8e6f`

- `team-security-publish-1440.png` / `team-security-detail-1440.png`
- `team-security-publish-360.png` / `team-security-detail-360.png`
- `team-security-publish-390.png` / `team-security-detail-390.png`
- `team-security-publish-430.png` / `team-security-detail-430.png`

浏览器脚本的截图位置使用上述本机路径；其他机器重跑时需更换该目录。Playwright CLI 自身 session/snapshot 记录为本地运行时文件，不属于交付源码。

## 7. 重跑命令

在仓库目录运行；4173 已有服务时不要重复启动。

```powershell
python -m http.server 4173 --bind 127.0.0.1
# 另开终端
node --test tests/team-security.test.cjs
node --test tests/*.cjs
node --check tests/team-security.browser.js
npx --yes --package @playwright/cli playwright-cli -s=teamsecurity open about:blank --browser msedge
npx --yes --package @playwright/cli playwright-cli -s=teamsecurity run-code --filename tests/team-security.browser.js --raw
git diff --check -- growth-schoolv3.html tests/team-security.test.cjs tests/team-security.browser.js tasks/team-security-frontend-validation.md
```

测试脚本从 about:blank / 已有本地页面开始，在导航前设置网络隔离，不允许直接先打开生产页面。真实浏览器测试失败时命令以非零退出；`--raw` 输出逐条 checks、布局、dialogs/errors/consoleErrors、mock API 请求计数和浏览器版本。

## 8. 明确不足与未验证项

- **没有真实后端/数据库写入**：未通过昵称编辑 API 存储攻击字符串，未发布或审批恶意任务，未验证 DB 往返；用 API mock 和原生产前端渲染/真实点击验证输出安全。后端金额、并发结算、A-7 至 A-15、B 组配置验证由主助手执行。
- 没有等待真实 3 天、没有验证定时任务/余额入账；只确认文案保留到账窗口，且没有改前端业务逻辑。
- 仅 Edge，未跑 Firefox/WebKit、真实 Android/iOS、软键盘、读屏；四尺寸重点是发布页与任务详情，不等于全站每个页面/弹窗都已做响应式视觉验收。
- QQ/微博的新窗口是真实窗口，但第三方内容由本地 fixture 替代；证明本页面窗口隔离，不证明第三方分享网站可用性。
- 旧 `teamConfirmComplete` / `teamPublisherConfirm` 的遗留确认流程仅静态回归，没有模拟提交/确认/通知链；本次额外只改其到账文案。
- 发现既有非本工单问题：`goPublish` 寻找 `publishTitle`，实际表单标题 id 为 `publishName`。点击技能后描述正常预填，标题不预填；为避免越界改业务，**未修**。A-4 以实际预填的描述与原值往返为证，不声称标题预填通过。
- 浏览器 console 有原页面“密码字段未放进 form”的 VERBOSE 提示，不是 error；最终断言 pageerror、console error、攻击 dialog 均为 0。
- 主线程已确认全量 Node（包含真实 nginx）**87 通过、0 跳过**；此为主线程提供的集成证据，不冒充本子任务独立执行的结果。
- 未提交、未 push、未执行上线。已做本范围 diff 自查，最终独立审查/合并由主助手处理。

## 9. 最后一次执行摘要

最终浏览器执行（补齐主 #18 后）：**64 条检查通过**；API mock 请求 **144**；dialog=0，pageerror=0，console error=0；Edge 153.0.4234.32；命令退出码 0。主线程另独立重跑补 #18 前脚本：61 checks / 137 mock 请求 / 错误 0，并检查了 390 详情截图。请求计数随页面异步埋点存在小幅变化。

最后再次执行 `node --test tests/team-security.test.cjs`：30 通过、0 失败、0 跳过；`node --check tests/team-security.browser.js` 与本范围 `git diff --check` 均退出 0。


## 10. 主体 #18：真实互评入口（按最后指令不提交）

- fixture：task 71001，team / completed / settled=0，当前用户 999 为发布者，`rateDeadline` 为测试运行时间 +2 天，待评对象 userId=998。所有任务/待评对象 API 均本地 mock。
- 调用原 `loadMyTasks` 获取并渲染任务列表；真实点击“待我处理”页签、任务卡“去互评”、评价聚合弹窗“去互评”。未替换 `renderMyTaskRow`、`openTaskRating`、`buildTaskRatingCore`、`openTeamRating`、`openRating` 等生产函数。
- 原页面将已完成但尚待互评任务归入“待我处理”。首次测试误定位“已完成”分组而超时；读 `taskStageOf` 后仅修正测试定位，没有更改业务逻辑。该次在找入口时已停止，没有触发评价提交。
- 真实点击 5 星并填写“本地互评入口回归，不提交”；断言 `.star.on` 数量 5、评分弹窗及“提交评价”按钮可见。随后关闭弹窗，**未点击提交**。最终请求断言仅允许 GET 与已 mock 的 `/api/track/page` POST，未产生评价或其他业务写请求。
- 截图 `team-security-rating-1440.png` 位于第 6 节截图目录，已人工打开检查：背后的已完成任务卡、“去互评”、评分弹窗、评语和提交按钮可见；攻击任务标题显示为纯文本。
- **覆盖边界**：证明主 #18 入口在未来互评窗口 fixture 下可见、可点、可打开原评分表单及选星；按用户最新要求没有提交评价。不据此声称后端受理、数据库口碑计入、截止时间拒绝逻辑或结算定时器已验证，这些需主线程集成证据。

前端文件现已交接，停止编辑，供主线程独立审查；保留共享 4173 静态服务，不主动终止主线程可能共用的服务或浏览器会话。
