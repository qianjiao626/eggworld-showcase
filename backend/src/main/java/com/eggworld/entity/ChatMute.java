package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 全站或会话内禁言记录。 */
@Data
@TableName("chat_mutes")
public class ChatMute {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String scope;
    private Long conversationId;
    private Long userId;
    private Long operatorId;
    private String reason;
    private LocalDateTime mutedAt;
    private LocalDateTime mutedUntil;
    private LocalDateTime revokedAt;
    private Long revokedBy;
    private LocalDateTime createdAt;
}
