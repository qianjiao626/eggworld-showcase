package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 打听回答实体，对应表 gossip_answers
 * likes 为冗余计数（点赞 +1），去重由 gossip_likes 表保证
 */
@Data
@TableName("gossip_answers")
public class GossipAnswer {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long postId;

    private Long authorId;

    private String content;

    /** 获赞数（冗余计数） */
    private Integer likes;

    /** 是否被采纳: 0否 1是 */
    private Integer isAdopted;

    private LocalDateTime createdAt;
}
