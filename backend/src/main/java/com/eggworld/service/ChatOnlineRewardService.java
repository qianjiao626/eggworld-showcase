package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.dto.ChatOnlineRewardVO;
import com.eggworld.entity.ChatOnlineReward;
import com.eggworld.entity.User;
import com.eggworld.mapper.ChatOnlineRewardMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 聊天室在线奖励（挂机金币）。
 *
 * 规则（方案 A）：
 * - 每在线 1 分钟 0.5 蛋蛋币（实现为每 120 秒 1 币，避免小数）
 * - 每日在线金币上限：20 币（= 在线 40 分钟），与稀有度无关（方案 B）
 * - 发言加成：每条 +2 币，每日前 20 条有效（不占用 20 币在线额度，每日合计上限 60）
 * - 防挂机：两次心跳间隔超过阈值（默认 5 分钟）的时段不计时
 *
 * 安全边界：
 * - 在线时长以**服务端时钟**计算，不接受前端上报的时长；
 * - 所有发币一律走 {@link PointService#changeBalance}（事务 + 行锁），不另开写余额路径。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatOnlineRewardService {

    /** 与签到保持一致：按上海时区切分自然日。 */
    public static final ZoneId REWARD_ZONE = ZoneId.of("Asia/Shanghai");

    private final ChatOnlineRewardMapper rewardMapper;
    private final UserMapper userMapper;
    private final PointService pointService;

    @Value("${eggworld.chat.online-reward.enabled:true}")
    private boolean enabled;
    /** 每多少秒发 1 枚在线金币（120 秒 = 每分钟 0.5 币）。 */
    @Value("${eggworld.chat.online-reward.interval-seconds:120}")
    private int intervalSeconds;
    /** 单次心跳最多计入的秒数，防止长时间离开后被补发。 */
    @Value("${eggworld.chat.online-reward.max-gap-seconds:300}")
    private int maxGapSeconds;
    /** 发言加成：每条加多少币。 */
    @Value("${eggworld.chat.online-reward.message-bonus-coins:2}")
    private int messageBonusCoins;
    /** 发言加成：每日前多少条有效。 */
    @Value("${eggworld.chat.online-reward.message-bonus-daily-limit:20}")
    private int messageBonusDailyLimit;
    /**
     * 每日在线金币上限（方案 B：固定值，与稀有度无关）。
     * 20 币 = 在线 40 分钟（每 120 秒 1 币）；发言加成不占用该额度，另行计算。
     */
    @Value("${eggworld.chat.online-reward.online-cap-coins:20}")
    private int onlineCapCoins;

    private static String tierLabel(String rarity) {
        if (rarity == null) return "普通蛋";
        return switch (rarity) {
            case "R" -> "稀有蛋";
            case "SR" -> "史诗蛋";
            case "SSR" -> "传说蛋";
            case "UR" -> "传说蛋";
            default -> "普通蛋";
        };
    }

    private int messageBonusCapCoins() {
        return messageBonusCoins * messageBonusDailyLimit;
    }

    /**
     * 心跳结算：按服务端时钟计算本次可计入的在线秒数并发放金币。
     * 前端只负责「我还在聊天室」这一事实，不上报时长。
     */
    @Transactional
    public ChatOnlineRewardVO tick(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) throw new com.eggworld.common.BusinessException("用户不存在");
        LocalDate today = LocalDate.now(REWARD_ZONE);
        if (!enabled) {
            // 开关关闭：不建行、不写库，仅回报当前档位与余额
            ChatOnlineReward empty = new ChatOnlineReward();
            empty.setSeconds(0);
            empty.setCoins(0);
            empty.setMsgRewardCount(0);
            return buildVO(user, empty, 0, 0, rarityOf(user));
        }
        ChatOnlineReward row = loadOrCreate(userId, today);

        LocalDateTime now = LocalDateTime.now(REWARD_ZONE);
        int elapsed = 0;
        if (row.getLastTickAt() != null) {
            long secs = java.time.Duration.between(row.getLastTickAt(), now).getSeconds();
            if (secs > 0) elapsed = (int) Math.min(secs, Math.max(1, maxGapSeconds));
        }

        String rarity = rarityOf(user);
        int onlineCap = Math.max(0, onlineCapCoins);
        int beforeSeconds = row.getSeconds() == null ? 0 : row.getSeconds();
        int beforeCoins = row.getCoins() == null ? 0 : row.getCoins();

        // 秒数也按上限截断，避免超上限后再累计（防止改配置后被追溯补发）
        int cappedSeconds = onlineCap > 0
                ? onlineCap * Math.max(1, intervalSeconds)
                : Integer.MAX_VALUE;
        int afterSeconds = Math.min(beforeSeconds + elapsed, cappedSeconds);
        int earnedCoins = afterSeconds / Math.max(1, intervalSeconds) - beforeCoins;
        if (earnedCoins < 0) earnedCoins = 0;

        row.setSeconds(afterSeconds);
        row.setCoins(beforeCoins + earnedCoins);
        row.setLastTickAt(now);
        rewardMapper.updateById(row);

        if (earnedCoins > 0) {
            pointService.changeBalance(userId, earnedCoins, "earn",
                    "聊天室在线奖励（+" + earnedCoins + " 蛋蛋币）", null);
        }
        return buildVO(user, row, earnedCoins, 0, rarity);
    }

    /**
     * 发言加成：每条消息 +2 币，每日前 20 条有效。
     * 由消息发送成功后调用；失败只记录日志，绝不影响发消息主流程。
     */
    @Transactional
    public void rewardMessage(Long userId) {
        if (!enabled) return;
        try {
            User user = userMapper.selectById(userId);
            if (user == null) return;
            LocalDate today = LocalDate.now(REWARD_ZONE);
            ChatOnlineReward row = loadOrCreate(userId, today);
            int used = row.getMsgRewardCount() == null ? 0 : row.getMsgRewardCount();
            if (used >= messageBonusDailyLimit) return;
            row.setMsgRewardCount(used + 1);
            rewardMapper.updateById(row);
            pointService.changeBalance(userId, messageBonusCoins, "earn",
                    "聊天室发言奖励（+" + messageBonusCoins + " 蛋蛋币）", null);
        } catch (Exception e) {
            log.warn("聊天室发言奖励发放失败，已忽略：userId={} err={}", userId, e.getMessage());
        }
    }

    /** 查询今日状态（不结算），用于前端展示。 */
    public ChatOnlineRewardVO status(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) throw new com.eggworld.common.BusinessException("用户不存在");
        ChatOnlineReward row = loadOrCreate(userId, LocalDate.now(REWARD_ZONE));
        return buildVO(user, row, 0, 0, rarityOf(user));
    }

    private String rarityOf(User user) {
        String r = user.getEggRarity();
        return (r == null || r.isBlank()) ? "N" : r;
    }

    /** 取当日行；不存在则创建（唯一键兜底并发）。 */
    private ChatOnlineReward loadOrCreate(Long userId, LocalDate today) {
        ChatOnlineReward row = rewardMapper.selectOne(new LambdaQueryWrapper<ChatOnlineReward>()
                .eq(ChatOnlineReward::getUserId, userId)
                .eq(ChatOnlineReward::getRewardDate, today));
        if (row != null) return row;
        ChatOnlineReward fresh = new ChatOnlineReward();
        fresh.setUserId(userId);
        fresh.setRewardDate(today);
        fresh.setSeconds(0);
        fresh.setCoins(0);
        fresh.setMsgRewardCount(0);
        try {
            rewardMapper.insert(fresh);
            return fresh;
        } catch (DuplicateKeyException e) {
            return rewardMapper.selectOne(new LambdaQueryWrapper<ChatOnlineReward>()
                    .eq(ChatOnlineReward::getUserId, userId)
                    .eq(ChatOnlineReward::getRewardDate, today));
        }
    }

    private ChatOnlineRewardVO buildVO(User user, ChatOnlineReward row, int earned, int msgEarned, String rarity) {
        int onlineCap = Math.max(0, onlineCapCoins);
        int bonusCap = messageBonusCapCoins();
        int todayCoins = (row.getCoins() == null ? 0 : row.getCoins())
                + (row.getMsgRewardCount() == null ? 0 : row.getMsgRewardCount()) * messageBonusCoins;
        ChatOnlineRewardVO vo = new ChatOnlineRewardVO();
        vo.setEarned(earned);
        vo.setMsgEarned(msgEarned);
        vo.setTodayCoins(todayCoins);
        vo.setOnlineCap(onlineCap);
        vo.setDailyCap(onlineCap + bonusCap);
        vo.setCapped((row.getCoins() == null ? 0 : row.getCoins()) >= onlineCap
                && (row.getMsgRewardCount() == null ? 0 : row.getMsgRewardCount()) >= messageBonusDailyLimit);
        vo.setRarity(rarity);
        vo.setTierLabel(tierLabel(rarity));
        vo.setBalance(user.getPoints() == null ? 0 : user.getPoints());
        vo.setCoinsPerMinute(60.0 / Math.max(1, intervalSeconds));
        return vo;
    }
}
