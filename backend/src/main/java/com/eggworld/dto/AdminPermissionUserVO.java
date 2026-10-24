package com.eggworld.dto;

import lombok.Data;

import java.util.List;

/**
 * 权限管理页用户列表项：用户信息 + 已持有的权限点
 */
@Data
public class AdminPermissionUserVO {

    private Long id;
    private String nickname;
    private String email;
    private String school;
    private String major;

    /** 已授权的权限点编码（按 {@link com.eggworld.common.PermCode} 声明顺序；无授权为空列表） */
    private List<String> permCodes;
}
