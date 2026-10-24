package com.eggworld.service;

import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.*;
import com.eggworld.entity.*;
import com.eggworld.job.RateSettleScheduler;
import com.eggworld.job.RefundScheduler;
import com.eggworld.mapper.*;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.RowBounds;
import org.apache.ibatis.session.ResultHandler;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.io.Reader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Opt-in real MySQL IT. Explicit -Dtest=TeamFundsMysqlIT; never loads application*.yml.
 * Each context creates a fresh random database, copies DDL only, and retains evidence.
 * No test-level transaction: assertions use separate connections to inspect committed data.
 */
@SpringJUnitConfig(TeamFundsMysqlIT.Config.class)
@EnabledIfEnvironmentVariable(named = "TEAM_SECURITY_MYSQL_IT", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@org.junit.jupiter.api.parallel.Execution(org.junit.jupiter.api.parallel.ExecutionMode.SAME_THREAD)
class TeamFundsMysqlIT {
    static final Path EXTERNAL = Path.of("D:/CodexData/local/eggworld/team-security-test");
    static final String SAFE_URL = "jdbc:mysql://127.0.0.1:3307/?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8&serverTimezone=Asia/Tokyo";
    static String database;

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement(proxyTargetClass = true)
    @MapperScan("com.eggworld.mapper")
    @Import({TaskService.class, ClaimService.class, RatingService.class, PointService.class, GossipService.class})
    static class Config {
        @Bean DataSource dataSource() throws Exception {
            Properties p = new Properties();
            try (Reader r = Files.newBufferedReader(EXTERNAL.resolve("mysql.properties"), StandardCharsets.UTF_8)) { p.load(r); }
            // Validate BEFORE opening any connection; arbitrary environment/profile URLs are not accepted.
            if (!SAFE_URL.equals(p.getProperty("url"))) throw new IllegalStateException("Only isolated loopback MySQL is permitted");
            DriverManagerDataSource ds = new DriverManagerDataSource(SAFE_URL, p.getProperty("user"), p.getProperty("password"));
            try (Connection c = ds.getConnection(); Statement s = c.createStatement()) {
                try (ResultSet r = s.executeQuery("SELECT @@port, @@datadir, @@version")) {
                    assertTrue(r.next()); assertEquals(3307, r.getInt(1));
                    assertEquals("d:/codexdata/local/eggworld/mysql-data/", r.getString(2).replace('\\', '/').toLowerCase(Locale.ROOT));
                    System.out.println("MYSQL_GUARD port=3307 datadir=" + r.getString(2) + " version=" + r.getString(3));
                }
                database = "eggworld_team_security_" + UUID.randomUUID().toString().replace("-", "");
                String source = System.getenv().getOrDefault("TEAM_SECURITY_DDL_SCHEMA", "eggworld");
                if (!source.matches("eggworld(?:_preview|_team_security_[a-f0-9]{32})?")) throw new IllegalStateException("Unsafe fixture schema");
                List<String> ddl = new ArrayList<>();
                List<String> tables = new ArrayList<>();
                try (ResultSet r = s.executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema='" + source + "' AND table_type='BASE TABLE' ORDER BY table_name")) {
                    while (r.next()) tables.add(r.getString(1));
                }
                assertTrue(tables.containsAll(List.of("tasks", "users", "point_logs", "task_claims", "ratings", "notifications")));
                for (String table : tables) {
                    if (!table.matches("[a-z_]+")) throw new IllegalStateException("Unsafe table identifier");
                    try (ResultSet r = s.executeQuery("SHOW CREATE TABLE `" + source + "`.`" + table + "`")) {
                        assertTrue(r.next());
                        String sql = r.getString(2);
                        // A qualified FK must never point back to the source schema.
                        sql = sql.replace("`" + source + "`.", "`" + database + "`.");
                        ddl.add(sql);
                    }
                }
                s.execute("CREATE DATABASE `" + database + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
                // Statements capture the catalog at creation; create the DDL statement AFTER selecting the new database.
                c.setCatalog(database);
                try (Statement clone = c.createStatement()) {
                clone.execute("SET SESSION FOREIGN_KEY_CHECKS=0");
                try { for (String sql : ddl) clone.execute(sql); }
                finally { clone.execute("SET SESSION FOREIGN_KEY_CHECKS=1"); }
                for (String table : tables) {
                    try (ResultSet r = clone.executeQuery("SELECT COUNT(*) FROM `" + table + "`")) { r.next(); assertEquals(0, r.getLong(1)); }
                }
                }
                // 旧隔离样板可能早于任务群版本；只在本次新建的空库应用仓库幂等迁移。
                assertEquals(database, c.getCatalog());
                for (String file : List.of("migrate-task-conversation.sql", "migrate-task-featured.sql")) {
                    String migration = Files.readString(Path.of("sql", file), StandardCharsets.UTF_8);
                    assertFalse(java.util.regex.Pattern.compile("(?im)^\\s*(?:USE|DROP|TRUNCATE|CREATE DATABASE)\\s+").matcher(migration).find());
                    org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(c,
                        new org.springframework.core.io.support.EncodedResource(new org.springframework.core.io.ByteArrayResource(migration.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8));
                }
                System.out.println("MYSQL_NEW_DATABASE=" + database + " empty_tables=" + tables.size() + " DDL_ONLY_WITH_FOREIGN_KEYS");
                Files.writeString(EXTERNAL.resolve("last-database.txt"), database + System.lineSeparator());
            }
            ds.setUrl(SAFE_URL.replace("3307/?", "3307/" + database + "?"));
            return ds;
        }
        @Bean PlatformTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean ReadRaceGate gate() { return new ReadRaceGate(); }
        @Bean SqlSessionFactory sqlSessionFactory(DataSource ds, ReadRaceGate gate) throws Exception {
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(ds); factory.setPlugins(gate);
            com.baomidou.mybatisplus.core.MybatisConfiguration c = new com.baomidou.mybatisplus.core.MybatisConfiguration();
            c.setMapUnderscoreToCamelCase(true); factory.setConfiguration(c);
            return factory.getObject();
        }
        // Invitation rewards are outside these workflows; all money/notification mappers remain real.
        @Bean InviteService inviteService() { return mock(InviteService.class); }
        // 本套资金用例显式覆盖旧的「发布者配对」兼容路径；自动入群路径由任务群专项另测。
        @Bean com.eggworld.config.AppProperties appProperties() {
            var p = new com.eggworld.config.AppProperties(); p.getFeatures().setTaskAutoGroup(false); return p;
        }
        @Bean ChatGroupService chatGroupService() { return mock(ChatGroupService.class); }
        @Bean FaultNotices notificationService(NotificationMapper n, UserMapper u) { return new FaultNotices(n, u); }
    }

    static class FaultNotices extends NotificationService {
        final AtomicInteger remaining = new AtomicInteger(-1);
        FaultNotices(NotificationMapper n, UserMapper u) { super(n, u); }
        public void failAfter(int count) { remaining.set(count); }
        @Override public void notify(Long userId, String text, String type) {
            super.notify(userId, text, type); // Exercise the real INSERT before throwing.
            if ("settle".equals(type) && remaining.decrementAndGet() == 0) {
                assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
                throw new IllegalStateException("injected-after-real-notification-insert");
            }
        }
    }

    /** Both actual SELECTs complete before either conditional UPDATE can run. */
    @Intercepts(@Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}))
    static class ReadRaceGate implements Interceptor {
        final ThreadLocal<CyclicBarrier> barrier = new ThreadLocal<>();
        final ThreadLocal<String> statement = new ThreadLocal<>();
        final Set<Long> connections = ConcurrentHashMap.newKeySet();
        @Override public Object intercept(Invocation i) throws Throwable {
            Object result = i.proceed();
            CyclicBarrier b = barrier.get();
            if (b != null && ((MappedStatement) i.getArgs()[0]).getId().equals(statement.get())) {
                barrier.remove();
                if (statement.get().endsWith("GossipLikeMapper.selectCount")) {
                    assertEquals(0L, ((Number) ((List<?>) result).get(0)).longValue(), "All contenders must observe no existing like before INSERT" );
                }
                assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
                Connection c = ((Executor) i.getTarget()).getTransaction().getConnection();
                assertFalse(c.getAutoCommit());
                try (Statement s = c.createStatement(); ResultSet r = s.executeQuery("SELECT CONNECTION_ID()")) { r.next(); connections.add(r.getLong(1)); }
                b.await(15, TimeUnit.SECONDS);
            }
            return result;
        }
    }

    @Autowired TaskService tasks;
    @Autowired ClaimService claims;
    @Autowired RatingService ratings;
    @Autowired PointService points;
    @Autowired GossipService gossip;
    @Autowired GossipPostMapper postMapper;
    @Autowired GossipAnswerMapper answerMapper;
    @Autowired TaskMapper taskMapper;
    @Autowired TaskClaimMapper claimMapper;
    @Autowired UserMapper userMapper;
    @Autowired FaultNotices notices;
    @Autowired ReadRaceGate gate;
    @Autowired JdbcTemplate jdbc;
    @Autowired ApplicationContext context;

    @BeforeAll void verifyRealContext() {
        for (Object bean : List.of(tasks, claims, ratings, points, gossip)) assertTrue(AopUtils.isAopProxy(bean));
        assertFalse(org.mockito.Mockito.mockingDetails(taskMapper).isMock());
        assertFalse(org.mockito.Mockito.mockingDetails(points).isMock());
        assertFalse(context.containsBean("dataInitializer"));
        assertFalse(context.containsBean("org.springframework.context.annotation.internalScheduledAnnotationProcessor"));
        assertEquals(0, number("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=? AND engine <> 'InnoDB'", database));
        assertEquals(0, number("SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=? AND referenced_table_schema IS NOT NULL AND referenced_table_schema<>?", database, database));
        System.out.println("CONTEXT real_transaction_proxies=5 real_mappers=true scheduling=false initializer=false");
    }
    @AfterEach void clearFault() { notices.failAfter(-1); }

    long user() {
        String name = "it_" + UUID.randomUUID().toString().replace("-", "");
        User u = new User(); u.setNickname(name); u.setEmail(name + "@example.invalid");
        u.setPasswordHash("not-a-login-credential"); u.setPoints(100); u.setExp(0); u.setReputation(new BigDecimal("5.0"));
        userMapper.insert(u); return u.getId();
    }
    long publish(long publisher, String type, int reward) {
        PublishTaskDTO d = new PublishTaskDTO(); d.setTitle("mysql-it-" + type); d.setTaskType(type);
        d.setReward(reward); d.setClaimMode(type.equals("team") ? "multiple" : "single"); d.setMaxClaimers(3); d.setSkillCategory("study"); d.setContact("test-only");
        return tasks.publish(publisher, d);
    }
    ClaimDTO contactClaim() { ClaimDTO dto = new ClaimDTO(); dto.setContact("fixture-only@example.invalid"); return dto; }
    void pair(long a, long task, Long... members) {
        tasks.approve(task);
        for (long member : members) claims.claim(member, task, contactClaim());
        PairDTO dto = new PairDTO(); dto.setClaimerIds(List.of(members)); claims.pair(a, task, dto);
        Task paired = taskMapper.selectById(task);
        // 教学/求助/组队同一套招募节奏：未满员时任务继续留在广场招募（approved），满员才结束认领（full）
        int cap = "single".equals(paired.getClaimMode()) ? 1 : paired.getMaxClaimers();
        assertEquals(members.length >= cap ? "full" : "approved", paired.getStatus());
    }
    long completedTeam(long a, long b) {
        long id = publish(a, "team", 9999);
        assertEquals(10, taskMapper.selectById(id).getReward()); assertBalance(a, 90);
        pair(a, id, b); assertBalance(b, 90);
        claims.submit(b, id); assertEquals("submitted", claimStatus(id, b));
        LocalDateTime before = LocalDateTime.now(); claims.confirm(a, id);
        Task t = taskMapper.selectById(id); assertEquals("completed", t.getStatus());
        assertEquals("completed", claimStatus(id, b)); assertEquals(0, t.getSettled());
        assertTrue(t.getRateDeadline().isAfter(before.plusDays(3).minusSeconds(2)));
        assertTrue(t.getRateDeadline().isBefore(LocalDateTime.now().plusDays(3).plusSeconds(2)));
        assertBalance(a, 90); assertBalance(b, 90); return id;
    }
    String claimStatus(long id, long member) { return jdbc.queryForObject("SELECT status FROM task_claims WHERE task_id=? AND claimer_id=?", String.class, id, member); }
    int number(String sql, Object... args) { return Objects.requireNonNull(jdbc.queryForObject(sql, Integer.class, args)); }
    void assertBalance(long id, int expected) { assertEquals(expected, number("SELECT points FROM users WHERE id=?", id)); }
    void log(long task, long user, String type, int delta, int balance) {
        assertEquals(1, number("SELECT COUNT(*) FROM point_logs WHERE task_id=? AND user_id=? AND type=? AND delta=? AND balance=?", task, user, type, delta, balance));
    }
    int refundCount(long id) { return number("SELECT COUNT(*) FROM point_logs WHERE task_id=? AND type='refund'", id); }
    void rate(long a, long b, long id, int score) { RateTaskDTO d = new RateTaskDTO(); d.setRateeId(b); d.setScore(score); ratings.rate(a, id, d); }
    void expireRating(long id) { jdbc.update("UPDATE tasks SET rate_deadline=? WHERE id=?", LocalDateTime.now().minusSeconds(5), id); }
    void scanRatings() { new RateSettleScheduler(taskMapper, ratings).scanExpiredRatings(); }

    List<Throwable> race(Runnable first, Runnable second) throws Exception {
        return race("com.eggworld.mapper.TaskMapper.selectById", List.of(first, second));
    }
    List<Throwable> race(String statement, List<Runnable> actions) throws Exception {
        CyclicBarrier barrier = new CyclicBarrier(actions.size()); gate.connections.clear();
        ExecutorService pool = Executors.newFixedThreadPool(actions.size());
        try {
            List<Future<Throwable>> futures = new ArrayList<>();
            for (Runnable action : actions) futures.add(pool.submit(() -> {
                gate.barrier.set(barrier); gate.statement.set(statement);
                try { action.run(); return null; } catch (Throwable e) { return e; } finally { gate.barrier.remove(); gate.statement.remove(); }
            }));
            List<Throwable> errors = new ArrayList<>();
            for (Future<Throwable> f : futures) { Throwable t = f.get(30, TimeUnit.SECONDS); if (t != null) errors.add(t); }
            assertEquals(actions.size(), gate.connections.size(), "Every contender must have its own real MySQL connection");
            System.out.println("RACE independent_connections=" + gate.connections + " rejected_calls=" + errors.size());
            return errors;
        } finally { pool.shutdownNow(); assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS)); }
    }
    void oneBusinessRejection(List<Throwable> errors) { assertEquals(1, errors.size(), errors.toString()); assertInstanceOf(BusinessException.class, errors.get(0)); }

    @ParameterizedTest @ValueSource(ints = {0, 5, 1})
    void teamWorkflowRefundIndependentOfRatingAndDeadline(int score) {
        long a = user(), b = user(), id = completedTeam(a, b);
        assertEquals(false, ratings.listRateTargets(a, id).get(0).get("ratedByMe"));
        if (score > 0) {
            rate(a, b, id, score); rate(b, a, id, score);
            assertEquals(true, ratings.listRateTargets(a, id).get(0).get("ratedByMe"));
            assertThrows(BusinessException.class, () -> rate(a, b, id, score));
            for (long u : List.of(a, b)) {
                assertEquals(0, new BigDecimal(score).compareTo(userMapper.selectById(u).getReputation()));
                assertEquals(score, number("SELECT reputation FROM user_stats WHERE user_id=?", u));
            }
        }
        scanRatings(); assertEquals(0, refundCount(id)); assertEquals(0, taskMapper.selectById(id).getSettled());
        expireRating(id);
        assertThrows(BusinessException.class, () -> rate(a, b, id, 3));
        scanRatings(); ratings.settleTask(id); scanRatings();
        assertEquals(1, taskMapper.selectById(id).getSettled()); assertEquals(2, refundCount(id));
        assertBalance(a, 98); assertBalance(b, 98);
        log(id, a, "freeze", -10, 90); log(id, b, "freeze", -10, 90);
        log(id, a, "refund", 8, 98); log(id, b, "refund", 8, 98);
        assertEquals(score == 0 ? 0 : 2, number("SELECT COUNT(*) FROM ratings WHERE task_id=?", id));
        assertThrows(BusinessException.class, () -> rate(b, a, id, 3));
        System.out.println("TEAM_WORKFLOW score=" + score + " task=" + id + " balances=98,98 refunds=8,8 deadline=3days settled=1");
    }

    @RepeatedTest(5) void simultaneousSettleRefundsExactlyOnce() throws Exception {
        long a = user(), b = user(), id = completedTeam(a, b); expireRating(id);
        assertTrue(race(() -> ratings.settleTask(id), () -> ratings.settleTask(id)).isEmpty());
        ratings.settleTask(id);
        assertEquals(1, taskMapper.selectById(id).getSettled()); assertEquals(2, refundCount(id));
        assertBalance(a, 98); assertBalance(b, 98); log(id, a, "refund", 8, 98); log(id, b, "refund", 8, 98);
        assertEquals(2, number("SELECT COUNT(*) FROM notifications WHERE user_id IN (?,?) AND type='settle'", a, b));
    }

    @Test void notificationFailureRollsBackEntireSettlementThenRetrySucceeds() {
        long a = user(), b = user(), id = completedTeam(a, b); expireRating(id);
        int logs = number("SELECT COUNT(*) FROM point_logs WHERE task_id=?", id);
        int notifications = number("SELECT COUNT(*) FROM notifications WHERE user_id IN (?,?)", a, b);
        notices.failAfter(2); // Fail after BOTH balances/logs and the second real notification INSERT.
        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> ratings.settleTask(id));
        assertEquals("injected-after-real-notification-insert", ex.getMessage());
        assertEquals(0, taskMapper.selectById(id).getSettled()); assertEquals(0, refundCount(id));
        assertBalance(a, 90); assertBalance(b, 90);
        assertEquals(logs, number("SELECT COUNT(*) FROM point_logs WHERE task_id=?", id));
        assertEquals(notifications, number("SELECT COUNT(*) FROM notifications WHERE user_id IN (?,?)", a, b));
        notices.failAfter(-1); ratings.settleTask(id);
        assertBalance(a, 98); assertBalance(b, 98); assertEquals(2, refundCount(id));
        assertEquals(1, taskMapper.selectById(id).getSettled());
        System.out.println("ROLLBACK second_real_notification_failed settled=0 balances=90,90 no_new_logs_or_notices retry=98,98");
    }

    @RepeatedTest(5) void simultaneousApproveAddsFiveExpOnce() throws Exception {
        long a = user(), id = publish(a, "team", 9999);
        oneBusinessRejection(race(() -> tasks.approve(id), () -> tasks.approve(id)));
        assertEquals("approved", taskMapper.selectById(id).getStatus()); assertEquals(5, userMapper.selectById(a).getExp());
        assertThrows(BusinessException.class, () -> tasks.approve(id)); assertBalance(a, 90); assertEquals(0, refundCount(id));
        assertEquals(1, number("SELECT COUNT(*) FROM notifications WHERE user_id=? AND type='review'", a));
    }

    @ParameterizedTest @CsvSource({"teach,9999,0", "team,9999,10", "help,20,20"})
    void concurrentRejectRefundsActualFreezeOnly(String type, int reward, int refund) throws Exception {
        long a = user(), id = publish(a, type, reward);
        if (type.equals("team")) { assertEquals(10, taskMapper.selectById(id).getReward()); jdbc.update("UPDATE tasks SET reward=9999 WHERE id=?", id); }
        assertBalance(a, 100 - refund);
        oneBusinessRejection(race(() -> tasks.reject(id, null), () -> tasks.reject(id, null)));
        assertEquals("rejected", taskMapper.selectById(id).getStatus()); assertBalance(a, 100);
        assertEquals(refund == 0 ? 0 : 1, refundCount(id)); assertEquals(0, userMapper.selectById(a).getExp());
        assertThrows(BusinessException.class, () -> tasks.reject(id, null)); assertThrows(BusinessException.class, () -> tasks.approve(id));
        assertEquals(1, number("SELECT COUNT(*) FROM notifications WHERE user_id=? AND type='review'", a));
        if (refund > 0) { log(id, a, "freeze", -refund, 100-refund); log(id, a, "refund", refund, 100); }
        else { assertEquals(0, number("SELECT COUNT(*) FROM point_logs WHERE task_id=?", id)); assertEquals(0, number("SELECT COUNT(*) FROM notifications WHERE user_id=? AND text LIKE '%已退回%'", a)); }
        System.out.println("REJECT type=" + type + " stored_reward=" + reward + " refund=" + refund + " once=true");
    }

    @RepeatedTest(3) void approveVersusRejectHasOnlyOneWinner() throws Exception {
        long a = user(), id = publish(a, "team", 9999);
        oneBusinessRejection(race(() -> tasks.approve(id), () -> tasks.reject(id, null)));
        boolean approved = "approved".equals(taskMapper.selectById(id).getStatus());
        assertEquals(approved ? "approved" : "rejected", taskMapper.selectById(id).getStatus());
        assertEquals(approved ? 5 : 0, userMapper.selectById(a).getExp()); assertBalance(a, approved ? 90 : 100);
        assertEquals(approved ? 0 : 1, refundCount(id));
        assertEquals(1, number("SELECT COUNT(*) FROM notifications WHERE user_id=? AND type='review'", a));
    }

    @ParameterizedTest @ValueSource(strings = {"help", "teach"})
    void helpAndTeachCompleteWorkflow(String type) {
        long a = user(), b = user(), id = publish(a, type, 20);
        assertBalance(a, type.equals("help") ? 80 : 100); assertBalance(b, 100);
        pair(a, id, b); claims.submit(b, id); assertEquals("submitted", claimStatus(id, b));
        assertBalance(a, type.equals("help") ? 80 : 120); assertBalance(b, type.equals("help") ? 100 : 80);
        claims.confirmMember(a, id, b); assertEquals("completed", taskMapper.selectById(id).getStatus()); assertEquals("completed", claimStatus(id, b));
        assertBalance(a, type.equals("help") ? 80 : 120); assertBalance(b, type.equals("help") ? 120 : 80);
        if (type.equals("help")) { log(id, a, "freeze", -20, 80); log(id, b, "earn", 20, 120); }
        else { log(id, b, "spend", -20, 80); log(id, a, "earn", 20, 120); }
        assertEquals(2, number("SELECT COUNT(*) FROM point_logs WHERE task_id=?", id));
        assertThrows(BusinessException.class, () -> claims.submit(b, id));
        assertThrows(BusinessException.class, () -> claims.confirmMember(a, id, b));
        System.out.println("COMPLETE_WORKFLOW type=" + type + " task=" + id + " two_exact_money_logs=true");
    }

    @Test void pairedTeamCancellationReturnsTenToEverySelectedMember() {
        long a = user(), b = user(), c = user(), outsider = user(), id = publish(a, "team", 9999);
        tasks.approve(id);
        for (long member : List.of(b, c, outsider)) claims.claim(member, id, contactClaim());
        PairDTO d = new PairDTO(); d.setClaimerIds(List.of(b, c)); claims.pair(a, id, d);
        for (long member : List.of(a, b, c)) assertBalance(member, 90);
        claims.cancel(a, id);
        assertEquals("cancelled", taskMapper.selectById(id).getStatus()); assertEquals(3, refundCount(id));
        for (long member : List.of(a, b, c)) { assertBalance(member, 100); log(id, member, "refund", 10, 100); }
        for (long member : List.of(b, c, outsider)) assertEquals("cancelled", claimStatus(id, member));
        assertBalance(outsider, 100); assertEquals(0, number("SELECT COUNT(*) FROM point_logs WHERE task_id=? AND user_id=?", id, outsider));
        assertThrows(BusinessException.class, () -> claims.cancel(a, id)); assertEquals(3, refundCount(id));
    }

    @ParameterizedTest @CsvSource({"help,20", "team,10"})
    void threeDayUnclaimedExpiryOnlyRefundsHelpAndPreservesLongRecruitingTeams(String type, int refund) {
        long a = user(), id = publish(a, type, type.equals("team") ? 9999 : 20); tasks.approve(id);
        RefundScheduler scheduler = new RefundScheduler(taskMapper, claimMapper, points);
        scheduler.scanExpiredTasks(); assertEquals("approved", taskMapper.selectById(id).getStatus()); assertEquals(0, refundCount(id));
        jdbc.update("UPDATE tasks SET created_at=? WHERE id=?", LocalDateTime.now().minusDays(3).minusMinutes(1), id);
        scheduler.scanExpiredTasks(); scheduler.scanExpiredTasks();
        // 2026-09-21 起组队长期招募，不属于三天无人认领自动退款；不改动业务状态机。
        if ("team".equals(type)) {
            assertEquals("approved", taskMapper.selectById(id).getStatus()); assertBalance(a, 90); assertEquals(0, refundCount(id));
        } else {
            assertEquals("expired", taskMapper.selectById(id).getStatus()); assertBalance(a, 100); assertEquals(1, refundCount(id)); log(id, a, "refund", refund, 100);
        }
    }

    @Test void pairWithNonexistentIdLeavesTaskClaimsMoneyAndNoticesUnchanged() {
        long a = user(), b = user(), id = publish(a, "team", 9999);
        tasks.approve(id); claims.claim(b, id, contactClaim());
        long nonexistent = Long.MAX_VALUE;
        assertEquals(0, number("SELECT COUNT(*) FROM users WHERE id=?", nonexistent));
        List<Map<String, Object>> taskBefore = jdbc.queryForList("SELECT * FROM tasks WHERE id=?", id);
        List<Map<String, Object>> claimsBefore = jdbc.queryForList("SELECT * FROM task_claims WHERE task_id=? ORDER BY id", id);
        List<Map<String, Object>> usersBefore = jdbc.queryForList("SELECT * FROM users WHERE id IN (?,?) ORDER BY id", a, b);
        List<Map<String, Object>> logsBefore = jdbc.queryForList("SELECT * FROM point_logs WHERE task_id=? ORDER BY id", id);
        List<Map<String, Object>> noticesBefore = jdbc.queryForList("SELECT * FROM notifications WHERE user_id IN (?,?) ORDER BY id", a, b);
        // Include a valid member before the invalid ID to catch partial pairing/freezing.
        for (List<Long> ids : List.of(List.of(nonexistent), List.of(b, nonexistent))) {
            PairDTO d = new PairDTO(); d.setClaimerIds(ids);
            BusinessException ex = assertThrows(BusinessException.class, () -> claims.pair(a, id, d));
            assertEquals(400, ex.getCode());
            assertEquals("approved", taskMapper.selectById(id).getStatus());
            assertEquals("pending_pairing", claimStatus(id, b));
            assertEquals(taskBefore, jdbc.queryForList("SELECT * FROM tasks WHERE id=?", id));
            assertEquals(claimsBefore, jdbc.queryForList("SELECT * FROM task_claims WHERE task_id=? ORDER BY id", id));
            assertEquals(usersBefore, jdbc.queryForList("SELECT * FROM users WHERE id IN (?,?) ORDER BY id", a, b));
            assertEquals(logsBefore, jdbc.queryForList("SELECT * FROM point_logs WHERE task_id=? ORDER BY id", id));
            assertEquals(noticesBefore, jdbc.queryForList("SELECT * FROM notifications WHERE user_id IN (?,?) ORDER BY id", a, b));
        }
        assertBalance(a, 90); assertBalance(b, 100); assertEquals(0, refundCount(id));
        System.out.println("A13_INVALID_PAIR task=" + id + " business_code=400 status=approved task_claims_users_logs_notices_unchanged=true");
    }
    long gossipPost() {
        GossipPost p = new GossipPost(); p.setTitle("mysql-it-like-post"); p.setPublisherId(user());
        p.setBounty(0); p.setCoinStatus("refunded"); p.setDeleted(0); postMapper.insert(p); return p.getId();
    }
    long gossipAnswer() {
        GossipAnswer a = new GossipAnswer(); a.setPostId(gossipPost()); a.setAuthorId(user());
        a.setContent("mysql-it-answer"); a.setLikes(0); answerMapper.insert(a); return a.getId();
    }
    List<Throwable> raceLikes(Runnable... actions) throws Exception {
        return race("com.eggworld.mapper.GossipLikeMapper.selectCount", List.of(actions));
    }

    @RepeatedTest(3) void distinctUsersConcurrentlyLikeAnswerWithoutLostIncrements() throws Exception {
        long answer = gossipAnswer(); int n = 8;
        List<Runnable> actions = new ArrayList<>();
        for (int i = 0; i < n; i++) { long voter = user(); actions.add(() -> gossip.likeAnswer(voter, answer)); }
        assertTrue(raceLikes(actions.toArray(Runnable[]::new)).isEmpty());
        assertEquals(n, number("SELECT likes FROM gossip_answers WHERE id=?", answer));
        assertEquals(n, number("SELECT COUNT(*) FROM gossip_likes WHERE answer_id=?", answer));
        assertEquals(n, number("SELECT COUNT(DISTINCT user_id) FROM gossip_likes WHERE answer_id=?", answer));
        System.out.println("LIKE_DISTINCT answer=" + answer + " concurrent_users=8 likes=8 rows=8");
    }

    @RepeatedTest(3) void sameUserConcurrentAnswerLikeCommitsOneAndReturnsBusinessException() throws Exception {
        long answer = gossipAnswer(), voter = user();
        List<Throwable> errors = raceLikes(() -> gossip.likeAnswer(voter, answer), () -> gossip.likeAnswer(voter, answer));
        oneBusinessRejection(errors); assertEquals(400, ((BusinessException) errors.get(0)).getCode());
        assertEquals(1, number("SELECT likes FROM gossip_answers WHERE id=?", answer));
        assertEquals(1, number("SELECT COUNT(*) FROM gossip_likes WHERE answer_id=? AND user_id=?", answer, voter));
        assertThrows(BusinessException.class, () -> gossip.likeAnswer(voter, answer));
        assertEquals(1, number("SELECT likes FROM gossip_answers WHERE id=?", answer));
        System.out.println("LIKE_ANSWER_DUPLICATE answer=" + answer + " likes=1 rows=1 loser=BusinessException");
    }

    @RepeatedTest(3) void sameUserConcurrentPostLikeCommitsOneAndReturnsBusinessException() throws Exception {
        long post = gossipPost(), voter = user();
        List<Throwable> errors = raceLikes(() -> gossip.likePost(voter, post), () -> gossip.likePost(voter, post));
        oneBusinessRejection(errors); assertEquals(400, ((BusinessException) errors.get(0)).getCode());
        assertEquals(1, number("SELECT COUNT(*) FROM gossip_likes WHERE post_id=? AND user_id=?", post, voter));
        assertThrows(BusinessException.class, () -> gossip.likePost(voter, post));
        assertEquals(1, number("SELECT COUNT(*) FROM gossip_likes WHERE post_id=?", post));
        System.out.println("LIKE_POST_DUPLICATE post=" + post + " rows=1 loser=BusinessException");
    }

    @Test void realMysqlIncrementFailureRollsBackPreviouslyInsertedLike() {
        long answer = gossipAnswer(), voter = user();
        String mode = jdbc.queryForObject("SELECT @@session.sql_mode", String.class);
        assertNotNull(mode); assertTrue(mode.contains("STRICT_TRANS_TABLES") || mode.contains("STRICT_ALL_TABLES"));
        // No fake mapper: INT overflow causes the real incrLikes UPDATE to fail AFTER the real like INSERT.
        jdbc.update("UPDATE gossip_answers SET likes=? WHERE id=?", Integer.MAX_VALUE, answer);
        org.springframework.dao.DataAccessException ex = assertThrows(org.springframework.dao.DataAccessException.class,
                () -> gossip.likeAnswer(voter, answer));
        Throwable root = ex.getMostSpecificCause();
        assertInstanceOf(SQLException.class, root); assertEquals(1264, ((SQLException) root).getErrorCode());
        assertEquals(Integer.MAX_VALUE, number("SELECT likes FROM gossip_answers WHERE id=?", answer));
        assertEquals(0, number("SELECT COUNT(*) FROM gossip_likes WHERE answer_id=?", answer));
        jdbc.update("UPDATE gossip_answers SET likes=0 WHERE id=?", answer);
        gossip.likeAnswer(voter, answer);
        assertEquals(1, number("SELECT likes FROM gossip_answers WHERE id=?", answer));
        assertEquals(1, number("SELECT COUNT(*) FROM gossip_likes WHERE answer_id=? AND user_id=?", answer, voter));
        System.out.println("LIKE_ROLLBACK mysql_error=1264 prior_like_insert_rolled_back=true retry_likes=1");
    }
    @Test void expiryScannerDoesNotRefundClaimedTask() {
        long a = user(), b = user(), id = publish(a, "team", 9999); tasks.approve(id); claims.claim(b, id, contactClaim());
        jdbc.update("UPDATE tasks SET created_at=? WHERE id=?", LocalDateTime.now().minusDays(4), id);
        new RefundScheduler(taskMapper, claimMapper, points).scanExpiredTasks();
        assertEquals("approved", taskMapper.selectById(id).getStatus()); assertBalance(a, 90); assertEquals(0, refundCount(id));
    }
}
