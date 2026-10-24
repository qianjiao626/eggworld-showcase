package com.eggworld.interceptor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.entity.UserPermission;
import com.eggworld.mapper.UserPermissionMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Set;
import java.util.stream.Collectors;

/**
 * 权限点加载拦截器（授权）
 *
 * <p>职责分离：{@link JwtInterceptor} 负责认证 / 封禁 / 角色归一，
 * 本拦截器负责把当前用户的权限点回库加载进 {@link UserContext} 中的 {@link LoginUser}，
 * 使「授权 / 收回」即时生效、无需重登（沿用 sub_admin 的做法）。
 *
 * <p>必须注册在 JwtInterceptor <b>之后</b>（order 更大），否则取不到登录态。
 */
@Component
@RequiredArgsConstructor
public class PermissionLoadInterceptor implements HandlerInterceptor {

    private final UserPermissionMapper userPermissionMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        LoginUser user = UserContext.get();
        if (user != null) {
            user.setPermissions(loadCodes(user.getId()));
        }
        return true;
    }

    /** 回库加载权限点编码（user_permissions） */
    private Set<String> loadCodes(Long userId) {
        if (userId == null) {
            return Set.of();
        }
        return userPermissionMapper.selectList(
                        new LambdaQueryWrapper<UserPermission>().eq(UserPermission::getUserId, userId))
                .stream()
                .map(UserPermission::getPermCode)
                .collect(Collectors.toSet());
    }
}
