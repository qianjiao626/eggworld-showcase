package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 角色解锁实体，对应表 user_characters
 * 每个用户 6 条：study/job/side/hobby/game/life
 */
@Data
@TableName("user_characters")
public class UserCharacter {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 角色分类：study/job/side/hobby/game/life */
    private String category;

    /** 是否解锁：0 否 / 1 是 */
    private Integer unlocked;

    /** 该分类完成任务数 */
    private Integer count;

    /** 是否当前使用：0 否 / 1 是 */
    private Integer isCurrent;
}
