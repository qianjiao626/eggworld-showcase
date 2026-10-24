package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.PointLog;
import com.eggworld.entity.User;
import com.eggworld.mapper.PointLogMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 蛋蛋币服务
 * 所有余额变动必须走这里：事务 + 行锁，防止并发超扣
 */
@Service
@RequiredArgsConstructor
public class PointService {

    private final UserMapper userMapper;
    private final PointLogMapper pointLogMapper;

    /**
     * 变更余额并记录流水（事务内执行）
     *
     * @param userId 目标用户
     * @param delta  变动金额（正数增加，负数减少）
     * @param type   流水类型：earn/spend/freeze/refund/reward
     * @param label  描述
     * @param taskId 关联任务（可空）
     */
    @Transactional
    public void changeBalance(Long userId, int delta, String type, String label, Long taskId) {
        // 行锁锁定用户，防止并发扣减
        User user = userMapper.selectByIdForUpdate(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }

        int newBalance = user.getPoints() + delta;
        if (newBalance < 0) {
            throw new BusinessException("蛋蛋币余额不足");
        }

        user.setPoints(newBalance);
        userMapper.updateById(user);

        // 记录流水
        PointLog log = new PointLog();
        log.setUserId(userId);
        log.setType(type);
        log.setLabel(label);
        log.setDelta(delta);
        log.setBalance(newBalance);
        log.setTaskId(taskId);
        pointLogMapper.insert(log);
    }

    /**
     * 查询用户余额（无锁读）
     */
    public int getBalance(Long userId) {
        User user = userMapper.selectById(userId);
        return user == null ? 0 : user.getPoints();
    }

    /**
     * 查询用户流水（分页）
     */
    public com.baomidou.mybatisplus.extension.plugins.pagination.Page<PointLog> listLogs(
            Long userId, String type, long page, long size) {
        LambdaQueryWrapper<PointLog> wrapper = new LambdaQueryWrapper<PointLog>()
                .eq(PointLog::getUserId, userId)
                .eq(type != null && !type.isBlank(), PointLog::getType, type)
                .orderByDesc(PointLog::getCreatedAt);
        return pointLogMapper.selectPage(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(page, size), wrapper);
    }
}
