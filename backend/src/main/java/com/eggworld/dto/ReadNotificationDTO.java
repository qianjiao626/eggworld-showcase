package com.eggworld.dto;

import lombok.Data;

/**
 * 标记通知已读请求体（不传 id = 全部已读）
 */
@Data
public class ReadNotificationDTO {

    /** 单条通知ID（可空） */
    private Long id;
}
