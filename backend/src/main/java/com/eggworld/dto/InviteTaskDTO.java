package com.eggworld.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 邀请发布任务请求体
 */
@Data
public class InviteTaskDTO {

    /** 邀请对方发布的技能标签 */
    @NotEmpty(message = "请至少选择一个技能")
    @Size(max = 10, message = "最多选择10个技能")
    private List<@Size(max = 20, message = "单个技能名最长20个字符") String> skills;
}
