package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.ChatMessage;
import org.apache.ibatis.annotations.Mapper;

/** ChatMessage 数据访问。 */
@Mapper
public interface ChatMessageMapper extends BaseMapper<ChatMessage> {
}
