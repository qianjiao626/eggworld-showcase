package com.eggworld.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 管理员权限注解
 * 标注在 Controller 方法上，由 AdminAspect 拦截校验
 * 非 admin 角色访问 → 403
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AdminOnly {
}
