package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资金详情：冻结清单条目
 * 冻结来源两类：任务悬赏（求助/组队/教学/奖励型任务的悬赏额）与打听悬赏。
 */
@Data
public class AdminFrozenCoinVO {

    /** 来源：task 任务悬赏 / gossip 打听悬赏 */
    private String source;

    /** 标题（任务标题 / 打听标题） */
    private String title;

    /** 冻结方昵称 */
    private String ownerName;

    /** 冻结金额 */
    private Long amount;

    /** 冻结时间 */
    private LocalDateTime frozenAt;

    /** 已冻结天数（服务端按当前时间算） */
    private Long days;

    /** 状态描述：任务状态 / 打听 coin_status */
    private String status;
}
