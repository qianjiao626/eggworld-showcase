package com.eggworld.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ChatConversationVO {
    private Long id;
    private String type;
    private String title;
    private String description;
    private String visibility;
    private Integer readOnly;
    private Integer memberCount;
    private Long peerUserId;
    private String peerNickname;
    private String lastMessagePreview;
    private LocalDateTime lastMessageAt;
    private Integer unreadCount;
    private Integer mentionUnread;
    private String notificationMode;
    private Integer pinned;
}
