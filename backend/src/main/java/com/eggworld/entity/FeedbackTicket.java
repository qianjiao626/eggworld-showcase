package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 反馈工单实体，对应表 feedback_tickets
 * 状态：open(待处理) / replied(已回复) / closed(已关闭)
 */
@Data
@TableName("feedback_tickets")
public class FeedbackTicket {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 提交用户（可空 = 匿名） */
    private Long userId;

    private String content;

    /** 反馈类型：bug/suggestion/report/other */
    private String type;

    /** 联系方式（选填） */
    private String contact;

    private String status;

    /** 管理员回复内容 */
    private String adminReply;

    /** 管理员回复时间 */
    private LocalDateTime repliedAt;

    /** 用户是否已读回复：0 未读 / 1 已读 */
    private Integer userRead;

    private LocalDateTime createdAt;

    /** 最后更新时间 */
    private LocalDateTime updatedAt;

    /** 提交人昵称（联表填充，非表字段） */
    @TableField(exist = false)
    private String userName;

    /** 会话消息（管理员回复 + 用户追问，联表填充，非表字段） */
    @TableField(exist = false)
    private java.util.List<FeedbackMessage> messages;
}
