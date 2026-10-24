package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.UserCharacter;
import org.apache.ibatis.annotations.Mapper;

/**
 * 角色解锁 Mapper
 */
@Mapper
public interface UserCharacterMapper extends BaseMapper<UserCharacter> {
}
