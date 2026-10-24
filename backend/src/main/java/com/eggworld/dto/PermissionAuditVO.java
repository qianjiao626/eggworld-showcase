package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 权限操作审计列表项（含操作人 / 被操作人昵称）
 */
@Data
public class PermissionAuditVO {

    private Long id;
    private Long operatorId;
    private String operatorNickname;
    private Long targetUserId;
    private String targetNickname;
    private String permCode;

    /** grant / revoke */
    private String action;

    private LocalDateTime createdAt;
}
