package com.eggworld.dto;

import lombok.Data;

import java.util.List;

/**
 * 装扮图鉴（全部特效/称号 + 我是否已解锁）
 */
@Data
public class DecoCatalogVO {

    /** 28 个特效 */
    private List<DecoItemVO> effects;

    /** 24 个称号 */
    private List<DecoItemVO> titles;

    /** 我已解锁的特效数 */
    private int unlockedEffects;

    /** 我已解锁的称号数 */
    private int unlockedTitles;

    private int totalEffects;
    private int totalTitles;
}
