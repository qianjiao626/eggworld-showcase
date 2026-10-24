package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.CheckinVO;
import com.eggworld.entity.DailyCheckin;
import com.eggworld.entity.User;
import com.eggworld.mapper.DailyCheckinMapper;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CheckinServiceTest {
    @Mock DailyCheckinMapper dailyCheckinMapper;
    @Mock UserMapper userMapper;
    @Mock PointService pointService;

    @InjectMocks CheckinService checkinService;

    @Test
    void checkinAddsFiveExperienceAndFivePoints() {
        User locked = user(7L, 10, 20);
        User latest = user(7L, 15, 25);
        when(dailyCheckinMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(dailyCheckinMapper.insert(any(DailyCheckin.class))).thenReturn(1);
        when(userMapper.selectByIdForUpdate(7L)).thenReturn(locked);
        when(userMapper.updateById(locked)).thenReturn(1);
        when(userMapper.selectById(7L)).thenReturn(latest);

        CheckinVO result = checkinService.checkin(7L);

        var order = org.mockito.Mockito.inOrder(userMapper, dailyCheckinMapper);
        order.verify(userMapper).selectByIdForUpdate(7L);
        order.verify(dailyCheckinMapper).selectCount(any(LambdaQueryWrapper.class));
        order.verify(dailyCheckinMapper).insert(any(DailyCheckin.class));
        assertTrue(result.isChecked());
        assertEquals(5, result.getExpReward());
        assertEquals(5, result.getPointReward());
        assertEquals(15, result.getTotalExp());
        assertEquals(25, result.getTotalPoints());
        assertEquals(15, locked.getExp());
        ArgumentCaptor<DailyCheckin> record = ArgumentCaptor.forClass(DailyCheckin.class);
        verify(dailyCheckinMapper).insert(record.capture());
        assertEquals(7L, record.getValue().getUserId());
        assertEquals(LocalDate.now(CheckinService.CHECKIN_ZONE), record.getValue().getCheckDate());
        verify(pointService).changeBalance(7L, 5, "earn", "每日签到（+5 蛋蛋币 +5 经验）", null);
    }

    @Test
    void repeatedCheckinIsRejectedBeforeRewards() {
        when(userMapper.selectByIdForUpdate(7L)).thenReturn(user(7L, 10, 20));
        when(dailyCheckinMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);

        BusinessException error = assertThrows(BusinessException.class, () -> checkinService.checkin(7L));

        assertEquals("今日已签到，明天再来吧！", error.getMessage());
        verify(dailyCheckinMapper, never()).insert(any(DailyCheckin.class));
        verify(pointService, never()).changeBalance(any(), org.mockito.ArgumentMatchers.anyInt(), any(), any(), any());
    }

    @Test
    void uniqueConstraintRaceIsReturnedAsAlreadyCheckedIn() {
        when(userMapper.selectByIdForUpdate(7L)).thenReturn(user(7L, 10, 20));
        when(dailyCheckinMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(dailyCheckinMapper.insert(any(DailyCheckin.class)))
                .thenThrow(new DuplicateKeyException("uk_user_date"));

        BusinessException error = assertThrows(BusinessException.class, () -> checkinService.checkin(7L));

        assertEquals("今日已签到，明天再来吧！", error.getMessage());
        verify(pointService, never()).changeBalance(any(), org.mockito.ArgumentMatchers.anyInt(), any(), any(), any());
    }

    @Test
    void statusUsesCurrentDateAndCurrentBalancesWithoutGrantingRewards() {
        when(dailyCheckinMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(userMapper.selectById(7L)).thenReturn(user(7L, 10, 20));

        CheckinVO result = checkinService.getTodayStatus(7L);

        assertFalse(result.isChecked());
        assertEquals(5, result.getExpReward());
        assertEquals(5, result.getPointReward());
        assertEquals(10, result.getTotalExp());
        assertEquals(20, result.getTotalPoints());
        verify(pointService, never()).changeBalance(any(), org.mockito.ArgumentMatchers.anyInt(), any(), any(), any());
    }

    private static User user(Long id, int exp, int points) {
        User user = new User();
        user.setId(id);
        user.setExp(exp);
        user.setPoints(points);
        return user;
    }
}
