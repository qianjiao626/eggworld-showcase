package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.ChatAuditLog;
import org.apache.ibatis.annotations.Mapper;

/** ChatAuditLog 数据访问。 */
@Mapper
public interface ChatAuditLogMapper extends BaseMapper<ChatAuditLog> {
}
