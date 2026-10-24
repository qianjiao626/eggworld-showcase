# 本轮后端本地环境与联调记录

## 当前状态

- 分支：`fix/first-round-usability`。
- 后端、MySQL、Mailpit 已启动；18 张业务表已导入，虚构测试管理员已创建。
- `mvn -B -ntp package` 已成功：11 项单元测试通过，0 失败、0 错误、0 跳过。
- 本轮完成 19 项实际 HTTP / 邮件链路检查，并直接查询隔离 MySQL 验证任务及角色数据已落库。
- 本地前端 HTML 可访问，前端来源的 CORS 预检通过；**尚未进行浏览器点击或移动端视觉验收**。
- 未改业务代码、未推送、未部署；所有写入仅针对本地虚构测试数据。

## 实测链路

1. `/api/health` 返回 code=200、status=up。
2. 为随机 `.test` 邮箱发送验证码，邮件实际进入本地 Mailpit；没有使用真实 SMTP 账号。
3. 从本地邮件读取验证码，正常注册、登录取得 JWT、读取个人信息。
4. 查询 6 个角色状态，选择已解锁的 study 成功；选择未解锁角色被拒绝，原角色未被覆盖。
5. 发布 teach 教学任务成功；“我发布的任务”与详情接口可查，状态 pending（待审核），发布者余额仍为 100。
6. 匿名访问个人资料返回 401；匿名访问待审核任务返回业务 404。
7. `http://127.0.0.1:4173` 来源的 CORS 预检成功，前端 HTML 返回成功。
8. 直接查询 MySQL 确认测试任务已落库、类型 teach、状态 pending、报酬 10，当前角色 study/is_current=1。

19 项检查的明细在本机私有目录 `D:\CodexData\local\eggworld\smoke-results.json`。这是本轮手动编排的联调检查结果，不是新增的持续集成测试套件。测试用户凭据单独保存在同目录的 `smoke-user.json`，不提交 Git。

## 新发现：待继续排查头像

新用户注册时传入 initialCategory=study，角色列表中 study 已解锁且被设置为当前角色，但首次个人资料的 eggCategory 为 null。调用角色选择接口后，eggCategory 变为 study。

代码检查发现 AuthService 注册过程写入了 user_characters 的当前角色，却没有同步写入 users.egg_category。**本轮仅记录，尚未修复；也尚未证明这就是用户看到头像异常的全部原因。** 后续应先补注册一致性回归测试，再进行小范围修复及前端验证。

## 本机工具及隔离边界

| 项目 | 位置 / 版本 |
| --- | --- |
| JDK | `D:\CodexData\devtools\jdk\jdk-17.0.20.1+1`，下载 SHA256 校验通过 |
| Maven | `D:\CodexData\devtools\maven\apache-maven-3.9.16`，下载 SHA512 校验通过 |
| MySQL | `D:\CodexData\devtools\mysql\mysql-8.4.10-winx64`，官方 ZIP、MD5 完整性校验 |
| Mailpit | `D:\CodexData\devtools\mailpit`，运行时版本 v1.31.1 |
| 私有配置及数据 | `D:\CodexData\local\eggworld`，ACL 限本机当前账号及 SYSTEM |
| 后端 JAR | `backend/target/eggworld-backend-0.0.1-SNAPSHOT.jar`，未打包本地敏感配置 |

- MySQL 实测监听 `127.0.0.1:3307`，数据目录为 `D:\CodexData\local\eggworld\mysql-data`。
- 后端监听 `127.0.0.1:8080`，使用外部 application-local.properties。
- SMTP 监听 `127.0.0.1:1025`；Mailpit 收件箱为 `http://127.0.0.1:8025`。
- 数据库密码、JWT 密钥、测试管理员密码随机生成，不写入文档、Git或启动参数。
- 应用账号仅有本地 eggworld 库的 SELECT/INSERT/UPDATE/DELETE 权限，初始化管理配置另存。
- 未安装系统服务、未修改全局 PATH、未连接线上数据库。
- 原 DataInitializer 包含默认管理员凭据及明文日志，仍是安全债务。本次先写入随机密码的虚构管理员；启动日志确认跳过默认账号创建。

## 启动、停止与重建

服务目前已运行，**不需要重复启动**。停止后再启动：

```powershell
& 'D:\CodexData\local\eggworld\start-local.ps1'
```

正常停止（保留数据库和测试邮件）：

```powershell
& 'D:\CodexData\local\eggworld\stop-local.ps1'
```

启动脚本的成功路径已由本机实际运行验证。停止脚本目前仅完成语法检查，完整启停循环尚未验收。停止逻辑核对 PID、可执行文件路径及启动时间；MySQL 使用 mysqladmin 正常关闭，不按端口批量杀进程。

在仓库 backend 目录重建：

```powershell
$env:JAVA_HOME = 'D:\CodexData\devtools\jdk\jdk-17.0.20.1+1'
& 'D:\CodexData\devtools\maven\apache-maven-3.9.16\bin\mvn.cmd' -B -ntp package
```

上述脚本和私有目录属于本机环境，不是跨机器通用安装器。伙伴机器需要独立安装和生成凭据，禁止复制线上或本机私有数据进 Git。

## 已解决的启动问题

1. 最初没有可用的 JDK、Maven、MySQL，现已补齐。
2. 工具策略拒绝后台服务启动命令；未绕过，由用户手动执行准备好的启动脚本。
3. 首次手动启动被数据目录校验拦截。MySQL 批处理输出转义了反斜杠，旧脚本规范化后出现双斜杠，误判为其他目录。
4. 修复查询为 `--batch --raw --skip-column-names`，增加退出码及单行非空检查，仍要求目录完全匹配。
5. 路径回归测试修复前失败；修复后 8 项离线用例在 PowerShell 7 和 Windows PowerShell 5.1 均通过。随后用户重新启动成功，真实查询返回的目录也已核对。

首次导入 init.sql 仍要求隔离目录匹配且业务库没有任何表；schema.ready 阻止正常重启时重复导入。部分导入失败应检查原因，不能删掉保护或盲目重跑含 DROP TABLE 的脚本。当前 init.sql 已含增量字段，本次没有重复执行 migrate-*.sql 或 demo 数据脚本。