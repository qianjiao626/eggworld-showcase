package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 未读成就解锁（驱动红点与解锁弹窗）
 */
@Data
public class AchievementUnlockVO {

    /** user_achievements.id，用于标记已读 */
    private Long id;

    private String achKey;
    private String name;
    private String description;

    /** 获得的特效 key（可为空） */
    private String rewardEffectKey;
    /** 获得的特效中文名（可为空） */
    private String rewardEffectName;
    /** 获得的特效槽位（可为空） */
    private String rewardEffectSlot;
    /** 获得的称号文本（可为空） */
    private String rewardTitleName;
    /** 获得的称号样式 class（可为空） */
    private String rewardTitleStyle;

    private LocalDateTime unlockedAt;
}
