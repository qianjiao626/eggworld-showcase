package com.eggworld.config;

import com.eggworld.interceptor.JwtInterceptor;
import com.eggworld.interceptor.ApiTrafficInterceptor;
import com.eggworld.interceptor.ModuleAvailabilityInterceptor;
import com.eggworld.interceptor.PermissionLoadInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * MVC 配置：注册 JWT 拦截器 + 跨域
 */
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final JwtInterceptor jwtInterceptor;
    private final ApiTrafficInterceptor apiTrafficInterceptor;
    private final ModuleAvailabilityInterceptor moduleAvailabilityInterceptor;
    private final PermissionLoadInterceptor permissionLoadInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(apiTrafficInterceptor).order(-20).addPathPatterns("/api/**");
        registry.addInterceptor(apiTrafficInterceptor.accountLimits()).order(10).addPathPatterns("/api/**");
        registry.addInterceptor(jwtInterceptor)
                // 拦截所有 /api/** 接口
                .addPathPatterns("/api/**")
                // 放行无需登录的接口：健康检查 + 认证相关 + 学生工坊排序（公开只读）
                .excludePathPatterns(
                        "/api/health",
                        "/api/auth/login",
                        "/api/auth/register",
                        "/api/auth/reset-password",
                        "/api/auth/send-code",
                        "/api/workshop/order",
                        /* 公开分享的职业测评报告：只读快照，凭随机令牌访问 */
                        "/api/resume/career/shared/*"
                );
        // 权限点加载：跑在 JwtInterceptor（默认 order 0）之后、进入 Controller 之前，
        // 把当前用户的权限点回库装进 UserContext，供 @RequirePermission 与前端入口显隐使用。
        registry.addInterceptor(permissionLoadInterceptor).order(5).addPathPatterns("/api/**");
        // 职业测评 / 宠物系统 / 猫舍本轮不建表：缺表时给可读的「该功能暂未开放」，而不是 500 + SQL 原文。
        // order 20 = 跑在 JwtInterceptor 之后（匿名先 401），进入 Controller 之前拦下。
        registry.addInterceptor(moduleAvailabilityInterceptor).order(20)
                .addPathPatterns("/api/career-test/**", "/api/pets/**", "/api/cats/**");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // 生产仅允许两个 HTTPS 来源；:[*] 是 Spring 的任意端口语法（含默认端口）。
        registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "https://dsxnb.com",
                        "https://www.dsxnb.com",
                        "http://localhost:[*]",
                        "http://127.0.0.1:[*]"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
