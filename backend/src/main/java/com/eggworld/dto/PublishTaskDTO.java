package com.eggworld.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 发布任务请求体
 */
@Data
public class PublishTaskDTO {

    @NotBlank(message = "任务标题不能为空")
    @Size(max = 50, message = "任务标题最长50个字符")
    private String title;

    @Size(max = 2000, message = "任务描述最长2000个字符")
    private String description;

    /** teach 教学 / help 求助 / team 组队 / reward 奖励型（蛋总任务） */
    @NotBlank(message = "任务类型不能为空")
    @Pattern(regexp = "^(teach|help|team|reward)$", message = "任务类型仅支持 teach/help/team/reward")
    private String taskType;

    /** study/job/side/hobby/game/life */
    @NotBlank(message = "技能分类不能为空")
    private String skillCategory;

    @Size(max = 50, message = "技能子类最长50个字符")
    private String skillSub;

    @NotNull(message = "蛋蛋币金额不能为空")
    @Min(value = 1, message = "蛋蛋币金额至少为1")
    @Max(value = 10000, message = "蛋蛋币金额不能超过10000")
    private Integer reward;

    /** single 单人 / multiple 多人 */
    private String claimMode;

    /** 最大认领人数（组队型必填） */
    @Min(value = 1, message = "最大认领人数至少为1")
    @Max(value = 50, message = "最大认领人数不能超过50")
    private Integer maxClaimers;

    @Size(max = 500, message = "参与要求最长500个字符")
    private String requirements;

    /**
     * 技能证明图片（选填）：先调 POST /api/tasks/proof-images 拿 id，再随发布请求回填。
     * 用于让认领者核实发布者的技能或相关信息，展示在任务详情页「任务描述」之前。
     */
    @Min(value = 1, message = "证明图片 ID 不合法")
    private Long proofImageId;

    /** 发布者联系方式（配对后展示给认领者） */
    @Size(max = 200, message = "联系方式最长200个字符")
    private String contact;

    private LocalDateTime signupDeadline;
    private LocalDateTime completeDeadline;
}
