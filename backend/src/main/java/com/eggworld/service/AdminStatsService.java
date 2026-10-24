package com.eggworld.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.dto.AdminFrozenCoinVO;
import com.eggworld.dto.AdminHiddenRatingVO;
import com.eggworld.dto.AdminPointLogVO;
import com.eggworld.dto.AdminStatsVO;
import com.eggworld.dto.CoinSeriesBucketVO;
import com.eggworld.dto.CountBucketVO;
import com.eggworld.dto.PageViewDetailVO;
import com.eggworld.dto.PageViewTotalsVO;
import com.eggworld.dto.PointTypeSummaryVO;
import com.eggworld.mapper.AdminDetailMapper;
import com.eggworld.mapper.AdminStatsMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 管理员工作台聚合统计服务（GET /api/admin/stats 及资金详情接口）
 *
 * 口径要点（详见 tasks/admin-workbench-plan.md 第 3 节）：
 * - 快照类指标（注册数、任务状态分布、流通量、风险计数）不随 range 变化
 * - 区间类指标（发布量、平台投放/任务流转、趋势、页面热度）随 range 变化
 * - 资金只有 `reward` 类型真正增发（平台投放）；`earn/spend` 是用户间转移，不改变总量
 * - range：today（按小时 24 桶）/ 7d（按天 7 桶）/ 30d（按天 30 桶），非法值按 7d
 */
@Service
@RequiredArgsConstructor
public class AdminStatsService {

    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("MM-dd");

    /** 注册赠币额度（与 AuthService 注册奖励保持一致） */
    private static final long REGISTER_GRANT_PER_USER = 100L;

    /** 趋势指标池的 key（前端据此映射中文名并做选线配置） */
    private static final String K_NEW_USERS = "newUsers";
    private static final String K_PUBLISHED = "publishedTasks";
    private static final String K_COMPLETED = "completedTasks";
    private static final String K_PAGE_VIEWS = "pageViews";
    private static final String K_PLATFORM_ISSUED = "platformIssued";
    private static final String K_TASK_TURNOVER = "taskTurnover";
    private static final String K_RATINGS = "newRatings";
    private static final String K_GOSSIP = "newGossip";

    private final AdminStatsMapper statsMapper;
    private final AdminDetailMapper detailMapper;

    /** 统计窗口：左闭右开 [start, end)，hourly 表示按小时分桶 */
    private record Window(LocalDateTime start, LocalDateTime end, LocalDate today, boolean hourly) {
    }

    /**
     * 聚合工作台全部指标（主管理员与副管理员均下发全部板块）
     *
     * @param range 统计范围：today / 7d / 30d，非法值按 7d
     */
    public AdminStatsVO stats(String range) {
        Window w = resolve(range);

        AdminStatsVO vo = new AdminStatsVO();
        vo.setTask(buildTask(w));
        vo.setTrend(buildTrend(w));
        vo.setTaskTypes(statsMapper.taskTypeDistribution());
        vo.setSkillCategories(statsMapper.skillCategoryDistribution());
        vo.setOverview(buildOverview(w));
        vo.setCoin(buildCoin(w));
        vo.setRisk(buildRisk());
        vo.setPageViews(statsMapper.pageStatsBetween(w.start(), w.end()));
        return vo;
    }

    /* ===== 资金详情（工作台「详情」弹窗） ===== */

    /** 资金详情：按流水类型汇总 */
    public List<PointTypeSummaryVO> pointTypeSummary(String range) {
        Window w = resolve(range);
        return statsMapper.summaryByType(w.start(), w.end());
    }

    /** 资金详情：全局流水明细（可筛选 + 分页） */
    public IPage<AdminPointLogVO> pointLogs(String range, String type, Integer minAbs, String keyword,
                                            long page, long size) {
        Window w = resolve(range);
        Page<AdminPointLogVO> p = new Page<>(page, size);
        return statsMapper.selectPointLogs(p, w.start(), w.end(), type, minAbs, keyword);
    }

    /** 资金详情：冻结清单（任务悬赏 + 打听悬赏） */
    public List<AdminFrozenCoinVO> frozenCoins() {
        return statsMapper.frozenCoins();
    }

    /* ===== 页面热度明细（热度榜点进去） ===== */

    /** 单页面在某区间内的 PV/UV、按桶趋势与访问最多的用户 */
    public PageViewDetailVO pageViewDetail(String pageKey, String range) {
        Window w = resolve(range);

        PageViewDetailVO vo = new PageViewDetailVO();
        vo.setPageKey(pageKey);

        PageViewTotalsVO totals = detailMapper.pageTotals(pageKey, w.start(), w.end());
        vo.setPv(totals == null || totals.getPv() == null ? 0L : totals.getPv());
        vo.setUv(totals == null || totals.getUv() == null ? 0L : totals.getUv());

        List<String> labels = buildLabels(w);
        List<CountBucketVO> buckets = w.hourly()
                ? detailMapper.pagePvByHour(pageKey, w.start(), w.end())
                : detailMapper.pagePvByDay(pageKey, w.start(), w.end());
        Map<String, Long> map = (buckets == null ? List.<CountBucketVO>of() : buckets).stream()
                .filter(b -> b.getLabel() != null)
                .collect(Collectors.toMap(CountBucketVO::getLabel,
                        b -> b.getCnt() == null ? 0L : b.getCnt(), Long::sum));
        vo.setLabels(labels);
        vo.setPvSeries(labels.stream().map(l -> map.getOrDefault(l, 0L)).toList());
        vo.setTopVisitors(detailMapper.topVisitors(pageKey, w.start(), w.end()));
        return vo;
    }

    /* ===== 被隐藏的评价 ===== */

    public IPage<AdminHiddenRatingVO> hiddenRatings(long page, long size) {
        return detailMapper.hiddenRatings(new Page<>(page, size));
    }

    /* ===== 运营概览 ===== */

    private AdminStatsVO.OverviewVO buildOverview(Window w) {
        AdminStatsVO.OverviewVO o = new AdminStatsVO.OverviewVO();
        o.setTotalUsers(statsMapper.countStudents());
        // 跟随 range 窗口（今日 / 近 7 日 / 近 30 日），与其它区间指标口径一致
        o.setNewUsersInRange(statsMapper.countNewUsers(w.start(), w.end()));
        o.setSubAdminCount(statsMapper.countSubAdmins());
        return o;
    }

    /* ===== 任务 ===== */

    private AdminStatsVO.TaskStatsVO buildTask(Window w) {
        long completed = statsMapper.countTasksByStatus("completed");
        long cancelled = statsMapper.countTasksByStatus("cancelled");
        long expired = statsMapper.countTasksByStatus("expired");
        // 驳回任务已退回冻结币，不属"已通过后的失败"，故不计入异常量
        long abnormal = cancelled + expired;

        AdminStatsVO.TaskStatsVO t = new AdminStatsVO.TaskStatsVO();
        t.setPendingReview(statsMapper.countPendingReview());
        t.setPendingClaim(statsMapper.countTasksByStatus("approved"));
        t.setInProgress(statsMapper.countTasksByStatus("in_progress"));
        t.setCompleted(completed);
        t.setAbnormal(abnormal);
        t.setPendingPairing(statsMapper.countClaimsByStatus("pending_pairing"));
        t.setSubmitted(statsMapper.countClaimsByStatus("submitted"));
        t.setOfficialPendingConfirm(statsMapper.countOfficialPendingConfirm());
        t.setPublishedInRange(statsMapper.countTasksCreated(w.start(), w.end()));

        long denom = completed + abnormal;
        t.setCompletionBase(denom);
        t.setCompletionRate(denom == 0 ? 0.0 : Math.round(completed * 10000.0 / denom) / 100.0);
        return t;
    }

    /* ===== 资金 ===== */

    private AdminStatsVO.CoinStatsVO buildCoin(Window w) {
        long circulated = statsMapper.sumCirculatingPoints();
        long frozen = statsMapper.sumFrozenTaskReward() + statsMapper.sumFrozenGossipBounty();
        // 注册赠币按规则计（注册即赠 100），而非按流水累加：
        // 早期调试数据中存在直接写库、未走 PointService 的赠币，按流水会与余额对不平
        long grant = REGISTER_GRANT_PER_USER * statsMapper.countStudents();

        AdminStatsVO.CoinStatsVO c = new AdminStatsVO.CoinStatsVO();
        c.setCirculating(circulated);
        c.setPlatformIssuedInRange(statsMapper.sumPlatformIssued(w.start(), w.end()));
        c.setTaskTurnoverInRange(statsMapper.sumTaskTurnover(w.start(), w.end()));
        c.setFrozen(frozen);
        c.setRegistrationGrant(grant);
        // 残差项：由余额反推，保证「流通 = 注册赠币 + 该净额 − 冻结中」恒等成立
        c.setTaskNetFlow(circulated - grant + frozen);
        return c;
    }

    /* ===== 风险与治理 ===== */

    private AdminStatsVO.RiskStatsVO buildRisk() {
        AdminStatsVO.RiskStatsVO k = new AdminStatsVO.RiskStatsVO();
        k.setBannedUsers(statsMapper.countBannedUsers());
        k.setOpenTickets(statsMapper.countOpenTickets());
        k.setOpenReports(statsMapper.countOpenReports());
        k.setHiddenRatings(statsMapper.countHiddenRatings());
        k.setComplaints(statsMapper.countComplaints());
        return k;
    }

    /* ===== 趋势（指标池 8 条） ===== */

    private AdminStatsVO.TrendVO buildTrend(Window w) {
        List<String> labels = buildLabels(w);

        List<AdminStatsVO.SeriesVO> series = new ArrayList<>();
        series.add(series(K_NEW_USERS, labels, w.hourly()
                ? statsMapper.newUsersByHour(w.start(), w.end())
                : statsMapper.newUsersByDay(w.start(), w.end())));
        series.add(series(K_PUBLISHED, labels, w.hourly()
                ? statsMapper.tasksByHour(w.start(), w.end())
                : statsMapper.tasksByDay(w.start(), w.end())));
        series.add(series(K_COMPLETED, labels, w.hourly()
                ? statsMapper.completedTasksByHour(w.start(), w.end())
                : statsMapper.completedTasksByDay(w.start(), w.end())));
        series.add(series(K_PAGE_VIEWS, labels, w.hourly()
                ? statsMapper.pageViewsByHour(w.start(), w.end())
                : statsMapper.pageViewsByDay(w.start(), w.end())));
        series.add(series(K_RATINGS, labels, w.hourly()
                ? statsMapper.ratingsByHour(w.start(), w.end())
                : statsMapper.ratingsByDay(w.start(), w.end())));
        series.add(series(K_GOSSIP, labels, w.hourly()
                ? statsMapper.gossipByHour(w.start(), w.end())
                : statsMapper.gossipByDay(w.start(), w.end())));

        List<CoinSeriesBucketVO> coin = w.hourly()
                ? statsMapper.coinSeriesByHour(w.start(), w.end())
                : statsMapper.coinSeriesByDay(w.start(), w.end());
        series.add(series(K_PLATFORM_ISSUED, labels, coin, true));
        series.add(series(K_TASK_TURNOVER, labels, coin, false));

        AdminStatsVO.TrendVO trend = new AdminStatsVO.TrendVO();
        trend.setLabels(labels);
        trend.setSeries(series);
        return trend;
    }

    private List<String> buildLabels(Window w) {
        List<String> labels = new ArrayList<>();
        if (w.hourly()) {
            for (int h = 0; h < 24; h++) {
                labels.add(String.format("%02d", h));          // 与 SQL 的 %H 对齐
            }
            return labels;
        }
        LocalDate d = w.start().toLocalDate();
        while (!d.isAfter(w.today())) {
            labels.add(d.format(DAY_LABEL));
            d = d.plusDays(1);
        }
        return labels;
    }

    /** 计数型指标 → 序列（按标签补 0，保证折线连续） */
    private AdminStatsVO.SeriesVO series(String key, List<String> labels, List<CountBucketVO> buckets) {
        Map<String, Long> map = (buckets == null ? List.<CountBucketVO>of() : buckets).stream()
                .filter(b -> b.getLabel() != null)
                .collect(Collectors.toMap(CountBucketVO::getLabel,
                        b -> b.getCnt() == null ? 0L : b.getCnt(), Long::sum));
        return buildSeries(key, labels, map);
    }

    /** 金额型指标（平台投放 / 任务流转）→ 序列 */
    private AdminStatsVO.SeriesVO series(String key, List<String> labels,
                                         List<CoinSeriesBucketVO> buckets, boolean platformIssued) {
        Map<String, Long> map = (buckets == null ? List.<CoinSeriesBucketVO>of() : buckets).stream()
                .filter(b -> b.getLabel() != null)
                .collect(Collectors.toMap(CoinSeriesBucketVO::getLabel,
                        b -> {
                            Long v = platformIssued ? b.getPlatformIssued() : b.getTaskTurnover();
                            return v == null ? 0L : v;
                        }, Long::sum));
        return buildSeries(key, labels, map);
    }

    private AdminStatsVO.SeriesVO buildSeries(String key, List<String> labels, Map<String, Long> map) {
        AdminStatsVO.SeriesVO s = new AdminStatsVO.SeriesVO();
        s.setKey(key);
        s.setData(labels.stream().map(l -> map.getOrDefault(l, 0L)).toList());
        return s;
    }

    /* ===== 范围解析 ===== */

    private Window resolve(String range) {
        boolean hourly = "today".equals(range);
        boolean d30 = "30d".equals(range);
        LocalDate today = LocalDate.now();
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime end = todayStart.plusDays(1);            // 右开区间：包含今天整日
        LocalDateTime start = hourly ? todayStart
                : d30 ? todayStart.minusDays(29)
                : todayStart.minusDays(6);                     // 缺省与非法值按 7d
        return new Window(start, end, today, hourly);
    }
}
