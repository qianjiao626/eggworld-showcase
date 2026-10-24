package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 聊天室消息热表。正文不允许保存 HTML。 */
@Data
@TableName("chat_messages")
public class ChatMessage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long senderId;
    private String messageType;
    private String content;
    private Long replyToId;
    private String mentionJson;
    private String status;
    private String clientMsgId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
