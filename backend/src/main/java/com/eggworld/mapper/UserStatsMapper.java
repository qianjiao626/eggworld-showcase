package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.UserStats;
import org.apache.ibatis.annotations.Mapper;

/**
 * 五维属性 Mapper
 */
@Mapper
public interface UserStatsMapper extends BaseMapper<UserStats> {
}
