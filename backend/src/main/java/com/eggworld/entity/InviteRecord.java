package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 邀请记录实体，对应表 invite_records
 * 邀请关系：inviter 邀请 invitee，invitee 发布首个任务后发放奖励
 */
@Data
@TableName("invite_records")
public class InviteRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 邀请人ID */
    private Long inviterId;

    /** 被邀请人ID（一人只能被绑定一次，唯一约束） */
    private Long inviteeId;

    /** pending 待发布任务 / rewarded 已发放 */
    private String status;

    /** 发放金额（已发放时为 20） */
    private Integer reward;

    private LocalDateTime createdAt;

    private LocalDateTime rewardedAt;
}
