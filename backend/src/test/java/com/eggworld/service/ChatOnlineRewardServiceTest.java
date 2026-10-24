package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.dto.ChatOnlineRewardVO;
import com.eggworld.entity.ChatOnlineReward;
import com.eggworld.entity.User;
import com.eggworld.mapper.ChatOnlineRewardMapper;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * 聊天室在线奖励（挂机金币）规则测试。
 * 覆盖：服务端计时、每日上限分档、发言加成每日条数、防挂机超时丢弃。
 */
@ExtendWith(MockitoExtension.class)
class ChatOnlineRewardServiceTest {

    @Mock ChatOnlineRewardMapper rewardMapper;
    @Mock UserMapper userMapper;
    @Mock PointService pointService;

    @InjectMocks ChatOnlineRewardService service;

    private static final ZoneId ZONE = ChatOnlineRewardService.REWARD_ZONE;

    private User user(long id, String rarity, int points) {
        User u = new User();
        u.setId(id);
        u.setEggRarity(rarity);
        u.setPoints(points);
        return u;
    }

    private ChatOnlineReward row(long userId, int seconds, int coins, int msgCount, LocalDateTime lastTick) {
        ChatOnlineReward r = new ChatOnlineReward();
        r.setId(1L);
        r.setUserId(userId);
        r.setRewardDate(LocalDate.now(ZONE));
        r.setSeconds(seconds);
        r.setCoins(coins);
        r.setMsgRewardCount(msgCount);
        r.setLastTickAt(lastTick);
        return r;
    }

    private void enable() {
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "intervalSeconds", 120);
        ReflectionTestUtils.setField(service, "maxGapSeconds", 300);
        ReflectionTestUtils.setField(service, "messageBonusCoins", 2);
        ReflectionTestUtils.setField(service, "messageBonusDailyLimit", 20);
        ReflectionTestUtils.setField(service, "onlineCapCoins", 20);
    }

    @Test
    void tickAwardsOneCoinPer120Seconds() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        // 上次结算在 120 秒前 -> 应发 1 币
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 0, 0, 0, LocalDateTime.now(ZONE).minusSeconds(120)));
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);

        ChatOnlineRewardVO vo = service.tick(1L);

        assertEquals(1, vo.getEarned(), "120 秒应发 1 币");
        verify(pointService).changeBalance(eq(1L), eq(1), eq("earn"), anyString(), isNull());
    }

    @Test
    void tickDoesNotAwardBelowOneInterval() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 0, 0, 0, LocalDateTime.now(ZONE).minusSeconds(59)));
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);

        ChatOnlineRewardVO vo = service.tick(1L);

        assertEquals(0, vo.getEarned(), "不足 120 秒不应发币");
        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
    }

    @Test
    void tickDiscardsGapLongerThanMaxGap() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        // 间隔 1 小时，超过 maxGap=300 秒 -> 只计入 300 秒 = 2 币
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 0, 0, 0, LocalDateTime.now(ZONE).minusHours(1)));
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);

        ChatOnlineRewardVO vo = service.tick(1L);

        assertEquals(2, vo.getEarned(), "超时段应被截断为 300 秒");
    }

    @Test
    void onlineCoinsCapAtTwentyForAnyRarity() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        // 已拿满 20 币上限（20 * 120 = 2400 秒）
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 2400, 20, 0, LocalDateTime.now(ZONE).minusSeconds(600)));
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);

        ChatOnlineRewardVO vo = service.tick(1L);

        assertEquals(0, vo.getEarned(), "达到 20 币在线上限后不再发币");
        assertEquals(20, vo.getOnlineCap());
        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
    }

    @Test
    void onlineCapIsSameForEveryRarity() {
        enable();
        User u = user(1L, "SR", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 0, 0, 0, LocalDateTime.now(ZONE).minusSeconds(120)));
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);

        ChatOnlineRewardVO vo = service.tick(1L);

        assertEquals(20, vo.getOnlineCap(), "方案 B：所有稀有度的在线上限都是 20 币");
        assertEquals("史诗蛋", vo.getTierLabel());
    }

    @Test
    void dailyCapEqualsOnlineCapPlusMessageBonus() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 0, 0, 0, LocalDateTime.now(ZONE)));
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);

        ChatOnlineRewardVO vo = service.tick(1L);

        assertEquals(20, vo.getOnlineCap(), "在线额度 20");
        assertEquals(60, vo.getDailyCap(), "每日合计上限 = 20 在线 + 40 发言");
    }

    @Test
    void messageBonusStopsAfterDailyLimit() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 0, 0, 20, LocalDateTime.now(ZONE)));

        service.rewardMessage(1L);

        verify(pointService, never()).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());
    }

    @Test
    void messageBonusAwardsTwoCoinsBeforeLimit() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        ChatOnlineReward r = row(1L, 0, 0, 5, LocalDateTime.now(ZONE));
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(r);
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);

        service.rewardMessage(1L);

        assertEquals(6, r.getMsgRewardCount(), "发言计数应递增");
        verify(pointService).changeBalance(eq(1L), eq(2), eq("earn"), anyString(), isNull());
    }

    @Test
    void messageBonusFailureDoesNotThrow() {
        enable();
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        when(rewardMapper.selectOne(any(LambdaQueryWrapper.class)))
                .thenReturn(row(1L, 0, 0, 0, LocalDateTime.now(ZONE)));
        when(rewardMapper.updateById(any(ChatOnlineReward.class))).thenReturn(1);
        doThrow(new RuntimeException("db down"))
                .when(pointService).changeBalance(anyLong(), anyInt(), anyString(), anyString(), any());

        assertDoesNotThrow(() -> service.rewardMessage(1L), "发币失败不能影响发消息主流程");
    }

    @Test
    void disabledSwitchAwardsNothing() {
        ReflectionTestUtils.setField(service, "enabled", false);
        ReflectionTestUtils.setField(service, "intervalSeconds", 120);
        User u = user(1L, "N", 0);
        when(userMapper.selectById(1L)).thenReturn(u);
        ChatOnlineRewardVO vo = service.tick(1L);

        assertEquals(0, vo.getEarned(), "开关关闭时不发币");
        verify(rewardMapper, never()).insert(any(ChatOnlineReward.class));
    }
}
