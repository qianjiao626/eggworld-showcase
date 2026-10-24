package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务互评实体，对应表 ratings
 * 唯一约束 (task_id, rater_id, ratee_id) 防重复评价
 */
@Data
@TableName("ratings")
public class Rating {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long taskId;

    /** 评价者ID */
    private Long raterId;

    /** 被评价者ID */
    private Long rateeId;

    /** 评分 1-5 星 */
    private Integer score;

    private String comment;

    /** 评价者角色：publisher 发布者评认领者 / claimer 认领者评发布者 */
    private String raterRole;

    /** 任务类型冗余（teach/help/team），便于按类型统计与追溯 */
    private String taskType;

    /** 是否系统补录：0 用户真实评价 / 1 系统结算标记（不计入口碑均分，v3 起不再生成） */
    private Integer isAuto;

    /** 可见性：1 正常 / 0 已被管理员隐藏（申诉或不当评价），隐藏后不计口碑 */
    private Integer visible;

    /** 被评价者对这条评价的回复（有则展示在评价详情） */
    private String reply;

    private LocalDateTime createdAt;
}
