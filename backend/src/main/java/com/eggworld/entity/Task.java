package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务实体，对应表 tasks
 * 状态机：pending(待审核) → approved(已通过) → in_progress(进行中) → completed(已完成)
 * 组队型：approved(招募中) → full(已满员/招募已结束) → completed(已完成)
 * 异常态：rejected(驳回) / cancelled(取消) / expired(超时退回)
 */
@Data
@TableName("tasks")
public class Task {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String title;
    private String description;

    /** teach 教学 / help 求助 / team 组队 / reward 悬赏 */
    private String taskType;

    /** 技能大类：study/job/side/hobby/game/life */
    private String skillCategory;
    private String skillSub;

    /** 蛋蛋币金额 */
    private Integer reward;

    /** single 单人 / multiple 多人 */
    private String claimMode;

    /** 最大认领人数（组队型用） */
    private Integer maxClaimers;

    private String requirements;

    /**
     * 技能证明图片（task_proof_images.id），选填：
     * 发布者用来证明自己的技能/相关信息，任务详情页在「任务描述」之前展示。
     */
    private Long proofImageId;

    private Long publisherId;

    /** 发布者联系方式（仅配对后对认领者可见） */
    private String contact;

    /** 绑定的群聊会话ID（chat_conversations.id）：教学/组队任务上线时自动建群，其余类型为空 */
    private Long conversationId;

    /** pending/approved/rejected/in_progress/completed/cancelled/expired/full */
    private String status;

    private LocalDateTime signupDeadline;
    private LocalDateTime completeDeadline;

    /** 组队互评截止时间（确认完成 + 3 天），仅组队任务用 */
    private LocalDateTime rateDeadline;

    /** 组队互评结算标记：0 未结算 / 1 已结算 */
    private Integer settled;

    /** 优质标签：0 普通 / 1 优质（管理员标记） */
    private Integer featured;

    /** 逻辑删除：0 未删 / 1 已删 */
    private Integer deleted;

    /**
     * 屏蔽标记：0 正常 / 1 已屏蔽（管理后台「任务管理」页处置）。
     * 刻意不复用 status：status 是认领/评价依赖的工作流状态机，屏蔽只影响前台可见性。
     */
    private Integer hidden;

    /** 最近一次处置原因（屏蔽/删除时填写，恢复/退回审核时清空） */
    private String governanceReason;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
