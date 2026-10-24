package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 成就定义，对应表 achievements
 * 成就由种子数据维护，不做用户可写。
 */
@Data
@TableName("achievements")
public class Achievement {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 成就标识，如 ach_checkin_1 */
    private String achKey;

    private String name;

    /** checkin/publish/complete/team/rating/gossip/invite/complaint/meta */
    private String category;

    /** 条件描述（前端展示） */
    private String description;

    /** 判定类型，见 AchievementService 的 cond_type 分派 */
    private String condType;

    /** 阈值 */
    private Integer condValue;

    /** 奖励特效 key（deco 类名），可为空 */
    private String rewardEffectKey;

    /** 特效槽位 aura/cloak/outfit/frame/charm/skin，可为空 */
    private String rewardEffectSlot;

    /** 奖励称号 key，可为空 */
    private String rewardTitleKey;

    private Integer sortOrder;

    /** 1 启用 / 0 停用 */
    private Integer enabled;

    private java.time.LocalDateTime createdAt;
}
