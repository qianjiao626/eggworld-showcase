package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 发布打听请求
 */
@Data
public class PublishGossipDTO {

    @NotBlank(message = "请填写打听内容")
    @Size(max = 200, message = "打听内容过长")
    private String title;

    @Size(max = 2000, message = "描述过长")
    private String description;

    /** 分类标签（校园/导师/职场/学业等） */
    private String tag;

    /** 悬赏蛋蛋币（默认 1） */
    private Integer bounty;
}
