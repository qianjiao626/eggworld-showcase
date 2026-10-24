package com.eggworld.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

/**
 * 登录/查询返回的用户完整信息（脱敏：不含密码）
 */
@Data
public class UserProfileVO {

    private Long id;
    private String nickname;
    private String email;
    private String role;
    private String school;
    private String major;
    private String city;
    private String grade;
    private Integer age;
    private String bio;
    private String mbtiType;
    private String mbtiGroup;
    private Integer points;
    private Integer exp;
    private Integer likes;
    private BigDecimal reputation;

    /** 收到的评价人数（口碑样本数，0 表示尚无评价） */
    private Integer ratingCount;
    private String eggCategory;
    private String eggRarity;
    private String inviteCode;

    private LocalDateTime createdAt;

    /** 排名：经验值高于我的人数 + 1 */
    private Integer rank;

    /** 全站用户总数 */
    private Integer total;

    /** 五维属性 */
    private StatsVO stats;

    /** 角色解锁状态（6 个分类） */
    private List<CharacterVO> characters;

    /**
     * 学生协管员持有的权限点编码（驱动前端「协管」入口显隐）
     * 主管理员 / 副管理员对所有权限点隐式通过，不在此列
     */
    private Set<String> permissions;

    @Data
    public static class StatsVO {
        private BigDecimal knowledge;
        private BigDecimal skills;
        private BigDecimal charm;
        private BigDecimal money;
        private BigDecimal reputation;
    }

    @Data
    public static class CharacterVO {
        private String category;
        private Boolean unlocked;
        private Integer count;
        private Boolean current;
    }
}
