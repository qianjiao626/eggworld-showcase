package com.eggworld.dto;

import lombok.Data;

/**
 * 权限点清单项（供后台筛选 / 勾选使用，来源为代码内枚举 PermCode）
 */
@Data
public class PermCodeVO {

    private String code;
    private String label;

    public PermCodeVO() {
    }

    public PermCodeVO(String code, String label) {
        this.code = code;
        this.label = label;
    }
}
