package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 权限操作审计，对应表 permission_audit
 * 每次授予 / 收回按人写一条，供后台「审计记录」弹层查询
 */
@Data
@TableName("permission_audit")
public class PermissionAudit {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 操作人ID */
    private Long operatorId;

    /** 被操作用户ID */
    private Long targetUserId;

    /** 权限点 */
    private String permCode;

    /** 动作：grant / revoke */
    private String action;

    private LocalDateTime createdAt;
}
