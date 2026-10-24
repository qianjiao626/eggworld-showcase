package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.DailyActiveStats;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

@Mapper
public interface DailyActiveStatsMapper extends BaseMapper<DailyActiveStats> {

    @Select("SELECT * FROM daily_active_stats WHERE stat_date >= #{from} AND stat_date <= #{to} ORDER BY stat_date")
    List<DailyActiveStats> listRange(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Select("SELECT COALESCE(SUM(dau), 0) FROM daily_active_stats WHERE stat_date >= #{from} AND stat_date <= #{to}")
    int sumDau(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
