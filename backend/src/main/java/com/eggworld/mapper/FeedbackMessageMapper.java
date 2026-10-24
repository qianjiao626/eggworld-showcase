package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.FeedbackMessage;
import org.apache.ibatis.annotations.Mapper;

/**
 * 反馈工单会话消息 Mapper
 */
@Mapper
public interface FeedbackMessageMapper extends BaseMapper<FeedbackMessage> {
}
