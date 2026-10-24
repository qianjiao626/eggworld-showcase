package com.eggworld.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 修改任务请求体（第二期）
 * 可改：标题 / 描述 / 参与要求 / 技能分类与子类 / 蛋蛋币 / 认领模式与最大人数 / 联系方式 / 两个截止时间。
 * 不可改：任务类型（改了会翻转蛋蛋币方向与冻结口径，故不开放）。
 */
@Data
public class EditTaskDTO {

    @NotBlank(message = "任务标题不能为空")
    @Size(max = 50, message = "任务标题最长50个字符")
    private String title;

    @Size(max = 2000, message = "任务描述最长2000个字符")
    private String description;

    @Size(max = 500, message = "参与要求最长500个字符")
    private String requirements;

    @NotBlank(message = "技能分类不能为空")
    private String skillCategory;

    @Size(max = 50, message = "技能子类最长50个字符")
    private String skillSub;

    @NotNull(message = "蛋蛋币金额不能为空")
    @Min(value = 1, message = "蛋蛋币金额至少为1")
    @Max(value = 10000, message = "蛋蛋币金额不能超过10000")
    private Integer reward;

    /** single / multiple */
    private String claimMode;

    @Min(value = 1, message = "最大认领人数至少为1")
    @Max(value = 50, message = "最大认领人数不能超过50")
    private Integer maxClaimers;

    @Size(max = 200, message = "联系方式最长200个字符")
    private String contact;

    /**
     * 修改稿要用的证明图片 id（task_proof_images.id）。
     * 为空 = 本次不改动证明图（沿用任务当前那张）；有值 = 通过审核后换成这张。
     */
    private Long proofImageId;

    /** true = 本次修改移除证明图片（与 proofImageId 同时给出时以「移除」为准） */
    private Boolean clearProofImage;

    private LocalDateTime signupDeadline;
    private LocalDateTime completeDeadline;
}
