package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 反馈工单会话消息，对应表 feedback_messages
 * 用户的首次提交存在 feedback_tickets.content（视为会话起点），
 * 本表只记录其后的往返消息（管理员回复 + 用户追问）。
 * sender_type：user（用户）/ admin（管理员）
 */
@Data
@TableName("feedback_messages")
public class FeedbackMessage {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属工单 */
    private Long ticketId;

    /** 发送方：user / admin */
    private String senderType;

    private String content;

    private LocalDateTime createdAt;
}
