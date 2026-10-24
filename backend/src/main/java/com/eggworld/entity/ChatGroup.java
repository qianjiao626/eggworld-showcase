package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 用户自建群。 */
@Data
@TableName("chat_groups")
public class ChatGroup {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long ownerId;
    private String name;
    private String description;
    private String visibility;
    private Integer maxMembers;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
