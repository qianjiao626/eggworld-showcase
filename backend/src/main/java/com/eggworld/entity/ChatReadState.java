package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 跨设备已读位置。 */
@Data
@TableName("chat_read_states")
public class ChatReadState {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long conversationId;
    private Long lastReadMessageId;
    private LocalDateTime updatedAt;
}
