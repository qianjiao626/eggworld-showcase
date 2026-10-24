package com.eggworld.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 管理后台用户列表项（脱敏：不含密码）
 */
@Data
public class AdminUserVO {

    private Long id;
    private String nickname;
    private String email;
    private String role;
    private String school;
    private String major;
    private String mbtiType;
    private Integer points;
    private Integer exp;
    private BigDecimal reputation;
    /** 封禁标记：0 正常 / 1 已封禁 */
    private Integer banned;
    /** 副管理员标记：0 否 / 1 是 */
    private Integer subAdmin;
    private LocalDateTime createdAt;
    /** 有效邀请人数：invite_records 中 status = rewarded 的条数（被邀请人已发布首个任务、奖励已发） */
    private Long inviteCount;
    /** 待发奖励的邀请人数：status = pending 的条数（已注册但尚未激活） */
    private Long invitePendingCount;
}
