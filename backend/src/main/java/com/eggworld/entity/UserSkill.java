package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 用户技能标签实体，对应表 user_skills
 * 一个用户可有多条技能标签，唯一约束 (user_id, skill)
 */
@Data
@TableName("user_skills")
public class UserSkill {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String skill;

    /** 展示排序（从 0 开始，按用户喜好），替代依赖自增 id 的隐式顺序 */
    private Integer sortOrder;
}
