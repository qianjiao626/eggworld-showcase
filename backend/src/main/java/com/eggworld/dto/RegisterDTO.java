package com.eggworld.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 注册请求体：邮箱 + 验证码 + 密码 + 昵称
 */
@Data
public class RegisterDTO {

    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    private String email;

    /** 邮箱收到的 6 位验证码 */
    @NotBlank(message = "验证码不能为空")
    @Pattern(regexp = "^\\d{6}$", message = "验证码为6位数字")
    private String code;

    /** 密码：6~20 位，至少包含字母和数字 */
    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 20, message = "密码长度需在6-20位之间")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "密码需同时包含字母和数字")
    private String password;

    @NotBlank(message = "昵称不能为空")
    @Size(max = 20, message = "昵称最长20个字符")
    private String nickname;

    /** 邀请码（选填），注册时绑定邀请关系 */
    @Size(max = 20, message = "邀请码过长")
    private String inviteCode;
}
