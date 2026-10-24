package com.eggworld.dto;

import com.eggworld.entity.Notification;
import lombok.Data;

import java.util.List;

/**
 * 我的通知列表（未读数 + 分页记录）
 */
@Data
public class NotificationListVO {

    /** 未读总数 */
    private Long unread;

    private List<Notification> records;
}
