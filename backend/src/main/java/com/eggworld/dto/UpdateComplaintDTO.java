package com.eggworld.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;

/**
 * 修改大学吐槽评分请求
 * 只允许改「16 维评分」与「留言」，学校不可变；
 * 修改不再发放奖励，也不占用「每人 2 次」的奖励次数。
 */
@Data
public class UpdateComplaintDTO {

    @Size(max = 500, message = "吐槽内容过长")
    private String content;

    @NotNull(message = "请完成评分")
    private Map<String, Integer> metrics;
}
