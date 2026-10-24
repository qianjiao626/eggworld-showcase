package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.DecoConstants;
import com.eggworld.dto.AchievementUnlockVO;
import com.eggworld.dto.AchievementVO;
import com.eggworld.entity.Achievement;
import com.eggworld.entity.Title;
import com.eggworld.entity.UserAchievement;
import com.eggworld.mapper.AchievementMapper;
import com.eggworld.mapper.AchievementProgressMapper;
import com.eggworld.mapper.TitleMapper;
import com.eggworld.mapper.UserAchievementMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 成就解锁引擎
 *
 * 设计要点：
 * 1) 解锁幂等 —— 依赖 uk_user_ach 唯一键 + 捕获 DuplicateKeyException；
 * 2) 评估必须发生在「业务事务提交之后」—— 否则进度查询看不到刚写入的数据；
 *    统一入口为 {@link #evaluateAfterCommit}；
 * 3) 任何评估异常都必须被吞掉 —— 签到 / 发布任务 / 完成任务是核心链路，
 *    成就系统绝不能把它们带崩。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AchievementService {

    private final AchievementMapper achievementMapper;
    private final AchievementProgressMapper progressMapper;
    private final UserAchievementMapper userAchievementMapper;
    private final TitleMapper titleMapper;
    private final NotificationService notificationService;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;

    /** 「众望所归」的口碑均分门槛（硬编码，与种子数据的描述文案保持一致） */
    public static final double RATING_QUALITY_AVG = 4.8;

    /** 连续签到回溯窗口（天） */
    private static final int STREAK_LOOKBACK_DAYS = 120;

    /* ==================== 对外：安全评估入口 ==================== */

    /**
     * 在「当前事务提交后」评估成就；无事务时立即评估。
     * 业务代码统一调用此方法，不要直接调用 evaluate()。
     */
    public void evaluateAfterCommit(Long userId, String category) {
        if (userId == null) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    evaluateQuietly(userId, category);
                }
            });
        } else {
            evaluateQuietly(userId, category);
        }
    }

    /** 评估并吞掉所有异常（成就系统不得影响主流程） */
    public void evaluateQuietly(Long userId, String category) {
        try {
            evaluate(userId, category);
        } catch (Exception e) {
            log.warn("成就评估失败（已忽略，不影响主流程） userId={} category={}", userId, category, e);
        }
    }

    /* ==================== 核心：评估与解锁 ==================== */

    /**
     * 评估并解锁已达标的成就（幂等，重复调用无副作用）。
     *
     * @param category 仅评估该分类；传 null 表示全量。meta 分类始终在普通成就之后评估，
     *                 因为它依赖「已解锁数量 / 已覆盖分类数」这两个派生值。
     */
    public void evaluate(Long userId, String category) {
        // afterCommit 仍可能绑定已提交连接；独立事务也避免同类调用绕过 @Transactional 代理。
        var tx = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(status -> evaluateInTransaction(userId, category));
    }

    private void evaluateInTransaction(Long userId, String category) {
        List<Achievement> all = (category == null || category.isBlank())
                ? achievementMapper.selectAllEnabled()
                : achievementMapper.selectEnabledByCategory(category);
        if (all.isEmpty()) return;

        List<Achievement> normal = new ArrayList<>();
        List<Achievement> meta = new ArrayList<>();
        for (Achievement a : all) {
            ("meta".equals(a.getCategory()) ? meta : normal).add(a);
        }

        // 已解锁集合（一次查出，避免逐条 count）
        java.util.Set<Long> unlockedIds = new java.util.HashSet<>(userAchievementMapper.selectUnlockedAchIds(userId));

        Map<String, Integer> cache = new HashMap<>();
        for (Achievement a : normal) {
            if (unlockedIds.contains(a.getId())) continue;
            int cur = progressCached(userId, a, cache);
            if (cur >= a.getCondValue()) {
                unlock(userId, a);
                unlockedIds.add(a.getId());
            }
        }

        // meta 依赖最新计数，放在最后
        for (Achievement a : meta) {
            if (unlockedIds.contains(a.getId())) continue;
            int cur = progressOf(userId, a);
            if (cur >= a.getCondValue()) {
                unlock(userId, a);
                unlockedIds.add(a.getId());
            }
        }
    }

    /** 执行解锁：插入记录 + 发通知；并发下靠唯一键兜底 */
    private void unlock(Long userId, Achievement a) {
        UserAchievement ua = new UserAchievement();
        ua.setUserId(userId);
        ua.setAchId(a.getId());
        try {
            userAchievementMapper.insert(ua);
        } catch (DuplicateKeyException e) {
            return;   // 已被并发线程解锁
        }
        notificationService.notify(userId, buildUnlockMessage(a), "achievement");
        log.info("成就解锁 userId={} ach={} ({})", userId, a.getAchKey(), a.getName());
    }

    private String buildUnlockMessage(Achievement a) {
        StringBuilder sb = new StringBuilder("🏆 解锁新成就「").append(a.getName()).append("」");
        List<String> gains = new ArrayList<>();
        if (a.getRewardEffectKey() != null) {
            gains.add("特效·" + DecoConstants.effectName(a.getRewardEffectKey()));
        }
        if (a.getRewardTitleKey() != null) {
            Title t = titleMapper.selectOne(new LambdaQueryWrapper<Title>()
                    .eq(Title::getTitleKey, a.getRewardTitleKey()));
            if (t != null) gains.add("称号·" + t.getName());
        }
        if (!gains.isEmpty()) {
            sb.append("，获得 ").append(String.join("、", gains));
        }
        sb.append("，快去「我的装扮」看看吧");
        return sb.toString();
    }

    /* ==================== 进度计算 ==================== */

    /** 带缓存的进度计算（同一次评估内同一 condType 只查一次） */
    private int progressCached(Long userId, Achievement a, Map<String, Integer> cache) {
        String t = a.getCondType();
        if ("rating_quality".equals(t)) {
            return ratingQualityProgress(userId, a.getCondValue());   // 二维条件，单独算
        }
        Integer v = cache.get(t);
        if (v == null) {
            v = computeOne(userId, t);
            cache.put(t, v);
        }
        return v;
    }

    /** 计算某成就的当前进度（列表展示与解锁判定共用，保证两者一致） */
    private int progressOf(Long userId, Achievement a) {
        String t = a.getCondType();
        if ("rating_quality".equals(t)) return ratingQualityProgress(userId, a.getCondValue());
        return computeOne(userId, t);
    }

    /**
     * 「众望所归」为二维条件：评价数达标 **且** 均分 ≥ 4.8。
     * 均分未达标时把进度封顶在目标之下，避免出现「进度满格却未解锁」的观感问题。
     */
    private int ratingQualityProgress(Long userId, int target) {
        int n = progressMapper.countValidRatings(userId);
        Double avg = progressMapper.avgRating(userId);
        if (avg != null && avg >= RATING_QUALITY_AVG) return n;
        return Math.min(n, Math.max(0, target - 1));
    }

    /** cond_type 分派（与 migrate-achievement.sql 的种子数据一一对应） */
    private int computeOne(Long userId, String condType) {
        if (condType == null) return 0;
        switch (condType) {
            case "checkin_total":
                return progressMapper.countCheckinTotal(userId);
            case "checkin_streak":
                return currentCheckinStreak(userId);
            case "publish_count":
                return progressMapper.countPublished(userId);
            case "complete_count":
                // 口径：作为认领者完成 + 作为发布者完成（两者都算"完成了一个任务"）
                return progressMapper.countClaimsCompleted(userId)
                        + progressMapper.countPublisherCompleted(userId);
            case "team_count":
                return progressMapper.countTeamAsClaimer(userId)
                        + progressMapper.countTeamAsPublisher(userId);
            case "rating_five_count":
                return progressMapper.countFiveStar(userId);
            case "gossip_adopted_count":
                return progressMapper.countGossipAdopted(userId);
            case "invite_count":
                return progressMapper.countInviteRewarded(userId);
            case "complaint_count":
                return progressMapper.countComplaints(userId);
            case "meta_ach_count":
                return progressMapper.countUnlockedAch(userId);
            case "meta_category_count":
                return progressMapper.countUnlockedCategories(userId);
            case "register_days":
                Integer d = progressMapper.registerDays(userId);
                return d == null ? 0 : Math.max(0, d);
            default:
                log.warn("未知的 cond_type: {}", condType);
                return 0;
        }
    }

    /**
     * 连续签到天数。
     * 今天已签到 → 从今天往前数；今天未签到但昨天签了 → 从昨天往前数（避免白天未签时显示为 0）；
     * 否则为 0。取最近 120 天日期到内存遍历，不用 SQL 硬算。
     */
    private int currentCheckinStreak(Long userId) {
        LocalDate today = LocalDate.now(CheckinService.CHECKIN_ZONE);
        List<LocalDate> dates = progressMapper.listRecentCheckinDates(userId, today.minusDays(STREAK_LOOKBACK_DAYS));
        if (dates == null || dates.isEmpty()) return 0;

        LocalDate expect;
        if (dates.get(0).equals(today)) {
            expect = today;
        } else if (dates.get(0).equals(today.minusDays(1))) {
            expect = today.minusDays(1);
        } else {
            return 0;
        }

        int streak = 0;
        for (LocalDate d : dates) {
            if (d.equals(expect)) {
                streak++;
                expect = expect.minusDays(1);
            } else if (d.isBefore(expect)) {
                break;
            }
        }
        return streak;
    }

    /* ==================== 查询：成就页 / 未读 / 标记已读 ==================== */

    /** 全部成就 + 我的进度 + 解锁状态（成就页数据源） */
    public List<AchievementVO> listForUser(Long userId) {
        return listForUser(userId, false);
    }

    public List<AchievementVO> listMine(Long userId) {
        return listForUser(userId, true).stream().filter(AchievementVO::isUnlocked).toList();
    }

    private List<AchievementVO> listForUser(Long userId, boolean includeDisabled) {
        List<Achievement> all = includeDisabled ? achievementMapper.selectList(null) : achievementMapper.selectAllEnabled();
        Map<String, Title> titles = titleMap();

        List<UserAchievement> mine = userAchievementMapper.selectList(
                new LambdaQueryWrapper<UserAchievement>().eq(UserAchievement::getUserId, userId));
        Map<Long, UserAchievement> unlockedMap = new HashMap<>();
        for (UserAchievement ua : mine) unlockedMap.put(ua.getAchId(), ua);

        List<AchievementVO> out = new ArrayList<>(all.size());
        for (Achievement a : all) {
            AchievementVO vo = new AchievementVO();
            vo.setId(a.getId());
            vo.setAchKey(a.getAchKey());
            vo.setName(a.getName());
            vo.setCategory(a.getCategory());
            vo.setDescription(a.getDescription());
            vo.setCondValue(a.getCondValue());
            vo.setSortOrder(a.getSortOrder());
            vo.setRewardEffectKey(a.getRewardEffectKey());
            vo.setRewardEffectSlot(a.getRewardEffectSlot());
            if (a.getRewardEffectKey() != null) {
                vo.setRewardEffectName(DecoConstants.effectName(a.getRewardEffectKey()));
            }
            vo.setRewardTitleKey(a.getRewardTitleKey());
            if (a.getRewardTitleKey() != null) {
                Title t = titles.get(a.getRewardTitleKey());
                if (t != null) {
                    vo.setRewardTitleName(t.getName());
                    vo.setRewardTitleStyle(t.getStyleClass());
                }
            }

            UserAchievement ua = unlockedMap.get(a.getId());
            vo.setUnlocked(ua != null);
            if (ua != null) vo.setUnlockedAt(ua.getUnlockedAt());
            vo.setTarget(a.getCondValue() == null ? 0 : a.getCondValue());
            vo.setProgress(progressOf(userId, a));
            out.add(vo);
        }
        return out;
    }

    /** 未读解锁（驱动红点与解锁弹窗） */
    public List<AchievementUnlockVO> listUnread(Long userId) {
        List<UserAchievement> unread = userAchievementMapper.selectUnread(userId);
        if (unread.isEmpty()) return Collections.emptyList();

        Map<Long, Achievement> achMap = new HashMap<>();
        for (Achievement a : achievementMapper.selectList(null)) achMap.put(a.getId(), a);
        Map<String, Title> titles = titleMap();

        List<AchievementUnlockVO> out = new ArrayList<>(unread.size());
        for (UserAchievement ua : unread) {
            Achievement a = achMap.get(ua.getAchId());
            if (a == null) continue;
            AchievementUnlockVO vo = new AchievementUnlockVO();
            vo.setId(ua.getId());
            vo.setAchKey(a.getAchKey());
            vo.setName(a.getName());
            vo.setDescription(a.getDescription());
            vo.setUnlockedAt(ua.getUnlockedAt());
            vo.setRewardEffectKey(a.getRewardEffectKey());
            vo.setRewardEffectSlot(a.getRewardEffectSlot());
            if (a.getRewardEffectKey() != null) {
                vo.setRewardEffectName(DecoConstants.effectName(a.getRewardEffectKey()));
            }
            if (a.getRewardTitleKey() != null) {
                Title t = titles.get(a.getRewardTitleKey());
                if (t != null) {
                    vo.setRewardTitleName(t.getName());
                    vo.setRewardTitleStyle(t.getStyleClass());
                }
            }
            out.add(vo);
        }
        return out;
    }

    public int countUnread(Long userId) {
        return userAchievementMapper.countUnread(userId);
    }

    /** 标记某条解锁已读（仅本人；越权返回业务异常） */
    public void markRead(Long userId, Long id) {
        if (id == null) return;
        UserAchievement ua = userAchievementMapper.selectMineById(id, userId);
        if (ua == null) return;   // 不是自己的记录，静默忽略（不泄露存在性）
        if (ua.getIsRead() != null && ua.getIsRead() == 1) return;
        ua.setIsRead(1);
        userAchievementMapper.updateById(ua);
    }

    /* ==================== 供 DecoService / 穿戴校验复用 ==================== */

    /**
     * 查出该用户「已解锁」的全部装扮 key（特效 + 称号）。
     * 由 user_achievements JOIN achievements 派生，不冗余存储。
     *
     * @return 一个二元数组：[0] 已解锁特效 key 集合，[1] 已解锁称号 key 集合
     */
    public UnlockedKeys loadUnlockedKeys(Long userId) {
        List<Achievement> all = achievementMapper.selectList(null);
        java.util.Set<Long> unlocked = new java.util.HashSet<>(userAchievementMapper.selectUnlockedAchIds(userId));
        java.util.Set<String> effects = new java.util.HashSet<>();
        java.util.Set<String> titles = new java.util.HashSet<>();
        for (Achievement a : all) {
            if (!unlocked.contains(a.getId())) continue;
            if (a.getRewardEffectKey() != null) effects.add(a.getRewardEffectKey());
            if (a.getRewardTitleKey() != null) titles.add(a.getRewardTitleKey());
        }
        return new UnlockedKeys(effects, titles);
    }

    /** 已解锁 key 的两元组 */
    public static class UnlockedKeys {
        public final java.util.Set<String> effects;
        public final java.util.Set<String> titles;

        public UnlockedKeys(java.util.Set<String> effects, java.util.Set<String> titles) {
            this.effects = effects;
            this.titles = titles;
        }
    }

    /** 称号 key → Title 映射（24 条，读多写少） */
    public Map<String, Title> titleMap() {
        Map<String, Title> map = new LinkedHashMap<>();
        for (Title t : titleMapper.selectAllOrdered()) {
            map.put(t.getTitleKey(), t);
        }
        return map;
    }

    /** 全部称号（图鉴用） */
    public List<Title> listTitles() {
        return titleMapper.selectAllOrdered();
    }
}
