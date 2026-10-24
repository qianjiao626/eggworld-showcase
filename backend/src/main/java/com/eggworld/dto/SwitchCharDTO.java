package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 切换角色请求体
 * category 为 6 大角色分类之一（study/job/side/hobby/game/life）
 */
@Data
public class SwitchCharDTO {

    /** 目标角色分类 */
    @NotBlank(message = "请选择角色")
    private String category;
}
