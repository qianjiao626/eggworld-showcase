package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 聊天室在线奖励（挂机金币）每日累计。一个用户一天一行。 */
@Data
@TableName("chat_online_reward")
public class ChatOnlineReward {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private LocalDate rewardDate;
    /** 当日已计入的在线秒数 */
    private Integer seconds;
    /** 当日已发放的在线金币（不含发言加成） */
    private Integer coins;
    /** 当日已计入加成的发言条数 */
    private Integer msgRewardCount;
    /** 上一次心跳结算时间（服务端时钟） */
    private LocalDateTime lastTickAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
