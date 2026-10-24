package com.eggworld.dto;

import lombok.Data;

import java.util.List;

/**
 * 存量任务补群的执行结果（主管理员手工触发，见 LegacyDataMigrationService）。
 * 用于上线后核对「历史任务是否都补上了任务群、老成员是否都进了群」。
 */
@Data
public class TaskChatBackfillVO {

    /** 候选任务数：教学/组队 + 进行中（approved/in_progress/full）+ conversation_id 为空 */
    private int scanned;

    /** 本次成功建群并回写 conversation_id 的任务数 */
    private int created;

    /** 本次拉进任务群的成员人次（不含发布者——建群时群主已在群里） */
    private int joined;

    /** 建群失败的任务数（该任务的写入已整体回滚，conversation_id 仍为空，可重跑） */
    private int failed;

    /** 失败明细：任务 #id + 原因，便于逐个排查 */
    private List<String> failures;
}
