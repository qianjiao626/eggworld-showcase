package com.eggworld.aspect;

import com.eggworld.common.BusinessException;
import com.eggworld.common.LoginUser;
import com.eggworld.common.PermCode;
import com.eggworld.common.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * @RequirePermission 权限点校验（AdminAspect.require）
 */
class AdminAspectPermissionTest {

    private final AdminAspect aspect = new AdminAspect();

    @AfterEach
    void clear() {
        UserContext.clear();
    }

    private LoginUser user(String role, Set<String> perms) {
        LoginUser u = new LoginUser(1L, role, "测试");
        u.setPermissions(perms);
        return u;
    }

    @Test
    void studentWithoutPermissionIsRejected() {
        UserContext.set(user("student", Set.of()));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> aspect.require(PermCode.CONTENT_REVIEW));
        assertEquals(403, ex.getCode());
    }

    @Test
    void studentWithPermissionPasses() {
        UserContext.set(user("student", Set.of(PermCode.CONTENT_REVIEW.code())));
        assertDoesNotThrow(() -> aspect.require(PermCode.CONTENT_REVIEW));
    }

    @Test
    void studentWithOtherPermissionIsRejected() {
        UserContext.set(user("student", Set.of(PermCode.DATA_DASHBOARD.code())));
        assertThrows(BusinessException.class, () -> aspect.require(PermCode.CONTENT_REVIEW));
    }

    @Test
    void adminAndSubAdminPassImplicitly() {
        UserContext.set(user("admin", Set.of()));
        assertDoesNotThrow(() -> aspect.require(PermCode.DATA_DASHBOARD));

        UserContext.set(user("subadmin", Set.of()));
        assertDoesNotThrow(() -> aspect.require(PermCode.DATA_DASHBOARD));
    }

    @Test
    void anonymousIsRejected() {
        UserContext.clear();
        assertThrows(BusinessException.class, () -> aspect.require(PermCode.CONTENT_REVIEW));
    }
}
