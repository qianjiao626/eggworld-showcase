package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资金/评价治理：被管理员隐藏的评价条目
 */
@Data
public class AdminHiddenRatingVO {

    private Long id;

    private Long taskId;
    /** 关联任务标题（联表填充） */
    private String taskTitle;

    /** 评价者昵称 */
    private String raterNickname;
    /** 被评价者昵称 */
    private String rateeNickname;

    /** 评分 1-5 星 */
    private Integer score;
    /** 评价内容 */
    private String comment;

    /** 评价者角色：publisher / claimer */
    private String raterRole;

    /** 评价时间（用于判断隐藏了多久） */
    private LocalDateTime createdAt;
}
