package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;

/**
 * 提交大学吐槽请求
 * metrics 为 16 维评分：key（如 canteen/manage/dorm）→ 0-10 分
 */
@Data
public class SubmitComplaintDTO {

    @NotBlank(message = "请选择学校")
    @Size(max = 100, message = "学校名称过长")
    private String schoolName;

    @Size(max = 500, message = "吐槽内容过长")
    private String content;

    @NotNull(message = "请完成评分")
    private Map<String, Integer> metrics;
}
