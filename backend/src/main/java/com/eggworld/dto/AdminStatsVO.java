package com.eggworld.dto;

import lombok.Data;

import java.util.List;

/**
 * 管理员工作台聚合统计（GET /api/admin/stats）
 * 分板块返回：运营概览 / 任务 / 资金 / 风险与治理 / 趋势 / 任务分布 / 页面热度。
 * 快照类指标不随 range 变化，趋势与页面热度随 range 变化。
 */
@Data
public class AdminStatsVO {

    /** 运营概览 */
    private OverviewVO overview;

    /** 任务数据 */
    private TaskStatsVO task;

    /** 资金数据 */
    private CoinStatsVO coin;

    /** 风险与治理 */
    private RiskStatsVO risk;

    /** 趋势：8 条指标池，前端按用户配置挑线渲染 */
    private TrendVO trend;

    /** 任务类型分布（快照：全部未删除任务按 taskType 聚合，label 为英文 key，文案由前端映射） */
    private List<CountBucketVO> taskTypes;

    /** 技能大类分布（快照：按 skillCategory 聚合，label 为英文 key） */
    private List<CountBucketVO> skillCategories;

    /** 页面热度榜（按 PV 降序） */
    private List<PageViewStatVO> pageViews;

    /** 运营概览：快照值 */
    @Data
    public static class OverviewVO {
        /** 注册蛋蛋总数（role=student 且未删除） */
        private Long totalUsers;
        /**
         * 区间内新增学生。随 range 变化：今日 / 近 7 日 / 近 30 日，
         * 与趋势、资金等区间指标口径保持一致（避免同屏混用两套时间口径）。
         */
        private Long newUsersInRange;
        /** 副管理员数 */
        private Long subAdminCount;
    }

    /** 任务数据：状态分布为快照，发布量为区间值 */
    @Data
    public static class TaskStatsVO {
        /** 待审核 */
        private Long pendingReview;
        /**
         * 等待认领：审核已通过、已上线但还没有人认领（tasks.status='approved'）。
         * 学生任务在此状态属"平台供需"信号；官方奖励任务是认领即开始，故也含在內。
         */
        private Long pendingClaim;
        /** 进行中 */
        private Long inProgress;
        /** 已完成 */
        private Long completed;
        /** 异常量：cancelled + expired */
        private Long abnormal;
        /**
         * 全站待配对认领（平台健康度）
         * 注意：配对是"发布者"的责任，且官方奖励任务认领即开始、不产生配对，
         * 故该值对管理员**不是待办**，仅作平台侧健康度参考。
         */
        private Long pendingPairing;
        /**
         * 全站已提交待确认（平台健康度）
         * 同上：确认完成是发布者的责任；管理员真正要处理的是 officialPendingConfirm。
         */
        private Long submitted;
        /** 管理员待办：官方（奖励型）任务中存在"已提交待确认"认领的任务数 */
        private Long officialPendingConfirm;
        /** 区间内发布 */
        private Long publishedInRange;
        /** 完成率（百分比 0~100，分母为 0 时为 0） */
        private Double completionRate;
        /** 完成率分母：已完成 + 异常（判定为"已终结"的任务数） */
        private Long completionBase;
    }

    /** 资金数据 */
    @Data
    public static class CoinStatsVO {
        /** 流通总量：SUM(users.points) */
        private Long circulating;
        /**
         * 平台投放（区间）：SUM(delta) WHERE type='reward'
         * 平台真正增发的币，唯一影响币总量的项（注册赠币 / 未来充值）。
         */
        private Long platformIssuedInRange;
        /**
         * 任务流转（区间）：SUM(delta) WHERE type='earn'
         * 用户间转移规模（earn 与 spend 是同一笔钱两端），反映活跃度而非资金风险。
         */
        private Long taskTurnoverInRange;
        /** 冻结中：进行中任务悬赏 + 冻结中的打听悬赏 */
        private Long frozen;
        /** 注册赠币总量（按规则 100/学生 计，用于拆解流通总量） */
        private Long registrationGrant;
        /** 任务/邀请净往来 = 流通总量 − 注册赠币 + 冻结中（残差项，保证拆解自洽） */
        private Long taskNetFlow;
    }

    /** 风险与治理 */
    @Data
    public static class RiskStatsVO {
        /** 已封禁用户 */
        private Long bannedUsers;
        /** 待处理工单（status=open） */
        private Long openTickets;
        /** 待处理举报（status=open 且 type=report） */
        private Long openReports;
        /** 被管理员隐藏的评价（visible=0） */
        private Long hiddenRatings;
        /** 大学黑榜吐槽数 */
        private Long complaints;
    }

    /** 趋势：labels 与每条 series 等长，无数据的桶补 0 */
    @Data
    public static class TrendVO {
        /** 桶标签：today 为 00~23 小时；7d/30d 为 MM-dd */
        private List<String> labels;
        /** 指标池（8 条），每条含 key 与数列 */
        private List<SeriesVO> series;
    }

    /** 趋势中的单条指标序列 */
    @Data
    public static class SeriesVO {
        /** 指标 key，前端据此映射中文名 */
        private String key;
        /** 数列，长度与 labels 一致 */
        private List<Long> data;
    }
}
