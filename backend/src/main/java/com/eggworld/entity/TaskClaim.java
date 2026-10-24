package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务认领实体，对应表 task_claims
 * 状态机：pending_pairing(待配对) → in_progress(进行中) → submitted(已提交) → completed(已完成)
 * 异常态：rejected(未被选中) / cancelled(取消)
 */
@Data
@TableName("task_claims")
public class TaskClaim {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long taskId;
    private Long claimerId;

    /** pending_pairing/in_progress/submitted/completed/rejected/cancelled */
    private String status;

    /** 认领者联系方式（配对后对发布者可见） */
    private String claimerContact;

    /** 是否被发布者选中：0 否 / 1 是 */
    private Integer selected;

    private LocalDateTime pairedAt;
    private LocalDateTime submittedAt;
    private LocalDateTime completedAt;

    private LocalDateTime createdAt;
}
