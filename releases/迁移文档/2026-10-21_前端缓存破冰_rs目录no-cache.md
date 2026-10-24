# 前端缓存破冰 + 发布流程自动化 · 待发布迁移文档

> 日期：2026-10-21
> 类型：**仅前后端文件 + 服务器运维脚本（无数据库变更）**
> 状态：已在分支完成开发与本地验证；**未合并 `main`、未发布、未改动线上 nginx**（nginx 改动需单独授权）。
> 开发分支 / PR：`fix/rs-html-cache` → [PR !51](https://gitee.com/xiaoshuai02/eggworld/pulls/51)（本 PR 含两批：缓存破冰 + 发布流程自动化）
> 关联文档：`releases/迁移文档/2026-10-20_学生工坊职业测评_工坊排序_返回工坊.md`（第七节已记录「`/rs/` 下 HTML 仍沿用 7 天缓存」这一已知边界，本次即修它）
> 部署包：`releases/deploy/2026-10-21_前端缓存破冰_rs目录no-cache/`（由 `backend/build-deploy.ps1 -Name "2026-10-21_前端缓存破冰_rs目录no-cache"` 生成）
> 上线前线上版本：`4655247`（2026-10-21 实测 `curl https://dsxnb.com/api/health`：version=`2026-10-21_职业测评报告深色档案与分享_简历移动端`、gitSha=`4655247`、buildTime=`2026-10-21T10:31:00Z`）
> 上线后线上版本：**待上线验证通过后回填**
> 对比基底：**显式 `-Base 4655247`**（线上这一版没有 `release/*` tag；最近 tag 是 `release/2026-10-14-task-governance`，早于线上版本，不能直接用默认基线）

## 一、本次范围

### 1. 缓存破冰（前端，解决「用户看不到新版」）

**真实事故（2026-10-21）**：职业测评深色档案版 10:33 已上传到服务器，但访问过 `/rs/career/` 的用户仍看到旧页面。

实测响应头：

| URL | Cache-Control | 结果 |
|---|---|---|
| `/`（主站入口） | `no-cache` | 每次都重新校验，正常 |
| `/rs/career/`、`/rs/career/report.html`、`/rs/` | `max-age=604800`（7 天） | **旧 HTML 7 天内不会回来请求** |
| `/rs/career/css/career-theme.css?v=20261021a` | `max-age=604800` | 带新版本串，能拿到新文件 |

根因：`location /` 的 `expires 7d` 把 `/rs/**` 一起覆盖了，只有 `location = /index.html` 单独设了 `expires -1`。用户连新 HTML 都没拿到，HTML 里的 `?v=` 自然没有生效机会。

改动：

1. **入口破冰**（`js/student-workshop.js`）：两张工坊卡片的跳转加上版本串
   - 大师兄简历：`rs/` → `rs/?v=20261021`
   - 大师兄找方向：`rs/career/` → `rs/career/?v=20261021`
   - `growth-schoolv3.html` 里 `js/student-workshop.js` 引用同步升到 `?v=20261021a`
2. **补齐遗漏的版本号**（`resume/public/career/*.html`）：`output.css`、`markdown.css`、`mobile-adaptation.css`、`navigation-feedback.css`、`js/index.js`、`js/navigation-feedback.js`
3. **nginx 根治**（`backend/deploy/dsxnb.conf`，需单独授权）：`/rs/` 下 HTML 与目录索引改 `expires -1`，带 hash / `?v=` 的 js、css、图片仍 `7d`
4. **构建期自动升版**（`backend/build-deploy.ps1`）：打包时把本次变更的 `js/*.js|css` 在包内 `index.html` 的 `?v=` 自动替换为当前 commit 短 SHA
   - 只改变更文件，未变更的 js 继续命中 7 天缓存
   - 只匹配 `src=` / `href=` 属性，不误伤注释
   - 只改 js、没改 HTML 时会把入口一起打进包

### 2. 发布流程自动化（服务器脚本，解决「手工覆盖 + 无回滚」）

改成三段式，与你现有习惯一致，只是把手工动作脚本化：

```
① 服务器：ops/backup.sh <上线名>          备份 jar + 数据库（只读线上，只写 backup/）
② 本地  ：backend\upload-deploy.ps1        构建增量包 + scp 上传到 incoming/<上线名>/
③ 服务器：ops/remote-deploy.sh <上线名>    前端原子切换 + 换 jar + 重启 + 健康检查 + 失败自动回滚
```

- 前端 `xs` 改为软链，指向 `releases/frontend/<版本>`；切换是 `rename(2)` 原子操作，nginx 不用改配置；
- **存储**：上传的是增量包；版本目录默认只保留 2 份（当前 + 上一版）；复制前检查剩余空间，不足直接拒绝；
- **防误删**：删除只允许发生在 `releases/frontend/*` 与 `incoming/*`；`backup.sh` 无删除操作；`init` 只改名不删除；失败自动回滚；
- **SQL**：脚本只备份并列出待执行脚本，人工执行后加 `--skip-sql` 重跑，不自动改库。

## 二、变更清单

### 参与部署（获授权后）

| 仓库文件 | 服务器绝对路径 | 说明 |
|---|---|---|
| `releases/deploy/<上线名>/frontend/index.html`（源：仓库根 `growth-schoolv3.html`） | `/home/xiaos/eggworld/xs/index.html` | `student-workshop.js` 引用升到 `?v=20261021a` |
| `releases/deploy/<上线名>/frontend/js/student-workshop.js` | `/home/xiaos/eggworld/xs/js/student-workshop.js` | 两个工坊入口带 `?v=20261021` |
| `releases/deploy/<上线名>/frontend/rs/`（整个目录） | `/home/xiaos/eggworld/xs/rs/` | career HTML 补齐资源版本号；**整目录覆盖** |
| `backend/deploy/publish-frontend.sh` | `/home/xiaos/eggworld/ops/publish-frontend.sh` | 前端版本目录：init / publish / rollback / list / status |
| `backend/deploy/backup.sh` | `/home/xiaos/eggworld/ops/backup.sh` | 发布前备份 jar + 数据库 |
| `backend/deploy/remote-deploy.sh` | `/home/xiaos/eggworld/ops/remote-deploy.sh` | 服务器侧切换、重启、验证、自动回滚 |
| `backend/deploy/dsxnb.conf`（仓库副本，**需单独授权**） | `/home/xiaos/eggworld/ops/`（线上实测有 `nginx.conf` 与 `nginx-xs-location.conf`，以实际位置为准） | `/rs/` 的 no-cache 规则；`nginx -t` 后 `systemctl reload nginx` |
| `backend/upload-deploy.ps1` | **仅本地使用，不上传** | Windows 构建 + scp 上传 |

**后端源码无改动**：`backend/src/` 不动，包内不应重新生成 jar。
**其他 `js/`、`assets/` 未改动**：不上传。

### 服务器目录变更（由脚本执行，不是上传物）

| 路径 | 变化 |
|---|---|
| `/home/xiaos/eggworld/releases/frontend/baseline-<时间>/` | 新增：现有 `xs/` 的完整副本 |
| `/home/xiaos/eggworld/xs` | **从真实目录变为软链**，指向上面那个 baseline |
| `/home/xiaos/eggworld/xs.before-atomic-<时间>/` | 新增：原目录改名保留，确认正常后可删 |
| `/home/xiaos/eggworld/incoming/` | 新增：每次发布的上传目录 |

### 仅测试 / 仅仓库（不参与部署）

- `tests/student-workshop-resume.test.cjs`：工坊跳转断言必须带 `?v=`
- `backend/build-deploy.ps1`：构建期自动升版（脚本不上传服务器）
- 本迁移文档本身

### 文件删除

本次无删除。

## 三、数据库变更

**无**。不改表结构、不写数据、不新增业务脚本。

`backup.sh` 会执行 `mysqldump` 做备份，不改数据。服务器已确认存在 `~/.my.cnf`（`chmod 600`），密码不写入仓库与本文档。

## 四、部署步骤

**一、本地生成增量部署包**（PR 合并进 `main` 后执行；工作区干净、`HEAD` = 本次发布提交）

```powershell
git checkout main
git pull
powershell -ExecutionPolicy Bypass -File backend\build-deploy.ps1 -Name "2026-10-21_前端缓存破冰_rs目录no-cache" -Base 4655247
```

- **必须显式 `-Base 4655247`**：线上这版没有 tag，默认基线会算出大量无关差异
- **产出**：`frontend/index.html`、`frontend/js/student-workshop.js`、`frontend/rs/`、`部署说明.md`；**不应出现 jar**
- 核对「部署说明.md」：应显示「本次无删除」，且「外联资源版本号」为当前 commit 短 SHA

**二、服务器侧（获授权后）**

1. **上传 3 个运维脚本并安装**（首次）

   ```powershell
   scp backend\deploy\publish-frontend.sh backend\deploy\backup.sh backend\deploy\remote-deploy.sh xiaos@dsxnb.com:/home/xiaos/eggworld/ops/
   ```

   ```bash
   cd /home/xiaos/eggworld/ops
   file publish-frontend.sh backup.sh remote-deploy.sh   # 不能出现 CRLF
   for f in publish-frontend.sh backup.sh remote-deploy.sh; do bash -n "$f" && chmod 755 "$f"; done
   ```

2. **备份（用新脚本，普通用户 xiaos，禁止 sudo）**

   ```bash
   ~/eggworld/ops/backup.sh 2026-10-21_前端缓存破冰_rs目录no-cache
   ls -l ~/eggworld/backup/<时间>-2026-10-21_前端缓存破冰_rs目录no-cache
   ls -l ~/eggworld/backup/db | tail -3   # dump 属主 xiaos、大小非 0
   ```

3. **首次初始化前端目录（只做一次，必须在发布新版之前）**

   ```bash
   du -sh ~/eggworld/xs        # 实测 18M，版本目录 2 份约 36M；当前剩余 19G
   ~/eggworld/ops/publish-frontend.sh init
   ls -l ~/eggworld/xs         # 应显示软链
   ```

   > 顺序不能反：先 `init` 得到的 baseline 才是**当前线上旧版**，出问题才能回滚。

4. **上传本批前端文件**（新流程）

   ```powershell
   powershell -ExecutionPolicy Bypass -File backend\upload-deploy.ps1 -Name "2026-10-21_前端缓存破冰_rs目录no-cache" -SkipBuild
   ```

   > 上一步已构建过，这里 `-SkipBuild` 直接上传；如果还没构建，去掉该参数并把 `-Base 4655247` 带上。

5. **服务器切换（本批无 jar，不会重启 eggworld）**

   ```bash
   ~/eggworld/ops/remote-deploy.sh 2026-10-21_前端缓存破冰_rs目录no-cache --skip-sql
   ```

6. **nginx（单独授权后才执行）**

   ```bash
   cp ~/eggworld/ops/nginx-xs-location.conf ~/eggworld/backup/<批次>/
   # 覆盖后校验并平滑重载
   nginx -t && sudo systemctl reload nginx
   ```

7. **清理**：确认正常后 `rm -rf ~/eggworld/incoming/2026-10-21_前端缓存破冰_rs目录no-cache`

**三、以后每次发版**

```bash
~/eggworld/ops/backup.sh <上线名>
```
```powershell
powershell -ExecutionPolicy Bypass -File backend\upload-deploy.ps1 -Name "<上线名>" -Base <线上 commit>
```
```bash
~/eggworld/ops/remote-deploy.sh <上线名>
```

## 五、验证清单

**缓存与前端**

- [ ] nginx 生效后 `curl -sI https://dsxnb.com/rs/career/` 返回 `Cache-Control: no-cache`
- [ ] `curl -sI https://dsxnb.com/rs/career/report.html` 返回 `Cache-Control: no-cache`
- [ ] `curl -sI 'https://dsxnb.com/rs/career/css/career-theme.css?v=20261021a'` 仍为 `max-age=604800`
- [ ] 主站工坊两张卡片跳转分别为 `rs/?v=20261021`、`rs/career/?v=20261021`
- [ ] 已有旧缓存的浏览器（不手动清缓存）从主站工坊进入，能看到深色档案版入口 / 答题 / 报告
- [ ] `/rs/career/report.html`、`reports.html`、`share.html` 样式无缺失
- [ ] 简历站 `rs/` 正常，换账号不串数据
- [ ] 多宽度（1440 / 390 / 430）正常；真实手机 / 微信客户端另行补测
- [ ] 既有功能未回退：任务广场、学生工坊排序、猫咪小屋入口

**发布流程**

- [ ] `ls -l ~/eggworld/xs` 为软链，指向 `releases/frontend/baseline-*`
- [ ] `publish-frontend.sh status` 显示当前版本与占用
- [ ] `incoming/<上线名>/` 文件数与部署包一致
- [ ] `curl -s https://dsxnb.com/api/health` 的 `gitSha` 仍为 `4655247`（本批不改 jar）
- [ ] 演练一次 `publish-frontend.sh rollback <上一版>`，页面可逆
- [ ] `du -sh ~/eggworld/releases/frontend` 不超过 2 份站点大小（本批约 36M）

## 六、回滚方案

1. **前端（版本目录）**：

   ```bash
   ~/eggworld/ops/publish-frontend.sh list
   ~/eggworld/ops/publish-frontend.sh rollback <上一版本>
   ```

2. **前端（未启用版本目录时的旧方式）**：`cp "$BACKUP"/index.html xs/index.html`、`cp "$BACKUP"/student-workshop.js xs/js/student-workshop.js`、`rm -rf xs/rs && cp -r "$BACKUP"/rs-before xs/rs`

3. **nginx**：用批次目录里的旧配置覆盖回 `~/eggworld/ops/`，`nginx -t && sudo systemctl reload nginx`

4. **完全撤销版本目录方案**：

   ```bash
   cd /home/xiaos/eggworld
   rm xs
   mv xs.before-atomic-<时间> xs
   ls -l xs          # 应为目录；nginx 不需要 reload
   ```

5. **数据库**：无变更，无需回滚；`backup/db/` 下的 dump 仅作保险
6. **不可逆项**：本次无资金、积分、状态机变动

## 七、备注 / 已知边界

- **改 nginx 不追溯已有缓存**：已经拿到 `/rs/career/` 7 天缓存（至 2026-10-28）的浏览器不会因响应头变化重新拉取；这类用户靠入口 `?v=` 破冰。
- 老 HTML 里的资源版本串是旧的，页面会**整体显示旧版**，不会新旧混用错位。
- `/rs/` 下不存在的路径从「回落到主站首页」改为 404；如线上有依赖旧回落行为的外链，验证时确认。
- **存储**：`xs` 实测 18M；版本目录默认保留 2 份（约 36M），发布前脚本会做空间预检；`backup/` 已有 24 个历史目录，本次不动，建议以后人工归档。
- **中文路径**：`incoming/<中文上线名>/` 若 Windows `scp` 编码异常，用 Xftp 传到同一目录即可；也可用 ASCII 目录名并加 `--expect-version "<中文上线名>"`。
- **SQL 不自动执行**：脚本只备份并列出命令，执行由人工完成。
- **`build-deploy.ps1` 的「部署说明.md」仍按逐个覆盖写法**，使用新流程时以本文档为准。
- **后端 jar 仍是覆盖式**：本批不改；后续可用相同思路做 `releases/backend/<版本>` 软链。
- **软链依赖**：nginx 需保持默认 `disable_symlinks off`。
- 本次不处理 `/dd/`（另一个项目）的缓存策略，也不改 `/` 主站现有规则。
