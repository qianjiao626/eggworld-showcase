package com.eggworld.dto;

import lombok.Data;

/**
 * 页面热度明细：区间总量（PV / UV）
 */
@Data
public class PageViewTotalsVO {

    /** 区间内总点击量 */
    private Long pv;

    /** 区间内去重人数 */
    private Long uv;
}
