# 蛋蛋世界（EggWorld）

校园技能互助平台：发布 / 认领任务、组队共创、技能互助，配套蛋蛋币、双向评价口碑、排行榜与后台管理。
本仓库包含 **Spring Boot 后端 + 单页前端 + 部署配置**。

> 📌 **先读规范**：文档该写在哪、改代码/改文档/上线各怎么走 —— 见 [PROJECT_RULES.md](PROJECT_RULES.md)（项目共识）。
> 协作方式见 [COLLABORATION.md](COLLABORATION.md)，AI/工具入口见 [AGENTS.md](AGENTS.md)。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Spring Boot 3.3.4、JDK 17、MyBatis-Plus 3.5.7、MySQL 8、JWT（jjwt 0.12）、JavaMail、BCrypt |
| 前端 | 单页 HTML（`growth-schoolv3.html`）+ `js/` 下的外联脚本与样式，无框架依赖 |
| 部署 | systemd + nginx，配置见 `backend/deploy/` |

## 目录结构

```
README.md                      项目入口（技术栈 / 目录 / 本地启动 / 打包发布）
PROJECT_RULES.md               项目共识：文档位置 + 变更流程（代码 / 文档 / 服务器侧）
COLLABORATION.md               协作规范（分支 / PR / 热点文件 / 授权）
AGENTS.md                      AI 工具入口（先读哪些文件、红线）
backend/                       后端工程
├── src/main/java/com/eggworld/
│   ├── controller/            REST 接口
│   ├── service/               业务逻辑
│   ├── mapper/                MyBatis-Plus Mapper
│   ├── entity/ dto/           实体与出参对象
│   ├── config/                配置类（含启动时的管理员初始化）
│   └── common/                统一返回、异常、JWT、文本净化
├── src/main/resources/
│   └── application.yml        主配置（敏感项一律占位符）
├── application-local.yml      本地敏感覆盖（已 gitignore，需自行创建；⚠️ 不能放 src/main/resources）
├── sql/
│   ├── init.sql               全新库初始化（含 DROP TABLE，线上勿执行）
│   └── migrate-*.sql          增量迁移脚本，按文件名顺序执行
├── deploy/                    systemd / nginx 配置
├── build-release.ps1          全量打包脚本（备用，见「打包与发布」）
├── build-deploy.ps1           增量部署包生成（标准做法，默认以上个 release tag 为基准）
└── check-live.ps1             与线上版本的同步自检（只读：线上 gitSha ↔ release tag ↔ 发布记录）
growth-schoolv3.html           前端入口（打包时改名为 index.html）
start-frontend.cjs             本地前端静态服务（零依赖，见「本地启动」第 4 步）
js/                            前端外联脚本与样式（打包时保持 js/ 子目录）
assets/                        站点图片（7 张 char-eggy-*.jpg + logo-char.png；不在打包范围内，需单独上传到 /xs/assets/）
tests/                         前端回归测试（Node；后端单测在 backend/src/test）
docs/                          资料类文档（接口交接 / PRD / 任务流程 / 历史迁移计划 / 专项说明）
releases/                      上线文档 + 逐次迁移文档（命名与格式规范见 releases/上线文档.md）
TODO/                          待办登记与已知问题
tasks/                         施工计划与阶段汇报（历史）
archive/                       历史版本（v1 / v2）+ 已归档报告与已完成工单（tasks/、todo/ 子目录；不参与构建与部署）
local-only/                    本地临时文件（.gitignore 忽略，不入库、不部署）
```

## 本地启动

1. 建库并初始化（仅限全新库）：

```bash
mysql -uroot -p < backend/sql/init.sql
```

2. 准备本地敏感配置：新建 **`backend/application-local.yml`**，需要真发邮件时提供腾讯云 SES 发信参数：

```yaml
eggworld:
  mail:
    from-address: noreply@你的域名
    ses:
      secret-id: 你的云API SecretId
      secret-key: 你的云API SecretKey
      templates:
        verify-code: 验证码模板ID
        invite-task: 邀请通知模板ID
```

> 不配也能启动和调试注册流程：未配置发信参数时验证码打印在后端日志（`[DEV] ... 的验证码 = 123456`），不真发邮件。

> **为什么放在 `backend/` 而不是 `src/main/resources/`？**
> `src/main/resources/` 下的文件会被打进 jar（`pom.xml` 已显式排除敏感配置，但仍不该放）。
> 放 `backend/` 时，Spring Boot 会从**工作目录**（默认外部配置位置 `file:./`）加载 —— 与线上
> `/home/xiaos/eggworld/application-prod.yml` 的机制完全一致。
> 前提是运行时工作目录为 `backend/`：`mvn spring-boot:run` 在 `backend/` 下执行即满足；
> IDE 里请把 Run Configuration 的 Working directory 设为模块目录（`backend/`）。

> 也可以用环境变量 `SES_FROM_ADDRESS` / `SES_SECRET_ID` / `SES_SECRET_KEY` / `SES_TEMPLATE_ID`、`DB_USERNAME` / `DB_PASSWORD` 注入，见 `application.yml` 中的占位符。

3. 启动（需 JDK 17）：

```powershell
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

默认端口 `8080`，健康检查 `GET /api/health`。

4. 起前端页面（要看页面时**另开一个终端**，零依赖，只需 Node）：

```powershell
node start-frontend.cjs 5500          # 打开 http://127.0.0.1:5500/growth-schoolv3.html
node start-frontend.cjs 5600 --open   # 换端口并顺带打开浏览器
```

- 静态根固定为**本仓库根**，所以 HTML 里对 `js/`、`assets/` 的相对引用都能解析
- 页面在 `localhost` / `127.0.0.1` 下打开时，前端 API 自动指向 `http://localhost:8080`（后端按上面第 3 步另起即可）
- 一律 `no-store`：改完 js/CSS 刷新即生效；只绑 `127.0.0.1` 不对局域网暴露，且只放行根下 `*.html` + `js/**` + `assets/**`
  （仓库里的密钥类文件因此读不出来）

## 数据库迁移

**线上已有库不要执行 `init.sql`**（开头是 `DROP TABLE IF EXISTS`，会清空数据）。
按顺序执行 `backend/sql/migrate-*.sql`，各脚本的适用场景与回滚方式见 [docs/迁移计划.md](docs/迁移计划.md)。

## 打包与发布

**增量部署包（标准做法）**：只打包本次变更的文件，输出到 `releases/deploy/<本次上线名>/`

```powershell
powershell -ExecutionPolicy Bypass -File backend\build-deploy.ps1 -Name "2026-09-13_XXX"
```

- 变更基准默认取**最近一个 `release/*` tag**（= 线上正在运行的版本），只打包「上次上线之后」的改动
- 打包时把 `version` / `gitSha` / `buildTime` 注入 jar，线上可用 `GET /api/health` 自查版本
- 后端有变更 → 用 JDK17 重新 `clean package`，把 jar 放进包内
- 前端只拷本次变更/新增文件（`growth-schoolv3.html` 自动改名为 `index.html`）
- 检出删除的文件，写入包内「部署说明.md」，并在迁移文档中登记
- 包内 `backend/`、`frontend/` 与服务器目录一一对应，照「部署说明.md」上传即可

**全量打包（备用，排查线上文件缺失时用）**：

```powershell
powershell -ExecutionPolicy Bypass -File backend\build-release.ps1
```

产出在 `backend/release/`：`eggworld.jar` + `index.html` + `js/`（全部 12 个外联文件）。
注意：`assets/` 下 8 张图片（7 张 `char-eggy-*.jpg` + `logo-char.png`）**不在打包范围内**，需单独上传到 `/xs/assets/`。

> ⚠️ 脚本文件（`.ps1`）内含中文，必须保存为 **UTF-8 with BOM**。否则 Windows PowerShell 5.1 会按 GBK 读取，
> 中文变乱码并抛出 `UnexpectedToken` 等语法错误（2026-09-14 曾因此两次踩坑）。
> **任何编辑 `.ps1` 之后都要核对 BOM**：
>
> ```powershell
> (Get-Content backend\build-deploy.ps1 -Encoding Byte -TotalCount 3) -join ','   # 期望 239,187,191
> ```
>
> 缺失时补回（无 BOM → 带 BOM）：
>
> ```powershell
> $p = 'backend\build-deploy.ps1'
> [System.IO.File]::WriteAllText($p, [System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false)), [System.Text.UTF8Encoding]::new($true))
> ```

## 上线与迁移文档

- 上线流程、发布物路径、回滚方式：[releases/上线文档.md](releases/上线文档.md)
- **与线上版本的同步自检**：`powershell -ExecutionPolicy Bypass -File backend\check-live.ps1`
  一条命令核对「线上 `/api/health` 的 `gitSha` ↔ 最近 `release/*` tag ↔ 发布记录」；
  规范见 [PROJECT_RULES.md](PROJECT_RULES.md) 2.6，命令见 [releases/上线文档.md](releases/上线文档.md) 第二节第 0 步。
- 发布总账（每次上线一行，含 tag / commit / 结果）：[releases/发布记录.md](releases/发布记录.md)
- **版本锚点**：上线验证通过后打 `git tag -a release/YYYY-MM-DD` 并 `git push gitee --tags`（`main` 只能通过 PR 合并，tag 单独推），
  使「线上跑的是哪一版」有据可查；jar 内置版本信息，可通过 `GET /api/health` 核对。
- **项目规范：每次上线都要新建一份迁移文档**，路径 `releases/迁移文档/YYYY-MM-DD_<本次做了什么>.md`；
  **只改前后端文件、不动数据库时同样要出**，并在「数据库变更」一节写「无」。
  命名规则、必备内容与模板见 [releases/上线文档.md](releases/上线文档.md) 第四节。

## 安全约定

- 所有密钥（数据库密码、邮箱授权码、JWT secret）通过环境变量或**未入库**的 `application-local.yml` / `application-prod.yml` 提供，主配置只保留占位符
- 线上数据备份、角色原图、本地临时文件已加入 `.gitignore`，不要提交
- 所有 JSON 入参的字符串会经过 `TextSanitizer` 剥离 `<`，与前端转义构成双层防护
