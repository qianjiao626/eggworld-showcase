package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 我的邀请列表（统计 + 记录）
 */
@Data
public class InviteListVO {

    /** 邀请总人数 */
    private Long count;

    /** 已获得蛋蛋币 */
    private Integer earned;

    private List<InviteItemVO> records;

    @Data
    public static class InviteItemVO {
        private Long inviteeId;
        private String inviteeNickname;
        /** pending 待发布任务 / rewarded 已发放 */
        private String status;
        private Integer reward;
        private LocalDateTime createdAt;
        private LocalDateTime rewardedAt;
    }
}
