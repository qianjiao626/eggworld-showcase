# 组队资金与点赞安全：真实本地 MySQL 集成验证

> 本文是子任务交接快照；最终提交、PR 与整体验收以 team-security-report.md 及 Git 记录为准。

## 结论与范围

- **已实现并实际执行：37 次集成测试，Failures 0 / Errors 0 / Skipped 0；Maven 退出码 0，BUILD SUCCESS。**
- 最终运行结束：**2026-09-15 13:49:54 +08:00**（Maven 主机日志时间；对应 Asia/Tokyo 14:49:54 +09:00）。测试耗时 9.710 秒，Maven 总耗时 26.703 秒。
- 本次执行方只写仓库内 `backend/src/test/java/com/eggworld/service/TeamFundsMysqlIT.java` 和本文档；没有修改业务代码、POM、application 配置或其他 agent 的文件，没有 commit/push，没有部署。
- 整体验收补充 A-13 非法配对，以及 GossipService 真实点赞并发和 SQL 失败回滚，均已完成。
- **不是全量测试 / package 结果。** 本轮只运行 `TeamFundsMysqlIT`。主线程新增的单元、API 和日志测试随 testCompile 编译，但没有由本轮执行；最终全量与 package 交回主线程。

## 隔离与真实程度

1. 已读仓库 AGENTS、PROJECT_RULES、首次协作计划、任务流程文档以及 `TODO/工单-组队出资退还规则调整.md`。沿用当前协作分支 `fix/team-refund-security`；按本任务禁止生产访问的明确指令，不执行线上核对脚本。
2. 唯一允许 JDBC 地址固定为 `127.0.0.1:3307`。外部配置的 URL 必须与代码内白名单字符串完全一致，**在连接前检查**，不接受任意 profile / 环境 URL。
3. 建库前真实查询并断言 `@@port=3307`、`@@datadir=D:\CodexData\local\eggworld\mysql-data\`，实际 MySQL **8.4.10**。未连接生产。
4. 每次 Spring 上下文启动都创建全新 UUID 后缀数据库；不复用、清空、删除任何已有数据库，不执行 dump/import。本次最终库：
   `eggworld_team_security_b5b537525efc44209a1aa42469e2e904`。
5. 仅从已知本地 `eggworld` 执行 `information_schema` 与 `SHOW CREATE TABLE` 读取结构，复制 **18 张空表**；无源数据复制。保留原 DDL 外键、唯一键、枚举和 InnoDB。克隆时仅新连接 SESSION 暂停外键检查，完成即恢复；每张表初始行数断言 0，最终检查外键全部指向新库。
6. 纯 `@SpringJUnitConfig`：显式导入 TaskService / ClaimService / RatingService / PointService / GossipService；真实 MyBatis-Plus SqlSessionFactory、Mapper、DataSourceTransactionManager。运行时断言 **5 个服务为 Spring AOP 代理**，关键 Mapper 和 PointService 不是 Mockito mock。
7. 不启用组件全扫描、Boot 自动配置、DataInitializer、Web 服务或调度基础设施。调度器只在测试中手动构造并调用扫描方法；其依赖是实际 Mapper 与事务代理，不会自动定时执行。
8. NotificationService 使用测试子类：正常调用真实父类与真实通知 Mapper；回滚测试才在第二次真实通知 INSERT 后抛异常。唯一 Mockito bean 是本轮未触发的 InviteService（不涉及邀请返奖）。没有 mock 资金、结算、认领、点赞 Mapper 或事务管理器。
9. 测试没有外层 `@Transactional`；数据库断言从独立连接读取已经提交/回滚的结果。每个用例创建独立用户/任务，不依赖清库。类内串行，测试内部使用有超时和 finally 回收的真实线程池。
10. 并发不是仅同时启动：MyBatis 拦截器在实际 SELECT 完成后使用 barrier。资金竞争双方先读到相同旧任务；点赞竞争所有线程先完成真实 `selectCount=0`，再竞争 INSERT/UPDATE。每个参与连接均断言活跃事务、autocommit=false，并记录不同 `CONNECTION_ID()`。

## 逐项证据

所有用户初始 100 币、0 经验、5.0 口碑；以下数字均由 JDBC/真实 Mapper 断言，不是仅 verify 方法调用。测试名称可在 Surefire XML 中直接定位。

| 工单/要求 | 测试方法（执行次数） | 实际证据 |
|---|---|---|
| 主 6：未评价到期也退 | `teamWorkflowRefundIndependentOfRatingAndDeadline` score=0（1） | publish(team,9999) 保存 reward=10，A 冻10；审核、B认领、配对B冻10、提交、确认完成；未到期扫描不退；到期各退8，A/B=98，ratings=0，settled=1 |
| 主 7：互评5分 | 同上 score=5（1） | 两方向真实 rate，ratings=2；users/user_stats 口碑均5；到期各退8，余额98/98，与未评相同 |
| 主 8：互评1分 | 同上 score=1（1） | 两人初始口碑5降至1，users/user_stats 同步；仍各退8，余额98/98，低分不影响资金 |
| 主 9：重复 settled 不退 | 三个 team 工作流 + 并发 settle 用例 | 扫描后再调用 settle / 再扫描，settled=1，始终仅两条 refund=8；没有第二轮发钱 |
| 主 10：两线程 settle | `simultaneousSettleRefundsExactlyOnce`（5） | 双连接先读旧任务再放行；两调用正常返回，最终仅各+8、两条退款流水、两条 settle 通知；连接对见下方 |
| 通知异常整体回滚 | `notificationFailureRollsBackEntireSettlementThenRetrySucceeds`（1） | 在两人的余额/流水和第二条真实通知均写入后抛异常；随后独立读取 settled=0、余额90/90、退款流水0、总流水与通知数回到调用前；关闭故障重试后98/98、settled=1、两条退款 |
| A-12：approve并发经验只+5 | `simultaneousApproveAddsFiveExpOnce`（5） | 同一 pending 任务两个实际事务竞争；一成功、一 BusinessException；approved、exp=5、余额90、review通知1；再次approve仍拒绝 |
| approve/reject互斥 | `approveVersusRejectHasOnlyOneWinner`（3） | 一成功、一 BusinessException；最终要么 approved/exp5/余额90/退款0，要么 rejected/exp0/余额100/退款1；本次最终三轮由approve胜出，不宣称统计上覆盖了两种获胜调度 |
| teach 9999 驳回=0 | `concurrentRejectRefundsActualFreezeOnly` teach（1） | 真实publish不冻结；双线程reject仅一次成功，余额100，整个任务无币流水，review通知1且不含“已退回” |
| team 9999 驳回=10 | 同上 team（1） | publish先验证落库reward=10且冻结10；仅在新库将该任务reward置9999模拟历史/恶意数据；双线程reject仅+10一次，余额100、refund10仅1条 |
| help 20 驳回=20 | 同上 help（1） | publish冻结20；双线程reject仅+20一次，余额100、refund20仅1条；三种类型重复reject/之后approve均拒绝 |
| team保存10 | 全部team发布工作流，特别是 `completedTeam` / reject | 输入9999，真实tasks行reward=10，真实freeze=-10，不信任调用参数 |
| 主 14：help完整流程 | `helpAndTeachCompleteWorkflow` help（1） | publish→approve→claim→pair→submit→confirm；发布者100→80，认领者确认前100、确认后120；准确两条freeze=-20/earn=20；任务及认领completed，重复提交/确认拒绝 |
| 主 15：teach完整流程 | 同上 teach（1） | 发布与配对不扣；submit时认领者100→80、发布者100→120；confirm不再改钱；准确两条spend=-20/earn=20，任务及认领completed |
| 主 16：配对后取消 | `pairedTeamCancellationReturnsTenToEverySelectedMember`（1） | A发布，B/C/另一个未选中者报名；B/C配对冻结；取消后A/B/C各退10、各回100、三条refund；未选中者100且无币流水，所有认领cancelled；重复取消拒绝 |
| 主 17：3天无人认领过期 | `threeDayUnclaimedExpiryRefundsCorrectAmount`（2） | help20/team10分别走真实发布审核；未满3天扫描不退，调整新库created_at到3天前后手动扫描，status=expired，余额100，准确一条refund20/10；重复扫描不再退 |
| 主 17：有人认领不误退 | `expiryScannerDoesNotRefundClaimedTask`（1） | 已报名team即使created_at为4天前，扫描仍approved、发布者90、退款0 |
| 主 18：互评期/入口服务 | 三个team工作流 | confirm生成约3天rate_deadline；listRateTargets的ratedByMe从false变true；rate实际写库、口碑同步；重复评价、到期后评价、settled后评价均拒绝；未到期扫描不结算 |
| A-13：pair unknown | `pairWithNonexistentIdLeavesTaskClaimsMoneyAndNoticesUnchanged`（1） | Long.MAX_VALUE确无用户；分别传[非法ID]和[已报名合法ID,非法ID]；BusinessException.code=400；完整比较tasks、task_claims、users、point_logs、notifications前后行快照相同；任务approved、认领pending_pairing、余额90/100 |
| 点赞：不同用户并发+N | `distinctUsersConcurrentlyLikeAnswerWithoutLostIncrements`（3） | 每轮8个不同用户、8条独立事务连接，全部先查无like后同时竞争；实际answer.likes=8、like行数=8、distinct user=8，无丢失自增 |
| 点赞：同用户回答重复 | `sameUserConcurrentAnswerLikeCommitsOneAndReturnsBusinessException`（3） | 两边均真实查到like=0后竞争唯一键，一成功一BusinessException/code400；计数1、like行1；顺序再点赞仍BusinessException，计数不变 |
| 点赞：同用户帖子重复 | `sameUserConcurrentPostLikeCommitsOneAndReturnsBusinessException`（3） | 两边均先查0，一成功一BusinessException/code400，post like仅1行；顺序重复仍拒绝且保持1 |
| 点赞：自增SQL异常回滚先插入like | `realMysqlIncrementFailureRollsBackPreviouslyInsertedLike`（1） | 仅新库把测试answer.likes设INT_MAX；严格SQL模式下真实incrLikes更新溢出，根因SQLException错误码1264；之前真实插入的like回滚为0，likes仍INT_MAX；恢复0重试成功、likes=1、like行1 |

合计：原26次 + A-13一次 + 点赞10次 = **37次**。

### 并发连接证据（最终运行）

- settle五轮：`2268/2269`、`2296/2297`、`2324/2325`、`2352/2353`、`2380/2381`；每轮 rejected_calls=0，退款次数断言通过。
- approve五轮：`2610/2611`、`2620/2621`、`2630/2631`、`2640/2641`、`2650/2651`；每轮 rejected_calls=1，错误类型确认为BusinessException。
- 八人答赞三轮：`2843..2850`、`2866..2873`、`2889..2896`，每轮 rejected_calls=0、最终likes=8。
- 同用户答赞三轮：`2706/2707`、`2717/2718`、`2728/2729`；同用户帖赞三轮：`2737/2738`、`2745/2746`、`2753/2754`；每轮恰好一个BusinessException。

## 最终数据库只读复核

通过用户指定 mysql.exe / defaults-extra-file 再次读取最终新库，而非复用服务内缓存：

- 隔离级别 `REPEATABLE-READ`，端口3307，datadir正确。
- 91个纯测试用户、28个任务；9个team已完成并settled=1；真实评价共4条（5分双方、1分双方）。
- 流水聚合：freeze -10共33条；refund +8共18条；freeze -20共3条；refund +20共2条；refund +10共5条；earn +20共2条；spend -20共1条。
- 全用户 `points != 100 + SUM(point_logs.delta)` 的行数 **0**。
- `gossip_answers`最终计数按id为 `1,1,1,1,8,8,8`；回答点赞28行、帖子点赞3行；回答冗余计数与实际like行数不一致的数量 **0**。
- 指向新库之外的外键数量 **0**。

## 复跑命令与证据文件

外部配置（已存在，不打印凭据、不提交）：
`D:/CodexData/local/eggworld/team-security-test/mysql.properties`

该UTF-8文件含 `url`、`user`、`password` 三个键。固定URL为：
`jdbc:mysql://127.0.0.1:3307/?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8&serverTimezone=Asia/Tokyo`

凭据从用户指定本地 mysql-client.ini 仅在内存中读取后写入上述外部文件，不作为Maven参数或系统属性传入。复跑前需保持本地mysqld运行并确认target归属；每次会产生**另一全新随机库**。

```powershell
Set-Location 'D:/桌面文件/蛋蛋校园第二版/eggworld'
$env:JAVA_HOME = 'D:/CodexData/devtools/jdk/jdk-17.0.20.1+1'
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
$env:TEAM_SECURITY_MYSQL_IT = 'true'
& 'D:/CodexData/devtools/maven/apache-maven-3.9.16/bin/mvn.cmd' `
  -o -f backend/pom.xml '-Dtest=TeamFundsMysqlIT' '-DfailIfNoTests=true' test `
  *> 'D:/CodexData/local/eggworld/team-security-test/maven-it.log'
if ($LASTEXITCODE -ne 0) { throw 'MySQL IT failed; inspect external log' }
```

**必须显式指定测试类并打开环境开关。** 文件名IT不在普通Surefire默认Test匹配内；只跑默认test/package不能据此声称执行过本IT。显式选类但缺少开关会skip，也不能算通过；本次已核实XML 37个testcase且skipped=0。

只读复核命令示例（不打印凭据）：

```powershell
$db = (Get-Content 'D:/CodexData/local/eggworld/team-security-test/last-database.txt' -Raw).Trim()
if ($db -notmatch '^eggworld_team_security_[a-f0-9]{32}$') { throw 'Unsafe DB name' }
& 'D:/CodexData/devtools/mysql/mysql-8.4.10-winx64/bin/mysql.exe' `
  '--defaults-extra-file=D:/CodexData/local/eggworld/mysql-client.ini' `
  --host=127.0.0.1 --port=3307 "--database=$db" --batch `
  -e 'SELECT DATABASE(),@@port,@@datadir; SELECT type,delta,COUNT(*) FROM point_logs GROUP BY type,delta;'
```

证据已复制到target之外，主线程clean/package不会丢失本次结果：

| 路径 | 内容 |
|---|---|
| `D:/CodexData/local/eggworld/team-security-test/maven-it.log` | 最终37次通过的Maven日志，MYSQL_GUARD / RACE / A13 / LIKE / ROLLBACK标记 |
| `D:/CodexData/local/eggworld/team-security-test/TEST-com.eggworld.service.TeamFundsMysqlIT.xml` | 最终Surefire XML，tests=37/errors=0/failures=0/skipped=0，37个testcase |
| `D:/CodexData/local/eggworld/team-security-test/com.eggworld.service.TeamFundsMysqlIT.txt` | Surefire文本摘要 |
| `D:/CodexData/local/eggworld/team-security-test/database-evidence.txt` | 最终新库只读SQL复核输出 |
| `D:/CodexData/local/eggworld/team-security-test/last-database.txt` | 最终随机数据库名称 |
| `D:/桌面文件/蛋蛋校园第二版/eggworld/backend/target/surefire-reports/TEST-com.eggworld.service.TeamFundsMysqlIT.xml` | 本轮构建原始报告；后续主线程运行可能覆盖 |

最终测试源码SHA-256：
`AA57EA262453372280FB174E5F3289444AF0C581E814B61EC47BE43453A5C054`

## 调试过程（不将失败隐藏为通过）

- 首次编译：IT中Spring/MyBatis同名Configuration通配导入冲突；只修正测试导入。
- 第一次启动：JDBC Statement创建时捕获旧catalog，切换新库后继续用旧Statement导致“No database selected”；改为setCatalog后创建新的DDL Statement。
- 初轮执行：直接访问CGLIB通知代理字段导致测试夹具空指针，改用代理方法设置故障；多人取消夹具错误使用single，改为team multiple。
- 随后26次完整通过两轮，增加A-13后27次通过，最后新增点赞后37次全部通过。历史日志存于同一外部目录的 `maven-it-first-compile.log`、`maven-it-context-failure.log`、`maven-it-fixture-failure.log`、`maven-it-first-pass.log`、`maven-it-26-pass.log`、`maven-it-27-pass.log`。
- 没有为了验证红绿而改回业务代码；故障注入和真实MySQL错误提供回滚证据。不声称已对旧业务实现执行过失败回归。
- 测试产生的新库（包括失败初始化留下的新库）全部保留，没有执行DROP/TRUNCATE/DELETE清理已有库。

## 未测项与边界

- **HTTP/浏览器层**：本轮不启动应用或浏览器。A-13验证的是BusinessException.code=400，不冒充实际HTTP状态断言；主18覆盖互评目标/提交服务，不冒充页面按钮验收。API @Valid、日志捕获和其他前端/配置项由主线程相应测试负责。
- **真实等待3天/定时触发**：用新库时间字段推进到期边界并手动调用原扫描方法，未等待墙钟3天，也未启用真实调度线程；未宣称自动启动配置已覆盖。
- **无人认领退款并发/故障原子性**：主17仅验证原扫描器顺序行为和重复扫描；RefundScheduler没有整体事务，本轮不把它包装进新事务，也不声称其多实例并发、与claim同时发生或中途失败回滚已验证。
- **更大范围一致性**：approve覆盖同一任务并发，不覆盖不同任务同时修改同一发布者经验；settle覆盖重复结算，不覆盖评价与结算并发、多个不同任务资金锁顺序或数据库进程崩溃。点赞已按最新要求真实覆盖，但不扩展到悬赏采纳/过期退款并发。
- **基础设施**：只验证本地MySQL8.4.10 / InnoDB / REPEATABLE-READ，不等同生产部署、其他隔离级别或生产负载压测；不访问生产。
- **后续验证码修复、全量与package**：主线程仍在补验证码失败/冷却测试，本报告不预判其结果。本次testCompile实际编译135个主源码和13个测试源码文件，TaskSecurityApiTest/AdminStartupLogSecurityTest类产物存在且无编译错误；其测试执行结果需主线程最终全量确认。

## target交接

本轮所有Maven进程和测试线程已结束，37次结果和数据库证据已备份至外部目录。**报告完成后释放 `D:/桌面文件/蛋蛋校园第二版/eggworld/backend/target` 的独占权，交回主线程执行最终全量测试与package；本执行方不再运行Maven。**
