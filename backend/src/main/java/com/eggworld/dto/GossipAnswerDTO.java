package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 回答打听请求
 */
@Data
public class GossipAnswerDTO {

    @NotBlank(message = "请填写回答内容")
    @Size(max = 2000, message = "回答过长")
    private String content;
}
