package com.eggworld.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 用户公开信息（跨用户主页展示，脱敏：不含 email/inviteCode）
 */
@Data
public class UserPublicVO {

    private Long id;
    private String nickname;
    private String role;

    private String school;
    private String major;
    private String city;
    private String grade;
    private Integer age;
    private String bio;
    private String mbtiType;
    private String mbtiGroup;

    /** 蛋蛋币余额（排行榜/名片展示） */
    private Integer points;
    private Integer exp;
    private Integer likes;

    /** 当前登录用户是否已点赞（未登录为 false） */
    private Boolean likedByMe;
    private BigDecimal reputation;

    /** 收到的评价人数（口碑样本数，0 表示尚无评价） */
    private Integer ratingCount;
    private String eggCategory;
    private String eggRarity;

    private LocalDateTime createdAt;

    /** 五维属性 */
    private UserProfileVO.StatsVO stats;

    /** 角色解锁状态 */
    private List<UserProfileVO.CharacterVO> characters;

    /** 技能标签 */
    private List<String> skills;
}
