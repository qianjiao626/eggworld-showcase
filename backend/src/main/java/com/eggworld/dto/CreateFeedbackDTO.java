package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 用户提交反馈工单请求体
 */
@Data
public class CreateFeedbackDTO {

    @NotBlank(message = "反馈内容不能为空")
    @Size(max = 2000, message = "反馈内容最长2000个字符")
    private String content;

    /** 反馈类型：bug/suggestion/report/other（缺省 other，服务端按白名单校验） */
    @Size(max = 20, message = "反馈类型不合法")
    private String type;

    /** 联系方式（选填） */
    @Size(max = 200, message = "联系方式最长200个字符")
    private String contact;
}
