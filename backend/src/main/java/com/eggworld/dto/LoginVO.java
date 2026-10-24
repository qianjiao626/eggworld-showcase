package com.eggworld.dto;

import lombok.Data;

/**
 * 登录成功响应体
 */
@Data
public class LoginVO {

    /** JWT token，前端存 localStorage，后续请求带 Authorization 头 */
    private String token;

    /** 用户基本信息 */
    private UserProfileVO user;
}
