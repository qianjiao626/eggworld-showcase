package com.eggworld.dto;
import lombok.Data;
/** 列表批量聚合结果，不暴露参与者个人资料。 */
@Data
public class TaskClaimCounts {
    private Long taskId;
    private Long claimCount;
    private Long memberCount;
}
