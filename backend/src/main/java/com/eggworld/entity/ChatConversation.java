package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 聊天室会话：私聊 / 自建群 / 官方频道。 */
@Data
@TableName("chat_conversations")
public class ChatConversation {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String type;
    private String title;
    private String description;
    private String avatarKey;
    private Long groupId;
    private String channelKey;
    private String directKey;
    private Long ownerId;
    private String visibility;
    private Integer readOnly;
    private String status;
    private Integer maxMembers;
    private Integer memberCount;
    private Long lastMessageId;
    private LocalDateTime lastMessageAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

