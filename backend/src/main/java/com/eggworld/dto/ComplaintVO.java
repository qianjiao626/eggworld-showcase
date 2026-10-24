package com.eggworld.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 大学吐槽榜返回对象
 */
public class ComplaintVO {

    /** 排名项（总榜 / 维度榜共用） */
    @Data
    public static class RankItem {
        private String schoolName;
        private Integer count;
        private BigDecimal avgScore;
        /** 维度榜的维度均分（总榜为 null） */
        private BigDecimal metricScore;
    }

    /** 单条吐槽（吐槽墙 / 学校详情留言共用） */
    @Data
    public static class Item {
        private Long id;
        private String schoolName;
        /** 脱敏昵称（后端按规则打码，保护隐私） */
        private String userName;
        private String content;
        private BigDecimal score;
        private Map<String, Integer> metrics;
        private LocalDateTime createdAt;
    }

    /** 学校详情：聚合统计 + 16 维均分 + 最近留言 */
    @Data
    public static class SchoolDetail {
        private String schoolName;
        private Integer count;
        private BigDecimal avgScore;
        private Integer rank;
        /** 16 维均分 {key: 分值} */
        private Map<String, BigDecimal> metrics;
        /** 最近 5 条留言（新到旧） */
        private List<Item> comments;
    }

    /** 页面统计：收录高校 / 吐槽总数 / 平均分 / 总次数限制 */
    @Data
    public static class Stats {
        private Integer schoolCount;
        private Long totalCount;
        private BigDecimal avgAll;
        /** 当前用户已吐槽次数（登录后返回） */
        private Integer myCount;
    }
}
