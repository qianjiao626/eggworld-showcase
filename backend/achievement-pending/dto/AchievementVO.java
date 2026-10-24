package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 成就（成就页数据源：定义 + 我的进度 + 解锁状态 + 奖励明细）
 */
@Data
public class AchievementVO {

    private Long id;
    private String achKey;
    private String name;
    private String category;
    private String description;
    private Integer condValue;
    private Integer sortOrder;

    /* ===== 奖励明细 ===== */
    /** 奖励特效 key（可为空） */
    private String rewardEffectKey;
    /** 奖励特效槽位（可为空） */
    private String rewardEffectSlot;
    /** 奖励特效中文名（由 Service 填充） */
    private String rewardEffectName;
    /** 奖励称号 key（可为空） */
    private String rewardTitleKey;
    /** 奖励称号文本（由 Service 填充） */
    private String rewardTitleName;
    /** 奖励称号样式 class（由 Service 填充） */
    private String rewardTitleStyle;

    /* ===== 我的进度 ===== */
    private boolean unlocked;
    private LocalDateTime unlockedAt;
    /** 当前进度值 */
    private int progress;
    /** 目标值（= condValue） */
    private int target;
}
