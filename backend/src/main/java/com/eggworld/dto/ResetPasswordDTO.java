package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 管理员重置用户密码请求体：仅新密码
 */
@Data
public class ResetPasswordDTO {

    /** 新密码：6~20 位，至少包含字母和数字（与注册一致） */
    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 20, message = "密码长度需在6-20位之间")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "密码需同时包含字母和数字")
    private String password;
}
