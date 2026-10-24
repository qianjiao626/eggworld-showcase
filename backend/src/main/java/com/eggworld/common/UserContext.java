package com.eggworld.common;

/**
 * 当前登录用户上下文（ThreadLocal 实现）
 * 拦截器解析 JWT 后写入，controller/service 中随时可取
 */
public class UserContext {

    private static final ThreadLocal<LoginUser> HOLDER = new ThreadLocal<>();

    public static void set(LoginUser user) {
        HOLDER.set(user);
    }

    public static LoginUser get() {
        return HOLDER.get();
    }

    /** 获取当前登录用户 ID（未登录返回 null） */
    public static Long userId() {
        LoginUser user = HOLDER.get();
        return user == null ? null : user.getId();
    }

    /** 请求结束后必须清理，防止线程池复用导致串号 */
    public static void clear() {
        HOLDER.remove();
    }
}
