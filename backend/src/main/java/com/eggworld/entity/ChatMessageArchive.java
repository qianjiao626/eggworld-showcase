package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 到期消息冷归档。主键沿用原消息ID，便于审计恢复。 */
@Data
@TableName("chat_messages_archive")
public class ChatMessageArchive {
    @TableId(type = IdType.INPUT)
    private Long id;
    private Long conversationId;
    private Long senderId;
    private String senderSnapshot;
    private String messageType;
    private String content;
    private Long replyToId;
    private String mentionJson;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime archivedAt;
}
