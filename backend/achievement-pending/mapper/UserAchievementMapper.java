package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.UserAchievement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 用户成就解锁记录 Mapper
 */
@Mapper
public interface UserAchievementMapper extends BaseMapper<UserAchievement> {

    /** 该成就是否已解锁（幂等判断） */
    @Select("SELECT COUNT(*) FROM user_achievements WHERE user_id = #{userId} AND ach_id = #{achId}")
    int countByUserAndAch(@Param("userId") Long userId, @Param("achId") Long achId);

    /** 未读解锁数量（驱动红点） */
    @Select("SELECT COUNT(*) FROM user_achievements WHERE user_id = #{userId} AND is_read = 0")
    int countUnread(@Param("userId") Long userId);

    /** 未读解锁记录（按时间正序，弹窗按顺序依次展示） */
    @Select("SELECT * FROM user_achievements WHERE user_id = #{userId} AND is_read = 0 ORDER BY unlocked_at, id")
    List<UserAchievement> selectUnread(@Param("userId") Long userId);

    /** 我已解锁的全部成就 id */
    @Select("SELECT ach_id FROM user_achievements WHERE user_id = #{userId}")
    List<Long> selectUnlockedAchIds(@Param("userId") Long userId);

    /** 标记单条已读（仅本人，防越权） */
    @Select("SELECT * FROM user_achievements WHERE id = #{id} AND user_id = #{userId}")
    UserAchievement selectMineById(@Param("id") Long id, @Param("userId") Long userId);
}
