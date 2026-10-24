package com.eggworld.dto;

import lombok.Data;

/**
 * 页面热度统计项：某页面在统计范围内的点击量（PV）与去重人数（UV）
 * 同时作为 AdminStatsMapper 的聚合返回类型与工作台接口的响应字段
 */
@Data
public class PageViewStatVO {

    /** 页面标识 */
    private String pageKey;

    /** 点击量：页面被切换到的次数 */
    private Long pv;

    /** 去重人数：范围内进入过该页面的不同用户数 */
    private Long uv;
}
