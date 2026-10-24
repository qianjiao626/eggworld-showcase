package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 管理员回复工单请求体
 */
@Data
public class ReplyFeedbackDTO {

    @NotBlank(message = "回复内容不能为空")
    @Size(max = 2000, message = "回复内容最长2000个字符")
    private String adminReply;
}
