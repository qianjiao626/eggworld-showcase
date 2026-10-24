package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 八卦点赞实体，对应表 gossip_likes
 * post_id 与 answer_id 二选一，唯一约束保证一人一赞
 */
@Data
@TableName("gossip_likes")
public class GossipLike {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 点赞的帖子ID（与 answerId 二选一） */
    private Long postId;

    /** 点赞的回答ID */
    private Long answerId;

    private LocalDateTime createdAt;
}
