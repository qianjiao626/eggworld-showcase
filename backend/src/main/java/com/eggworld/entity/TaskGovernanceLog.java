package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务处置流水，对应表 task_governance_log。
 * <p>
 * 管理后台「任务管理」页的每一次处置（屏蔽 / 恢复 / 删除 / 退回审核）都追加一条，只增不改：
 * 同一条任务会被反复处置，「最后一次处置人」这类整行覆盖字段留不住过程，出了纠纷无法追溯。
 */
@Data
@TableName("task_governance_log")
public class TaskGovernanceLog {

    /** action 取值：屏蔽 */
    public static final String ACTION_HIDE = "hide";
    /** action 取值：恢复 */
    public static final String ACTION_RESTORE = "restore";
    /** action 取值：删除（逻辑删除） */
    public static final String ACTION_DELETE = "delete";
    /** action 取值：退回审核（打回 pending，重新进审核中心） */
    public static final String ACTION_RETURN_REVIEW = "return_review";

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 被处置的任务 ID */
    private Long taskId;

    /** 处置时的任务标题快照 */
    private String taskTitle;

    /** hide / restore / delete / return_review */
    private String action;

    /** 处置原因 */
    private String reason;

    /** 操作人用户 ID */
    private Long operatorId;

    /** 操作人昵称快照 */
    private String operatorName;

    private LocalDateTime createdAt;
}
