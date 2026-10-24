package com.eggworld.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 审核驳回请求体（可选带原因）
 * - 首次审核驳回：任务置 rejected 并退回冻结币（原有行为）
 * - 修改稿驳回：原因会转达给发布者（我的任务里提示"修改未通过 + 原因"）
 */
@Data
public class RejectTaskDTO {

    @Size(max = 200, message = "驳回原因最长200个字符")
    private String reason;
}
