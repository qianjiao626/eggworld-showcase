# safeHttpUrl 来源链接渲染修复 · 待发布汇报与迁移文档

> 日期：2026-09-24
> 类型：仅前端文件变更（无数据库）
> 状态：已在分支完成开发与验证；**未合并 `main`、未发布、未改动线上数据库与配置**。
> 开发分支 / PR：`fix/safe-http-url` → PR 创建后回填编号与链接
> 关联文档：`AGENTS.md`、`PROJECT_RULES.md`、`COLLABORATION.md`、`releases/迁移文档/_模板.md`
> 部署包：`releases/deploy/2026-09-24_safe-http-url修复/`（PR 合并后、获得上线授权并在干净工作区执行 `backend\build-deploy.ps1 -Name "2026-09-24_safe-http-url修复"` 生成）
> 上线前线上版本：`082923f`（既有线上版本锚点；本次未连接线上接口、未执行部署）
> 上线后线上版本：**待上线验证通过后回填**
> 对比基底：`release/2026-09-18`（当前线上 `082923f` 不在 `release/*` tag 上；正式打包时必须按规范显式使用 `-Base 082923f`，并由上线执行方复核）

## 一、本次范围

修复高校宿舍目录加载资料时因调用未定义的 `safeHttpUrl` 导致页面出现 `safeHttpUrl is not defined` 的问题，并补充来源链接的协议安全校验。

- 新增 `safeHttpUrl`：只允许 `http:` / `https:` 来源，空值、非法值及 `javascript:` 等危险协议返回空字符串。
- 增加回归测试：覆盖危险来源不渲染链接、正常 HTTPS 来源仍可展示。
- 本次不改宿舍目录的学校数据、上传审核流程、后端接口、数据库或服务器配置。

## 二、变更清单

### 参与部署（获授权后）

| 仓库文件 | 服务器绝对路径 | 说明 |
|---|---|---|
| `js/dormitory.js` | `/home/xiaos/eggworld/xs/js/dormitory.js` | 参与部署；修复来源链接渲染并过滤非 HTTP(S) 协议 |

### 仅测试 / 仅文档

| 仓库文件 | 说明 |
|---|---|
| `tests/dormitory-directory.test.cjs` | 仅测试；不上传服务器，新增 `safeHttpUrl` 回归覆盖 |
| `releases/迁移文档/2026-09-24_safe-http-url修复.md` | 本汇报与待发布迁移说明；不直接上传服务器 |
| `growth-schoolv3.html` | 未修改；不上传 |
| `js/bl-schools.js` | 未修改；不上传 |
| `backend/`、`backend/sql/` | 未修改；不上传，不生成数据库迁移 |
| `assets/` | 未修改；不上传 |

### 文件删除

本次无删除。

## 三、数据库变更

无数据库变更、无迁移 SQL、无数据修正、无需备份数据库。本次不执行线上 `init.sql`，也不连接正式数据库。

## 四、部署步骤

### 一、本地生成增量部署包

仅在 PR 合并进 `main`、工作区干净并获得单独上线授权后执行：

```powershell
git checkout main
git pull
git log -1 --oneline
powershell -ExecutionPolicy Bypass -File backend\build-deploy.ps1 -Name "2026-09-24_safe-http-url修复" -Base 082923f
```

核对 `releases/deploy/2026-09-24_safe-http-url修复/部署说明.md`，确认只包含 `js/dormitory.js`（以及脚本按项目规则生成的必要前端入口文件），没有数据库脚本、密钥或无关文件。当前线上 SHA 不在 `release/*` tag 上，不能省略 `-Base 082923f`；上线执行方需先再次核对 `/api/health` 的真实 SHA。

### 二、服务器侧（获授权后）

1. 以普通用户 `xiaos` 备份旧文件到 `/home/xiaos/eggworld/backup/<日期>-safe-http-url/`，并用 `test -r` / `test -s` 验证备份可读。
2. 按部署说明上传 `/home/xiaos/eggworld/xs/js/dormitory.js`；无数据库迁移，跳过数据库步骤。
3. 本次只有静态前端文件变更，按线上操作手册完成必要的静态文件生效动作；不修改 jar、Nginx、服务器配置或数据库。
4. 发布后执行 `curl -s https://dsxnb.com/api/health`，记录真实线上版本；宿舍目录页面打开资料详情，确认控制台无 `safeHttpUrl is not defined`。
5. 删除清单默认不执行，保留备份用于回滚。

## 五、验证清单

### 已完成

- [x] 专项测试：`node --test tests/dormitory-directory.test.cjs` → 7 通过、0 失败。
- [x] 前端全量测试：`node --test tests/*.cjs` → 175 通过、9 跳过、0 失败（共 184 项）。
- [x] 语法检查：`node --check js/dormitory.js` 通过。
- [x] 差异检查：`git diff --check` 通过。
- [x] 本地浏览器验证：打开 `http://127.0.0.1:4173/growth-schoolv3.html`，进入“八卦吃瓜”→“高校宿舍目录”，页面正常显示，控制台错误为空。
- [x] 已核对未修改用户原有未跟踪文件 `TODO/工单-兴趣选择与任务推荐.md`，该文件不纳入本次提交。

### 待 PR 合并 / 上线后

- [ ] PR 合并前按项目规则执行 `cd backend && mvn -o compile`（当前任务没有后端改动）。
- [ ] 1440 / 390 / 430 宽度及真实手机 / 微信 WebView 补测。
- [ ] 线上 `/api/health` 版本与本次上线提交 SHA 核对。
- [ ] 权限边界与协作者已有功能未回退的上线后回归。

## 六、回滚方案

- 代码回滚：恢复 `/home/xiaos/eggworld/xs/js/dormitory.js` 的上线前备份即可；静态文件按线上手册重新加载。
- 数据库：无数据库变更，不执行反向 SQL。
- 本次没有资金、余额、流水等不可逆变动。

## 七、备注 / 已知边界

- 本 PR 只修复 `safeHttpUrl is not defined` 及来源协议过滤，不代表所有学校都已有已核验宿舍资料。
- 当前工作区原有的 `TODO/工单-兴趣选择与任务推荐.md` 与本任务无关，既不修改也不提交。
- 当前尚未上线、尚未合并 `main`；PR 编号与链接将在 Gitee 创建成功后回填。


