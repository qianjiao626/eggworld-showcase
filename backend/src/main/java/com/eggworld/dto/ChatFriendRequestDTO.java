package com.eggworld.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChatFriendRequestDTO {
    @NotNull(message = "目标用户不能为空")
    private Long targetUserId;
    @Size(max = 200, message = "申请说明最多200个字符")
    private String message;
}
