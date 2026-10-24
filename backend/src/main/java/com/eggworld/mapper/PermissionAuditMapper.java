package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.PermissionAudit;
import org.apache.ibatis.annotations.Mapper;

/**
 * 权限操作审计 Mapper
 */
@Mapper
public interface PermissionAuditMapper extends BaseMapper<PermissionAudit> {
}
