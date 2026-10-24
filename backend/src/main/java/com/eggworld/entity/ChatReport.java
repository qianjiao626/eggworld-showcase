package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 聊天举报，可关联现有反馈工单。 */
@Data
@TableName("chat_reports")
public class ChatReport {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long reporterId;
    private Long conversationId;
    private Long messageId;
    private Long targetUserId;
    private String reason;
    private String detail;
    private String contextJson;
    private String status;
    private Long ticketId;
    private Long handledBy;
    private LocalDateTime handledAt;
    private LocalDateTime createdAt;
}
