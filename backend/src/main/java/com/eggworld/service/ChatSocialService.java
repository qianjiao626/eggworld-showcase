package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/** 好友、关注和黑名单。 */
@Service
@RequiredArgsConstructor
public class ChatSocialService {

    private final ChatFriendMapper friendMapper;
    private final ChatFriendRequestMapper requestMapper;
    private final ChatFollowMapper followMapper;
    private final ChatBlockMapper blockMapper;
    private final ChatConversationMemberMapper memberMapper;
    private final ChatPermissionService permissionService;

    public List<ChatFriendRequest> pendingRequests(Long userId) {
        return requestMapper.selectList(new LambdaQueryWrapper<ChatFriendRequest>()
                .eq(ChatFriendRequest::getTargetId, userId)
                .eq(ChatFriendRequest::getStatus, "pending")
                .orderByDesc(ChatFriendRequest::getCreatedAt));
    }

    @Transactional
    public void requestFriend(Long userId, Long targetId, String message) {
        if (userId.equals(targetId)) throw new BusinessException("不能添加自己为好友");
        if (permissionService.areFriends(userId, targetId)) throw new BusinessException("你们已经是好友");
        if (permissionService.isBlockedEitherWay(userId, targetId)) throw new BusinessException(403, "存在黑名单关系，无法申请");
        Long exists = requestMapper.selectCount(new LambdaQueryWrapper<ChatFriendRequest>()
                .eq(ChatFriendRequest::getRequesterId, userId)
                .eq(ChatFriendRequest::getTargetId, targetId)
                .eq(ChatFriendRequest::getStatus, "pending"));
        if (exists != null && exists > 0) throw new BusinessException("好友申请已发送");
        ChatFriendRequest r = new ChatFriendRequest();
        r.setRequesterId(userId); r.setTargetId(targetId); r.setMessage(message); r.setStatus("pending");
        requestMapper.insert(r);
    }

    @Transactional
    public void handleFriendRequest(Long userId, Long requestId, boolean accept) {
        ChatFriendRequest r = requestMapper.selectById(requestId);
        if (r == null || !userId.equals(r.getTargetId()) || !"pending".equals(r.getStatus())) {
            throw new BusinessException(403, "好友申请不存在或无权处理");
        }
        if (permissionService.isBlockedEitherWay(r.getRequesterId(), r.getTargetId())) {
            throw new BusinessException(403, "存在黑名单关系，无法成为好友");
        }
        r.setStatus(accept ? "accepted" : "rejected");
        r.setHandledAt(LocalDateTime.now());
        requestMapper.updateById(r);
        if (accept) {
            addFriendPair(r.getRequesterId(), r.getTargetId());
            addFriendPair(r.getTargetId(), r.getRequesterId());
        }
    }

    @Transactional
    public void removeFriend(Long userId, Long friendId) {
        friendMapper.delete(new LambdaQueryWrapper<ChatFriend>()
                .eq(ChatFriend::getUserId, userId).eq(ChatFriend::getFriendId, friendId));
        friendMapper.delete(new LambdaQueryWrapper<ChatFriend>()
                .eq(ChatFriend::getUserId, friendId).eq(ChatFriend::getFriendId, userId));
    }

    @Transactional
    public void follow(Long userId, Long targetId) {
        if (userId.equals(targetId)) throw new BusinessException("不能关注自己");
        if (permissionService.isBlockedEitherWay(userId, targetId)) throw new BusinessException(403, "存在黑名单关系");
        if (followMapper.selectCount(new LambdaQueryWrapper<ChatFollow>()
                .eq(ChatFollow::getFollowerId, userId).eq(ChatFollow::getFollowingId, targetId)) == 0) {
            ChatFollow f = new ChatFollow(); f.setFollowerId(userId); f.setFollowingId(targetId); followMapper.insert(f);
        }
    }

    public void unfollow(Long userId, Long targetId) {
        followMapper.delete(new LambdaQueryWrapper<ChatFollow>()
                .eq(ChatFollow::getFollowerId, userId).eq(ChatFollow::getFollowingId, targetId));
    }

    @Transactional
    public void block(Long userId, Long targetId) {
        if (userId.equals(targetId)) throw new BusinessException("不能拉黑自己");
        if (blockMapper.selectCount(new LambdaQueryWrapper<ChatBlock>()
                .eq(ChatBlock::getUserId, userId).eq(ChatBlock::getBlockedId, targetId)) == 0) {
            ChatBlock b = new ChatBlock(); b.setUserId(userId); b.setBlockedId(targetId); blockMapper.insert(b);
        }
        friendMapper.delete(new LambdaQueryWrapper<ChatFriend>()
                .eq(ChatFriend::getUserId, userId).eq(ChatFriend::getFriendId, targetId));
        friendMapper.delete(new LambdaQueryWrapper<ChatFriend>()
                .eq(ChatFriend::getUserId, targetId).eq(ChatFriend::getFriendId, userId));
        followMapper.delete(new LambdaQueryWrapper<ChatFollow>()
                .eq(ChatFollow::getFollowerId, userId).eq(ChatFollow::getFollowingId, targetId));
        followMapper.delete(new LambdaQueryWrapper<ChatFollow>()
                .eq(ChatFollow::getFollowerId, targetId).eq(ChatFollow::getFollowingId, userId));
    }

    public void unblock(Long userId, Long targetId) {
        blockMapper.delete(new LambdaQueryWrapper<ChatBlock>()
                .eq(ChatBlock::getUserId, userId).eq(ChatBlock::getBlockedId, targetId));
    }

    private void addFriendPair(Long a, Long b) {
        if (friendMapper.selectCount(new LambdaQueryWrapper<ChatFriend>()
                .eq(ChatFriend::getUserId, a).eq(ChatFriend::getFriendId, b)) == 0) {
            ChatFriend f = new ChatFriend(); f.setUserId(a); f.setFriendId(b); friendMapper.insert(f);
        }
    }
}
