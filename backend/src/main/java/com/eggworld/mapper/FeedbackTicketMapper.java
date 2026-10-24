package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.FeedbackTicket;
import org.apache.ibatis.annotations.Mapper;

/**
 * 反馈工单 Mapper
 */
@Mapper
public interface FeedbackTicketMapper extends BaseMapper<FeedbackTicket> {
}
