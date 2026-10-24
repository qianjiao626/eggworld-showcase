package com.eggworld.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class ChatMessageVO {
    private Long id;
    private Long conversationId;
    private Long senderId;
    private String senderNickname;
    private String messageType;
    private String content;
    private Long replyToId;
    private String status;
    private String clientMsgId;
    private List<Long> mentionUserIds;
    private LocalDateTime createdAt;
}
