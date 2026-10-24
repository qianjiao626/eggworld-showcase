package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 用户黑名单。 */
@Data
@TableName("chat_blocks")
public class ChatBlock {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long blockedId;
    private LocalDateTime createdAt;
}
