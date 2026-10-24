package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.InviteListVO;
import com.eggworld.entity.InviteRecord;
import com.eggworld.entity.User;
import com.eggworld.mapper.InviteRecordMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 邀请服务：邀请码生成、注册绑定、发布首个任务发奖、邀请列表查询
 * 规则：被邀请人注册 → pending；被邀请人发布首个任务 → 邀请人 +20 币，记录置 rewarded
 */
@Service
@RequiredArgsConstructor
public class InviteService {

    private static final String CODE_PREFIX = "EGG";
    private static final int REWARD = 20;

    private final InviteRecordMapper inviteRecordMapper;
    private final UserMapper userMapper;
    private final PointService pointService;
    private final SecureRandom random = new SecureRandom();

    /**
     * 生成唯一邀请码（EGG + 6 位数字），撞码自动重试
     */
    public String generateInviteCode() {
        for (int i = 0; i < 10; i++) {
            String code = CODE_PREFIX + String.format("%06d", random.nextInt(1_000_000));
            Long exists = userMapper.selectCount(
                    new LambdaQueryWrapper<User>().eq(User::getInviteCode, code));
            if (exists == 0) {
                return code;
            }
        }
        throw new BusinessException("邀请码生成失败，请重试");
    }

    /**
     * 注册时绑定邀请关系（邀请码选填）
     * 校验：码有效、不能是自己；invitee 唯一约束兜底一人只能被绑定一次
     */
    public void bindOnRegister(Long newUserId, String inviteCode) {
        if (inviteCode == null || inviteCode.isBlank()) {
            return;
        }
        User inviter = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getInviteCode, inviteCode));
        if (inviter == null) {
            throw new BusinessException("邀请码无效");
        }
        if (inviter.getId().equals(newUserId)) {
            throw new BusinessException("不能使用自己的邀请码");
        }

        InviteRecord record = new InviteRecord();
        record.setInviterId(inviter.getId());
        record.setInviteeId(newUserId);
        record.setStatus("pending");
        record.setReward(0);
        inviteRecordMapper.insert(record);
    }

    /**
     * 用户发布首个任务时发放邀请奖励（事务内调用）
     * 仅当存在该用户的 pending 邀请记录时发放一次
     */
    @Transactional
    public void rewardOnFirstPublish(Long publisherId) {
        InviteRecord record = inviteRecordMapper.selectOne(
                new LambdaQueryWrapper<InviteRecord>()
                        .eq(InviteRecord::getInviteeId, publisherId)
                        .eq(InviteRecord::getStatus, "pending"));
        if (record == null) {
            return;
        }
        pointService.changeBalance(record.getInviterId(), REWARD, "reward",
                "邀请奖励：好友发布首个任务", null);
        record.setStatus("rewarded");
        record.setReward(REWARD);
        record.setRewardedAt(LocalDateTime.now());
        inviteRecordMapper.updateById(record);
    }

    /**
     * 查询我的邀请统计与记录（新到旧）
     */
    public InviteListVO listMine(Long userId) {
        List<InviteRecord> records = inviteRecordMapper.selectList(
                new LambdaQueryWrapper<InviteRecord>()
                        .eq(InviteRecord::getInviterId, userId)
                        .orderByDesc(InviteRecord::getCreatedAt));

        InviteListVO vo = new InviteListVO();
        vo.setCount((long) records.size());
        vo.setEarned(records.stream()
                .filter(r -> "rewarded".equals(r.getStatus()))
                .mapToInt(InviteRecord::getReward)
                .sum());
        vo.setRecords(records.stream().map(r -> {
            InviteListVO.InviteItemVO item = new InviteListVO.InviteItemVO();
            item.setInviteeId(r.getInviteeId());
            item.setStatus(r.getStatus());
            item.setReward(r.getReward());
            item.setCreatedAt(r.getCreatedAt());
            item.setRewardedAt(r.getRewardedAt());
            User invitee = userMapper.selectById(r.getInviteeId());
            item.setInviteeNickname(invitee != null ? invitee.getNickname() : "未知用户");
            return item;
        }).toList());
        return vo;
    }
}
