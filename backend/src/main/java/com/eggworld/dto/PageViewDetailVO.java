package com.eggworld.dto;

import lombok.Data;

import java.util.List;

/**
 * 页面热度明细（工作台热度榜点进去的详情）
 */
@Data
public class PageViewDetailVO {

    /** 页面标识 */
    private String pageKey;

    /** 区间内总点击量 */
    private Long pv;

    /** 区间内去重人数 */
    private Long uv;

    /** 分桶标签（today 为 00~23；7d/30d 为 MM-dd） */
    private List<String> labels;

    /** 各桶 PV，长度与 labels 一致 */
    private List<Long> pvSeries;

    /** 访问最多的用户（按次数降序，最多 10 位） */
    private List<VisitorVO> topVisitors;

    /** 访问用户条目 */
    @Data
    public static class VisitorVO {
        private Long userId;
        /** 昵称（已注销用户为空） */
        private String nickname;
        /** 该区间内访问该页面的次数 */
        private Long cnt;
    }
}
