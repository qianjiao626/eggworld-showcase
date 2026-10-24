# 蛋蛋世界后端落地 · 任务清单（历史施工计划）

> ⚠️ **这是历史文档，不是待办**：Task 1–24 是后端从零落地阶段的施工单，**均已落地**，保留仅供追溯当初的施工顺序与验收口径。
> - **当前待办**请看 [TODO/TODO.md](../TODO/TODO.md)
> - **接口与表结构**请看 [docs/backend-handoff.md](../docs/backend-handoff.md)
> - 本文原名 `tasks/todo.md`，2026-09-14 改名以消除与 `TODO/TODO.md` 的命名冲突
>
> 实施计划见 [plan.md](../archive/tasks/plan.md)（2026-09-24 随历史报告一并归档）
> 每个任务都遵循：描述 + 验收标准 + 验证步骤 + 依赖 + 涉及文件 + 规模

---

## 阶段 0：项目骨架与环境

## Task 1: 确认环境 + 创建 Spring Boot 项目骨架

**描述：** 确认 JDK 17+ / Maven / MySQL 8.x 已就绪，在 `backend/` 子目录创建 Spring Boot 3 项目骨架，配置分层结构与依赖。

**验收标准：**
- [ ] `java -version` 输出 17 或更高
- [ ] `mvn -version` 可用
- [ ] `mysql --version` 输出 8.x
- [ ] `backend/` 目录存在，含 `pom.xml` 和标准 Maven 目录结构
- [ ] `pom.xml` 包含依赖：spring-boot-starter-web / validation / mybatis-plus / mysql-driver / mail / jjwt / lombok
- [ ] 包结构：`com.eggworld.{controller,service,mapper,entity,dto,config,common}`
- [ ] `application.yml` 配置好 MySQL 数据源（密码留空待填）

**验证：**
- [ ] 命令验证：`java -version && mvn -version && mysql --version`
- [ ] 构建验证：`cd backend && mvn clean compile` 成功
- [ ] 启动验证：`mvn spring-boot:run` 启动成功

**依赖：** 无

**涉及文件：**
- `backend/pom.xml`
- `backend/src/main/resources/application.yml`
- `backend/src/main/java/com/eggworld/EggWorldApplication.java`
- `backend/src/main/java/com/eggworld/common/`（统一响应、异常处理）

**规模：** Medium（4-5 文件）

---

## Task 2: 创建数据库 + 导入建表 SQL

**描述：** 创建 `eggworld` 数据库，将 [backend/sql/init.sql](file:///d:/code/projects/all/backend-handoff-package/backend/sql/init.sql)（初期按 [backend-handoff.md 第四节](file:///d:/code/projects/all/backend-handoff-package/docs/backend-handoff.md) 的设计稿整理，现为 18 张表）整理为可执行脚本，并导入初始数据（角色分类、默认管理员）。

**验收标准：**
- [ ] 数据库 `eggworld` 字符集 `utf8mb4`
- [ ] 10 张表全部创建：users / user_stats / tasks / task_claims / ratings / point_logs / gossip_posts / gossip_answers / notifications / feedback_tickets / user_characters
- [ ] 初始数据：6 个角色分类、1 个默认管理员账号（密码 BCrypt 加密）
- [ ] SQL 脚本可重复执行（`DROP TABLE IF EXISTS` 顺序正确）
- [ ] 在 `users.email` 上加唯一索引

**验证：**
- [ ] 执行脚本：`mysql -u root -p < backend/sql/init.sql`
- [ ] 查询验证：`SHOW TABLES;` 看到 10 张表
- [ ] 数据验证：`SELECT * FROM users WHERE role='admin';` 有 1 条记录

**依赖：** Task 1

**涉及文件：**
- `backend/sql/init.sql`

**规模：** Small（1 文件，较长）

---

## 检查点：骨架就绪
- [ ] 项目能启动，能连 MySQL
- [ ] `GET /api/health` 返回 `{"code":200,"msg":"ok"}`
- [ ] 数据库 10 张表就绪

---

## 阶段 1：认证 + 个人信息（P0）

## Task 3: 实现邮箱验证码发送与缓存

**描述：** 实现 `POST /api/auth/send-code`，接收邮箱，生成 6 位验证码，通过 Spring Mail 发送，内存缓存（`ConcurrentHashMap`，5 分钟过期）。

**验收标准：**
- [ ] 接口 `POST /api/auth/send-code`，body: `{"email":"xxx@xx.com"}`
- [ ] 邮箱格式校验，非法返回 400
- [ ] 生成 6 位数字验证码，存入内存（key=邮箱，value=验证码+过期时间）
- [ ] 通过 SMTP 发送验证码邮件，邮件含验证码和签名
- [ ] 同一邮箱 60 秒内不能重复发送（防刷）
- [ ] 返回统一响应格式 `{"code":200,"msg":"验证码已发送"}`

**验证：**
- [ ] Postman 调用接口，能收到验证码邮件
- [ ] 60 秒内重复调用返回 429
- [ ] 5 分钟后验证码失效

**依赖：** Task 1, Task 2

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/AuthController.java`
- `backend/src/main/java/com/eggworld/service/VerifyCodeService.java`
- `backend/src/main/java/com/eggworld/config/MailConfig.java`
- `backend/src/main/resources/application.yml`（SMTP 配置）

**规模：** Medium（3-4 文件）

---

## Task 4: 实现用户注册（验证码 + 设置密码）

**描述：** 实现 `POST /api/auth/register`，校验验证码，创建用户，初始化 `user_stats` 和 `user_characters`，赠送 100 蛋蛋币并记录流水。

**验收标准：**
- [ ] 接口 `POST /api/auth/register`，body: `{"email":"x","password":"x","code":"x","nickname":"x"}`
- [ ] 校验验证码正确且未过期
- [ ] 校验邮箱未注册（唯一）
- [ ] 密码用 BCrypt 加密存储
- [ ] 事务内创建：users 记录 + user_stats 初始化 + user_characters 6 条（默认 game 解锁）
- [ ] 赠送 100 蛋蛋币，写一条 `point_logs`（type=reward, delta=100）
- [ ] 注册成功后验证码立即失效

**验证：**
- [ ] Postman 注册成功，MySQL 能查到用户
- [ ] 重复邮箱注册返回 409
- [ ] 验证码错误返回 400
- [ ] 用户表 points=100，point_logs 有 1 条记录

**依赖：** Task 2, Task 3

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/AuthController.java`
- `backend/src/main/java/com/eggworld/service/AuthService.java`
- `backend/src/main/java/com/eggworld/service/UserService.java`
- `backend/src/main/java/com/eggworld/mapper/UserMapper.java`
- `backend/src/main/java/com/eggworld/entity/User.java`

**规模：** Medium（4-5 文件）

---

## Task 5: 实现邮箱密码登录 + JWT 签发

**描述：** 实现 `POST /api/auth/login`，校验邮箱+密码，签发 JWT；实现 JWT 拦截器，受保护接口需带 token。

**验收标准：**
- [ ] 接口 `POST /api/auth/login`，body: `{"email":"x","password":"x"}`
- [ ] BCrypt 校验密码
- [ ] 签发 JWT（含 userId、role、nickname），有效期 7 天
- [ ] 实现 `JwtInterceptor`，拦截 `/api/**`（排除 login/register/send-code）
- [ ] token 解析失败返回 401
- [ ] 登录响应含 token 和用户基本信息

**验证：**
- [ ] Postman 登录成功，返回 token
- [ ] 错误密码返回 401
- [ ] 带 token 访问 `/api/users/me` 成功
- [ ] 不带 token 访问受保护接口返回 401

**依赖：** Task 4

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/AuthController.java`
- `backend/src/main/java/com/eggworld/service/AuthService.java`
- `backend/src/main/java/com/eggworld/common/JwtUtil.java`
- `backend/src/main/java/com/eggworld/config/WebMvcConfig.java`
- `backend/src/main/java/com/eggworld/interceptor/JwtInterceptor.java`

**规模：** Medium（4-5 文件）

---

## Task 6: 实现个人信息查询与更新接口

**描述：** 实现 `GET /api/users/me`、`PUT /api/users/me`、`GET /api/users/:id/stats`、`GET /api/users/:id/characters`，对应前端 `USER`、`USER_DB`、`CHAR_STATE`。

**验收标准：**
- [ ] `GET /api/users/me` 返回当前登录用户完整信息
- [ ] `PUT /api/users/me` 支持更新 nickname/school/major/city/grade/age/bio/mbti
- [ ] `GET /api/users/:id/stats` 返回五维属性
- [ ] `GET /api/users/:id/characters` 返回 6 个角色解锁状态
- [ ] 更新 MBTI 时自动计算 mbti_group（NT/NF/SJ/SP）

**验证：**
- [ ] Postman 登录后查自己，数据完整
- [ ] 修改 nickname 后再查，已更新
- [ ] 修改 mbti_type=INTJ，mbti_group 自动变 NT

**依赖：** Task 5

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/UserController.java`
- `backend/src/main/java/com/eggworld/service/UserService.java`
- `backend/src/main/java/com/eggworld/service/StatsService.java`
- `backend/src/main/java/com/eggworld/dto/UserProfileVO.java`

**规模：** Medium（3-4 文件）

---

## 检查点：认证闭环
- [ ] Postman 走通：注册→登录→查自己→改资料→再登录
- [ ] 所有接口返回统一响应格式
- [ ] JWT 鉴权生效

---

## 阶段 2：任务模块（P0）

## Task 7: 实现发布任务接口（含蛋蛋币冻结）

**描述：** 实现 `POST /api/tasks`，校验蛋蛋币余额，事务内创建任务并冻结相应金额，写 point_logs。

**验收标准：**
- [ ] 接口 `POST /api/tasks`，需登录
- [ ] 校验：余额 >= reward 金额
- [ ] 事务内：插入 task + 扣减用户 points + 写 point_logs（type=freeze）
- [ ] 使用 `SELECT ... FOR UPDATE` 锁用户行防并发
- [ ] 任务初始状态 pending（待审核）
- [ ] 校验必填字段：title/task_type/skill_category/reward

**验证：**
- [ ] Postman 发布成功，tasks 表有记录，用户 points 减少
- [ ] 余额不足返回 400
- [ ] point_logs 有冻结记录

**依赖：** Task 6

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/TaskController.java`
- `backend/src/main/java/com/eggworld/service/TaskService.java`
- `backend/src/main/java/com/eggworld/service/PointService.java`
- `backend/src/main/java/com/eggworld/entity/Task.java`

**规模：** Medium（3-4 文件）

---

## Task 8: 实现任务广场查询（筛选/分页）

**描述：** 实现 `GET /api/tasks`，支持按 task_type / skill_category / status / 关键词筛选，分页返回；实现 `GET /api/tasks/:id` 详情。

**验收标准：**
- [ ] `GET /api/tasks?type=teach&category=study&status=approved&page=1&size=20`
- [ ] 返回分页结构 `{records, total, page, size}`
- [ ] `GET /api/tasks/:id` 返回任务详情 + 发布者基本信息
- [ ] 联系方式仅在状态为 in_progress/submitted 时返回（文档 6.3）

**验证：**
- [ ] Postman 筛选查询，结果正确
- [ ] pending 状态的任务联系方式为空
- [ ] in_progress 状态任务联系方式可见

**依赖：** Task 7

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/TaskController.java`
- `backend/src/main/java/com/eggworld/service/TaskService.java`
- `backend/src/main/java/com/eggworld/dto/TaskQueryDTO.java`
- `backend/src/main/java/com/eggworld/dto/TaskVO.java`

**规模：** Medium（3-4 文件）

---

## Task 9: 实现认领与配对接口

**描述：** 实现 `POST /api/tasks/:id/claim`、`GET /api/tasks/:id/claimers`、`POST /api/tasks/:id/pair`，含业务规则校验。

**验收标准：**
- [ ] `claim` 校验：不能认领自己任务、组队型不超 max_claimers、不能重复认领
- [ ] `claimers` 返回认领者列表（仅发布者可见联系方式）
- [ ] `pair` 由发布者选择认领者，状态从 pending_pairing → in_progress
- [ ] 教学型认领时扣减认领者蛋蛋币（文档 6.1）
- [ ] 所有操作走事务

**验证：**
- [ ] Postman 认领成功，task_claims 有记录
- [ ] 认领自己任务返回 400
- [ ] 配对后任务状态变为 in_progress

**依赖：** Task 8

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/TaskController.java`
- `backend/src/main/java/com/eggworld/service/TaskService.java`
- `backend/src/main/java/com/eggworld/service/ClaimService.java`

**规模：** Medium（2-3 文件）

---

## Task 10: 实现任务状态机（提交/确认/取消）

**描述：** 实现 `POST /api/tasks/:id/submit`、`/confirm`、`/cancel`，按文档 6.2 状态机流转，触发蛋蛋币结算。

**验收标准：**
- [ ] `submit`：认领者提交，状态 in_progress → submitted，教学型此时扣减认领者币给发布者
- [ ] `confirm`：发布者确认，状态 submitted → completed，求助/组队型此时释放冻结币给认领者
- [ ] `cancel`：教学型 48 小时内可取消，退款
- [ ] 状态流转校验：不允许非法跳转
- [ ] 完成时增加双方 exp，更新 user_stats

**验证：**
- [ ] Postman 走完整状态机
- [ ] 非法状态跳转返回 400
- [ ] 完成后双方 exp 增加，余额正确

**依赖：** Task 9, Task 11

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/TaskController.java`
- `backend/src/main/java/com/eggworld/service/TaskService.java`
- `backend/src/main/java/com/eggworld/service/PointService.java`

**规模：** Medium（2-3 文件）

---

## 检查点：任务闭环
- [ ] Postman 走通完整状态机
- [ ] 三种任务类型（teach/help/team）蛋蛋币方向正确

---

## 阶段 3：蛋蛋币流转 + 流水（P0）

## Task 11: 实现蛋蛋币事务化结算

**描述：** 抽象 `PointService`，提供 `freeze/spend/earn/refund` 方法，全部走事务 + 行锁，按文档 6.1 规则结算。

**验收标准：**
- [ ] `freeze(userId, amount, taskId, label)`：扣余额，写流水
- [ ] `spend(userId, amount, taskId, label)`：扣余额给对方
- [ ] `earn(userId, amount, taskId, label)`：加余额
- [ ] `refund(userId, amount, taskId, label)`：返还冻结
- [ ] 所有方法用 `@Transactional` + `SELECT ... FOR UPDATE`
- [ ] 余额不足抛业务异常

**验证：**
- [ ] 单元测试：并发 10 个线程同时扣同一用户，余额不错
- [ ] 流水记录完整可追溯

**依赖：** Task 6

**涉及文件：**
- `backend/src/main/java/com/eggworld/service/PointService.java`
- `backend/src/main/java/com/eggworld/mapper/PointLogMapper.java`
- `backend/src/main/java/com/eggworld/entity/PointLog.java`

**规模：** Small（2-3 文件）

---

## Task 12: 实现蛋蛋币流水查询接口

**描述：** 实现 `GET /api/users/:id/point-logs`，分页返回流水，支持按类型筛选。

**验收标准：**
- [ ] 接口 `GET /api/users/:id/point-logs?page=1&size=20&type=earn`
- [ ] 返回流水列表，含变动金额、变动后余额、描述、时间
- [ ] 只能查自己的流水（除非 admin）

**验证：**
- [ ] Postman 查询，结果正确
- [ ] 查别人流水返回 403

**依赖：** Task 11

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/UserController.java`
- `backend/src/main/java/com/eggworld/service/PointService.java`

**规模：** Small（1-2 文件）

---

## Task 13: 实现自动退回定时任务

**描述：** 用 `@Scheduled` 每小时扫描一次，处理求助/组队 3 天无人认领、教学型 48 小时取消、打听 30 天退回。

**验收标准：**
- [ ] `@Scheduled(fixedRate = 3600000)` 每小时执行
- [ ] 求助/组队任务 created_at + 3 天无认领者 → 状态 expired，退款
- [ ] 打听 created_at + 30 天无回答 → coin_status=refunded，退款
- [ ] 退款走 PointService.refund
- [ ] 日志记录每次扫描处理了多少条

**验证：**
- [ ] 手动改一条任务 created_at 为 4 天前，触发扫描后状态变 expired
- [ ] 用户余额恢复

**依赖：** Task 11

**涉及文件：**
- `backend/src/main/java/com/eggworld/job/RefundScheduler.java`
- `backend/src/main/java/com/eggworld/EggWorldApplication.java`（加 `@EnableScheduling`）

**规模：** Small（1-2 文件）

---

## 检查点：资金安全
- [ ] 并发模拟多次认领/发布，余额不错一分钱
- [ ] 自动退回定时任务生效

---

## 阶段 4：后台管理（P0）

## Task 14: 实现 admin 权限拦截

**描述：** 实现 `@AdminOnly` 注解 + AOP 拦截，admin 接口需 role=admin。

**验收标准：**
- [ ] 自定义注解 `@AdminOnly`
- [ ] AOP 切面拦截带此注解的方法，校验当前用户 role
- [ ] 非 admin 访问返回 403
- [ ] 在 controller 方法上加注解即可生效

**验证：**
- [ ] 普通学生访问 `/api/admin/**` 返回 403
- [ ] admin 访问成功

**依赖：** Task 5

**涉及文件：**
- `backend/src/main/java/com/eggworld/annotation/AdminOnly.java`
- `backend/src/main/java/com/eggworld/aspect/AdminAspect.java`

**规模：** Small（2 文件）

---

## Task 15: 实现任务审核接口

**描述：** 实现 `GET /api/admin/tasks/pending`、`POST /api/admin/tasks/:id/approve`、`/reject`。

**验收标准：**
- [ ] `pending` 列表分页返回待审核任务
- [ ] `approve`：状态 pending → approved
- [ ] `reject`：状态 pending → rejected，退款冻结币
- [ ] 全部加 `@AdminOnly`

**验证：**
- [ ] admin 能看到待审核列表
- [ ] 审核通过后学生端任务状态变 approved
- [ ] 驳回后冻结币退回

**依赖：** Task 14, Task 7

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/AdminController.java`
- `backend/src/main/java/com/eggworld/service/AdminService.java`

**规模：** Small（2 文件）

---

## Task 16: 实现用户管理 + 反馈工单接口

**描述：** 实现 `GET /api/admin/users`、`GET /api/admin/feedback`、`POST /api/admin/feedback/:id/reply`。

**验收标准：**
- [ ] 用户列表分页，支持按 nickname 搜索
- [ ] 工单列表分页
- [ ] 回复工单：status → replied，写 admin_reply
- [ ] 全部加 `@AdminOnly`

**验证：**
- [ ] admin 能查看用户列表
- [ ] 回复工单后用户端可见

**依赖：** Task 14

**涉及文件：**
- `backend/src/main/java/com/eggworld/controller/AdminController.java`
- `backend/src/main/java/com/eggworld/service/AdminService.java`

**规模：** Small（2 文件）

---

## 检查点：后台闭环
- [ ] 管理员能审核任务，学生端状态实时变化
- [ ] 管理员能回复工单

---

## 阶段 5：前端对接（与阶段 1~4 并行）

## Task 17: 前端封装 API 层

**描述：** 在 [growth-school.html](file:///d:/code/projects/all/backend-handoff-package/growth-school.html) 内联一段 fetch 封装，含 token 注入、统一错误处理、toast 提示。

**验收标准：**
- [ ] 提供 `api.get/post/put` 方法
- [ ] 自动从 localStorage 读取 token 注入 `Authorization` 头
- [ ] 401 自动跳转登录页
- [ ] 业务错误自动 toast 提示
- [ ] 不改动现有 UI 结构

**验证：**
- [ ] 浏览器控制台调用 `api.get('/api/health')` 返回 ok
- [ ] 无 token 时访问受保护接口自动跳登录

**依赖：** Task 1

**涉及文件：**
- `growth-school.html`（新增 `<script>` 块）

**规模：** Small（单文件，新增约 30 行）

---

## Task 18: 前端登录/注册改造

**描述：** 改造 `doStudentLogin()`（L5104 附近）和注册函数为 API 调用，登录后存 token，登出清 token。

**验收标准：**
- [ ] 登录调 `POST /api/auth/login`，成功后存 token 到 localStorage
- [ ] 注册调 `POST /api/auth/send-code` + `POST /api/auth/register`
- [ ] 登出清 localStorage
- [ ] 改造后页面行为与原版一致
- [ ] 函数改为 `async/await`

**验证：**
- [ ] 浏览器走通注册→登录→登出
- [ ] 刷新后 token 仍在，自动保持登录

**依赖：** Task 5, Task 17

**涉及文件：**
- `growth-school.html`（修改登录/注册相关函数）

**规模：** Medium（单文件，改动约 80 行）

---

## Task 19: 前端个人信息页改造

**描述：** 改造 `refreshProfile()` 等函数，从 `USER` 内存变量改为 `GET /api/users/me` 调用。

**验收标准：**
- [ ] 进入个人信息页调 `GET /api/users/me` 渲染
- [ ] 保存资料调 `PUT /api/users/me`
- [ ] 五维属性、角色解锁状态从 API 获取
- [ ] 改造后刷新页面数据不丢

**验证：**
- [ ] 浏览器改资料后刷新，数据保留
- [ ] 切换角色状态持久化

**依赖：** Task 6, Task 17

**涉及文件：**
- `growth-school.html`

**规模：** Medium（改动约 60 行）

---

## Task 20: 前端任务广场/发布/认领改造

**描述：** 改造任务广场渲染、发布表单、认领按钮为 API 调用。

**验收标准：**
- [ ] 任务广场调 `GET /api/tasks` 渲染
- [ ] 发布任务调 `POST /api/tasks`
- [ ] 认领/配对/提交/确认全部走 API
- [ ] 蛋蛋币余额实时从 API 刷新
- [ ] 改造后三个广场页（plaza/teamplaza/helpplaza）正常工作

**验证：**
- [ ] 浏览器走通：发布→广场可见→认领→配对→提交→确认
- [ ] 刷新后任务状态保留

**依赖：** Task 10, Task 17

**涉及文件：**
- `growth-school.html`

**规模：** Large（改动约 150 行，需拆分多次提交）

---

## Task 21: 前端"我的任务"与后台管理改造

**描述：** 改造"我的任务"页和管理后台为 API 调用。

**验收标准：**
- [ ] "我的任务"调 `GET /api/tasks/my-published` + `my-claimed`
- [ ] 管理后台调 `GET /api/admin/tasks/pending` + 审核
- [ ] 反馈工单调 `POST /api/feedback` 提交
- [ ] admin 回复工单

**验证：**
- [ ] 学生端"我的任务"页数据正确
- [ ] admin 端审核流程顺畅

**依赖：** Task 16, Task 17

**涉及文件：**
- `growth-school.html`

**规模：** Medium（改动约 100 行）

---

## 检查点：本地全流程
- [ ] 浏览器走通：注册→发任务→接任务→完成→看余额流水
- [ ] 刷新后数据不丢
- [ ] admin 后台正常工作

---

## 阶段 6：部署上线

## Task 22: 打包 jar + 部署到云服务器

**描述：** `mvn package` 打包，上传到云轻量服务器，用 systemd 守护进程。

**验收标准：**
- [ ] `mvn clean package -DskipTests` 生成可执行 jar
- [ ] 服务器装好 JDK 17 + MySQL 8
- [ ] jar 上传服务器，`nohup java -jar` 启动
- [ ] systemd 服务配置开机自启
- [ ] 服务器本地 `curl localhost:8080/api/health` 返回 ok

**验证：**
- [ ] 服务器进程存活
- [ ] 重启后服务自动拉起

**依赖：** 所有前序任务

**涉及文件：**
- `backend/eggworld-backend.service`（systemd 配置）

**规模：** Small

---

## Task 23: 配置 Nginx + HTTPS + 域名解析

**描述：** Nginx 反向代理后端 + 静态托管 `growth-school.html`，配置 SSL 证书，域名解析。

**验收标准：**
- [ ] Nginx 配置：前端静态文件 + `/api/` 反代后端 8080
- [ ] SSL 证书配置（阿里云/腾讯云免费证书）
- [ ] 域名解析到服务器 IP
- [ ] HTTP 自动跳 HTTPS
- [ ] 浏览器访问 `https://域名` 能打开页面

**验证：**
- [ ] 域名访问正常
- [ ] HTTPS 证书有效
- [ ] API 调用无跨域问题

**依赖：** Task 22（备案需提前办）

**涉及文件：**
- `backend/deploy/nginx.conf`

**规模：** Small

---

## Task 24: 角色图片上传 CDN + 替换前端路径

**描述：** 将 7 张角色图片上传 OSS/CDN，替换前端本地路径。（最终未走 CDN：图片现位于 `assets/`，随前端一起部署，见 [README.md](../README.md) 目录树）

**验收标准：**
- [ ] 7 张角色图片上传到 OSS
- [ ] `growth-school.html` 中所有 `src="char-eggy-*.jpg"` 替换为 CDN URL
- [ ] 页面加载图片正常显示
- [ ] 首屏加载速度提升

**验证：**
- [ ] 浏览器 Network 面板看图片从 CDN 加载
- [ ] 无 404 图片

**依赖：** Task 23

**涉及文件：**
- `growth-school.html`

**规模：** Small

---

## 检查点：上线
- [ ] 手机浏览器输入域名，全流程可用
- [ ] 数据持久化
- [ ] HTTPS 生效

---

## 执行说明

1. **严格按顺序执行：** 每个任务的依赖必须先完成
2. **每个任务完成后立即验证：** 不要积累多个任务再验证
3. **遇到检查点暂停：** 等用户确认后再进入下一阶段
4. **并行机会：** Task 17（前端 API 层）可与阶段 1~4 并行
5. **开放问题需先解决：** 域名、服务器、邮箱 SMTP 配置请提前确认
