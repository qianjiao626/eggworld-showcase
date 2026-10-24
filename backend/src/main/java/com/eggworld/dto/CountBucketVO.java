package com.eggworld.dto;

import lombok.Data;

/**
 * 趋势分桶结果（内部聚合用）：label 为桶标签（日期或小时），cnt 为计数
 */
@Data
public class CountBucketVO {

    /** 桶标签：按天为 yyyy-MM-dd，按小时为 0~23 */
    private String label;

    /** 计数 */
    private Long cnt;
}
