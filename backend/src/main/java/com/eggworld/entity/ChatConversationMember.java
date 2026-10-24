package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 会话成员、未读缓存和会话级禁言状态。 */
@Data
@TableName("chat_conversation_members")
public class ChatConversationMember {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long userId;
    private String role;
    private String status;
    private LocalDateTime mutedUntil;
    private LocalDateTime joinedAt;
    private LocalDateTime leftAt;
    private Long lastReadMessageId;
    private LocalDateTime lastReadAt;
    private Integer unreadCount;
    private Integer mentionUnread;
    private String notificationMode;
    private Integer pinned;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
