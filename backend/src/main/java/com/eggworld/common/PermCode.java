package com.eggworld.common;

import java.util.Optional;

/**
 * 权限点定义（写死在代码里，运营不能自造）
 *
 * <p>两段式权限模型：用户 → 权限点（无角色层）。
 * 主管理员 / 副管理员对所有权限点隐式通过（见 {@link LoginUser#hasPermission}）。
 */
public enum PermCode {

    /** 内容审核：进审核中心处理举报 / 帖子 */
    CONTENT_REVIEW("content_review", "内容审核"),

    /** 数据看板：看运营数据 */
    DATA_DASHBOARD("data_dashboard", "数据看板");

    private final String code;
    private final String label;

    PermCode(String code, String label) {
        this.code = code;
        this.label = label;
    }

    /** 存库编码（user_permissions.perm_code） */
    public String code() {
        return code;
    }

    /** 展示名（后台权限管理页） */
    public String label() {
        return label;
    }

    /** 按编码解析；未知编码返回 empty（脏数据不会造成误授权） */
    public static Optional<PermCode> fromCode(String code) {
        if (code == null) {
            return Optional.empty();
        }
        for (PermCode p : values()) {
            if (p.code.equals(code)) {
                return Optional.of(p);
            }
        }
        return Optional.empty();
    }
}
