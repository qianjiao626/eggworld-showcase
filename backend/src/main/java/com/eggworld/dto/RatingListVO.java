package com.eggworld.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 我收到的评价列表（含均分与总数）
 */
@Data
public class RatingListVO {

    /** 收到的评价均分（无记录为 0） */
    private BigDecimal avg;

    /** 收到的评价总数 */
    private Long count;

    private List<RatingItemVO> records;

    @Data
    public static class RatingItemVO {
        private Long id;
        private Long taskId;
        private String taskType;
        private String taskTitle;
        private Long raterId;
        private String raterNickname;
        private Integer score;
        private String comment;
        /** 被评价者（当前查看者）对这条评价的回复 */
        private String reply;
        private LocalDateTime createdAt;
    }
}
