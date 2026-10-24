package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.eggworld.dto.AdminHiddenRatingVO;
import com.eggworld.dto.CountBucketVO;
import com.eggworld.dto.PageViewDetailVO;
import com.eggworld.dto.PageViewTotalsVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 工作台"下钻详情"查询 Mapper（批次 2）：页面热度明细 / 被隐藏评价列表
 *
 * 与 AdminStatsMapper 同为原生 SQL：分桶一律 `GROUP BY <完整表达式>`（only_full_group_by 兼容）。
 */
@Mapper
public interface AdminDetailMapper {

    /* ===== 页面热度明细 ===== */

    /** 区间总量：PV 与 UV */
    @Select("SELECT COUNT(*) AS pv, COUNT(DISTINCT user_id) AS uv FROM page_views "
            + "WHERE page_key = #{pageKey} AND created_at >= #{start} AND created_at < #{end}")
    PageViewTotalsVO pageTotals(@Param("pageKey") String pageKey,
                                @Param("start") LocalDateTime start,
                                @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%m-%d') AS label, COUNT(*) AS cnt FROM page_views "
            + "WHERE page_key = #{pageKey} AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%m-%d')")
    List<CountBucketVO> pagePvByDay(@Param("pageKey") String pageKey,
                                    @Param("start") LocalDateTime start,
                                    @Param("end") LocalDateTime end);

    @Select("SELECT DATE_FORMAT(created_at, '%H') AS label, COUNT(*) AS cnt FROM page_views "
            + "WHERE page_key = #{pageKey} AND created_at >= #{start} AND created_at < #{end} "
            + "GROUP BY DATE_FORMAT(created_at, '%H')")
    List<CountBucketVO> pagePvByHour(@Param("pageKey") String pageKey,
                                     @Param("start") LocalDateTime start,
                                     @Param("end") LocalDateTime end);

    /** 访问该页面最多的用户（最多 10 位；已注销用户 nickname 为 null） */
    @Select("SELECT pv.user_id AS userId, u.nickname AS nickname, COUNT(*) AS cnt FROM page_views pv "
            + "LEFT JOIN users u ON u.id = pv.user_id "
            + "WHERE pv.page_key = #{pageKey} AND pv.created_at >= #{start} AND pv.created_at < #{end} "
            + "GROUP BY pv.user_id, u.nickname ORDER BY cnt DESC LIMIT 10")
    List<PageViewDetailVO.VisitorVO> topVisitors(@Param("pageKey") String pageKey,
                                                 @Param("start") LocalDateTime start,
                                                 @Param("end") LocalDateTime end);

    /* ===== 被隐藏的评价 ===== */

    @Select("SELECT r.id, r.task_id, t.title AS taskTitle, "
            + "       ru.nickname AS raterNickname, eu.nickname AS rateeNickname, "
            + "       r.score, r.comment, r.rater_role, r.created_at "
            + "FROM ratings r "
            + "LEFT JOIN tasks t ON t.id = r.task_id "
            + "LEFT JOIN users ru ON ru.id = r.rater_id "
            + "LEFT JOIN users eu ON eu.id = r.ratee_id "
            + "WHERE r.visible = 0 ORDER BY r.created_at DESC")
    IPage<AdminHiddenRatingVO> hiddenRatings(IPage<AdminHiddenRatingVO> page);
}
