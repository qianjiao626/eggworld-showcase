package com.eggworld.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChatMuteDTO {
    @NotNull(message = "用户不能为空")
    private Long userId;
    private Long conversationId;
    @Min(value = 1, message = "禁言至少1分钟")
    @Max(value = 525600, message = "禁言最长365天")
    @NotNull(message = "禁言时长不能为空")
    private Integer minutes;
    @Size(max = 300, message = "禁言原因最多300个字符")
    private String reason;
}
