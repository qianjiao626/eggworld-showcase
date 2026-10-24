# 2026-09-14 每日签到与大学PK上线

状态：已于2026-09-14 18:00（北京时间）发布，公网验证通过；已知加载时序问题见末节。上线名：`2026-09-14_checkin-university-pk`。

## 范围与版本

- 用户已授权当前全部未上线改动发布，允许先备份后执行签到必要的新增表迁移。
- 在个人分支 `feature/university-pk` 合入 `origin/main`（14053ae），保留伙伴线上6f2dade的版本自查、图片assets目录迁移及引导资源。没有合并或推送main。
- 已发布：每日签到（每天北京时间+5经验/+5蛋蛋币）、大学PK（16项对比、15秒刷新、真实首页二维码分享）。
- 生产基线：health.gitSha=6f2dade；原首页与该提交源码字节一致。
- 原JAR SHA256：`f793b88e4d9e6e85c6062b4d5d0befe99d347c82170621f6aaf291f8cb9eab4b`。
- 原首页SHA256：`9486d82997f7629c100580c241d107e607e5cd3c462c210771d8d3524d62d4d6`。

## 数据库迁移

**含数据库变更：仅新增daily_checkins。**

- 数据库已只读核对为eggworld、MariaDB 10.3.39，18张现有表均InnoDB，users.id是有符号BIGINT，daily_checkins尚不存在。
- 私有目录备份整库（single-transaction + routines + triggers + events），压缩校验及SHA256；不将数据备份下载到仓库、不公开。
- 唯一执行SQL：`backend/sql/migrate-daily-checkin.sql`。不执行init.sql、不清表、不覆盖或批量修改旧数据。
- 新表含user_id外键、user_id/check_date唯一约束。旧版本不使用新表，应用回滚保留新表及已经产生的签到数据。
- 正常用户签到会写入签到记录、更新该用户经验/余额并新增积分流水，这是用户使用功能的正常业务写入。

## 发布物与顺序

1. 先提交，再在工作区外干净克隆构建；Maven验证、39项Node回归、前端合并后浏览器回归。打包基线显式6f2dade。
2. 包内仅后端eggworld.jar、frontend/index.html、frontend/js/pk-module.js；SQL单独审核上传私有暂存目录。
3. 核对线上配置和原文件SHA未发生并发变更；备份旧JAR、首页及数据库。
4. 执行新增表迁移，检查表结构；发布PK静态资源后替换JAR、重启eggworld并等待健康，再原子替换首页。
5. 核对公网health版本/commit、静态资源SHA、图片与真实PK只读接口；不在生产注册或用真实用户写测试签到。
6. 不改nginx、MySQL配置、生产秘密配置，不清理旧图片和js。

## 回滚

备份路径预定：`/home/xiaos/eggworld/backup/20260914-checkin-pk`（700，仅服务器私有）。

- 发布过程失败自动还原备份JAR和首页，重启旧服务并验证health。
- 新增PK脚本可保留；旧首页不会引用它。
- 不删除新表，不用整库恢复覆盖发布后正常业务数据。数据库恢复须单独核对事故范围及另行授权。
- 人工回滚前必须检查现在线上仍是本发布版本，避免覆盖后续协作发布。

## 验证与限制

合并前PK：39/39 Node、20项浏览器断言、六屏宽、下载PNG解码验证通过。签到此前完成隔离MySQL真实并发及事务验证。

合并后的重新构建、线上结果及最终commit将在发布完成后回填。真实手机/微信保存、实际跨夜、生产用户写入式签到不宣称已验收。

## 实际发布结果

- 发布代码：`6059747`；分支：`feature/university-pk`。main未推送、未合并。版本标签仅本地创建：`release/2026-09-14-checkin-pk`。
- 后端健康接口返回 `status=up`、`version=2026-09-14_checkin-university-pk`、`gitSha=6059747`；构建时间 `2026-09-14T09:53:54Z`。
- 发布时间：2026-09-14 18:00:36 +08:00。systemd eggworld active，新PID 799805。验证时新进程日志ERROR计数0。
- 合并后Maven verify：16/16；Node：39/39；本地PK浏览器20项断言通过。
- 上传采用可验证的JAR差量重建；重建产物与本地完整测试JAR逐字节SHA256一致。
- 备份实际路径：`/home/xiaos/eggworld/backup/20260914-checkin-pk`，目录700、备份文件600。旧JAR、首页、整库SQL和gzip、backup-manifest.json均保留；数据库备份完成标记、18张表覆盖、解压后SHA256均验证通过。未进行实际恢复演练。
- 只执行 `migrate-daily-checkin.sql`；新增daily_checkins及唯一键、外键。原18张表仍在，原表CREATE TABLE结构逐表比对一致（忽略AUTO_INCREMENT计数）。未执行init.sql、删表、清表或导入旧业务数据。
- application-prod.yml与nginx配置SHA256前后一致。没有重启MySQL/nginx，没有删除旧图片或JS；打包说明中的文档删除清单不在生产执行。
- 公网www正确跳转至裸域；首页、PK脚本SHA256匹配；15个HTML引用的本地js/assets资源请求成功。
- 全新浏览器会话、不使用模拟API：热门10所、真实学校详情16项、390px宽无溢出、无JS运行异常。
- 签到GET状态及POST接口在未登录时均HTTP401；没有借真实用户账号写测试签到数据。

### 新文件SHA256

| 文件 | SHA256 |
|---|---|
| eggworld.jar | `719213d39e1a27ecaddf2174795178b73252a4539562e120bc531e8485972d81` |
| index.html | `ee5491e1aad39473c8f1ac97f4a553116248f85821146dbf298f469b921d5d8e` |
| js/pk-module.js | `5778536cc108273cf86e2d2f0a39809dd8112cf443cac0baa2cc57fc1fb2a77a` |

### 已知问题与未验证项

- 首次进入榜单，在排行榜请求返回前立刻打开PK，下拉可能显示“暂无学校数据”；榜单完成后重新打开可恢复。此次线上冒烟首轮遇到，等待榜单完成后复测通过。尚未修复，不记作全部体验验收通过。
- 访客首页原有users/rankings请求出现401；本轮未修改该权限/调用行为。签到鉴权测试的401属于预期。
- 真机微信长按保存、真实跨夜刷新、生产已登录用户领取奖励尚未实测；不使用真实账号或写测试业务数据来冒充验收。
- 私有服务器 `result.json` 和 `verification.json` 保存部署/公网校验元数据；不含密码或业务记录。
