package com.eggworld.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 管理端查看单个用户的总览（资料 + 行为统计，脱敏：不含密码）
 */
@Data
public class AdminUserOverviewVO {

    /** 用户完整资料（复用登录态 profile：基本信息 + 五维 + 角色解锁） */
    private UserProfileVO profile;

    /** 发布任务总数 */
    private Long publishedCount;

    /** 认领任务总数（认领记录数） */
    private Long claimedCount;

    /** 作为发布者"进行中"的任务数 */
    private Long publishedActiveCount;

    /** 作为认领者已完成的任务数 */
    private Long completedCount;

    /** 收到的评价均分（无记录为 0） */
    private BigDecimal receivedRatingAvg;

    /** 收到的评价总数 */
    private Long receivedRatingCount;

    /** 成功邀请注册人数（邀请奖励已发放） */
    private Long inviteCount;
}
