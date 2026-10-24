package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务修改稿，对应表 task_revisions（第二期）
 * 发布者对「已审核通过且无人认领」的任务提交修改 → 生成一条 pending 记录，任务回到 pending 等待重审；
 * 审核通过 → 把本记录的值写回 tasks（含证明图片 proofImageId）；审核驳回 → 记录置 rejected，任务按原内容恢复 approved。
 */
@Data
@TableName("task_revisions")
public class TaskRevision {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long taskId;

    /** pending 待审核 / approved 已采纳 / rejected 已驳回 */
    private String status;

    private String title;
    private String description;
    private String requirements;
    private String skillCategory;
    private String skillSub;
    private Integer reward;
    private String claimMode;
    private Integer maxClaimers;
    /**
     * 修改稿的证明图片（task_proof_images.id）。
     * 由服务层解析「沿用原图 / 替换 / 移除」后的**最终值**：NULL = 通过审核后任务没有证明图。
     * 因此审核中心可以直接拿它展示「通过后会用哪张图」。
     */
    private Long proofImageId;
    private String contact;
    private LocalDateTime signupDeadline;
    private LocalDateTime completeDeadline;

    /** 驳回原因（驳回时必填），用于在我的任务里提示发布者 */
    private String rejectReason;

    private LocalDateTime createdAt;
    private LocalDateTime reviewedAt;
}
