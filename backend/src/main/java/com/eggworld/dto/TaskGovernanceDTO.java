package com.eggworld.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 任务处置入参（管理后台「任务管理」页）。
 * <p>
 * 是否必填原因由接口语义决定（屏蔽 / 删除必填、恢复 / 退回审核选填），
 * 因此这里只做长度上限，必填校验放在 service 层，便于给出更贴切的中文提示。
 */
@Data
public class TaskGovernanceDTO {

    /** 处置原因，最长 200 字 */
    @Size(max = 200, message = "处置原因最长200个字符")
    private String reason;
}
