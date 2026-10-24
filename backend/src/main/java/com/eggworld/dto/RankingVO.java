package com.eggworld.dto;

import com.eggworld.entity.UserStats;
import lombok.Data;

import java.util.List;

/**
 * 排行榜响应：榜单 Top N + 我的名次
 */
@Data
public class RankingVO {

    /** 榜单类型：all/rich/rep/study/job/side/hobby/game/life */
    private String cat;

    private List<Item> records;

    /** 我的名次（未上榜/未登录为 0） */
    private Integer myRank;

    @Data
    public static class Item {
        private Long userId;
        private String nickname;
        private String school;
        /** 角色分类（study/job/...） */
        private String eggCategory;
        /** 角色稀有度 N/R/SR/UR */
        private String eggRarity;
        private Integer exp;
        private Integer points;
        private String mbtiType;
        private UserStats stats;

        /** 收到的评价人数（口碑榜展示"N人评"用） */
        private Integer ratingCount;
    }
}
