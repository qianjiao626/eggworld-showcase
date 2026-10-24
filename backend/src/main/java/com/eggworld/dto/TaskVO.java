package com.eggworld.dto;

import com.eggworld.entity.Task;
import com.eggworld.entity.TaskRevision;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 任务详情/列表视图
 * 组合任务本身 + 发布者信息 + 按可见性脱敏的联系方式
 */
@Data
public class TaskVO {

    /** 任务核心字段 */
    private Task task;

    /** 发布者昵称 */
    private String publisherNickname;

    /** 发布者角色（admin/student），前端据此展示管理员专用形象，避免用昵称猜测 */
    private String publisherRole;

    /** 发布者学校 */
    private String publisherSchool;

    /**
     * 发布者当前蛋分类（study/job/side/hobby/game/life），可能为空（用户没选过蛋）。
     * 前端任务卡片据此展示与「用户名片」一致的蛋形象；为空时退回任务技能分类。
     */
    private String publisherEggCategory;

    /** 发布者角色稀有度 */
    private String publisherRarity;

    /** 发布者口碑 */
    private BigDecimal publisherReputation;

    /**
     * 联系方式（按可见性规则填充）：
     * 仅发布者本人，或已配对（task_claims 处于 in_progress/submitted）的认领者可见
     */
    private String contact;

    /** 当前登录用户对该任务的认领状态（未认领为 null） */
    private String myClaimStatus;

    /** 发布者视角：被选中认领者的状态（submitted 时发布者才可确认完成） */
    private String selectedClaimStatus;

    /** 已认领人数（组队型限量判断用） */
    private Integer claimCount;

    /**
     * 已入队人数（组队型：被发布者选中且仍在队内的人数；其他类型恒为 0）。
     * 组队型「未满员时任务继续招募」的口径就是它，而非 claimCount（报名只是候选池）。
     */
    private Integer memberCount;

    /**
     * 待审核的修改稿（第二期）：任务处于 pending 且有 pending 修改稿时填充。
     * 审核中心用它渲染「修改前（task 里的旧值）vs 修改后（这里的新值）」对比。
     */
    private TaskRevision pendingRevision;

    /**
     * 最近一次被驳回的修改稿（仅发布者本人可见）：
     * 用于在「我的任务」里提示"该任务的修改未通过 + 原因"。
     */
    private TaskRevision lastRejectedRevision;
}
