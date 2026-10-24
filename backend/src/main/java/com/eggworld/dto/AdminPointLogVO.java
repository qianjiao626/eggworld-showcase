package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资金详情：全局流水明细行（联表带出用户昵称与关联任务标题）
 */
@Data
public class AdminPointLogVO {

    private Long id;
    private LocalDateTime createdAt;

    private Long userId;
    /** 用户昵称（联表填充，非 point_logs 字段） */
    private String userNickname;

    /** 流水类型：reward/earn/spend/freeze/refund */
    private String type;
    /** 描述，如"完成任务获得" */
    private String label;

    /** 变动金额：正数增加，负数减少 */
    private Integer delta;
    /** 变动后余额 */
    private Integer balance;

    private Long taskId;
    /** 关联任务标题（联表填充，非 point_logs 字段） */
    private String taskTitle;
}
