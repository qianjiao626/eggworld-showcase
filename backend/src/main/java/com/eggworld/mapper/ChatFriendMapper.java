package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.ChatFriend;
import org.apache.ibatis.annotations.Mapper;

/** ChatFriend 数据访问。 */
@Mapper
public interface ChatFriendMapper extends BaseMapper<ChatFriend> {
}
