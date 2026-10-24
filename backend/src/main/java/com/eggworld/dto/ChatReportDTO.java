package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChatReportDTO {
    private Long conversationId;
    private Long messageId;
    private Long targetUserId;
    @NotBlank(message = "举报原因不能为空")
    @Size(max = 100, message = "举报原因最多100个字符")
    private String reason;
    @Size(max = 1000, message = "举报说明最多1000个字符")
    private String detail;
}
