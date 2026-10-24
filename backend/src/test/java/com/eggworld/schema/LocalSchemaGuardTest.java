package com.eggworld.schema;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 本地隔离库（D:\CodexData\local\eggworld 的 3306）的 tasks 结构守护测试。
 *
 * 为什么需要它：2026-10-07 给 {@code Task} 加了 {@code proofImageId} 字段后，MyBatis-Plus 给 tasks
 * 生成的 SELECT 会自动带上 proof_image_id，而本地库没跑迁移脚本时**每个**查任务的接口与定时任务
 * （RateSettleScheduler / RefundScheduler）都会抛 Unknown column —— 实体与库结构必须同步。
 * 这个测试把「tasks 的列集合」钉住：谁再加字段就必须一起改 SQL 迁移脚本，否则本地库一跑就红。
 *
 * 护栏（与 TeamFundsMysqlIT / ChatroomMysqlIT 同一套思路）：只允许连本地隔离库 3306 +
 * datadir 命中 D:\CodexData\local\eggworld\mysql-data\；连不上或端口不是隔离实例时**跳过**，
 * 不去连任何正式库。
 */
class LocalSchemaGuardTest {

    private static final String HOST = "127.0.0.1";
    private static final int PORT = 3306;
    /**
     * 允许连的本地实例 datadir 白名单（只放行本机、明确不是线上库的实例）：
     * · d:/codexdata/local/eggworld/mysql-data/ —— 项目约定的隔离环境数据目录
     * · d:/env/mysql/mysqlserver8.4/data/      —— 开发机上实际在跑的本地 MySQL（2026-10-07 实测）
     * 端口或 datadir 不在白名单里一律跳过，绝不改连别的库。
     */
    private static final List<String> SAFE_DATADIRS = List.of(
            "d:/codexdata/local/eggworld/mysql-data/",
            "d:/env/mysql/mysqlserver8.4/data/");

    /** tasks 的列集合：加字段必须同步 backend/sql/migrate-*.sql 与 init.sql */
    private static final List<String> TASKS_COLUMNS = List.of(
            "id", "title", "description", "task_type", "skill_category", "skill_sub", "reward",
            "claim_mode", "max_claimers", "requirements", "proof_image_id", "publisher_id", "contact",
            "conversation_id", "status", "settled", "signup_deadline", "complete_deadline",
            "rate_deadline", "featured", "deleted", "hidden", "governance_reason",
            "created_at", "updated_at");

    /**
     * task_revisions 的列集合。
     * 为什么也要钉（2026-10-07 真实故障）：给 {@link com.eggworld.entity.TaskRevision} 加了
     * {@code proofImageId} 后，凡是查改稿表的接口（「我的任务」带出 pendingRevision、审核中心）
     * 生成的 SELECT 都会带 proof_image_id；本地库没执行新列时**整页报「任务加载失败」**。
     */
    private static final List<String> TASK_REVISIONS_COLUMNS = List.of(
            "id", "task_id", "status", "title", "description", "requirements", "skill_category", "skill_sub",
            "reward", "claim_mode", "max_claimers", "proof_image_id", "contact",
            "signup_deadline", "complete_deadline", "reject_reason", "created_at", "reviewed_at");

    private Connection openIsolated() {
        Connection connection = null;
        try {
            connection = DriverManager.getConnection(
                    "jdbc:mysql://" + HOST + ":" + PORT + "/?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8",
                    "root", "root");
            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery("SELECT @@port, @@datadir")) {
                assertTrue(rs.next());
                int port = rs.getInt(1);
                String datadir = rs.getString(2) == null ? "" : rs.getString(2).replace('\\', '/').toLowerCase(Locale.ROOT);
                if (port != PORT || !SAFE_DATADIRS.contains(datadir)) {
                    connection.close();
                    Assumptions.abort("target instance is not a whitelisted local one (port=" + port + ", datadir=" + datadir + ")");
                }
            }
            return connection;
        } catch (SQLException error) {
            // 连不上（没起本地库）就跳过：护栏的意义是不去连正式库，而不是把没起库的人卡红
            if (connection != null) {
                try { connection.close(); } catch (SQLException ignored) { /* 关闭失败无所谓 */ }
            }
            Assumptions.abort("local isolated MySQL is not reachable: " + error.getMessage());
            return null;
        }
    }

    @Test
    void tasksColumnsMatchEntityFields() throws Exception {
        try (Connection connection = openIsolated()) {
            List<String> actual = columnNames(connection, "tasks");
            assertFalse(actual.isEmpty(), "本地库没有 tasks 表");
            // 只比列集合、不比顺序：迁移脚本是 ALTER 追加列，线上/本地顺序天然与 init.sql 不同
            assertEquals(TASKS_COLUMNS.stream().sorted().toList(), actual,
                    "tasks 列与 Task 实体不一致：加/删字段要同步 backend/sql/migrate-*.sql 并在本地库执行");
        }
    }

    @Test
    void taskRevisionsColumnsMatchEntityFields() throws Exception {
        try (Connection connection = openIsolated()) {
            List<String> actual = columnNames(connection, "task_revisions");
            assertFalse(actual.isEmpty(),
                    "本地库没有 task_revisions 表：先按 backend/sql/migrate-task-revisions.sql 建表");
            assertEquals(TASK_REVISIONS_COLUMNS.stream().sorted().toList(), actual,
                    "task_revisions 列与 TaskRevision 实体不一致：加/删字段要同步 backend/sql/migrate-*.sql"
                            + "（proof_image_id 在 migrate-task-proof-image.sql 第 4 节）并在本地库执行，"
                            + "否则「我的任务」会整页报「任务加载失败」");
        }
    }

    @Test
    void proofImageTableAndIndexesExist() throws Exception {
        try (Connection connection = openIsolated()) {
            assertEquals(List.of("byte_size", "content_type", "created_at", "id", "image_key", "uploader_id"),
                    columnNames(connection, "task_proof_images"),
                    "task_proof_images 结构不对：应执行 backend/sql/migrate-task-proof-image.sql");
            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                         "SELECT INDEX_NAME FROM information_schema.STATISTICS"
                                 + " WHERE TABLE_SCHEMA = 'eggworld' AND TABLE_NAME = 'tasks'"
                                 + " AND INDEX_NAME IN ('idx_proof_image', 'idx_conversation')")) {
                List<String> indexes = new ArrayList<>();
                while (rs.next()) indexes.add(rs.getString(1));
                assertTrue(indexes.contains("idx_proof_image") && indexes.contains("idx_conversation"),
                        "tasks 缺少迁移脚本建的索引，实际：" + indexes);
            }
        }
    }

    /** 列名按字母序返回，便于与期望集合直接比较 */
    private List<String> columnNames(Connection connection, String table) throws SQLException {
        List<String> names = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT COLUMN_NAME FROM information_schema.COLUMNS"
                             + " WHERE TABLE_SCHEMA = 'eggworld' AND TABLE_NAME = '" + table + "' ORDER BY COLUMN_NAME")) {
            while (rs.next()) names.add(rs.getString(1));
        }
        return names;
    }
}
