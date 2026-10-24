package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChatSensitiveWordDTO {
    @NotBlank(message = "敏感词不能为空")
    @Size(max = 100, message = "敏感词最多100个字符")
    private String word;
    @Pattern(regexp = "review|block", message = "级别只能是review或block")
    private String level = "review";
    private Integer enabled = 1;
}
