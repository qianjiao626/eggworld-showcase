package com.eggworld.dto;

import lombok.Data;

/**
 * 资金详情：按流水类型汇总（区间内）
 */
@Data
public class PointTypeSummaryVO {

    /** 流水类型：reward/earn/spend/freeze/refund */
    private String type;

    /** 笔数 */
    private Long cnt;

    /** 净额（delta 之和，冻结为负数） */
    private Long sumDelta;

    /** 绝对额（|delta| 之和，便于按规模排序/展示） */
    private Long sumAbs;
}
