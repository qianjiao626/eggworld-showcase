package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户实体，对应表 users
 * 密码用 BCrypt 哈希存储，永不返回给前端
 */
@Data
@TableName("users")
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String nickname;

    /** 邮箱：登录凭证，唯一 */
    private String email;

    /** BCrypt 密码哈希，序列化时脱敏 */
    private String passwordHash;

    /** student / admin */
    private String role;

    private String school;
    private String major;
    private String city;
    private String grade;
    private Integer age;
    private String bio;

    /** MBTI 类型，如 INTJ */
    private String mbtiType;

    /** MBTI 分组：NT/NF/SJ/SP（由 mbtiType 自动推导） */
    private String mbtiGroup;

    /** 蛋蛋币余额，初始 100 */
    private Integer points;

    /** 经验值：每完成一个任务 +10（决定称号/经验榜） */
    private Integer exp;

    /** 获赞数 */
    private Integer likes;

    /** 口碑值（评价均分） */
    private java.math.BigDecimal reputation;

    private String eggCategory;
    private String eggRarity;
    private String inviteCode;

    /** 封禁：0 正常 / 1 已封禁（登录与已有 token 均被拒绝） */
    private Integer banned;

    /** 副管理员：0 否 / 1 是（可发布官方任务、审核任务，后台仅见官方任务与审核中心） */
    private Integer subAdmin;

    /** 逻辑删除：0 未删 / 1 已删 */
    private Integer deleted;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
