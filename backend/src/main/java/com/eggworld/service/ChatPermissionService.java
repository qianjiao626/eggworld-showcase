package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 聊天室统一权限判定。
 *
 * 前端可以隐藏按钮，但任何发送、查看、管理动作都必须经过这里。
 */
@Service
@RequiredArgsConstructor
public class ChatPermissionService {

    private final ChatConversationMapper conversationMapper;
    private final ChatConversationMemberMapper memberMapper;
    private final ChatGroupMemberMapper groupMemberMapper;
    private final ChatBlockMapper blockMapper;
    private final ChatFriendMapper friendMapper;
    private final ChatMuteMapper muteMapper;
    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;

    /**
     * 私密群总开关：已停用（2026-09-21）。
     *
     * 为什么停用：私密群「仅邀请」在没有好友体系支撑时容易变成小圈子，与校园广场的公开定位不符。
     * 关闭后：① 不允许新建（{@link ChatGroupService#create} 拒绝 private）；
     *        ② 存量私密群冻结为只读——保留历史消息可查，但谁都不能再发言。
     *
     * ⚠️ 判定必须同时看 type 与 visibility：一对一私聊的 visibility 也是 private，
     *    只按 visibility 拦截会把私聊一起禁掉。
     */
    public static final boolean PRIVATE_GROUP_ENABLED = false;

    public ChatConversation requireActiveConversation(Long conversationId) {
        ChatConversation c = conversationMapper.selectById(conversationId);
        if (c == null || !"active".equals(c.getStatus())) {
            throw new BusinessException(404, "会话不存在或已关闭");
        }
        return c;
    }

    public ChatConversationMember requireMember(Long conversationId, Long userId) {
        ChatConversationMember m = memberMapper.selectOne(new LambdaQueryWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, conversationId)
                .eq(ChatConversationMember::getUserId, userId));
        if (m == null || !"active".equals(m.getStatus())) {
            throw new BusinessException(403, "你不在该会话中");
        }
        return m;
    }

    /** WebSocket 高频读路径：用一条即时 JOIN 同时检查账号、会话和成员状态。 */
    public void requireReadableConversation(Long conversationId, Long userId) {
        if (conversationId == null || userId == null
                || !Integer.valueOf(1).equals(memberMapper.selectReadableConversation(conversationId, userId))) {
            throw new BusinessException(403, "聊天会话权限不可用");
        }
    }

    public void requireCanSend(Long conversationId, Long userId) {
        ChatConversation c = requireActiveConversation(conversationId);
        ChatConversationMember m = requireMember(conversationId, userId);

        if (isGloballyMuted(userId)) {
            throw new BusinessException(403, "你已被全站禁言");
        }
        if (m.getMutedUntil() != null && m.getMutedUntil().isAfter(LocalDateTime.now())) {
            throw new BusinessException(403, "你已被本会话禁言");
        }
        if ("channel".equals(c.getType()) && Integer.valueOf(1).equals(c.getReadOnly())
                && !isConversationManager(m)) {
            throw new BusinessException(403, "该频道为只读公告");
        }
        // 任务群归档后只读（ChatGroupService.archive 把 read_only 置 1）。
        // 不复用上面 channel 那段：频道只读时放行管理员，而任务结束的群该整体停言、只留记录。
        if ("group".equals(c.getType()) && Integer.valueOf(1).equals(c.getReadOnly())) {
            throw new BusinessException(403, "该任务已结束，群聊已归档，不能再发言");
        }
        // 私密群已停用：存量私密群冻结为只读（保留历史可查，但谁都不能发言）。
        // 必须同时判 type=group，否则会把 visibility 同为 private 的一对一私聊一起禁掉。
        if (!PRIVATE_GROUP_ENABLED && "group".equals(c.getType()) && "private".equals(c.getVisibility())) {
            throw new BusinessException(403, "私密群已停用，该群不能再发言");
        }
    }

    public boolean isGloballyMuted(Long userId) {
        Long count = muteMapper.selectCount(new LambdaQueryWrapper<ChatMute>()
                .eq(ChatMute::getUserId, userId)
                .eq(ChatMute::getScope, "global")
                .isNull(ChatMute::getRevokedAt)
                .gt(ChatMute::getMutedUntil, LocalDateTime.now()));
        return count != null && count > 0;
    }

    public boolean isConversationManager(ChatConversationMember member) {
        return member != null && ("owner".equals(member.getRole()) || "admin".equals(member.getRole()));
    }

    public boolean isGroupOwnerOrAdmin(Long groupId, Long userId) {
        ChatGroupMember gm = groupMemberMapper.selectOne(new LambdaQueryWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, groupId)
                .eq(ChatGroupMember::getUserId, userId)
                .eq(ChatGroupMember::getStatus, "active"));
        return gm != null && ("owner".equals(gm.getRole()) || "admin".equals(gm.getRole()));
    }

    public boolean isBlockedEitherWay(Long a, Long b) {
        Long count = blockMapper.selectCount(new LambdaQueryWrapper<ChatBlock>()
                .and(w -> w.eq(ChatBlock::getUserId, a).eq(ChatBlock::getBlockedId, b))
                .or(w -> w.eq(ChatBlock::getUserId, b).eq(ChatBlock::getBlockedId, a)));
        return count != null && count > 0;
    }

    public boolean areFriends(Long a, Long b) {
        Long count = friendMapper.selectCount(new LambdaQueryWrapper<ChatFriend>()
                .eq(ChatFriend::getUserId, a)
                .eq(ChatFriend::getFriendId, b));
        return count != null && count > 0;
    }

    /** 任务参与者可直聊：发布者与已选认领者，或同一任务的两个已选参与者。 */
    public boolean shareTaskRelation(Long a, Long b) {
        Long direct = taskClaimMapper.selectCount(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getSelected, 1)
                .and(w -> w.and(x -> x.eq(TaskClaim::getClaimerId, a).eq(TaskClaim::getSelected, 1))
                        .or(x -> x.eq(TaskClaim::getClaimerId, b).eq(TaskClaim::getSelected, 1))));
        if (direct != null && direct > 0) {
            // 先粗筛出与任一人有关的已选认领记录，再确认双方是否处于同一任务。
            var claimsA = taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                    .eq(TaskClaim::getClaimerId, a).eq(TaskClaim::getSelected, 1));
            for (TaskClaim ca : claimsA) {
                Task t = taskMapper.selectById(ca.getTaskId());
                if (t == null) continue;
                if (b.equals(t.getPublisherId())) return true;
                Long peer = taskClaimMapper.selectCount(new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getTaskId, ca.getTaskId())
                        .eq(TaskClaim::getClaimerId, b)
                        .eq(TaskClaim::getSelected, 1));
                if (peer != null && peer > 0) return true;
            }
        }
        var published = taskMapper.selectList(new LambdaQueryWrapper<Task>()
                .eq(Task::getPublisherId, a));
        for (Task t : published) {
            if (b.equals(t.getPublisherId())) continue;
            Long selected = taskClaimMapper.selectCount(new LambdaQueryWrapper<TaskClaim>()
                    .eq(TaskClaim::getTaskId, t.getId())
                    .eq(TaskClaim::getClaimerId, b)
                    .eq(TaskClaim::getSelected, 1));
            if (selected != null && selected > 0) return true;
        }
        return false;
    }

    public void requireDirectAllowed(Long a, Long b) {
        if (a == null || b == null || a.equals(b)) {
            throw new BusinessException("不能与自己发起私聊");
        }
        if (isBlockedEitherWay(a, b)) {
            throw new BusinessException(403, "对方已在黑名单中");
        }
        if (areFriends(a, b) || shareTaskRelation(a, b)) return;
        throw new BusinessException(403, "陌生人需先成为好友才能私聊");
    }
}
