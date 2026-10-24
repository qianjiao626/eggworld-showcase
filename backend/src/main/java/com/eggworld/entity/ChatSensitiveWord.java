package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 后台可编辑的聊天敏感词。 */
@Data
@TableName("chat_sensitive_words")
public class ChatSensitiveWord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String word;
    private String level;
    private Integer enabled;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
