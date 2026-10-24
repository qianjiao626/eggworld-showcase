package com.eggworld.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ChatCreateDirectDTO {
    @NotNull(message = "目标用户不能为空")
    private Long targetUserId;
}
