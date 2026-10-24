# 组队工单 A.3 + B 组：仓库配置验证记录

> 本文是子任务交接快照；最终提交、PR 与整体验收以 team-security-report.md 及 Git 记录为准。

> 日期：2026-09-15。分支：`fix/team-refund-security`；接单基线：`90ae23e`。
> **仅仓库层面实现，未部署。没有连接生产，没有运行生产 check-live、restart、reload、daemon-reload；没有提交或 push。**
> **没有读取、修改或创建生产 application-prod.yml，也没有将其加入 Git。**
> 本记录仅覆盖本子任务；业务、前端和全分支最终回归由主助手汇总。共享工作区其他修改不属于本子任务。

## 1. 已实现与文件清单

| 工单 | 文件 | 结果 |
|---|---|---|
| A.3 R1 | `.gitignore` | 工单 12 个密钥/环境模式与 2 个自动化目录模式全部追加；原有规则保留 |
| A.3 R2 | `backend/deploy/nginx.conf` → `backend/deploy/nginx.conf.deprecated` | 内容原样保留，不再匹配 `*.conf`；旧文件 Git blob 与归档文件 hash 均为 `c241d2509ad89029de430b68626a8887c8673916` |
| A.3 R2 必要引用 | `backend/build-deploy.ps1` | 只改一处配置分类条件：排除 `*.deprecated`，避免生成“应上传此配置”的错误提示；保留原 UTF-8 BOM，兼容 Windows PowerShell |
| B1 | `backend/src/main/java/com/eggworld/config/WebMvcConfig.java` | 仅 HTTPS `dsxnb.com`、`www.dsxnb.com`；HTTP localhost/127.0.0.1 任意端口；仅 `/api/**`；原方法、请求头、凭据与缓存设置保留 |
| B2–B4 | `backend/deploy/dsxnb.conf` | 两个 TLS server 的 6 个安全头，CSP **仅 Report-Only**；隐藏文件、敏感后缀与编辑器备份拒绝；2m、10/60/60s timeout；auth 限流 |
| B2–B4 替代部署 | `backend/deploy/nginx-xs-location.conf` | 实际路径在 deploy 下；补同等安全配置、`/xs/api/auth/` 限流，明确是历史替代片段，不可与当前配置同时合并 |
| B5 | `backend/deploy/eggworld.service` | 工单 6 项沙箱配置与 `/usr/bin/java`；保留用户、工作目录、IPv4 JVM 参数、prod profile、重启策略 |
| B6 | 本文第 4 节 | 仅脱敏运维变更片段和待执行检查；生产文件未读未改、未部署 |
| 测试 | `backend/src/test/java/com/eggworld/config/CorsSecurityTest.java` | 真正 WebApplicationContext + MockMvc + WebMvcConfig + JWT 拦截器，不是配置字符串断言 |
| 测试 | `tests/team-config-security.cjs` | ignore、归档/打包分类保护、nginx 结构、service 与 timeout 静态回归 |
| 测试 | `tests/team-config-nginx.cjs` | 真实本地 nginx 语法/HTTP 集成测试；未提供二进制环境变量时明确 skip，不假报实跑 |

### 关键设计与边界

- CORS 端口模式使用 Spring `http://localhost:[*]` / `http://127.0.0.1:[*]`，而非工单示例普通 `:*` 通配。前者表达任意数字端口及默认端口，避免用普通字符通配匹配非端口后缀；真实 MVC 测试覆盖无显式端口、5173、65535 等，以及攻击者域名、相似域名、带 userinfo 的伪造 Origin。保留凭据但绝不响应 ACAO `*`。
- `limit_req_zone` 在 `dsxnb.conf` 的 server 块外，要求宿主从 **http 上下文** include；同名 `eggworld_auth` zone 只定义一次。历史片段只能放在 HTTPS server 内，其宿主需先在 http 层定义 zone。不能把历史 location 片段直接放进 `conf.d/*.conf` 的 http 级通配 include。
- 认证使用客户端连接 IP 的 `$binary_remote_addr`，持续速率 1r/s，`burst=5 nodelay` 允许短突发（空桶首次最多约 6 个立即通过），超限 429；不是每秒严格只准一次。普通 `/api/` 不占此 zone。没有信任客户端自行提供的 X-Forwarded-For；若生产前面有可信代理/CDN，需运维另审 real_ip 配置及共享 IP 的限流影响。
- `/MKJ/` 从 `^~` 改普通前缀，使 server 级安全正则能拦截 `/MKJ/.env` 等；其 root/index/try_files 保留。auth 也是普通长前缀，因此 `/api/auth/.git/config` 不绕过安全正则。原有 exact location 均是固定安全路由。
- 安全头只在 server 层设置并使用 `always`，没有 location 级 `add_header` 抹掉继承；`expires` 缓存设置保留。实测 200、301、401、403、413、429、500 都有相应 TLS 安全头。未加入强制 CSP，也未加入不存在的 CSP 报告 URL；当前只可在浏览器控制台观察，尚无服务端报告收集。
- 保留当前 `/api/ → 8090`、`/xs/ → Node:3000`、`/dd/api/ → 3310`、`/dd/health`、`/dd/blind-box/`、`/MKJ/`、首页缓存规则和原代理头/cookie 路径。历史片段的 `/xs/ → Eggworld` 与当前路由互斥，**禁止直接合并到当前 dsxnb.conf**。
- 隐藏文件仅豁免完整 `.well-known` 路径段，`.well-known-evil` 不豁免；敏感后缀仍拒绝。原 HTTP → HTTPS 重定向保留；没有猜测并修改 ACME webroot。测试只证明合法 challenge 路径不被新增正则拦截、原 HTTP 重定向保留，不等于证明线上证书续期可用。
- 全站 TLS 主 server 的 2m 限制也覆盖 `/dd/`、`/xs/` 既有项目；需要运维确认这些项目没有大文件上传需求。10s 连接、60s 发送/读取超时为继承设置，WebSocket 长连接需求需在维护窗口复核；没有改其 Upgrade 头。
- 搜索所有受 Git 跟踪的 nginx 引用和构建脚本：没有活跃脚本直接复制旧 `backend/deploy/nginx.conf`，增量脚本本就不打包 deploy 配置，但原先会把 deprecated 也列为待手工上传，现已排除。`tasks/backend-implementation-plan.md`、`archive/tasks/project-progress.md` 留有旧配置的历史说明，不是可执行引用，且不在本子任务允许写范围。归档保留旧注释原文，仅供参考，**不可部署**。

## 2. 已执行验证（真实证据）

### 2.1 CORS：先红后绿，隔离构建

- JDK：`D:/CodexData/devtools/jdk/jdk-17.0.20.1+1`。
- Maven：`D:/CodexData/devtools/maven/apache-maven-3.9.16/bin/mvn.cmd`。
- 临时 POM：`D:/CodexData/local/team-security-validation/pom.xml`，从仓库 POM 的依赖与插件复制，source/testSource 指向仓库；build.directory 指向外部 `target`；**移除 resources 配置，临时项目内没有 application 配置资源**。未改仓库 POM，未使用共享 `backend/target`。
- MockMvc 使用 `@SpringJUnitWebConfig` + `@EnableWebMvc` + `@Import(WebMvcConfig.class)`，真实 JwtInterceptor；仅 JwtUtil/UserMapper 为 mock。不加载 Spring Boot 主应用、不扫描业务、不启数据库或邮件，不加载生产配置。
- 最终测试在旧 CORS 上：复制 Java 源到外部 `baseline-main`，只将 WebMvcConfig 替换为 `git show 90ae23e:...` 的版本；独立 `baseline-target`。**20 tests，11 failures，0 errors，0 skipped**，11 个非法来源用例均能复现通配放行。记录：`D:/CodexData/local/team-security-validation/cors-baseline-final.log`。
- 最终测试在修复上：**20 tests，0 failures，0 errors，0 skipped；BUILD SUCCESS**。记录：`D:/CodexData/local/team-security-validation/cors-after.log` 与 `target/surefire-reports/com.eggworld.config.CorsSecurityTest.txt`。
- 覆盖 7 个允许来源（实际 GET 与无需 JWT 的 OPTIONS）、11 个非法来源（实际 GET 与 OPTIONS）、PATCH 预检拒绝、带允许 Origin 的未登录私有接口仍 401、无 Origin 的正常访问、非 API 路由不添加 CORS。

运行命令（PowerShell，本地已执行）：

```powershell
$env:JAVA_HOME = 'D:/CodexData/devtools/jdk/jdk-17.0.20.1+1'
& 'D:/CodexData/devtools/maven/apache-maven-3.9.16/bin/mvn.cmd' -o `
  -f D:/CodexData/local/team-security-validation/pom.xml -Dtest=CorsSecurityTest test
# 旧 CORS 对照：-f D:/CodexData/local/team-security-validation/baseline-pom.xml
```

测试夹具开发时修正过两点：MockMvc 默认 host 是 localhost，会将无端口 localhost Origin 当同源，现使用独立 api.test 请求 host；无效非数字端口 Origin 在当前 Spring 会抛解析异常，不属于浏览器合法 Origin 白名单测试。未为了让测试通过而修改业务或框架。早期探索日志不作为最终红绿结论，以上最终 baseline/fixed 日志为准。

### 2.2 真正 nginx -t 与本地 HTTP 行为

- 本机无可用 WSL 发行版、无原生 nginx/systemd 工具；从 nginx 官方下载固定版本 **Windows nginx 1.28.0** 到外部临时目录；不是声称“最新版”。OpenSSL 为本机 Git 附带版本，生成一次性自签测试证书与 DH 参数。测试只监听 `127.0.0.1` 高位临时端口；上游为本机 Node stub。
- 测试对当前配置和历史片段各构建完整 nginx 配置并真实执行 **`nginx.exe -p <fixture>/ -c current.conf -t`** / **`... -c legacy.conf -t`**。两者均退出 0，并输出 `syntax is ok` 和 `test is successful`。
- 夹具仅替换端口、上游、本地静态根、测试 TLS 文件路径，提供测试版 SSL include，以及原文件依赖的 `$dd_static_expires` map。**没有读取生产证书、生产 include 或 application-prod.yml**。
- 实测：首页、原项目跳转、API 路径改写、`/dd` cookie path、敏感文件与大小写后缀拒绝、`/MKJ/`/alias/proxy 下安全正则、ACME challenge、2 MiB 成功与 2 MiB+1 的 413、认证突发 429 和约 1s 后恢复、非认证请求不误限流、错误/重定向安全头、没有强制 CSP。
- 每个夹具启动独立 nginx，结束仅向自身 prefix/pid 发 `-s quit`，确认自身 pid 文件消失。不调用系统服务、不影响其他进程。
- 当前配置保留的 `listen ... http2` 在 1.28.0 给出 **deprecated warning**，不影响测试成功。为兼容未知生产版本，没有擅改为较新语法。

完整运行命令（仓库根目录，已执行）：

```powershell
$env:NGINX_BIN = 'D:/CodexData/local/team-security-validation/nginx-1.28.0/nginx.exe'
$env:OPENSSL_BIN = 'C:/Program Files/Git/usr/bin/openssl.exe'
$env:TEAM_CONFIG_TMP = 'D:/CodexData/local/team-security-validation'
node --test tests/team-config*.cjs
```

最终用例数和最后一次 fixture 路径见本报告末尾“最终核对”。日志 `D:/CodexData/local/team-security-validation/nginx-tests.log` 包含 TAP 结果和 retained local fixtures 路径；fixture 内 `current-syntax.log`、`legacy-syntax.log`、`logs/*-access.log` 与 `logs/*-error.log` 保留真实语法输出与状态码证据。测试证书/密钥只在外部临时目录，不入仓库。

### 2.3 其他检查

- `tests/team-config-security.cjs` 最初在未修复配置上 4/4 失败；修复后通过，随后增加两种部署 timeout/rate 参数回归。
- `git check-ignore --no-index` 逐一验证所有工单模式，包括嵌套路径；不读取任何真实密钥。
- PowerShell AST 解析 `backend/build-deploy.ps1`：0 errors；从解析树抽取原配置分类 foreach 块，输入 deprecated、dsxnb.conf、eggworld.service，实际执行该块后仅保留后两者；未执行整个构建/上传脚本。
- 旧配置归档 hash 与基线完全一致。
- `git diff --check`：通过（仅现有换行风格提示，无 whitespace errors）。

## 3. 未验证 / 不应宣称完成

1. **未部署**；生产配置完整 `nginx -t`、实际 TLS/certbot include、现有 http map/zone 是否重复、其他 server/include 的正则/headers、真实证书续期均未验证。本地夹具 `nginx -t` 不是生产完整配置检查。
2. systemd 仅有仓库静态测试，**没有 `systemd-analyze verify`、security 评分或沙箱运行结果**。Windows/不可用 WSL 无法验证 Linux mount namespace、权限与启动。不要将静态断言写成 systemd 语法实测。
3. unit 原注释提示服务器默认 Java 曾为 1.8。改成 `/usr/bin/java` 后，运维必须先确认其实际目标为 **JDK 17+**，否则本 unit 不能上线；本次没有更改系统 alternatives。
4. `ProtectSystem=strict` + `ProtectHome=read-only` 下仅工作目录显式可写，PrivateTmp 提供私有临时目录。需运维确认真实日志/上传/缓存/工作目录、目录存在及 xiaos 权限，无其他必要写路径被锁死；未验证 SMTP/DNS/数据库运行连接。
5. 未做生产日志级别效果检查、浏览器 CSP 控制台观察、真实站点跨域/登录、压力/共享 NAT 测试，未实等 60s 验证 timeout 行为；timeout 只有配置语法与静态参数验证。
6. 未跑全后端测试/打包或业务前端全套，本子任务不使用共享 target；由主助手安排整合测试。构建脚本仅解析与分类块验证，未实际生成部署包。
7. 本轮无子代理派发工具，以独立实施者执行 subagent-driven-development 的隔离范围、规格复核和自审；不能声称已完成独立 reviewer 审核。主助手需做最终跨任务复核。

## 4. B6 脱敏运维变更片段（待授权，未执行）

只在运维核实的外置生产配置中**合并这两个键**，不要用此片段覆盖整个文件，不要重复创建现有 YAML 根键，不要打印或提交其余配置内容。按当前 unit 工作目录，预期外置路径为 `/home/xiaos/eggworld/application-prod.yml`，但仍须运维确认实际加载路径和覆盖优先级；本助手未读取该文件。

```yaml
mybatis-plus:
  configuration:
    log-impl: org.apache.ibatis.logging.nologging.NoLoggingImpl
logging:
  level:
    com.eggworld: info
```

待授权维护窗口检查清单（**本次全部未执行**）：

- 运维自行建立能读回且权限受控的备份；备份含敏感内容，不上传仓库、不回传聊天。
- 核实有效 Spring profile/外置配置来源和环境变量、命令行覆盖；仅合并上面两个设置。只记录键名与是否符合，不输出连接串、口令、邮箱授权码或整份配置。
- 使用目标平台 YAML 校验器检查缩进和重复键；检查类名是 `org.apache.ibatis.logging.nologging.NoLoggingImpl`，而非 Spring 或其他同名 logger 类。
- 另获发布与启动授权后，按主助手迁移文档安排生效和回滚；本记录不授权 restart/reload。观察普通业务请求日志中不再有 MyBatis Preparing/Parameters SQL 调试行，应用正常 INFO 及错误日志仍可用。
- Nginx 文件只按目标 include 上下文逐个安装；禁止整个 deploy 目录通配复制进 conf.d。先合并线上已有必要路由/ACME，再在目标机器跑真实 `nginx -t`；需要查看有效配置时由运维自行审阅，避免把可能包含敏感信息的 `nginx -T` 输出粘贴回聊天。
- systemd 发布前运行 `/usr/bin/java -version`、`systemd-analyze verify /etc/systemd/system/eggworld.service`，确认 JDK 17+ 与 unit 路径权限。systemd verify 即使通过，也不等于沙箱中的服务启动和写入路径验证通过。
- CSP 本轮保持 Report-Only；不要把报告头误改为强制头。观察现有内联脚本/样式和第三方资源违规后另立工单，不在本批消除内联代码。

## 5. 最终核对与交接

- 最后一次 `node --test tests/team-config*.cjs`：**8 tests，8 passed，0 failed，0 skipped**（包含两个真实 nginx 部署变体子测试）。
- 最终夹具：`D:/CodexData/local/team-security-validation/eggworld-nginx-wZY1nj`。`current-syntax.log`、`legacy-syntax.log` 均保存真实 `nginx -t` 成功输出；本轮测试 nginx 已退出，没有残留测试 nginx 进程。
- 最后一次本子任务 CORS：**20/20 通过**；仅旧 CORS 对照：**20 tests，11 failures，0 errors**。不再重复 Maven；所有本子任务 Maven 输出都在 `D:/CodexData/local/team-security-validation/target` 或 `baseline-target`，没有写 `backend/target`。
- **协作方报告，非本子任务自行运行**：主助手通知全量 Maven **55 tests，0 failures**，包含本 Cors 测试；主助手/Hooke 后续真实 MySQL 集成验证由其汇总，不计入本配置子任务已验证清单。
- scoped `git diff --check` 通过；`backend/build-deploy.ps1` 最终差异仅 1 行替换，BOM 保留；无提交/push/生产访问/生产配置读取或部署。
- 待主助手审阅：本报告第 3 节的未验证项、第 4 节 B6 运维片段，尤其 **`/usr/bin/java` 必须为 JDK 17+**、当前 `/xs/` 与历史片段互斥、HTTP include 层级/zone 与生产 `$dd_static_expires` 的已有定义、真实 ACME 路径与其他应用 2m 上限影响。

## 6. 补充：主助手全量 Node 结果与部署目标路径核对

### 6.1 已完成真实 nginx 验证，不是在等待准备

主助手另行报告全量 Node **83 通过、1 个真实 nginx 测试 skip**（未设二进制路径），属于其运行环境的预期 skip。不能把这一次全量结果写成“已实跑 nginx”，但本子任务第 2.2/5 节已有独立真实 nginx 验证：**8/8 通过、0 skip**；两个变体的 `nginx -t` 都有成功日志。未重复 Maven，也未写共享 backend/target。

除第 2.2 节可复现完整集成测试命令外，以下是已验证夹具的直接语法复核命令（只访问本机测试配置）：

```powershell
$nginx = 'D:/CodexData/local/team-security-validation/nginx-1.28.0/nginx.exe'
$fixture = 'D:/CodexData/local/team-security-validation/eggworld-nginx-wZY1nj/'
& $nginx -p $fixture -c current.conf -t
& $nginx -p $fixture -c legacy.conf -t
```

`-t` 不启动服务；成功输出见该 fixture 中 `current-syntax.log`、`legacy-syntax.log`。当前配置仅有保留旧式 `listen ... http2` 的 deprecated warning。上述路径是**本机夹具**，不是生产配置位置。

### 6.2 本地文档证据存在差异，不能认定 sites-available 为已确认真实目标

仅搜索并阅读本地仓库 Markdown（包括尚未跟踪的本次迁移文档），没有读取线上配置：

| 本地证据 | 行号 | 记载目标 |
|---|---|---|
| `docs/迁移计划.md` | 344、347 | `/etc/nginx/conf.d/dsxnb.conf`，历史迁移说明明确使用此路径 |
| `releases/迁移文档/2026-09-15_组队出资退还与安全加固.md` | 25 | `/etc/nginx/sites-available/dsxnb.conf`，已标注“预期配置目标”，要求 nginx -T 核实实际启用路径/软链 |

**结论：两者路径不一致。现有历史文档支持 conf.d；本次 sites-available 仅是待核实预期，没有找到可独立确认其已经启用的本地证据。两者都不能仅凭文档认定为线上当前事实。** 主迁移文档保留“预期 + 执行前确认”不会冒充已验证，但发布前必须消除此差异并把最终绝对路径写回迁移表，不能照预期路径盲目覆盖。

获单独上线授权后，由执行方在目标环境使用正确 nginx 二进制及服务实际启动参数运行 `nginx -T`，本地审阅输出中的 configuration file 来源和 include 链，配合软链真实目标确认：

1. 实际采用的是 conf.d 还是 sites-enabled（可能链接至 sites-available），是否还有其他自定义 include。
2. dsxnb.com 主 server 与 www 重定向究竟在哪个文件生效；如果两个位置都有同名文件，先核实是否重复加载，不直接新增第二套 server。
3. 目标配置是否由 http 上下文加载、eggworld_auth zone 是否已定义，以及 `$dd_static_expires` map、ACME 与必要路由的原始来源。
4. 确认后先修订主迁移文档的绝对目标/备份/回滚路径，再按授权实施、运行目标环境完整 `nginx -t`。`nginx -T` 输出由运维自行审阅，不回传整份可能含敏感信息的配置。

**本次没有执行线上 `nginx -T`，真实生产目标路径仍待上线前确认。** 不擅改主助手负责的迁移文档，仅在本子任务报告记录证据差异与前置条件。
