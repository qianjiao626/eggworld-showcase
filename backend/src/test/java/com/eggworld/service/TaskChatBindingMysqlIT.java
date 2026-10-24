package com.eggworld.service;

import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.eggworld.common.BusinessException;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.config.AppProperties;
import com.eggworld.dto.ClaimDTO;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.dto.TaskChatBackfillVO;
import com.eggworld.job.DeadlineScheduler;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 本地实跑（opt-in）：任务绑定群聊的完整链 + 超期退款 + 开关回滚，跑在**真实 MySQL**上。
 *
 * 隔离做法（照抄 {@link TeamFundsMysqlIT} 的思路）：
 * 只允许本机 3306 开发库，且**只读它的 DDL** —— 克隆到临时库 {@value #TEMP_DATABASE} 后，
 * 全部写入都发生在临时库里，开发库 eggworld 的数据一行都不会动。
 *
 * 运行：
 * <pre>
 *   $env:EGGWORLD_LOCAL_MYSQL_IT='true'; cd backend; mvn -o test -Dtest=TaskChatBindingMysqlIT
 * </pre>
 */
@SpringJUnitConfig(TaskChatBindingMysqlIT.Config.class)
@EnabledIfEnvironmentVariable(named = "EGGWORLD_LOCAL_MYSQL_IT", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TaskChatBindingMysqlIT {

    /** 只接受本机 3306 开发库（与 application.yml 的本地默认一致：root/root） */
    static final String SAFE_URL = "jdbc:mysql://127.0.0.1:3306/?useSSL=false&allowPublicKeyRetrieval=true"
            + "&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai";
    /** 临时库固定名字：每次跑都先删再建，失败时保留现场供排查，也不会越跑越多 */
    static final String TEMP_DATABASE = "eggworld_verify_task_chat";

    static final long ADMIN = 1L;        // role=admin
    static final long PUBLISHER = 6L;    // 学生：任务发布者
    static final long CLAIMER = 9L;      // 学生：认领者
    static final long CLAIMER2 = 10L;    // 学生：第二个认领者（试空联系方式）

    static final int START_POINTS = 1000;

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement(proxyTargetClass = true)
    @MapperScan("com.eggworld.mapper")
    @Import({TaskService.class, ClaimService.class, PointService.class, ChatGroupService.class,
            ChatPermissionService.class, NotificationService.class, LegacyDataMigrationService.class,
            RatingService.class, DeadlineScheduler.class})
    static class Config {

        @Bean
        DataSource dataSource() throws Exception {
            DriverManagerDataSource ds = new DriverManagerDataSource(SAFE_URL, "root", "root");
            try (Connection c = ds.getConnection(); Statement s = c.createStatement()) {
                try (ResultSet r = s.executeQuery("SELECT @@port, @@datadir, @@version")) {
                    assertTrue(r.next());
                    assertEquals(3306, r.getInt(1), "只允许本机 3306");
                    String datadir = r.getString(2).replace('\\', '/').toLowerCase(Locale.ROOT);
                    assertTrue(datadir.contains("d:/env/mysql"), "只允许本机开发库，实际 datadir=" + datadir);
                    System.out.println("GUARD port=" + r.getInt(1) + " datadir=" + r.getString(2)
                            + " version=" + r.getString(3));
                }
                s.execute("DROP DATABASE IF EXISTS `" + TEMP_DATABASE + "`");
                s.execute("CREATE DATABASE `" + TEMP_DATABASE + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");

                // 从开发库克隆表结构（不复制数据），并断言源库确实有这次要用的表
                List<String> tables = new ArrayList<>();
                try (ResultSet r = s.executeQuery("SELECT table_name FROM information_schema.tables"
                        + " WHERE table_schema='eggworld' AND table_type='BASE TABLE' ORDER BY table_name")) {
                    while (r.next()) {
                        tables.add(r.getString(1));
                    }
                }
                assertTrue(tables.containsAll(List.of("tasks", "task_claims", "users", "point_logs",
                        "notifications", "chat_conversations", "chat_groups", "chat_group_members",
                        "chat_conversation_members")), "源库表清单不完整：" + tables);
                List<String> ddl = new ArrayList<>();
                for (String table : tables) {
                    if (!table.matches("[a-z_]+")) throw new IllegalStateException("不安全的表名：" + table);
                    try (ResultSet r = s.executeQuery("SHOW CREATE TABLE eggworld.`" + table + "`")) {
                        assertTrue(r.next());
                        ddl.add(r.getString(2).replace("`eggworld`.", "`" + TEMP_DATABASE + "`."));
                    }
                }
                c.setCatalog(TEMP_DATABASE);
                try (Statement clone = c.createStatement()) {
                    clone.execute("SET SESSION FOREIGN_KEY_CHECKS=0");
                    try {
                        for (String sql : ddl) clone.execute(sql);
                    } finally {
                        clone.execute("SET SESSION FOREIGN_KEY_CHECKS=1");
                    }
                }
                System.out.println("TEMP_DATABASE=" + TEMP_DATABASE + " tables=" + tables.size() + " DDL_ONLY");
            }
            ds.setUrl(SAFE_URL.replace("3306/?", "3306/" + TEMP_DATABASE + "?"));
            return ds;
        }

        @Bean
        PlatformTransactionManager transactionManager(DataSource ds) {
            return new DataSourceTransactionManager(ds);
        }

        @Bean
        JdbcTemplate jdbc(DataSource ds) {
            return new JdbcTemplate(ds);
        }

        /** 开关对象：测试里直接改它的值来切新老流程（服务每次调用时读取，所以运行时改也生效） */
        @Bean
        AppProperties appProperties() {
            return new AppProperties();
        }

        /** 邀请奖励与本次链路无关，替换成替身；资金/通知/聊天全部用真实实现 */
        @Bean
        InviteService inviteService() {
            return mock(InviteService.class);
        }

        @Bean
        SqlSessionFactory sqlSessionFactory(DataSource ds) throws Exception {
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(ds);
            com.baomidou.mybatisplus.core.MybatisConfiguration c = new com.baomidou.mybatisplus.core.MybatisConfiguration();
            c.setMapUnderscoreToCamelCase(true);
            factory.setConfiguration(c);
            return factory.getObject();
        }
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired TaskService taskService;
    @Autowired ClaimService claimService;
    @Autowired RatingService ratingService;
    @Autowired LegacyDataMigrationService backfillService;
    @Autowired DeadlineScheduler scheduler;
    @Autowired AppProperties props;

    @BeforeAll
    void seedUsers() {
        // 直接复用开发库里真实用户行（结构完全一致），再把余额抹平，避免测试之间互相影响
        jdbc.update("INSERT INTO users SELECT * FROM eggworld.users WHERE id IN (?,?,?,?)",
                ADMIN, PUBLISHER, CLAIMER, CLAIMER2);
        assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
    }

    @BeforeEach
    void resetState() {
        jdbc.update("UPDATE users SET points = ?", START_POINTS);
        UserContext.clear();
        props.getFeatures().setTaskAutoGroup(true);
    }

    @AfterEach
    void clearActor() {
        UserContext.clear();
        props.getFeatures().setTaskAutoGroup(true);
    }

    // ==================== ① 教学：审核建群 → 认领即入队 → 提交确认 → 群归档 ====================

    @Test
    void teachFlowCreatesGroupJoinsClaimerAndArchives() {
        UserContext.set(new LoginUser(PUBLISHER, "student", "发布者"));
        Long taskId = publish("teach", "教高数", PUBLISHER, 1, "wx-publisher");
        assertEquals("pending", taskStatus(taskId), "学生发布 → 待审核");

        approve(taskId);
        Long convId = conversationId(taskId);
        assertNotNull(convId, "审核通过应自动建群并把会话 ID 回写");
        assertEquals("active", jdbc.queryForObject(
                "SELECT status FROM chat_conversations WHERE id=?", String.class, convId));
        assertEquals(PUBLISHER, jdbc.queryForObject(
                "SELECT owner_id FROM chat_conversations WHERE id=?", Long.class, convId), "群主 = 发布者");
        assertTrue(isGroupMember(convId, PUBLISHER), "发布者建群时即为群主成员");
        System.out.println("EVIDENCE 教学建群 conversation_id=" + convId);

        // 认领即入队
        claimService.claim(CLAIMER, taskId, claimDto("wx-claimer"));
        assertEquals("in_progress", claimStatus(taskId, CLAIMER));
        assertEquals(1, jdbc.queryForObject("SELECT selected FROM task_claims WHERE task_id=? AND claimer_id=?",
                Integer.class, taskId, CLAIMER));
        assertTrue(isGroupMember(convId, CLAIMER), "认领当场入群，无需发布者配对");
        assertEquals("full", taskStatus(taskId), "single 任务第 1 人认领即满员，报名关闭");
        System.out.println("EVIDENCE 教学认领：claims=in_progress/selected=1，已在任务群");

        // 提交 → 逐个确认 → 完成 → 归档只读
        claimService.submit(CLAIMER, taskId);
        claimService.confirmMember(PUBLISHER, taskId, CLAIMER);
        assertEquals("completed", taskStatus(taskId));
        assertEquals(1, jdbc.queryForObject("SELECT read_only FROM chat_conversations WHERE id=?",
                Integer.class, convId), "任务完成 → 群转只读归档");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM point_logs WHERE task_id=? AND user_id=?"
                        + " AND type='spend' AND delta=-10", Integer.class, taskId, CLAIMER), "教学提交时付款");
        System.out.println("EVIDENCE 教学完成：task=completed，群 read_only=1");
    }

    // ==================== ② 组队：认领即冻 10 币 + 🔴 90 天兜底两边都退 ====================

    @Test
    void teamClaimFreezesDepositAndExpiryRefundsBothSides() {
        UserContext.set(new LoginUser(PUBLISHER, "student", "发布者"));
        Long taskId = publish("team", "组队刷题", PUBLISHER, 2, "wx-publisher");
        approve(taskId);
        Long convId = conversationId(taskId);
        assertNotNull(convId);
        assertEquals(START_POINTS - 10, pointsOf(PUBLISHER), "发布组队任务时冻 10 币");

        claimService.claim(CLAIMER, taskId, claimDto("wx-claimer"));
        assertEquals(START_POINTS - 10, pointsOf(CLAIMER), "认领即入队 → 出资在认领时就冻");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM point_logs WHERE task_id=? AND user_id=?"
                + " AND type='freeze' AND delta=-10", Integer.class, taskId, CLAIMER));
        assertTrue(isGroupMember(convId, CLAIMER));
        assertEquals("approved", taskStatus(taskId), "只招到 1 人（上限 2）→ 继续招募，未满员");
        System.out.println("EVIDENCE 组队认领：双方各冻 10，任务仍 approved");

        // 造 90 天兜底：created_at / updated_at 都推到 91 天前（updated_at 是兜底时钟的锚）
        LocalDateTime old = LocalDateTime.now().minusDays(91);
        jdbc.update("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?",
                Timestamp.valueOf(old), Timestamp.valueOf(old), taskId);
        scheduler.scanSignupDeadlines();

        assertEquals("expired", taskStatus(taskId), "超兜底 → 下架");
        assertEquals(START_POINTS, pointsOf(PUBLISHER), "🔴 发布者出资退回");
        assertEquals(START_POINTS, pointsOf(CLAIMER), "🔴 已入队搭子的出资也要退回（旧版这里不退，等于吞钱）");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM point_logs WHERE task_id=? AND user_id=?"
                + " AND type='refund' AND delta=10", Integer.class, taskId, CLAIMER));
        System.out.println("EVIDENCE 超期退款：发布者=" + pointsOf(PUBLISHER) + " 搭子=" + pointsOf(CLAIMER)
                + "（均回到 " + START_POINTS + "）；搭子认领状态=" + claimStatus(taskId, CLAIMER));
    }

    // ==================== ③ 开关关闭：回到旧流程 + 联系方式必填 ====================

    @Test
    void toggleOffFallsBackToOldFlowAndRequiresContact() {
        // 四个用例共用一个临时库，所以这里用「建群数量快照」来判断开关期间有没有新增群，避免与其它用例互相干扰
        int groupsBefore = groupCount();
        props.getFeatures().setTaskAutoGroup(false);

        UserContext.set(new LoginUser(ADMIN, "admin", "管理员"));
        Long taskId = publish("teach", "回滚后的教学任务", PUBLISHER, 1, "wx-publisher");
        assertEquals("approved", taskStatus(taskId), "管理员发布直接上线");
        assertNull(conversationId(taskId), "开关关闭 → 不建群");

        claimService.claim(CLAIMER, taskId, claimDto("wx-claimer"));
        assertEquals("pending_pairing", claimStatus(taskId, CLAIMER), "开关关闭 → 报名进候选池");
        assertEquals(0, jdbc.queryForObject("SELECT selected FROM task_claims WHERE task_id=? AND claimer_id=?",
                Integer.class, taskId, CLAIMER));
        assertEquals(groupsBefore, groupCount(), "开关关闭期间不产生任何任务群");

        BusinessException claimErr = assertThrows(BusinessException.class,
                () -> claimService.claim(CLAIMER2, taskId, new ClaimDTO()), "空联系方式应被拒");
        assertTrue(claimErr.getMessage().contains("请填写联系方式"), claimErr.getMessage());

        BusinessException publishErr = assertThrows(BusinessException.class,
                () -> publish("team", "空联系方式的组队", PUBLISHER, 2, null), "发布侧同样必填");
        assertTrue(publishErr.getMessage().contains("请填写联系方式"), publishErr.getMessage());
        System.out.println("EVIDENCE 开关关闭：不建群、落候选池、空联系方式被拒（认领与发布两侧）");
    }

    // ==================== ④ 存量补群：给历史任务补群并拉老成员，且幂等 ====================

    @Test
    void backfillCreatesGroupForLegacyTaskAndIsIdempotent() {
        // 先用关掉的开关造一条「改版前那样、没有群」的任务 + 一条历史已入队的报名
        props.getFeatures().setTaskAutoGroup(false);
        UserContext.set(new LoginUser(ADMIN, "admin", "管理员"));
        Long taskId = publish("teach", "存量历史任务", PUBLISHER, 1, "wx-publisher");
        assertNull(conversationId(taskId));
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO task_claims (task_id, claimer_id, status, selected, claimer_contact,"
                        + " paired_at, created_at) VALUES (?,?,?,?,?,?,?)",
                taskId, CLAIMER, "in_progress", 1, "wx-claimer",
                Timestamp.valueOf(now), Timestamp.valueOf(now));

        // 打开开关，跑一次补群
        props.getFeatures().setTaskAutoGroup(true);
        TaskChatBackfillVO vo = backfillService.backfillTaskChatGroups();
        assertTrue(vo.getCreated() >= 1, "至少为这条历史任务补出群，实际 created=" + vo.getCreated());
        assertTrue(vo.getFailed() == 0, "不应有失败：" + vo.getFailures());
        Long convId = conversationId(taskId);
        assertNotNull(convId, "历史任务被补上了任务群");
        assertTrue(isGroupMember(convId, PUBLISHER), "发布者成为群主成员");
        assertTrue(isGroupMember(convId, CLAIMER), "历史已入队的搭子被拉进群");
        System.out.println("EVIDENCE 补群：created=" + vo.getCreated() + " joined=" + vo.getJoined()
                + " conversation_id=" + convId);

        // 幂等：再跑一次不再建群
        TaskChatBackfillVO again = backfillService.backfillTaskChatGroups();
        assertEquals(0, again.getCreated(), "已建群的任务不再重复建群");
        assertEquals(convId, conversationId(taskId));
        System.out.println("EVIDENCE 补群幂等：第二次 created=0");
    }

    // ==================== ⑤ 修复验证：超期后「重新发布」不会再凭空发币 ====================

    /**
     * 修复前实测：组队 90 天兜底退回双方各 10 币，但搭子的认领仍留在 in_progress/selected=1，
     * 发布者「重新发布」后搭子照样提交、确认，3 天互评期满再退 8 币 → 只冻 10 却拿回 18（凭空发币）。
     *
     * 修复：`expireTeam` 退币时把仍在参与中的认领一并收尾（cancelled + 通知）；
     * 队伍既然没成行，就不该再有「提交 → 完成 → 再退一次」的路径。
     */
    @Test
    void teamExpiryClosesMemberClaimsSoRenewCannotDoubleRefund() {
        UserContext.set(new LoginUser(PUBLISHER, "student", "发布者"));
        Long taskId = publish("team", "超期后重新发布", PUBLISHER, 2, "wx-publisher");
        approve(taskId);
        claimService.claim(CLAIMER, taskId, claimDto("wx-claimer"));
        assertEquals(START_POINTS - 10, pointsOf(CLAIMER));

        LocalDateTime old = LocalDateTime.now().minusDays(91);
        jdbc.update("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?",
                Timestamp.valueOf(old), Timestamp.valueOf(old), taskId);
        scheduler.scanSignupDeadlines();
        assertEquals("expired", taskStatus(taskId));
        assertEquals(START_POINTS, pointsOf(CLAIMER), "超期时已退回搭子 10 币");
        assertEquals("cancelled", claimStatus(taskId, CLAIMER), "队伍没成行 → 认领一并收尾");

        UserContext.set(new LoginUser(PUBLISHER, "student", "发布者"));
        taskService.renewTask(PUBLISHER, taskId, 30);
        assertEquals("approved", taskStatus(taskId), "重新发布仍允许（发布者继续招募）");

        BusinessException blocked = assertThrows(BusinessException.class,
                () -> claimService.submit(CLAIMER, taskId), "认领已收尾 → 提交被拒，结算路径断掉");
        assertTrue(blocked.getMessage().contains("无法提交"), blocked.getMessage());
        assertEquals(START_POINTS, pointsOf(CLAIMER), "结算没发生 → 不会再退 8 币");
        System.out.println("EVIDENCE 修复验证：超期后认领=" + claimStatus(taskId, CLAIMER)
                + "，重新发布后提交被拒，搭子余额=" + pointsOf(CLAIMER));
    }

    /**
     * 第二道闸：就算上一轮的 cancelled/selected=1 记录还在，结算也只退给「仍在参与中」的成员。
     * 这里让任务重新发布后换一个新搭子完成，老搭子不该拿到 8 币。
     */
    @Test
    void settleTaskSkipsTheClosedClaimFromTheEarlierRound() {
        UserContext.set(new LoginUser(PUBLISHER, "student", "发布者"));
        Long taskId = publish("team", "重新发布后换人完成", PUBLISHER, 2, "wx-publisher");
        approve(taskId);
        claimService.claim(CLAIMER, taskId, claimDto("wx-claimer"));

        LocalDateTime old = LocalDateTime.now().minusDays(91);
        jdbc.update("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?",
                Timestamp.valueOf(old), Timestamp.valueOf(old), taskId);
        scheduler.scanSignupDeadlines();
        assertEquals("cancelled", claimStatus(taskId, CLAIMER));
        assertEquals(START_POINTS, pointsOf(CLAIMER), "老搭子已退回 10");

        taskService.renewTask(PUBLISHER, taskId, 30);
        claimService.claim(CLAIMER2, taskId, claimDto("wx-claimer2"));
        assertEquals(START_POINTS - 10, pointsOf(CLAIMER2), "新搭子认领即冻 10");
        claimService.submit(CLAIMER2, taskId);
        claimService.confirm(PUBLISHER, taskId);
        assertEquals("completed", taskStatus(taskId));
        ratingService.settleTask(taskId);       // 相当于 3 天互评期满的定时任务

        assertEquals(START_POINTS, pointsOf(CLAIMER), "老记录（cancelled）不该被结算");
        assertEquals(START_POINTS - 2, pointsOf(CLAIMER2), "新搭子照常退 80%（-10+8）");
        assertEquals(START_POINTS - 2, pointsOf(PUBLISHER), "发布者同样退 80%");
        System.out.println("EVIDENCE 结算过滤：老搭子=" + pointsOf(CLAIMER) + " 新搭子=" + pointsOf(CLAIMER2)
                + " 发布者=" + pointsOf(PUBLISHER));
    }

    // ==================== ⑦ 团队提交即收尾：报名关闭，新人认领被拒 ====================

    @Test
    void teamSubmitClosesRecruitmentAndBlocksNewClaims() {
        UserContext.set(new LoginUser(PUBLISHER, "student", "发布者"));
        Long taskId = publish("team", "提交即收尾", PUBLISHER, 3, "wx-publisher");
        approve(taskId);
        claimService.claim(CLAIMER, taskId, claimDto("wx-claimer"));
        assertEquals("approved", taskStatus(taskId), "只招到 1/3 → 仍在招募");
        claimService.claim(CLAIMER2, taskId, claimDto("wx-claimer2"));   // 提交前可以进来
        assertEquals("approved", taskStatus(taskId));

        claimService.submit(CLAIMER, taskId);       // 团队整体提交
        assertEquals("full", taskStatus(taskId), "提交即关掉报名");

        BusinessException blocked = assertThrows(BusinessException.class,
                () -> claimService.claim(CLAIMER, taskId, claimDto("wx-claimer")),
                "提交后不能再认领");
        assertTrue(blocked.getMessage().contains("满员") || blocked.getMessage().contains("不可认领"),
                blocked.getMessage());
        System.out.println("EVIDENCE 提交即收尾：task=" + taskStatus(taskId)
                + "，两个搭子提交状态=" + claimStatus(taskId, CLAIMER) + "/" + claimStatus(taskId, CLAIMER2));
    }

    // ==================== 工具 ====================

    private Long publish(String type, String title, long publisherId, Integer maxClaimers, String contact) {
        PublishTaskDTO dto = new PublishTaskDTO();
        dto.setTitle(title);
        dto.setDescription("本地实跑（临时库 " + TEMP_DATABASE + "）");
        dto.setTaskType(type);
        dto.setSkillCategory("study");
        dto.setReward(10);
        dto.setClaimMode(maxClaimers != null && maxClaimers > 1 ? "multiple" : "single");
        dto.setMaxClaimers(maxClaimers);
        dto.setContact(contact);
        return taskService.publish(publisherId, dto);
    }

    private void approve(Long taskId) {
        UserContext.set(new LoginUser(ADMIN, "admin", "管理员"));
        taskService.approve(taskId);
    }

    private static ClaimDTO claimDto(String contact) {
        ClaimDTO dto = new ClaimDTO();
        dto.setContact(contact);
        return dto;
    }

    private String taskStatus(Long taskId) {
        return jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, taskId);
    }

    private Long conversationId(Long taskId) {
        return jdbc.queryForObject("SELECT conversation_id FROM tasks WHERE id = ?", Long.class, taskId);
    }

    private String claimStatus(Long taskId, long userId) {
        return jdbc.queryForObject("SELECT status FROM task_claims WHERE task_id = ? AND claimer_id = ?",
                String.class, taskId, userId);
    }

    private int pointsOf(long userId) {
        return jdbc.queryForObject("SELECT points FROM users WHERE id = ?", Integer.class, userId);
    }

    /** 临时库里已建的群数量（任务群 + 用户自建群），用于判断「开关关闭期间有没有新增群」 */
    private int groupCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversations WHERE type = 'group'", Integer.class);
    }

    private boolean isGroupMember(Long conversationId, long userId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM chat_group_members m"
                + " JOIN chat_groups g ON g.id = m.group_id"
                + " WHERE g.conversation_id = ? AND m.user_id = ? AND m.status = 'active'",
                Integer.class, conversationId, userId);
        return n != null && n > 0;
    }
}
