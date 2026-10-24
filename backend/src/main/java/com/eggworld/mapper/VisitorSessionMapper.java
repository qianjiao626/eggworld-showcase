package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.VisitorSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface VisitorSessionMapper extends BaseMapper<VisitorSession> {

    @Update("UPDATE visitor_sessions SET last_active_at = #{now}, page_count = page_count + 1 WHERE session_id = #{sessionId}")
    int heartbeat(@Param("sessionId") String sessionId, @Param("now") LocalDateTime now);

    @Select("SELECT COUNT(DISTINCT user_id) FROM visitor_sessions WHERE user_id IS NOT NULL AND started_at >= #{from} AND started_at < #{to}")
    int countDistinctUsers(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT COUNT(*) FROM visitor_sessions WHERE user_id IS NULL AND started_at >= #{from} AND started_at < #{to}")
    int countAnonymousSessions(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT COUNT(*) FROM visitor_sessions WHERE started_at >= #{from} AND started_at < #{to}")
    int countTotalSessions(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT COALESCE(AVG(TIMESTAMPDIFF(SECOND, started_at, last_active_at)), 0) FROM visitor_sessions WHERE started_at >= #{from} AND started_at < #{to} AND last_active_at > started_at")
    int avgDurationSec(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT COUNT(*) FROM visitor_sessions WHERE is_new_visitor = 1 AND started_at >= #{from} AND started_at < #{to}")
    int countNewVisitors(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT COUNT(DISTINCT visitor_id) FROM visitor_sessions WHERE is_new_visitor = 0 AND started_at >= #{from} AND started_at < #{to}")
    int countReturningVisitors(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT HOUR(started_at) AS h FROM visitor_sessions WHERE started_at >= #{from} AND started_at < #{to} GROUP BY h ORDER BY COUNT(*) DESC LIMIT 1")
    Integer peakHour(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT HOUR(started_at) AS h, COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) AS users, COUNT(*) AS sessions " +
            "FROM visitor_sessions WHERE started_at >= #{from} AND started_at < #{to} GROUP BY h ORDER BY h")
    List<HourlyActivity> hourlyBreakdown(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /**
     * 时段热力的一行（HOUR(started_at) / 去重用户数 / 会话数）。
     *
     * ⚠️ 必须是 class 而不是 interface：MyBatis 通过无参构造反射实例化结果对象，
     * interface 无法 new，会抛 NoSuchMethodException 导致接口 500。
     */
    @lombok.Data
    class HourlyActivity {
        private int h;
        private int users;
        private int sessions;
    }
}
