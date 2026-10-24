package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.ChatGroupMember;
import org.apache.ibatis.annotations.Mapper;

/** ChatGroupMember 数据访问。 */
@Mapper
public interface ChatGroupMemberMapper extends BaseMapper<ChatGroupMember> {
}
