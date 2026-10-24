package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 我给出的评价（前端任务卡片"已评价"展示用）
 */
@Data
public class GivenRatingVO {

    /** 被评价的任务ID */
    private Long taskId;

    private String taskTitle;

    /** 被评价者ID */
    private Long rateeId;

    /** 被评价者昵称 */
    private String rateeNickname;

    /** 评分 1-5 星 */
    private Integer score;

    private String comment;

    /** 被评价者（对方）对该条评价的回复 */
    private String reply;

    private LocalDateTime createdAt;
}
