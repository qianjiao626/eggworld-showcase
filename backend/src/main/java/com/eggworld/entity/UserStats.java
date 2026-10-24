package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 用户五维属性实体，对应表 user_stats
 * 与 users 一对一，主键即 user_id
 */
@Data
@TableName("user_stats")
public class UserStats {

    @TableId
    private Long userId;

    /** 学识值 0-10 */
    private BigDecimal knowledge;

    /** 打工值 0-10 */
    private BigDecimal skills;

    /** 魅力值 0-10 */
    private BigDecimal charm;

    /** 搞钱值 0-10 */
    private BigDecimal money;

    /** 口碑值 0-5 */
    private BigDecimal reputation;
}
