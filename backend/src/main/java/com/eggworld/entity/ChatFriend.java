package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 双向好友关系，成对保存两行。 */
@Data
@TableName("chat_friends")
public class ChatFriend {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long friendId;
    private String remark;
    private LocalDateTime createdAt;
}
