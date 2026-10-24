package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 打听/八卦帖子实体，对应表 gossip_posts
 * 发布打听时冻结悬赏蛋蛋币，采纳回答后发放
 */
@Data
@TableName("gossip_posts")
public class GossipPost {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String title;

    private String description;

    /** 分类标签（校园/导师/职场/学业等） */
    private String tag;

    private Long publisherId;

    /** 悬赏蛋蛋币 */
    private Integer bounty;

    /** frozen冻结中 / awarded已发放 / refunded已退回 */
    private String coinStatus;

    /** 是否已采纳: 0否 1是 */
    private Integer adopted;

    /** 采纳的回答ID */
    private Long adoptedAnswerId;

    /** 提问永久保留: 0否 1是 */
    private Integer isPermanent;

    /** 30天后自动退回时间 */
    private LocalDateTime deadline;

    /** 逻辑删除: 0未删 1已删 */
    private Integer deleted;

    private LocalDateTime createdAt;
}
