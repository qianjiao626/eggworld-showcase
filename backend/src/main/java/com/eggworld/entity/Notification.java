package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 站内通知实体，对应表 notifications
 */
@Data
@TableName("notifications")
public class Notification {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 接收用户ID */
    private Long userId;

    /** 通知内容 */
    private String text;

    /** 类型：claim/pair/submit/confirm/cancel/review/rating/info 等 */
    private String type;

    /** 0 未读 / 1 已读 */
    private Integer isRead;

    private LocalDateTime createdAt;
}
