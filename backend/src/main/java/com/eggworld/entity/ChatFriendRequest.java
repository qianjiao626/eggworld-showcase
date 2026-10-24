package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 好友申请。 */
@Data
@TableName("chat_friend_requests")
public class ChatFriendRequest {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long requesterId;
    private Long targetId;
    private String message;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime handledAt;
}
