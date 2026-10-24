package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import java.util.List;

@Data
public class ChatMessageDTO {
    @NotBlank(message = "消息内容不能为空")
    @Size(max = 1000, message = "消息最多1000个字符")
    private String content;
    @Size(max = 64, message = "clientMsgId过长")
    private String clientMsgId;
    private Long replyToId;
    private List<Long> mentionUserIds;
}
