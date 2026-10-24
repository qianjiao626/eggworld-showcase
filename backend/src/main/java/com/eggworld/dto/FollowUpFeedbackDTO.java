package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 用户对已提交的反馈工单「继续追问」请求体
 */
@Data
public class FollowUpFeedbackDTO {

    @NotBlank(message = "追问内容不能为空")
    @Size(max = 2000, message = "追问内容最长2000个字符")
    private String content;
}
