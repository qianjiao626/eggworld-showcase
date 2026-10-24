package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.SchoolComplaint;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 大学吐槽 Mapper
 * 学校排名用原生 SQL 聚合（metrics 为 JSON，取维度均分需 JSON_EXTRACT）
 */
@Mapper
public interface SchoolComplaintMapper extends BaseMapper<SchoolComplaint> {

    /** 总榜：按平均吐槽分排名 */
    @Select("SELECT school_name AS schoolName, COUNT(*) AS cnt, AVG(score) AS avgScore " +
            "FROM school_complaints GROUP BY school_name ORDER BY avgScore DESC")
    List<Map<String, Object>> rankAll();

    /** 维度榜：按指定维度的均分排名（metric 需白名单校验，JSON path 由 CONCAT 拼接） */
    @Select("SELECT school_name AS schoolName, COUNT(*) AS cnt, AVG(score) AS avgScore, " +
            "AVG(JSON_UNQUOTE(JSON_EXTRACT(metrics, CONCAT('$.\\\"', #{metric}, '\\\"')))) AS metricScore " +
            "FROM school_complaints GROUP BY school_name ORDER BY metricScore DESC")
    List<Map<String, Object>> rankByMetric(@Param("metric") String metric);
}
