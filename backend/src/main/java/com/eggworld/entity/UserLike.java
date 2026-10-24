package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户点赞实体，对应表 user_likes
 * 唯一约束 (liker_id, likee_id) 保证一人只能点赞一次
 */
@Data
@TableName("user_likes")
public class UserLike {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 点赞者ID */
    private Long likerId;

    /** 被点赞者ID */
    private Long likeeId;

    private LocalDateTime createdAt;
}
