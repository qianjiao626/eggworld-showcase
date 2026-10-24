package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import java.util.List;

@Data
public class ChatCreateGroupDTO {
    @NotBlank(message = "群名称不能为空")
    @Size(max = 100, message = "群名称最多100个字符")
    private String name;
    @Size(max = 500, message = "群简介最多500个字符")
    private String description;
    private String visibility = "private";
    private List<Long> memberIds;
}
