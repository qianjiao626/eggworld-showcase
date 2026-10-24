package com.eggworld.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 管理类权限（主管理员 或 副管理员）：
 * 副管理员可发布官方任务、审核任务；用户管理/反馈/封禁等仍仅主管理员（用 @AdminOnly）
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ModeratorOnly {
}
