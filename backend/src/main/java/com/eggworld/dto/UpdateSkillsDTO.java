package com.eggworld.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 更新用户技能标签请求体（全量替换：前端提交完整技能列表）
 */
@Data
public class UpdateSkillsDTO {

    @NotEmpty(message = "技能标签不能为空")
    @Size(max = 50, message = "技能标签最多50个")
    private List<@Size(max = 30, message = "单个技能最长30字") String> skills;
}
