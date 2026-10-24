package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 关注关系。 */
@Data
@TableName("chat_follows")
public class ChatFollow {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long followerId;
    private Long followingId;
    private LocalDateTime createdAt;
}
