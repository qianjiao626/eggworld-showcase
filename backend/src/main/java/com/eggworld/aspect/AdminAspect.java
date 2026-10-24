package com.eggworld.aspect;

import com.eggworld.annotation.RequirePermission;
import com.eggworld.common.BusinessException;
import com.eggworld.common.LoginUser;
import com.eggworld.common.PermCode;
import com.eggworld.common.UserContext;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.stereotype.Component;

/**
 * 管理权限切面
 * @AdminOnly   → 仅主管理员（用户管理/反馈/封禁）
 * @ModeratorOnly → 主管理员或副管理员（官方任务/审核）
 * @RequirePermission → 持有指定权限点（主/副管理员隐式通过；见 user_permissions）
 */
@Aspect
@Component
public class AdminAspect {

    @Before("@annotation(com.eggworld.annotation.AdminOnly)")
    public void checkAdmin() {
        if (UserContext.get() == null || !UserContext.get().isAdmin()) {
            throw new BusinessException(403, "无权限：仅管理员可操作");
        }
    }

    @Before("@annotation(com.eggworld.annotation.ModeratorOnly)")
    public void checkModerator() {
        if (UserContext.get() == null || !UserContext.get().isModerator()) {
            throw new BusinessException(403, "无权限：仅管理员或副管理员可操作");
        }
    }

    @Before("@annotation(requirePermission)")
    public void checkPermission(RequirePermission requirePermission) {
        require(requirePermission.value());
    }

    /** 校验当前用户是否持有权限点（独立出来便于单测） */
    public void require(PermCode perm) {
        LoginUser user = UserContext.get();
        if (user == null || !user.hasPermission(perm)) {
            throw new BusinessException(403, "无权限：需要「" + perm.label() + "」权限");
        }
    }
}
