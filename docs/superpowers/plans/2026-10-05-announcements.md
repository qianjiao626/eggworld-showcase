# 全站公告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主管理员发布/编辑/下架公告，所有访客浏览最新和历史公告及发布人。

**Architecture:** 单独表和服务；公开路由仅返回 published，写入使用 `@AdminOnly`；全站壳层提示与公告历史由 JS 独立渲染。

**Tech Stack:** Java 17, Spring Boot 3.3, MySQL 8, JUnit5/Mockito, vanilla JS, node:test。

## Global Constraints
- 只改 `codex/gossip-reports`；先备份再迁移，不执行 `init.sql`，不部署、不主动开 PR。
- 只支持即时文字公告，匿名访客也能读，必须显示发布人；副管理员无写权限。

---

### Task 1: 后端公告与权限
**Files:** Create `backend/sql/migrate-announcements.sql`, `backend/src/main/java/com/eggworld/service/AnnouncementService.java`, `backend/src/main/java/com/eggworld/controller/AnnouncementController.java`, `backend/src/main/java/com/eggworld/controller/AdminAnnouncementController.java`; Modify `backend/src/main/java/com/eggworld/interceptor/JwtInterceptor.java`; Test `backend/src/test/java/com/eggworld/service/AnnouncementServiceTest.java`, `backend/src/test/java/com/eggworld/interceptor/AnnouncementPublicReadTest.java`.
**Interfaces:** GET `/api/announcements`, `/api/announcements/{id}`；管理员 GET `/api/admin/announcements`；`@AdminOnly` POST `/api/admin/announcements`, `PUT /api/admin/announcements/{id}`, `POST /api/admin/announcements/{id}/unpublish`.
- [ ] 写失败测试：公开 GET 匿名通过、写入匿名拒绝；主管理员写权限注解，副管理员不能写；下架后公开不可见；更新记操作员与时间。
- [ ] 跑定向测试确认红。
- [ ] 实现服务端边界、迁移和路由：用服务端 UserContext 判断管理员，不信任前端发布人。
- [ ] 重跑定向测试和 `mvn -o compile` 至绿。

### Task 2: 全站可见界面与上线说明
**Files:** Create `js/announcements.js`, `js/announcements.css`, `tests/announcements.test.cjs`, `releases/迁移文档/2026-10-05_爆料与全站公告.md`; Modify `growth-schoolv3.html`.
**Interfaces:** 使用 `apiGet`, `apiPost`, `apiPut` 访问公告；仅 `USER.role === 'admin'` 展示编辑下架；全站主内容上方展示公告入口。
- [ ] 写失败前端测试：未登录浏览入口、历史和发布人、管理员操作可见性、转义与失败保留输入。
- [ ] 跑 node 定向测试确认红。
- [ ] 实现公告壳层、历史对话框、管理编辑器；按仓库迁移模板填写上线基线、SQL、备份和回滚步骤。
- [ ] 重跑前端/后端测试和 `mvn -o compile`，检查 git diff 后提交本功能分支。
