package com.eggworld.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 认领任务请求体（联系方式选填）
 */
@Data
public class ClaimDTO {

    /** 认领者联系方式（微信号/手机号/QQ 等，配对后展示给发布者） */
    @Size(max = 200, message = "联系方式最长200字")
    private String contact;
}
