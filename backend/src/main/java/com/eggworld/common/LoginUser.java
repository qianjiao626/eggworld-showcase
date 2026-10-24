package com.eggworld.common;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashSet;
import java.util.Set;

/**
 * 当前登录用户信息（从 JWT 解析而来，存入 ThreadLocal）
 */
@Data
@NoArgsConstructor
public class LoginUser {
    private Long id;
    private String role;
    private String nickname;

    /**
     * 持有的权限点编码（由 PermissionLoadInterceptor 每请求回库加载）
     * 主管理员 / 副管理员不依赖它，隐式通过所有权限点
     */
    private Set<String> permissions = new HashSet<>();

    /** 兼容原有 3 参调用（不含权限点） */
    public LoginUser(Long id, String role, String nickname) {
        this.id = id;
        this.role = role;
        this.nickname = nickname;
    }

    /** null 视为空集合，避免 NPE */
    public void setPermissions(Set<String> permissions) {
        this.permissions = permissions == null ? new HashSet<>() : permissions;
    }

    public boolean isAdmin() {
        return "admin".equals(role);
    }

    /** 管理类权限：主管理员或副管理员（可发布官方任务、审核任务） */
    public boolean isModerator() {
        return "admin".equals(role) || "subadmin".equals(role);
    }

    /** 是否持有某权限点：主 / 副管理员隐式通过；普通学生看 permissions */
    public boolean hasPermission(PermCode perm) {
        return perm != null && (isModerator() || permissions.contains(perm.code()));
    }
}
