package com.eggworld.dto;

import lombok.Data;

/**
 * 任务广场查询参数
 */
@Data
public class TaskQueryDTO {

    /** 任务类型：teach/help/team */
    private String type;

    /** 技能分类：study/job/side/hobby/game/life */
    private String category;

    /** 状态：approved（广场默认）/pending/in_progress/completed */
    private String status;

    /** 标题关键词模糊搜索 */
    private String keyword;

    private long page = 1;
    private long size = 20;
}
