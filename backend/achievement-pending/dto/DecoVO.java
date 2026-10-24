package com.eggworld.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

/**
 * 用户装扮（挂在全站各 VO 的 deco 字段上）
 * 全字段为 null 时前端按默认样式渲染。
 */
@Data
public class DecoVO {

    /** 仅供批量加载时做 Map key，不参与序列化 */
    @JsonIgnore
    private Long userId;

    /** 光环 key */
    private String aura;
    /** 披风 key */
    private String cloak;
    /** 服装 key */
    private String outfit;
    /** 边框 key */
    private String frame;
    /** 挂件 key */
    private String charm;
    /** 称号 key */
    private String title;
    /** 称号文本（冗余带出，省去前端二次查表） */
    private String titleName;
    /** 称号样式 class（title-plain / title-gold / title-neon / title-flame / title-holo） */
    private String titleStyle;
    /** 调色皮肤 key */
    private String skin;

    /** 是否为空（无任何装备） */
    public boolean isEmpty() {
        return isBlank(aura) && isBlank(cloak) && isBlank(outfit)
                && isBlank(frame) && isBlank(charm) && isBlank(title) && isBlank(skin);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
