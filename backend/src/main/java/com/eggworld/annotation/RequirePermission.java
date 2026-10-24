package com.eggworld.annotation;

import com.eggworld.common.PermCode;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 权限点校验：要求当前登录用户持有指定权限点。
 *
 * <p>两段式权限模型（用户 → 权限点）；主管理员 / 副管理员隐式通过所有权限点，
 * 现有主 / 副管理员逻辑不受影响。校验实现见 {@code AdminAspect}。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {

    /** 要求的权限点 */
    PermCode value();
}
