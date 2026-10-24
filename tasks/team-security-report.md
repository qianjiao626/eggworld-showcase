# 组队出资退还与安全加固｜协作验收报告

日期：2026-09-15；分支：fix/team-refund-security。本文为最终验收汇总，子报告中的“未提交”是各子任务交接时快照，不代表最终 Git 状态。

## 微信摘要

本次完成主体资金修复、附录 A 全部项目及 B 组仓库配置/运维说明。组队每人仍出资 10 币，任务完成且原有 3 天互评期结束后退 8 币；是否评价、评分高低不再影响退款，评价仍影响口碑。修复驳回时教学凭空退款、组队超额退款，以及重复结算/重复审核风险。补齐 XSS、点赞、验证码、参数校验等安全保护。

**只交付功能分支与 PR，不合并、不上线。未读取或更改生产数据库，无数据库迁移脚本。B6 生产日志配置仍须运维执行，Linux systemd 需维护窗口验证。**

## 1. 核心实现

- TaskService.frozenAmountOf 为发布/驳回/过期退款口径：help→reward，team→10，teach/reward→0。发布先 copyProperties，再固定 team.reward=10，再计算冻结额。
- 审核通过和驳回均采用 pending 条件更新，抢占成功才发经验/退钱/通知；防止并发重复副作用。
- RatingService 先 markSettled 条件更新，再退钱；全部在原事务内。实际 SQL/通知失败会回滚结算标记、余额、流水，重试只能成功一次。
- 10、0.8、3 三个常量不变；3 天调度结构不变。完成不意味着立即到账。
- 验证码最多错 5 次；并发尝试串行消费。第 5 次失效但保留发送时间，不能绕过原有 60 秒重发冷却。
- 点赞禁自赞，回答计数原子递增，唯一键竞争转友好业务提示；pair 在冻结/状态变化前校验全部 ID 命中。
- HTML 仅局部修改：14 处指定文案及同类遗漏文案，F1–F23 转义点、jsArgAttr 事件参数、新窗口隔离。

## 2. 已执行验证

| 层级 | 结果 | 证据 |
|---|---|---|
| 默认后端测试及打包 | 68 通过，0 失败/错误/跳过；BUILD SUCCESS | team-final-build.log；新增 7 个默认测试类，另有独立 IT（见文件清单） |
| 真实 MySQL 集成 | 37 通过，0 失败/错误/跳过 | team-security-mysql-validation.md；TeamFundsMysqlIT |
| Node 全量（含实际 nginx） | 87 通过，0 失败/跳过 | team-frontend-all.log；真实 nginx -t 与 TLS/HTTP 响应 |
| 真实 Edge 浏览器 | 64 个检查点通过，144 个 mock 请求；弹窗/页面异常/console error 均 0 | team-browser-final.log；team-security-frontend-validation.md |
| 本地空库完整后端启动 | health code200/status up；管理员初始化 1 个，明文口令/SQL 参数日志均未出现 | team-security-boot/verification.json |

默认后端与独立 IT 共 105 次测试执行。浏览器 64 个检查点不算成 64 个独立端到端测试。默认 Maven 不自动执行 IT，需显式开启。日志位于本机 D:/CodexData/local/eggworld，不含在提交中。

### 主体清单：18 项

| # | 验证项 | 结果与方法 |
|---|---|---|
| 1 | teach 驳回不退款 | 通过；真实 MySQL/单元测试，余额与流水不凭空增加 |
| 2 | team 驳回只退 10 | 通过；真实 MySQL/单元测试，旧 reward 不影响实际冻结口径 |
| 3 | help reward=20 驳回退 20 | 通过；真实 MySQL/单元测试 |
| 4 | 金额上限 | 通过；按已确认勘误测 10001 拒绝、9999 合法，保留 @Max(10000) |
| 5 | API team reward=9999 规范化 | 通过；服务测试及真实 MySQL：落库 10，冻结流水 -10 |
| 6 | 无互评完成后到期各退 8 | 通过；真实完成流程，移动测试库时间后调用原调度 |
| 7 | 互评 5 分各退 8 | 通过；真实互评、结算、余额/流水断言 |
| 8 | 互评 1 分各退 8、口碑下降 | 通过；真实互评计入口碑，与资金独立 |
| 9 | settled=1、重复不发钱 | 通过；真实数据库断言 |
| 10 | 并发结算一次 | 通过；5 轮不同连接竞争同一旧状态；另验证故障回滚及重试 |
| 11 | 旧评分退款门槛文案清零 | 通过；生产 HTML 检索/Node 回归；历史文档不作删除 |
| 12 | 发布/卡片/详情/完成弹窗/toast 文案 | 通过；精确文案回归与真实渲染，注明 3 天互评期后到账 |
| 13 | 未结算显示将退 80% | 通过；真实详情渲染、四种视口验证 |
| 14 | help 完整流程 | 通过；真实数据库发布至确认，核对余额/流水 |
| 15 | teach 完整流程 | 通过；认领者付费、发布者收款不变 |
| 16 | 配对后取消组队 | 通过；真实发布者与两名入选者各退 10 |
| 17 | 3 天无人认领过期 | 通过；help 退 reward/team 退 10；已有认领不错误过期 |
| 18 | rate_deadline、互评入口、口碑 | 通过；数据库验证窗口与真实提交计入口碑；浏览器真实点入口、星级并填写评语，未点提交 |

### A.4 清单：15 项

| # | 验证项 | 结果与方法 |
|---|---|---|
| A-1 | 昵称五处 XSS | 通过；真实 Edge 渲染攻击载荷为纯文本，无攻击节点/弹窗 |
| A-2 | 任务标题/描述/要求 XSS | 通过；真实详情渲染纯文本；换行仍为 br |
| A-3 | 技能子类 script 载荷 | 通过；真实卡片与详情渲染纯文本 |
| A-4 | 技能标签引号/反斜线注入 | 通过；真实点击发布/删除/邀请，参数原样往返，无 JS 错误 |
| A-5 | 学校搜索注入 | 通过；真实输入、下拉渲染为纯文本 |
| A-6 | 分享窗口 opener | 通过；QQ/微博真实新窗口 opener=null，目的站离线 mock |
| A-7 | reward=99999 | 通过；真实 MockMvc 校验拦截，业务 code=400 |
| A-8 | 邀请 11 个技能 | 通过；真实 MockMvc 校验拦截，业务 code=400 |
| A-9 | 自己回答点赞 | 通过；服务测试拒绝且无写入 |
| A-10 | 重复回答点赞 | 通过；真实并发唯一键竞争，友好业务错误，计数/记录一次 |
| A-11 | 验证码错 5/6 次 | 通过；顺序及 8 线程尝试、成功仅消费一次、失效保留冷却 |
| A-12 | 并发审核 | 通过；5 轮真实数据库竞争，经验只 +5 一次；额外审核/驳回竞争 |
| A-13 | pair 不存在 ID | 通过；真实事务业务 code=400，任务仍 approved，资金/认领/通知无改变 |
| A-14 | 重启日志不泄露口令 | 通过；空本地库实际启动 jar，触发管理员初始化；内存比较日志，未输出口令 |
| A-15 | 忽略自动化目录 | 通过；git check-ignore 与 git status、Node 回归 |

说明：项目现有 API 使用 HTTP 200 + JSON 业务 code=400，未擅自改全局异常协议。A-1～A-5 是真实浏览器执行生产渲染代码与攻击载荷，**不是静态检查替代**；接口数据由 mock 注入，未向生产或测试后端保存攻击资料。

### B 组：实现与发布状态分开

| 项 | 仓库交付 | 验证/待办 |
|---|---|---|
| B1 CORS | 已收敛为主站 HTTPS 与本地开发 | 20 项实际 Spring MVC 测试；部署前确认实际跨域来源 |
| B2 安全头 | 已补齐；CSP 仅 Report-Only | 真实 nginx TLS/HTTP 验证；未启用强制 CSP |
| B3 敏感路径 | 隐藏/敏感后缀拒绝；保留 ACME | 真实 nginx；历史 xs 片段是替代方案，不与当前路由叠加 |
| B4 限流/体积/超时 | 2m、10/60/60、auth 1r/s | 实际 413/429 与限流恢复等验证；发布前检查其他站点兼容性 |
| B5 systemd | 六项沙箱配置、/usr/bin/java | 静态检查通过；**未在 Linux 实际启动验证**，需确认 JDK17+ 与路径权限 |
| B6 生产日志 | 已提供脱敏变更片段与验收步骤 | **未读取/修改生产 application-prod.yml**；运维维护窗口执行 |

## 3. 兼容性、差异与未完成项

- 无表结构变化、无迁移 SQL；没有修正或回收既往错误发放的资金。旧 team.reward 非 10 不再作为驳回金额；已 settled=1 的任务不补发，旧 settled=0 的完成任务到期按新规则处理。
- 工单 #4 的“9999 超过 10000”是笔误，按用户确认更正验证值；不把注解改小。
- GossipPost 无 likes 字段/列：沿用 gossip_likes 唯一记录 + COUNT，不照抄会报错的 posts.likes SQL；回答有计数字段，使用原子自增。
- Spring CORS 任意端口采用 :[*]，而不是工单的 :*；实际允许/拒绝测试已覆盖。
- A.1 标题写 16 项，但具体点位是 F1–F23，已全部逐点处理。严格先 escapeHtml 后换行替换；jsArgAttr 不含外围引号。
- 未做生产部署、Linux systemd 运行验证、真实手机/微信内置浏览器验证、真实外部分享站验证；不把桌面窄视口当真机。
- 没有等待现实 3 天：只移动隔离测试数据时间、执行原调度。浏览器评分未提交，服务端真实评分提交由 MySQL IT 覆盖，未声称整条真实网络 E2E。
- 本地打包用于测试，health 的版本元数据为空；正式发布仍须依照发布脚本生成带版本元数据的产物。
- 既有其他资金入口、过期调度多实例竞争、默认管理员密码策略等不在本工单范围，未扩大修改。
- 用户原有未跟踪 TODO 工单与审计报告原样保留，未擅自提交；本报告及迁移文档独立说明交付范围。

### 最终复审与再次执行

独立只读复审关闭验证码冷却 P2；未发现明确新增高风险回归。仍要求发布前验证 /usr/bin/java 为 JDK17+、共享 nginx 路由兼容性。主线程再次运行默认测试/打包 68 项、独立真实 MySQL 37 项、Node 87 项、当前浏览器脚本 64 检查点，均通过。最新 IT 日志为 D:/CodexData/local/eggworld/team-security-test/maven-it-final.log；专项报告保留其上一轮独立验证库与时间，非最新测试库。

## 4. 改动文件清单

以下均相对于仓库根目录（旧 nginx 文件为原内容改名）：

- `.gitignore`
- `backend/build-deploy.ps1`
- `backend/deploy/dsxnb.conf`
- `backend/deploy/eggworld.service`
- `backend/deploy/nginx-xs-location.conf`
- `backend/deploy/nginx.conf`
- `backend/deploy/nginx.conf.deprecated`
- `backend/src/main/java/com/eggworld/config/DataInitializer.java`
- `backend/src/main/java/com/eggworld/config/WebMvcConfig.java`
- `backend/src/main/java/com/eggworld/controller/UserPublicController.java`
- `backend/src/main/java/com/eggworld/dto/InviteTaskDTO.java`
- `backend/src/main/java/com/eggworld/dto/PublishTaskDTO.java`
- `backend/src/main/java/com/eggworld/job/RateSettleScheduler.java`
- `backend/src/main/java/com/eggworld/job/RefundScheduler.java`
- `backend/src/main/java/com/eggworld/mapper/GossipAnswerMapper.java`
- `backend/src/main/java/com/eggworld/mapper/TaskMapper.java`
- `backend/src/main/java/com/eggworld/service/ClaimService.java`
- `backend/src/main/java/com/eggworld/service/GossipService.java`
- `backend/src/main/java/com/eggworld/service/RatingService.java`
- `backend/src/main/java/com/eggworld/service/TaskService.java`
- `backend/src/main/java/com/eggworld/service/UserService.java`
- `backend/src/main/java/com/eggworld/service/VerifyCodeService.java`
- `backend/src/test/java/com/eggworld/config/AdminStartupLogSecurityTest.java`
- `backend/src/test/java/com/eggworld/config/CorsSecurityTest.java`
- `backend/src/test/java/com/eggworld/controller/TaskSecurityApiTest.java`
- `backend/src/test/java/com/eggworld/dto/TaskSecurityValidationTest.java`
- `backend/src/test/java/com/eggworld/service/SecuritySmallFixTest.java`
- `backend/src/test/java/com/eggworld/service/TeamFundsMysqlIT.java`
- `backend/src/test/java/com/eggworld/service/TeamRefundServiceTest.java`
- `docs/backend-handoff.md`
- `docs/蛋蛋世界-PRD-v2.0.md`
- `growth-schoolv3.html`
- `releases/迁移文档/2026-09-15_组队出资退还与安全加固.md`
- `tasks/task-flow-test-cases.md`
- `tasks/team-security-config-validation.md`
- `tasks/team-security-frontend-validation.md`
- `tasks/team-security-mysql-validation.md`
- `tasks/team-security-report.md`
- `tests/team-config-nginx.cjs`
- `tests/team-config-security.cjs`
- `tests/team-security.browser.js`
- `tests/team-security.test.cjs`

## 5. 复跑与上线交接

- 默认后端：mvn -f backend/pom.xml -o test package。
- MySQL IT：仅本地安全白名单环境，设置 TEAM_SECURITY_MYSQL_IT=true，显式 mvn -f backend/pom.xml -o -Dtest=TeamFundsMysqlIT test；外部凭据不入库。
- Node：node --test tests/*.cjs。实际 nginx 测试需设置 NGINX_BIN、OPENSSL_BIN、TEAM_CONFIG_TMP；未设置时会跳过，不可冒充本报告实跑结果。
- 浏览器：测试脚本 tests/team-security.browser.js，使用本地 4173 静态页、Edge 与 Playwright CLI；API/外部请求全部拦截。
- 三份专项证据：tasks/team-security-frontend-validation.md、tasks/team-security-mysql-validation.md、tasks/team-security-config-validation.md。
- 同 PR 迁移文档：releases/迁移文档/2026-09-15_组队出资退还与安全加固.md。列明服务器绝对路径、可读回备份、上线前 SHA/待填上线后 SHA、回滚与 B6 步骤。
- 发布须另获确认；不能直接推 main、合并 PR 或打 release tag。回滚代码不自动逆转合法流水，旧代码回滚会重新暴露原资金漏洞。
