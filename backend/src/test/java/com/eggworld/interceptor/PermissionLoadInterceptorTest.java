package com.eggworld.interceptor;

import com.eggworld.common.LoginUser;
import com.eggworld.common.PermCode;
import com.eggworld.common.UserContext;
import com.eggworld.entity.UserPermission;
import com.eggworld.mapper.UserPermissionMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 权限点加载拦截器：把 user_permissions 装进当前登录用户
 */
class PermissionLoadInterceptorTest {

    private final UserPermissionMapper mapper = mock(UserPermissionMapper.class);
    private final PermissionLoadInterceptor interceptor = new PermissionLoadInterceptor(mapper);

    @AfterEach
    void clear() {
        UserContext.clear();
    }

    @Test
    void loadsCodesIntoCurrentUser() {
        UserPermission row = new UserPermission();
        row.setUserId(7L);
        row.setPermCode(PermCode.CONTENT_REVIEW.code());
        when(mapper.selectList(any())).thenReturn(List.of(row));

        LoginUser user = new LoginUser(7L, "student", "同学");
        UserContext.set(user);

        interceptor.preHandle(null, null, null);

        assertTrue(user.hasPermission(PermCode.CONTENT_REVIEW));
    }

    @Test
    void doesNothingWhenAnonymous() {
        UserContext.clear();
        assertDoesNotThrow(() -> interceptor.preHandle(null, null, null));
        verifyNoInteractions(mapper);
    }
}
