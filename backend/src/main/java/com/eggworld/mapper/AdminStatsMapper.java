package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.eggworld.dto.AdminFrozenCoinVO;
import com.eggworld.dto.AdminPointLogVO;
import com.eggworld.dto.CoinSeriesBucketVO;
import com.eggworld.dto.CountBucketVO;
import com.eggworld.dto.PageViewStatVO;
import com.eggworld.dto.PointTypeSummaryVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 工作台聚合统计 Mapper（不对应单一实体，与 UserPurgeMapper 同策略）
 *
 * 注意 1：此处为原生 SQL，MyBatis-Plus 的逻辑删除不会自动追加过滤条件，
 *         涉及 users / tasks / gossip_posts 的查询必须显式写 deleted = 0。
 * 注意 2：MySQL 的 only_full_group_by 下，`GROUP BY <SELECT 别名>` 对含聚合函数的
 *         语句不可靠，故所有分桶查询统一 `GROUP BY <完整表达式>`。
 */
@Mapper
public interface AdminStatsMapper {

    /* ===== 运营概览 ===== */

    /** 注册蛋蛋总数（学生） */
    @Select("SELECT COUNT(*) FROM users WHERE role = 'student' AND deleted = 0")
    long countStudents();

    /** 副管理员数 */
    @Select("SELECT COUNT(*) FROM users WHERE sub_admin = 1 AND deleted = 0")
    long countSubAdmins();

    /** 区间内新增学生 */
    @Select("SELECT COUNT(*) FROM users WHERE role = 'student' AND deleted = 0 "
            + "AND created_at >= #{start} AND created_at < #{end}")
    long countNewUsers(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /* ===== 任务 ===== */

    /** 按状态统计任务数 */
    @Select("SELECT COUNT(*) FROM tasks WHERE status = #{status} AND deleted = 0")
    long countTasksByStatus(@Param("status") String status);

    /**
     * 待审核任务数：任务本身待审 + 有一份 pending 修改稿的任务。
     * 过期任务的改稿按设计保持 expired 状态（审过才复活），只数 tasks.status='pending' 会与审核中心列表对不上。
     */
    @Select("SELECT COUNT(*) FROM tasks t WHERE t.deleted = 0 AND (t.status = 'pending' "
            + "OR EXISTS (SELECT 1 FROM task_revisions r WHERE r.task_id = t.id AND r.status = 'pending'))")
    long countPendingReview();

    /** 按状态统计认领记录数（全站，含学生任务，仅作平台健康度） */
    @Select("SELECT COUNT(*) FROM task_claims WHERE status = #{status}")
    long countClaimsByStatus(@Param("status") String status);

    /** 管理员待办：官方（奖励型）任务中存在"已提交待确认"认领的任务数 */
    @Select("SELECT COUNT(DISTINCT t.id) FROM tasks t JOIN task_claims c ON c.task_id = t.id "
            + "WHERE t.deleted = 0 AND t.task_type = 'reward' AND c.status = 'submitted'")
    long countOfficialPendingConfirm();

    /** 区间内发布的任务数 */
    @Select("SELECT COUNT(*) FROM tasks WHERE deleted = 0 "
            + "AND created_at >= #{start} AND created_at < #{end}")
    long countTasksCreated(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /* ===== 资金 ===== */

    /** 流通总量：全部未删除用户的余额之和 */
    @Select("SELECT COALESCE(SUM(points), 0) FROM users WHERE deleted = 0")
    long sumCirculatingPoints();

    /**
     * 平台投放（区间）：type='reward' 的 delta 之和。
     * 只有这类流水真正增发货币、影响币总量；earn/spend 是用户间转移，freeze 只是转托管。
     */
    @Select("SELECT COALESCE(SUM(delta), 0) FROM point_logs "
            + "WHERE created_at >= #{start} AND created_at < #{end} AND type = 'reward'")
    long sumPlatformIssued(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /** 任务流转（区间）：type='earn' 的 delta 之和（活跃度指标，不改变币总量） */
    @Select("SELECT COALESCE(SUM(delta), 0) FROM point_logs "
            + "WHERE created_at >= #{start} AND created_at < #{end} AND type = 'earn'")
    long sumTaskTurnover(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /** 冻结中：进行中任务（含待审核/已通过/组队已满员未结算）的悬赏总额 */
    @Select("SELECT COALESCE(SUM(reward), 0) FROM tasks WHERE deleted = 0 "
            + "AND status IN ('pending', 'approved', 'in_progress', 'full')")
    long sumFrozenTaskReward();

    /** 冻结中：打听悬赏尚未结算的总额 */
    @Select("SELECT COALESCE(SUM(bounty), 0) FROM gossip_posts WHERE deleted = 0 AND coin_status = 'frozen'")
    long sumFrozenGossipBounty();

    /* ===== 风险与治理 ===== */

    /** 已封禁用户 */
    @Select("SELECT COUNT(*) FROM users WHERE banned = 1 AND deleted = 0")
    long countBannedUsers();

    /** 待处理工单 */
    @Select("SELECT COUNT(*) FROM feedback_tickets WHERE status = 'open'")
    long countOpenTickets();

    /** 待处理举报工单 */
    @Select("SELECT COUNT(*) FROM feedback_tickets WHERE status = 'open' AND type = 'report'")
    long countOpenReports();

    /** 被管理员隐藏的评价 */
    @Select("SELECT COUNT(*) FROM ratings WHERE visible = 0")
    long countHiddenRatings();

    /** 大学黑榜吐槽数 */
    @Select("SELECT COUNT(*) FROM school_complaints")
    long countComplaints();

    /* ===== 趋势指标池（8 条，按天：label 为 MM-dd） ===== */

    @Select("SELECT DATE_FORMAT(created_at, '%m-%d') AS label, COUNT(*) AS cnt FROM users "
            + "WHERE role = 'student' AND deleted = 0 AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%m-%d')")
    List<CountBucketVO> newUsersByDay(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%m-%d') AS label, COUNT(*) AS cnt FROM tasks "
            + "WHERE deleted = 0 AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%m-%d')")
    List<CountBucketVO> tasksByDay(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /** 完成任务：以认领记录的 completed_at 为准（tasks 表没有状态变更时间字段） */
    @Select("SELECT DATE_FORMAT(completed_at, '%m-%d') AS label, COUNT(*) AS cnt FROM task_claims "
            + "WHERE status = 'completed' AND completed_at >= #{start} AND completed_at < #{end} "
            + "GROUP BY DATE_FORMAT(completed_at, '%m-%d')")
    List<CountBucketVO> completedTasksByDay(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%m-%d') AS label, COUNT(*) AS cnt FROM page_views "
            + "WHERE created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%m-%d')")
    List<CountBucketVO> pageViewsByDay(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%m-%d') AS label, COUNT(*) AS cnt FROM ratings "
            + "WHERE created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%m-%d')")
    List<CountBucketVO> ratingsByDay(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%m-%d') AS label, COUNT(*) AS cnt FROM gossip_posts "
            + "WHERE deleted = 0 AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%m-%d')")
    List<CountBucketVO> gossipByDay(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /* ===== 趋势指标池（按小时：label 为 00~23） ===== */

    @Select("SELECT DATE_FORMAT(created_at, '%H') AS label, COUNT(*) AS cnt FROM users "
            + "WHERE role = 'student' AND deleted = 0 AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%H')")
    List<CountBucketVO> newUsersByHour(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%H') AS label, COUNT(*) AS cnt FROM tasks "
            + "WHERE deleted = 0 AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%H')")
    List<CountBucketVO> tasksByHour(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(completed_at, '%H') AS label, COUNT(*) AS cnt FROM task_claims "
            + "WHERE status = 'completed' AND completed_at >= #{start} AND completed_at < #{end} "
            + "GROUP BY DATE_FORMAT(completed_at, '%H')")
    List<CountBucketVO> completedTasksByHour(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%H') AS label, COUNT(*) AS cnt FROM page_views "
            + "WHERE created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%H')")
    List<CountBucketVO> pageViewsByHour(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%H') AS label, COUNT(*) AS cnt FROM ratings "
            + "WHERE created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%H')")
    List<CountBucketVO> ratingsByHour(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%H') AS label, COUNT(*) AS cnt FROM gossip_posts "
            + "WHERE deleted = 0 AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%H')")
    List<CountBucketVO> gossipByHour(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /* ===== 资金序列（趋势指标池中的"平台投放""任务流转"两条） ===== */

    @Select("SELECT DATE_FORMAT(created_at, '%m-%d') AS label, "
            + "COALESCE(SUM(CASE WHEN type = 'reward' THEN delta ELSE 0 END), 0) AS platformIssued, "
            + "COALESCE(SUM(CASE WHEN type = 'earn' THEN delta ELSE 0 END), 0) AS taskTurnover "
            + "FROM point_logs WHERE created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%m-%d')")
    List<CoinSeriesBucketVO> coinSeriesByDay(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%H') AS label, "
            + "COALESCE(SUM(CASE WHEN type = 'reward' THEN delta ELSE 0 END), 0) AS platformIssued, "
            + "COALESCE(SUM(CASE WHEN type = 'earn' THEN delta ELSE 0 END), 0) AS taskTurnover "
            + "FROM point_logs WHERE created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%H')")
    List<CoinSeriesBucketVO> coinSeriesByHour(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /* ===== 任务分布（快照：全部未删除任务） ===== */

    /** 任务类型分布（label 为 task_type 英文 key） */
    @Select("SELECT task_type AS label, COUNT(*) AS cnt FROM tasks WHERE deleted = 0 GROUP BY task_type")
    List<CountBucketVO> taskTypeDistribution();

    /** 技能大类分布（label 为 skill_category 英文 key） */
    @Select("SELECT skill_category AS label, COUNT(*) AS cnt FROM tasks "
            + "WHERE deleted = 0 AND skill_category IS NOT NULL AND skill_category <> '' GROUP BY skill_category")
    List<CountBucketVO> skillCategoryDistribution();

    /* ===== 页面热度 ===== */

    /** 区间内各页面 PV / UV（按 PV 降序） */
    @Select("SELECT page_key AS pageKey, COUNT(*) AS pv, COUNT(DISTINCT user_id) AS uv FROM page_views "
            + "WHERE created_at >= #{start} AND created_at < #{end} GROUP BY page_key ORDER BY pv DESC")
    List<PageViewStatVO> pageStatsBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /* ===== 资金详情：类型汇总 ===== */

    @Select("SELECT type, COUNT(*) AS cnt, COALESCE(SUM(delta), 0) AS sumDelta, "
            + "COALESCE(SUM(ABS(delta)), 0) AS sumAbs FROM point_logs "
            + "WHERE created_at >= #{start} AND created_at < #{end} GROUP BY type")
    List<PointTypeSummaryVO> summaryByType(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    /* ===== 资金详情：全局流水明细（可筛选 + 分页） ===== */

    @Select("<script>"
            + "SELECT p.id, p.created_at, p.user_id, u.nickname AS userNickname, p.type, p.label, "
            + "       p.delta, p.balance, p.task_id, t.title AS taskTitle "
            + "FROM point_logs p "
            + "LEFT JOIN users u ON u.id = p.user_id "
            + "LEFT JOIN tasks t ON t.id = p.task_id "
            + "<where>"
            + "  <if test=\"start != null\"> AND p.created_at &gt;= #{start} </if>"
            + "  <if test=\"end != null\"> AND p.created_at &lt; #{end} </if>"
            + "  <if test=\"type != null and type != ''\"> AND p.type = #{type} </if>"
            + "  <if test=\"minAbs != null\"> AND ABS(p.delta) &gt;= #{minAbs} </if>"
            + "  <if test=\"keyword != null and keyword != ''\">"
            + "    AND (u.nickname LIKE CONCAT('%', #{keyword}, '%') OR u.email LIKE CONCAT('%', #{keyword}, '%'))</if>"
            + "</where>"
            + "ORDER BY p.created_at DESC, p.id DESC"
            + "</script>")
    IPage<AdminPointLogVO> selectPointLogs(IPage<AdminPointLogVO> page,
                                          @Param("start") LocalDateTime start,
                                          @Param("end") LocalDateTime end,
                                          @Param("type") String type,
                                          @Param("minAbs") Integer minAbs,
                                          @Param("keyword") String keyword);

    /* ===== 资金详情：冻结清单 ===== */

    /**
     * 冻结清单：任务悬赏 + 打听悬赏。
     * 冻结时间用 created_at 近似（发布即冻结，表内无独立的冻结时间字段）。
     * 过滤条件必须与 sumFrozenTaskReward / sumFrozenGossipBounty 保持一致，
     * 否则清单合计会对不上"冻结中"总额。
     */
    @Select("SELECT 'task' AS source, t.title AS title, u.nickname AS ownerName, t.reward AS amount, "
            + "       t.created_at AS frozenAt, DATEDIFF(NOW(), t.created_at) AS days, t.status AS status "
            + "FROM tasks t LEFT JOIN users u ON u.id = t.publisher_id "
            + "WHERE t.deleted = 0 AND t.status IN ('pending', 'approved', 'in_progress', 'full') "
            + "UNION ALL "
            + "SELECT 'gossip' AS source, g.title AS title, u.nickname AS ownerName, g.bounty AS amount, "
            + "       g.created_at AS frozenAt, DATEDIFF(NOW(), g.created_at) AS days, g.coin_status AS status "
            + "FROM gossip_posts g LEFT JOIN users u ON u.id = g.publisher_id "
            + "WHERE g.deleted = 0 AND g.coin_status = 'frozen' "
            + "ORDER BY days DESC")
    List<AdminFrozenCoinVO> frozenCoins();
}
