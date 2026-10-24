package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 八卦帖子展示对象（列表/详情共用）
 * 脱敏：仅返回发布者昵称与必要展示字段
 */
@Data
public class GossipPostVO {

    private Long id;
    private String title;
    private String description;
    private String tag;
    private Integer bounty;

    /** frozen冻结中 / awarded已发放 / refunded已退回 */
    private String coinStatus;

    private Boolean adopted;
    private Long adoptedAnswerId;
    private LocalDateTime deadline;
    private LocalDateTime createdAt;

    /** 发布者信息 */
    private Long publisherId;
    private String publisherNickname;

    /** 是否当前用户发布 */
    private Boolean isMine;

    /** 当前用户是否已点赞（匿名/未登录为 false） */
    private Boolean liked;

    /** 帖子获赞数（gossip_likes 统计） */
    private Integer likes;

    private Integer answerCount;

    /** 详情时返回回答列表（列表接口为空） */
    private List<GossipAnswerVO> answers;

    @Data
    public static class GossipAnswerVO {
        private Long id;
        private Long authorId;
        private String authorNickname;
        private String content;
        private Integer likes;
        /** 当前用户是否已点赞 */
        private Boolean liked;
        private Boolean isAdopted;
        private LocalDateTime createdAt;
    }
}
