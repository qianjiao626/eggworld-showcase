package com.eggworld.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

/**
 * 成就进度聚合 Mapper
 *
 * 只读统计，全部为单条聚合查询，供 AchievementService 按 cond_type 分派调用。
 * 注意：MyBatis-Plus 的逻辑删除只作用于 BaseMapper，原生 @Select 需显式加 deleted = 0。
 */
@Mapper
public interface AchievementProgressMapper {

    /* ===== 签到 ===== */

    @Select("SELECT COUNT(*) FROM daily_checkins WHERE user_id = #{userId}")
    int countCheckinTotal(@Param("userId") Long userId);

    /** 取最近 N 天内的签到日期（倒序），由 Service 在内存里计算连续天数，避免 SQL 硬算 */
    @Select("SELECT check_date FROM daily_checkins WHERE user_id = #{userId} AND check_date >= #{from} " +
            "ORDER BY check_date DESC")
    List<LocalDate> listRecentCheckinDates(@Param("userId") Long userId, @Param("from") LocalDate from);

    /* ===== 任务 ===== */

    @Select("SELECT COUNT(*) FROM tasks WHERE publisher_id = #{userId} AND deleted = 0")
    int countPublished(@Param("userId") Long userId);

    /** 完成任务口径之一：作为认领者，认领记录已完成 */
    @Select("SELECT COUNT(*) FROM task_claims WHERE claimer_id = #{userId} AND status = 'completed'")
    int countClaimsCompleted(@Param("userId") Long userId);

    /** 完成任务口径之二：作为发布者，任务已完成 */
    @Select("SELECT COUNT(*) FROM tasks WHERE publisher_id = #{userId} AND status = 'completed' AND deleted = 0")
    int countPublisherCompleted(@Param("userId") Long userId);

    /** 组队完成口径之一：作为认领者参与的组队任务（按任务去重） */
    @Select("SELECT COUNT(DISTINCT c.task_id) FROM task_claims c JOIN tasks t ON t.id = c.task_id " +
            "WHERE c.claimer_id = #{userId} AND c.status = 'completed' AND t.task_type = 'team'")
    int countTeamAsClaimer(@Param("userId") Long userId);

    /** 组队完成口径之二：作为发布者发布的组队任务（按任务去重） */
    @Select("SELECT COUNT(DISTINCT t.id) FROM tasks t JOIN task_claims c ON c.task_id = t.id " +
            "WHERE t.publisher_id = #{userId} AND t.task_type = 'team' AND t.status = 'completed' " +
            "AND c.selected = 1 AND t.deleted = 0")
    int countTeamAsPublisher(@Param("userId") Long userId);

    /* ===== 口碑评价 ===== */

    @Select("SELECT COUNT(*) FROM ratings WHERE ratee_id = #{userId} AND score = 5 " +
            "AND visible = 1 AND is_auto = 0")
    int countFiveStar(@Param("userId") Long userId);

    @Select("SELECT COUNT(*) FROM ratings WHERE ratee_id = #{userId} AND visible = 1 AND is_auto = 0")
    int countValidRatings(@Param("userId") Long userId);

    @Select("SELECT AVG(score) FROM ratings WHERE ratee_id = #{userId} AND visible = 1 AND is_auto = 0")
    Double avgRating(@Param("userId") Long userId);

    /* ===== 问答 ===== */

    @Select("SELECT COUNT(*) FROM gossip_answers WHERE author_id = #{userId} AND is_adopted = 1")
    int countGossipAdopted(@Param("userId") Long userId);

    /* ===== 邀请 ===== */

    @Select("SELECT COUNT(*) FROM invite_records WHERE inviter_id = #{userId} AND status = 'rewarded'")
    int countInviteRewarded(@Param("userId") Long userId);

    /* ===== 吐槽 ===== */

    @Select("SELECT COUNT(*) FROM school_complaints WHERE user_id = #{userId}")
    int countComplaints(@Param("userId") Long userId);

    /* ===== 综合 ===== */

    @Select("SELECT DATEDIFF(NOW(), created_at) FROM users WHERE id = #{userId}")
    Integer registerDays(@Param("userId") Long userId);

    @Select("SELECT COUNT(*) FROM user_achievements WHERE user_id = #{userId}")
    int countUnlockedAch(@Param("userId") Long userId);

    @Select("SELECT COUNT(DISTINCT a.category) FROM user_achievements ua " +
            "JOIN achievements a ON a.id = ua.ach_id WHERE ua.user_id = #{userId}")
    int countUnlockedCategories(@Param("userId") Long userId);

    /** 用于每日扫描：取全部启用成就的分类去重列表 */
    @Select("SELECT DISTINCT category FROM achievements WHERE enabled = 1")
    List<String> selectEnabledCategories();
}
