package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 大学吐槽记录实体，对应表 school_complaints
 * metrics 存 16 维评分的 JSON 字符串，score 为 16 维均值
 */
@Data
@TableName("school_complaints")
public class SchoolComplaint {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String schoolName;

    /** 吐槽人ID（可为空=匿名） */
    private Long userId;

    /** 吐槽留言 */
    private String content;

    /** 16维评分 JSON {key: 分值0-10} */
    private String metrics;

    /** 平均吐槽分 */
    private java.math.BigDecimal score;

    private LocalDateTime createdAt;
}
