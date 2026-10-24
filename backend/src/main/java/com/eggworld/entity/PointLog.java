package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 蛋蛋币流水实体，对应表 point_logs
 * 类型：earn(获得)/spend(支出)/freeze(冻结)/refund(退回)/reward(奖励)
 */
@Data
@TableName("point_logs")
public class PointLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 变动类型：earn/spend/freeze/refund/reward */
    private String type;

    /** 描述，如"完成任务获得" */
    private String label;

    /** 变动金额：正数增加，负数减少 */
    private Integer delta;

    /** 变动后的余额 */
    private Integer balance;

    /** 关联任务ID（非任务相关可空） */
    private Long taskId;

    private LocalDateTime createdAt;
}
