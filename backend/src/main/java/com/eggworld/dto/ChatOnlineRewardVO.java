package com.eggworld.dto;

import lombok.Data;

/** 聊天室在线奖励状态与结算结果。 */
@Data
public class ChatOnlineRewardVO {
    /** 本次心跳新增的金币（含发言加成） */
    private int earned;
    /** 本次新增中来自发言加成的部分 */
    private int msgEarned;
    /** 今日已获得金币（含发言加成） */
    private int todayCoins;
    /** 今日上限（在线金币 + 发言加成） */
    private int dailyCap;
    /** 在线金币上限（不含发言加成） */
    private int onlineCap;
    /** 是否已达今日上限 */
    private boolean capped;
    /** 当前稀有度档位：N/R/SR/SSR/UR */
    private String rarity;
    /** 稀有度中文档位名 */
    private String tierLabel;
    /** 用户当前蛋蛋币余额 */
    private int balance;
    /** 每分钟在线金币（0.5 表示每 2 分钟 1 币） */
    private double coinsPerMinute;
}
