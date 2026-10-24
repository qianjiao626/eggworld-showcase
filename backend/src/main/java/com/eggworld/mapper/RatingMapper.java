package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.Rating;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 评价 Mapper
 * 统计口径统一：仅统计 用户真实、未被隐藏 的评价（visible=1 AND is_auto=0），
 * 历史系统补录的"默认4分"与管理员隐藏的不再影响口碑/条数
 */
@Mapper
public interface RatingMapper extends BaseMapper<Rating> {

    /** 某用户收到的真实评价总数 */
    @Select("SELECT COUNT(*) FROM ratings WHERE ratee_id = #{userId} AND visible = 1 AND is_auto = 0")
    Long countByRatee(@Param("userId") Long userId);

    /** 某用户收到的真实评价均分（无记录时返回 0） */
    @Select("SELECT COALESCE(AVG(score), 0) FROM ratings WHERE ratee_id = #{userId} AND visible = 1 AND is_auto = 0")
    BigDecimal avgByRatee(@Param("userId") Long userId);

    /** 某用户在指定任务内收到的真实评价均分（组队互评结算用） */
    @Select("SELECT COALESCE(AVG(score), 0) FROM ratings WHERE task_id = #{taskId} AND ratee_id = #{userId} AND visible = 1 AND is_auto = 0")
    BigDecimal avgByRateeInTask(@Param("taskId") Long taskId, @Param("userId") Long userId);

    /** 全站真实评分均分（贝叶斯先验用，无记录时按 4 分先验） */
    @Select("SELECT COALESCE(AVG(score), 4) FROM ratings WHERE visible = 1 AND is_auto = 0")
    BigDecimal avgGlobal();

    /** 按被评者聚合：每条 = {rateeId, cnt, avgScore}（口碑榜计算用，仅真实评价） */
    @Select("SELECT ratee_id AS rateeId, COUNT(*) AS cnt, COALESCE(AVG(score), 0) AS avgScore FROM ratings WHERE visible = 1 AND is_auto = 0 GROUP BY ratee_id")
    List<Map<String, Object>> groupByRatee();
}
