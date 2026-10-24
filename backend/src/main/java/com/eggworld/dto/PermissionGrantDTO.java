package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

/**
 * 批量授予 / 收回权限点入参
 */
@Data
public class PermissionGrantDTO {

    /** 目标用户ID列表（后端去重后逐人处理） */
    @NotEmpty(message = "请至少选择一名用户")
    private List<Long> userIds;

    /** 权限点编码，见 PermCode */
    @NotBlank(message = "权限点不能为空")
    private String permCode;
}
