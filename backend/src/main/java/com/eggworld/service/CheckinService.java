package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.CheckinVO;
import com.eggworld.entity.DailyCheckin;
import com.eggworld.entity.User;
import com.eggworld.mapper.DailyCheckinMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.ZoneId;

@Service
@RequiredArgsConstructor
public class CheckinService {
    public static final ZoneId CHECKIN_ZONE = ZoneId.of("Asia/Shanghai");
    private final DailyCheckinMapper dailyCheckinMapper;
    private final UserMapper userMapper;
    private final PointService pointService;

    @Transactional
    public CheckinVO checkin(Long userId) {
        // 先锁用户再查/插签到，避免外键共享锁与奖励更新排他锁相互升级死锁。
        User user = userMapper.selectByIdForUpdate(userId);
        if (user == null) throw new BusinessException("用户不存在");
        LocalDate today = LocalDate.now(CHECKIN_ZONE);
        if (dailyCheckinMapper.selectCount(todayQuery(userId, today)) > 0) {
            throw new BusinessException("今日已签到，明天再来吧！");
        }
        DailyCheckin record = new DailyCheckin();
        record.setUserId(userId);
        record.setCheckDate(today);
        try {
            dailyCheckinMapper.insert(record);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("今日已签到，明天再来吧！");
        }
        user.setExp(user.getExp() + 5);
        userMapper.updateById(user);
        pointService.changeBalance(userId, 5, "earn", "每日签到（+5 蛋蛋币 +5 经验）", null);
        User latest = userMapper.selectById(userId);
        return new CheckinVO(true, 5, 5, latest.getExp(), latest.getPoints());
    }

    public CheckinVO getTodayStatus(Long userId) {
        boolean checked = dailyCheckinMapper.selectCount(todayQuery(userId, LocalDate.now(CHECKIN_ZONE))) > 0;
        User user = userMapper.selectById(userId);
        if (user == null) throw new BusinessException("用户不存在");
        return new CheckinVO(checked, 5, 5, user.getExp(), user.getPoints());
    }

    private LambdaQueryWrapper<DailyCheckin> todayQuery(Long userId, LocalDate date) {
        return new LambdaQueryWrapper<DailyCheckin>()
                .eq(DailyCheckin::getUserId, userId).eq(DailyCheckin::getCheckDate, date);
    }
}
