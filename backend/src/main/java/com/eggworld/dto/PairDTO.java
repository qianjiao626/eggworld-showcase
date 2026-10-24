package com.eggworld.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

/**
 * 确认配对请求体：发布者从认领者中选择
 * 组队型可多选（多人平分），教学/求助单选
 */
@Data
public class PairDTO {

    /** 被选中的认领者ID列表 */
    @NotEmpty(message = "请选择要配对的认领者")
    private List<Long> claimerIds;
}
