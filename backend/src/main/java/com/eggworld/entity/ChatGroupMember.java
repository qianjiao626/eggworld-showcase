package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 自建群成员。 */
@Data
@TableName("chat_group_members")
public class ChatGroupMember {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long groupId;
    private Long userId;
    private String role;
    private String status;
    private LocalDateTime joinedAt;
    private LocalDateTime leftAt;
}
