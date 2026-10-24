# 成就特效系统 · 暂存目录（不参与编译）

本目录存放**成就特效系统**的全部后端代码。它们已从 `backend/src/` 移出，
**不参与 Maven 编译、不会打进 jar**，因此线上不会再因缺少数据库表而报错。

## 为什么下线

线上数据库**没有执行** `backend/sql/migrate-achievement.sql`，
`titles` / `achievements` / `user_achievements` / `user_equip` 四张表不存在。
而原实现里 `DecoResponseAdvice`（全局响应增强）与 `UserService` 会在**每次请求**时查这些表，
导致线上接口报错。故整条链路暂时下线。

## 下线范围（2026-09-18）

| 层 | 处理 |
|----|------|
| 后端代码 | 本目录（28 个文件，含测试） |
| 后端调用点 | 已回退：`CheckinService` / `TaskService` / `ClaimService` / `RatingService` / `GossipService` / `InviteService` / `ComplaintService` / `UserService` / `AdminService` / `UserPurgeMapper` / `UserController` |
| 后端 VO 字段 | 已移除 `deco` / `publisherDeco` 字段：`TaskVO` / `RankingVO` / `GossipPostVO` / `ComplaintVO` / `InviteListVO` / `UserPublicVO` / `UserProfileVO` |
| 前端页面 | 抽到 `js/achievement-page.css` + `js/achievement-page.js`（主文件不加载） |
| 前端装扮 | `js/deco.css` / `js/deco.js` / `js/deco-integration.js` 保留但主文件不加载 |
| SQL | `init.sql` 第 19 节与顶部 4 行 DROP、`migrate-achievement.sql` 整节，均已注释并附说明 |
| 打包脚本 | `backend/build-release.ps1` 的外联清单已移除 3 个 deco 文件 |

## 恢复步骤

1. **数据库**：在线上执行 `backend/sql/migrate-achievement.sql`（取消该文件全部注释后执行）。
2. **后端**：把本目录下的文件按包路径移回 `backend/src/main/java/com/eggworld/` 与
   `backend/src/test/java/com/eggworld/`（目录结构已按包名保留，直接搬回即可）。
3. **后端调用点**：参考 git 历史里下线前的版本，恢复各 Service 的 `evaluateAfterCommit` 调用、
   `UserService` 的 `decoService` 注入与 `attachDecos`、`UserController` 的 `/equip` 接口、
   `AdminService` 的注销清理、以及 7 个 VO 的 `deco` 字段。
4. **前端**：放开 `growth-schoolv3.html` 顶部注释掉的 5 个外联引用，
   删掉 `.nav-item[data-page="achievements"]{display:none}`，
   并把 `go()` 里的 `if(id === 'achievements'){ toast('成就殿堂暂未开放'); return; }` 换回
   `if(id === 'achievements'){ loadAchievementsPage(); }`。
5. **SQL**：取消 `init.sql` 顶部 4 行 DROP 与第 19 节注释。
6. **打包脚本**：把 `deco.css` / `deco.js` / `deco-integration.js` 加回 `build-release.ps1` 清单。
7. **测试**：`tests/achievement.contract.cjs` 已改为校验「下线状态」，
   恢复时请回退到 git 历史里下线前的版本。
8. **验证**：`cd backend && mvn -o test`；`node --test tests/*.cjs`。
