package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 聊天室管理操作审计；业务上禁止删除。 */
@Data
@TableName("chat_audit_logs")
public class ChatAuditLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long operatorId;
    private String action;
    private String targetType;
    private Long targetId;
    private String detailJson;
    private String ip;
    private LocalDateTime createdAt;
}
