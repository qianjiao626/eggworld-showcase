# 爆料区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在八卦大厅提供独立的文字爆料、审核奖励、文字评论和点赞，并保留资金与治理留痕。

**Architecture:** JdbcTemplate 操作四张独立表，以条件更新和唯一键控制并发审核/结算；PointService 负责平台发币；公开视图不泄露匿名身份。单独 JS/CSS 接入既有页面，避免改动打听逻辑。

**Tech Stack:** Java 17, Spring Boot 3.3, MySQL 8, JUnit5/Mockito, vanilla JS, node:test。

## Global Constraints
- 只改 `codex/gossip-reports`；不执行 `init.sql`，不改线上数据库、不部署、不主动开 PR。
- 评论、标题、正文使用启用敏感词提交前拦截和后端复验；第一版纯文字无图片无分类。
- 奖励金额 0..10000，唯一 report_id 记录；管理员发布自己不能结算；匿名仅前台隐藏身份。

---

### Task 1: 持久层与公共安全规则
**Files:** Create `backend/sql/migrate-gossip-reports.sql`, `backend/src/main/java/com/eggworld/service/GossipReportService.java`, `backend/src/test/java/com/eggworld/service/GossipReportServiceTest.java`.
**Interfaces:** Service 用 `JdbcTemplate`, `ChatSensitiveWordMapper`, `PointService`, `NotificationService`；`publish(Long, ReportInput, boolean)` 与 `approve/reject/settle` 为后续 controller 提供接口。
- [ ] 编写失败测试：普通用户为 pending；管理员为 published/pending-reward；含敏感词拒绝；负数/超上限拒绝；自己结算拒绝；重复审核不二次调用 PointService。
- [ ] 执行 `mvn -o -Dtest=GossipReportServiceTest test`，确认因服务缺失而红。
- [ ] 实现四张表及索引；使用条件更新 CAS、独立唯一奖励记录、`@Transactional` 统一发币和通知；批量可见列表限页限量。
- [ ] 重跑测试直至通过；检查匿名仅在公开投影隐藏，后台有实名，评论同样安全转义。

### Task 2: API 与匿名读取边界
**Files:** Create `backend/src/main/java/com/eggworld/controller/GossipReportController.java`, `backend/src/main/java/com/eggworld/controller/AdminGossipReportController.java`; Modify `backend/src/main/java/com/eggworld/interceptor/JwtInterceptor.java`; Test `backend/src/test/java/com/eggworld/interceptor/GossipReportPublicReadTest.java`.
**Interfaces:** GET `/api/gossip/reports`, `/api/gossip/reports/{id}`, `/{id}/comments`; POST `/api/gossip/reports`, `/{id}/comments`, `/{id}/like`; moderator-only `/api/admin/gossip-reports/...` and `/api/admin/gossip-report-comments/...`.
- [ ] 编写失败测试：匿名可读三类公开路由但不可写，管理读写未登录不可访问。
- [ ] 跑定向测试确认红。
- [ ] 实现控制器、DTO 验证、只允许 GET 公开路由；管控所有管理员写入使用 `@ModeratorOnly` 和服务端状态判断。
- [ ] 定向测试与离线编译确认绿。

### Task 3: 前端交互与审查
**Files:** Create `js/gossip-reports.js`, `js/gossip-reports.css`, `tests/gossip-reports.test.cjs`; Modify `growth-schoolv3.html`.
**Interfaces:** UI 用全局 `apiGet`, `apiPost`, `USER`, `toast`；注入八卦 Tab 与管理审核面板，不修改旧打听的数据及发币流程。
- [ ] 写失败的静态/交互测试：Tab、匿名切换、文字提交锁、展示转义、审核操作、页码和错误保留草稿。
- [ ] 运行 `node --test tests/gossip-reports.test.cjs` 确认红。
- [ ] 实现响应式界面（列表、详情、评论点赞、待审和治理），前端加载启用敏感词预校验；失败保留草稿。
- [ ] 重跑测试，确认绿。
