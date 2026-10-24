package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.UserPermission;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户权限点 Mapper（当前授权状态）
 */
@Mapper
public interface UserPermissionMapper extends BaseMapper<UserPermission> {
}
