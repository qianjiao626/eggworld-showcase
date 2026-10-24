package com.eggworld.dto;

import lombok.Data;

/**
 * 装扮图鉴单项（特效或称号）
 */
@Data
public class DecoItemVO {

    /** 特效 key 或称号 key */
    private String key;

    /** 展示名（特效中文名 / 称号文本） */
    private String name;

    /** 槽位（仅特效有值） */
    private String slot;

    /** 样式 class（仅称号有值） */
    private String styleClass;

    /** 是否已解锁 */
    private boolean unlocked;

    /** 来源成就名（已解锁时填，便于展示"由 XX 成就解锁"） */
    private String sourceAchName;
}
