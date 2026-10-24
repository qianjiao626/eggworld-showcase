# 实施计划：蛋蛋世界后端落地

## 概述

将纯前端单文件应用 [growth-school.html](file:///d:/code/projects/all/backend-handoff-package/growth-school.html) 落地为可真实上线的 MVP。后端使用 Java + Spring Boot 3 + MySQL 8 + 邮箱密码（含验证码）登录，部署到国内云轻量服务器。本期目标是验证业务能否跑通、能否留住用户，因此采用**垂直切片**：每个 P0 模块从数据库 → API → 前端对接一条龙完成，跑通一个再下一个，不做过度设计。

## 架构决策

| 决策 | 理由 |
|------|------|
| Spring Boot 3.x + JDK 17 | 国内主流、资料最多、招人方便；Spring Boot 3 最低要求 JDK 17 |
| MySQL 8.x | 建表 SQL 见 [backend/sql/init.sql](file:///d:/code/projects/all/backend-handoff-package/backend/sql/init.sql)（设计稿见 [backend-handoff.md 第四节](file:///d:/code/projects/all/backend-handoff-package/docs/backend-handoff.md)），零迁移成本 |
| MyBatis-Plus | 国内主流 ORM，对单表 CRUD 友好，代码量小，SQL 可控 |
| JWT（jjwt）+ 邮箱密码 + 验证码 | MVP 阶段无状态认证最简单；密码用 BCrypt；验证码第一版内存缓存，二期换 Redis |
| 邮件服务用 Spring Mail + SMTP | 腾讯企业邮/QQ邮箱 SMTP 免费起步，零成本 |
| 蛋蛋币流转用数据库事务 + 行锁 | `SELECT ... FOR UPDATE` 防并发超扣，单库足够 MVP |
| 后端工程放在 `backend/` 子目录 | 与前端 `growth-school.html` 同级，便于统一管理 |
| 自动退回用 `@Scheduled` 定时任务 | 单机 Spring Boot 即可，无需引入 XXL-JOB 等调度框架 |

## 任务列表（按执行顺序）

### 阶段 0：项目骨架与环境
- [ ] Task 1: 确认环境 + 创建 Spring Boot 项目骨架
- [ ] Task 2: 创建数据库 + 导入建表 SQL

### 检查点：骨架就绪
- [ ] 项目能启动，能连 MySQL，`/api/health` 返回 ok

### 阶段 1：认证 + 个人信息（P0）
- [ ] Task 3: 实现邮箱验证码发送与缓存
- [ ] Task 4: 实现用户注册（验证码 + 设置密码）
- [ ] Task 5: 实现邮箱密码登录 + JWT 签发
- [ ] Task 6: 实现个人信息查询与更新接口

### 检查点：认证闭环
- [ ] Postman 走通：注册→登录→查自己→改资料→再登录

### 阶段 2：任务模块（P0）
- [ ] Task 7: 实现发布任务接口（含蛋蛋币冻结）
- [ ] Task 8: 实现任务广场查询（筛选/分页）
- [ ] Task 9: 实现认领与配对接口
- [ ] Task 10: 实现任务状态机（提交/确认/取消）

### 检查点：任务闭环
- [ ] Postman 走通完整状态机：pending→approved→in_progress→submitted→completed

### 阶段 3：蛋蛋币流转 + 流水（P0，与阶段 2 交叉）
- [ ] Task 11: 实现蛋蛋币事务化结算（按文档 6.1 规则）
- [ ] Task 12: 实现蛋蛋币流水查询接口
- [ ] Task 13: 实现自动退回定时任务

### 检查点：资金安全
- [ ] 并发模拟多次认领/发布，余额不错一分钱

### 阶段 4：后台管理（P0）
- [ ] Task 14: 实现 admin 权限拦截
- [ ] Task 15: 实现任务审核接口
- [ ] Task 16: 实现用户管理 + 反馈工单接口

### 检查点：后台闭环
- [ ] 管理员能审核任务，学生端状态实时变化

### 阶段 5：前端对接（与阶段 1~4 并行）
- [ ] Task 17: 前端封装 API 层（fetch + token 注入）
- [ ] Task 18: 前端登录/注册改造为 API 调用
- [ ] Task 19: 前端个人信息页改造为 API 调用
- [ ] Task 20: 前端任务广场/发布/认领改造为 API 调用
- [ ] Task 21: 前端"我的任务"与后台管理改造

### 检查点：本地全流程
- [ ] 浏览器走通：注册→发任务→接任务→完成→看余额流水，刷新不丢

### 阶段 6：部署上线
- [ ] Task 22: 打包 jar + 部署到云服务器
- [ ] Task 23: 配置 Nginx + HTTPS + 域名解析
- [ ] Task 24: 角色图片上传 CDN + 替换前端路径

### 检查点：上线
- [ ] 手机浏览器输入域名，全流程可用

## 风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 域名备案需 7~20 天 | 高 | 阶段 0 立即启动备案，与开发并行 |
| 前端同步内存操作改异步 API 工作量大 | 中 | 按"先包装 fetch，再逐个函数 async 化"，不一次性重写 |
| 蛋蛋币并发超扣 | 高 | 所有金额变动走事务 + 行锁，写并发测试用例 |
| 邮件被识别为垃圾邮件 | 中 | 用企业邮箱 SMTP，配置 SPF/DKIM，验证码邮件加签名 |
| 单文件前端 628KB 改造易冲突 | 中 | 只改 JS 数据层，不动 CSS/HTML 结构 |
| 单人开发时间紧张 | 高 | 严格按 P0 优先级，砍掉所有 P1/P2 |

## 开放问题

- [ ] 域名是否已购买？备案是否已启动？（影响阶段 6 时间线）
- [ ] 云服务器是否已下单？哪个云厂商？（影响部署脚本）
- [ ] 邮箱用哪个 SMTP？（QQ邮箱/腾讯企业邮/阿里云邮件推送）
- [ ] 前端是否纳入 git 版本管理？（影响工程目录结构）
