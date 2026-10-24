package com.eggworld.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 发送验证码请求体
 */
@Data
public class SendCodeDTO {

    /** 目标邮箱 */
    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    private String email;
}
