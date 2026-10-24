package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.Achievement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 成就定义 Mapper
 */
@Mapper
public interface AchievementMapper extends BaseMapper<Achievement> {

    /** 全部启用中的成就（按分类 + 排序号） */
    @Select("SELECT * FROM achievements WHERE enabled = 1 ORDER BY category, sort_order, id")
    List<Achievement> selectAllEnabled();

    /** 指定分类及元成就（由引擎放在普通成就之后计算） */
    @Select("SELECT * FROM achievements WHERE enabled = 1 AND (category = #{category} OR category = 'meta') ORDER BY sort_order, id")
    List<Achievement> selectEnabledByCategory(@Param("category") String category);
}
