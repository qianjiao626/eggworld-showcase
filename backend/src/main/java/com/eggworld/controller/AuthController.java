package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.dto.LoginDTO;
import com.eggworld.dto.LoginVO;
import com.eggworld.dto.RegisterDTO;
import com.eggworld.dto.ResetPasswordByEmailDTO;
import com.eggworld.dto.SendCodeDTO;
import com.eggworld.service.AuthService;
import com.eggworld.service.VerifyCodeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证接口（Task 3/4/5）
 * - POST /api/auth/send-code  发送邮箱验证码
 * - POST /api/auth/register   注册（验证码 + 设置密码）
 * - POST /api/auth/login      登录（邮箱 + 密码）
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final VerifyCodeService verifyCodeService;
    private final com.eggworld.interceptor.ApiTrafficInterceptor traffic;

    /** 发送邮箱验证码 */
    @PostMapping("/send-code")
    public Result<Void> sendCode(@Valid @RequestBody SendCodeDTO dto) {
        verifyCodeService.sendCode(dto.getEmail());
        return Result.ok();
    }

    /** 注册 */
    @PostMapping("/register")
    public Result<Void> register(@Valid @RequestBody RegisterDTO dto) {
        traffic.limitAuthentication(dto.getEmail());
        authService.register(dto);
        return Result.ok();
    }

    /** 忘记密码：邮箱验证码校验通过后重设密码（无需登录态） */
    @PostMapping("/reset-password")
    public Result<Void> resetPassword(@Valid @RequestBody ResetPasswordByEmailDTO dto) {
        traffic.limitAuthentication(dto.getEmail());
        authService.resetPassword(dto.getEmail(), dto.getCode(), dto.getPassword());
        return Result.ok();
    }

    /** 登录，返回 token + 用户信息 */
    @PostMapping("/login")
    public Result<LoginVO> login(@Valid @RequestBody LoginDTO dto) {
        traffic.limitAuthentication(dto.getEmail());
        return Result.ok(authService.login(dto));
    }
}
