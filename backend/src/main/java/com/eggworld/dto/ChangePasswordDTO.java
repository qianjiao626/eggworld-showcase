package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 自助修改密码请求体（「我的信息」页）：校验当前密码，不走邮箱验证
 */
@Data
public class ChangePasswordDTO {

    /** 当前密码（用于确认本人操作） */
    @NotBlank(message = "请输入当前密码")
    private String oldPassword;

    /** 新密码：6~20 位，至少包含字母和数字（与注册一致） */
    @NotBlank(message = "新密码不能为空")
    @Size(min = 6, max = 20, message = "密码长度需在6-20位之间")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "密码需同时包含字母和数字")
    private String newPassword;
}
