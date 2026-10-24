package com.eggworld.dto;

import lombok.Data;

/**
 * 八卦榜排行项：按回答获赞总数聚合统计用户
 */
@Data
public class GossipRankVO {

    private Long userId;
    private String nickname;

    /** 回答获赞总数（排行依据） */
    private Integer totalLikes;

    /** 回答数量 */
    private Integer answerCount;

    /** 被采纳次数 */
    private Integer adoptedCount;
}
