package com.eggworld.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 提交任务评价请求体
 * 调用方：POST /api/tasks/{id}/rate
 */
@Data
public class RateTaskDTO {

    /** 被评价者ID（任务参与者：发布者或认领者） */
    @NotNull(message = "缺少被评价者")
    private Long rateeId;

    /** 评分 1-5 星 */
    @NotNull(message = "请给出评分")
    @Min(value = 1, message = "评分最小1星")
    @Max(value = 5, message = "评分最大5星")
    private Integer score;

    @Size(max = 500, message = "评价内容最长500字")
    private String comment;
}
