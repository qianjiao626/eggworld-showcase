package com.eggworld.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 重新发布过期任务请求体
 * 只带报名截止天数：任务内容（标题/描述/报酬/类型/联系方式）一律不可改，
 * 所以重新发布可以免审核直接上线，不会成为绕过审核改内容的通道。
 */
@Data
public class RenewTaskDTO {

    /** 新的报名截止：发布后 N 天（当天 23:59:59 截止） */
    @NotNull(message = "请选择报名截止天数")
    @Min(value = 1, message = "报名截止至少 1 天")
    @Max(value = 365, message = "报名截止最长 365 天")
    private Integer signupDays;
}
