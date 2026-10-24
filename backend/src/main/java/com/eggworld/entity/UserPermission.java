package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户权限点，对应表 user_permissions
 * 当前授权状态的唯一权威源；权限点写死在代码里（{@link com.eggworld.common.PermCode}）
 */
@Data
@TableName("user_permissions")
public class UserPermission {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 被授权用户ID */
    private Long userId;

    /** 权限点：content_review / data_dashboard */
    private String permCode;

    /** 授权操作人ID */
    private Long grantedBy;

    private LocalDateTime grantedAt;
}
