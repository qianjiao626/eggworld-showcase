package com.eggworld.dto;

import lombok.Data;

/**
 * 资金序列分桶（内部聚合用）
 *
 * 口径说明：
 * - platformIssued（平台投放）= SUM(delta) WHERE type='reward'，平台真正增发的币
 * - taskTurnover（任务流转）  = SUM(delta) WHERE type='earn'，用户间转移规模（不改变币总量）
 * `spend` 是 `earn` 的对侧（同一笔钱两端），故不再单独出指标，避免被误读为"平台支出"。
 */
@Data
public class CoinSeriesBucketVO {

    /** 桶标签：按天为 MM-dd，按小时为 00~23 */
    private String label;

    /** 该桶平台投放（type='reward' 的 delta 之和） */
    private Long platformIssued;

    /** 该桶任务流转（type='earn' 的 delta 之和） */
    private Long taskTurnover;
}
