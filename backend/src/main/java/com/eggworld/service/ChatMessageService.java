package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.common.TextSanitizer;
import com.eggworld.dto.*;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/** 聊天室核心读写服务：会话、消息、未读和已读。 */
@Service
@RequiredArgsConstructor
public class ChatMessageService {

    private final ChatConversationMapper conversationMapper;
    private final ChatConversationMemberMapper memberMapper;
    private final ChatMessageMapper messageMapper;
    private final ChatReadStateMapper readStateMapper;
    private final ChatSensitiveWordMapper sensitiveWordMapper;
    private final ChatAuditLogMapper auditLogMapper;
    private final UserMapper userMapper;
    private final ChatPermissionService permissionService;
    private final ChatRealtimePublisher realtimePublisher;
    private final ChatOnlineRewardService onlineRewardService;

    /** 进程内滑动窗口限流；后续多实例部署需换成 Redis。 */
    private final ConcurrentHashMap<Long, ArrayDeque<Long>> sendWindows = new ConcurrentHashMap<>();
    private static final int MAX_PER_SECOND = 3;
    private static final int MAX_TRACKED_SENDERS = 20000;
    private long sendWindowsCleanedAt;

    /** 私聊总开关：暂时关闭，只保留官方频道与群聊。恢复时改为 true。 */
    public static final boolean DIRECT_CHAT_ENABLED = false;

    // The internal ensure call does not cross a Spring proxy. Keep membership + count atomic here too.
    // READ_COMMITTED lets a concurrent first visit see the membership committed while it waited for the channel lock.
    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public List<ChatConversationVO> listConversations(Long userId) {
        ensureOfficialChannelMembership(userId);
        List<ChatConversationMember> memberships = memberMapper.selectList(
                new LambdaQueryWrapper<ChatConversationMember>()
                        .eq(ChatConversationMember::getUserId, userId)
                        .eq(ChatConversationMember::getStatus, "active")
                        .orderByDesc(ChatConversationMember::getPinned)
                        .orderByDesc(ChatConversationMember::getUpdatedAt));
        if (memberships.isEmpty()) return List.of();
        List<ChatConversation> conversations = conversationMapper.selectBatchIds(memberships.stream()
                .map(ChatConversationMember::getConversationId).distinct().toList());
        List<ChatConversation> activeConversations = conversations.stream()
                .filter(c -> "active".equals(c.getStatus()))
                .toList();
        Map<Long, ChatConversation> byId = activeConversations.stream()
                .collect(Collectors.toMap(ChatConversation::getId, c -> c));
        List<Long> messageIds = activeConversations.stream()
                .map(ChatConversation::getLastMessageId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<Long, ChatMessage> lastMessages = messageIds.isEmpty() ? Map.of() : messageMapper.selectBatchIds(messageIds).stream()
                .collect(Collectors.toMap(ChatMessage::getId, m -> m));
        List<Long> directIds = activeConversations.stream()
                .filter(c -> "direct".equals(c.getType()))
                .map(ChatConversation::getId)
                .toList();
        Map<Long, ChatConversationMember> peers = directIds.isEmpty() ? Map.of() : memberMapper.selectList(
                new LambdaQueryWrapper<ChatConversationMember>().in(ChatConversationMember::getConversationId, directIds)
                        .ne(ChatConversationMember::getUserId, userId)).stream()
                .collect(Collectors.toMap(ChatConversationMember::getConversationId, m -> m, (first, ignored) -> first));
        List<Long> peerIds = peers.values().stream().map(ChatConversationMember::getUserId).distinct().toList();
        Map<Long, User> peerUsers = peerIds.isEmpty() ? Map.of() : userMapper.selectBatchIds(peerIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));
        List<ChatConversationVO> result = new ArrayList<>();
        for (ChatConversationMember m : memberships) {
            ChatConversation c = byId.get(m.getConversationId());
            if (c == null) continue;
            ChatConversationMember peer = peers.get(c.getId());
            result.add(toConversationVO(c, m, c.getLastMessageId() == null ? null : lastMessages.get(c.getLastMessageId()), peer,
                    peer == null ? null : peerUsers.get(peer.getUserId())));
        }
        result.sort(Comparator.comparing(ChatConversationVO::getLastMessageAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return result;
    }
    /** 官方频道对全体已登录用户可见；首次访问时惰性加入，保证可直接发言。 */
    @Transactional
    public void ensureOfficialChannelMembership(Long userId) {
        List<ChatConversation> channels = conversationMapper.selectList(new LambdaQueryWrapper<ChatConversation>()
                .eq(ChatConversation::getType, "channel")
                .eq(ChatConversation::getStatus, "active"));
        if (channels.isEmpty()) return;
        Map<Long, ChatConversationMember> existing = memberMapper.selectList(
                new LambdaQueryWrapper<ChatConversationMember>()
                        .eq(ChatConversationMember::getUserId, userId)
                        .in(ChatConversationMember::getConversationId, channels.stream().map(ChatConversation::getId).toList()))
                .stream().collect(Collectors.toMap(ChatConversationMember::getConversationId, m -> m));
        List<Long> reactivate = new ArrayList<>();
        // Existing members take only the two bulk reads above. Lock only the first-join path,
        // in stable channel order, and recheck using a current read rather than an old transaction snapshot.
        for (ChatConversation c : channels.stream().sorted(Comparator.comparing(ChatConversation::getId)).toList()) {
            ChatConversationMember membership = existing.get(c.getId());
            if (membership == null) {
                ChatConversation locked = conversationMapper.selectOne(new LambdaQueryWrapper<ChatConversation>()
                        .eq(ChatConversation::getId, c.getId()).eq(ChatConversation::getType, "channel")
                        .eq(ChatConversation::getStatus, "active").last("FOR UPDATE"));
                if (locked == null) continue;
                membership = memberMapper.selectOne(new LambdaQueryWrapper<ChatConversationMember>()
                        .eq(ChatConversationMember::getConversationId, c.getId())
                        .eq(ChatConversationMember::getUserId, userId).last("FOR UPDATE"));
                if (membership == null) {
                    addMember(c.getId(), userId, "member");
                    conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                            .eq(ChatConversation::getId, c.getId())
                            .setSql("member_count = member_count + 1"));
                    continue;
                }
            }
            if (!"active".equals(membership.getStatus())) reactivate.add(c.getId());
        }
        if (!reactivate.isEmpty()) {
            // Preserve the existing official-channel rejoin/count rules and all unread/mute/preference fields.
            memberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                    .eq(ChatConversationMember::getUserId, userId)
                    .in(ChatConversationMember::getConversationId, reactivate)
                    .ne(ChatConversationMember::getStatus, "active")
                    .set(ChatConversationMember::getStatus, "active")
                    .set(ChatConversationMember::getLeftAt, null));
        }
    }

    @Transactional
    public ChatConversationVO createDirect(Long userId, Long targetId) {
        if (!DIRECT_CHAT_ENABLED) throw new BusinessException(403, "私聊功能暂时关闭，请使用官方频道或群聊");
        permissionService.requireDirectAllowed(userId, targetId);
        String directKey = userId < targetId ? userId + ":" + targetId : targetId + ":" + userId;
        ChatConversation c = conversationMapper.selectOne(new LambdaQueryWrapper<ChatConversation>()
                .eq(ChatConversation::getDirectKey, directKey));
        if (c == null) {
            c = new ChatConversation();
            c.setType("direct");
            c.setDirectKey(directKey);
            c.setVisibility("private");
            c.setStatus("active");
            c.setMaxMembers(2);
            c.setMemberCount(2);
            conversationMapper.insert(c);
            addMember(c.getId(), userId, "member");
            addMember(c.getId(), targetId, "member");
        } else {
            reactivateMember(c.getId(), userId);
            reactivateMember(c.getId(), targetId);
        }
        return toConversationVO(c, permissionService.requireMember(c.getId(), userId), userId);
    }

    @Transactional
    public ChatMessageVO send(Long userId, Long conversationId, ChatMessageDTO dto) {
        permissionService.requireCanSend(conversationId, userId);
        rateLimit(userId);
        String content = TextSanitizer.clean(dto.getContent());
        if (!StringUtils.hasText(content)) throw new BusinessException("消息内容不能为空");
        checkSensitive(content);

        if (dto.getClientMsgId() != null && !dto.getClientMsgId().isBlank()) {
            ChatMessage exists = messageMapper.selectOne(new LambdaQueryWrapper<ChatMessage>()
                    .eq(ChatMessage::getSenderId, userId)
                    .eq(ChatMessage::getClientMsgId, dto.getClientMsgId()));
            if (exists != null) return toMessageVO(exists, userId);
        }

        if (dto.getReplyToId() != null) {
            ChatMessage reply = messageMapper.selectById(dto.getReplyToId());
            if (reply == null || !conversationId.equals(reply.getConversationId())) {
                throw new BusinessException("回复的消息不存在");
            }
        }

        List<Long> mentions = dto.getMentionUserIds() == null ? List.of() :
                dto.getMentionUserIds().stream().filter(Objects::nonNull).distinct().limit(20).toList();
        for (Long mentionId : mentions) {
            permissionService.requireMember(conversationId, mentionId);
        }

        ChatMessage message = new ChatMessage();
        message.setConversationId(conversationId);
        message.setSenderId(userId);
        message.setMessageType("text");
        message.setContent(content);
        message.setReplyToId(dto.getReplyToId());
        message.setMentionJson(toJson(mentions));
        message.setStatus("normal");
        message.setClientMsgId(dto.getClientMsgId());
        // 显式赋值时间戳，修「消息日期显示成 1970-01-01」。
        //
        // 根因：MyBatis-Plus 的 insert 不回读数据库生成的默认值（只回填自增 id），
        // 所以即使表上 created_at 有 DEFAULT CURRENT_TIMESTAMP、库里那行是对的，
        // 这个 Java 对象里的 createdAt 仍然是 null。于是：
        //   ① 下面写 last_message_at 时拿到 null（会话列表时间变空）；
        //   ② toMessageVO 返回 createdAt=null，前端 new Date(null) = 1970-01-01，
        //      消息列表的日期分隔就显示成「1970年1月1日」（刷新后重新查库才恢复）。
        // 在 insert 前取好时间，两处都复用同一个值。
        LocalDateTime now = LocalDateTime.now();
        message.setCreatedAt(now);
        message.setUpdatedAt(now);
        messageMapper.insert(message);

        conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                .eq(ChatConversation::getId, conversationId)
                .set(ChatConversation::getLastMessageId, message.getId())
                .set(ChatConversation::getLastMessageAt, now));

        memberMapper.incrementUnread(conversationId, userId, mentions);
        ChatMessageVO vo = toMessageVO(message, userId);
        realtimePublisher.publishMessage(conversationId, vo);
        // 发言加成：事务提交后再发币，避免奖励失败回滚整条消息；异常只记日志。
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            onlineRewardService.rewardMessage(userId);
                        }
                    });
        } else {
            onlineRewardService.rewardMessage(userId);
        }
        return vo;
    }

    public ChatHistoryVO history(Long userId, Long conversationId, Long beforeId, int size) {
        permissionService.requireMember(conversationId, userId);
        int limit = Math.max(1, Math.min(size, 50));
        Page<ChatMessage> page = messageMapper.selectPage(new Page<>(1, limit + 1, false),
                new LambdaQueryWrapper<ChatMessage>()
                        .eq(ChatMessage::getConversationId, conversationId)
                        .lt(beforeId != null, ChatMessage::getId, beforeId)
                        .orderByDesc(ChatMessage::getId));
        List<ChatMessage> list = new ArrayList<>(page.getRecords());
        boolean hasMore = list.size() > limit;
        if (hasMore) list = list.subList(0, limit);
        Collections.reverse(list);
        ChatHistoryVO vo = new ChatHistoryVO();
        List<Long> senderIds = list.stream().map(ChatMessage::getSenderId).filter(Objects::nonNull).distinct().toList();
        Map<Long, User> senders = senderIds.isEmpty() ? Map.of() : userMapper.selectBatchIds(senderIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));
        vo.setRecords(list.stream().map(m -> toMessageVO(m, senders.get(m.getSenderId()))).toList());
        vo.setHasMore(hasMore);
        if (!list.isEmpty()) vo.setNextBeforeId(list.get(0).getId());
        return vo;
    }

    @Transactional
    public void markRead(Long userId, Long conversationId, Long messageId) {
        permissionService.requireMember(conversationId, userId);
        Long maxId = messageId;
        if (maxId == null) {
            ChatMessage last = messageMapper.selectOne(new LambdaQueryWrapper<ChatMessage>()
                    .eq(ChatMessage::getConversationId, conversationId)
                    .orderByDesc(ChatMessage::getId).last("LIMIT 1"));
            maxId = last == null ? 0L : last.getId();
        }
        memberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, conversationId)
                .eq(ChatConversationMember::getUserId, userId)
                .set(ChatConversationMember::getLastReadMessageId, maxId)
                .set(ChatConversationMember::getLastReadAt, LocalDateTime.now())
                .set(ChatConversationMember::getUnreadCount, 0)
                .set(ChatConversationMember::getMentionUnread, 0));
        ChatReadState state = readStateMapper.selectOne(new LambdaQueryWrapper<ChatReadState>()
                .eq(ChatReadState::getUserId, userId)
                .eq(ChatReadState::getConversationId, conversationId));
        if (state == null) {
            state = new ChatReadState();
            state.setUserId(userId);
            state.setConversationId(conversationId);
            state.setLastReadMessageId(maxId);
            readStateMapper.insert(state);
        } else {
            state.setLastReadMessageId(maxId);
            readStateMapper.updateById(state);
        }
        realtimePublisher.publishRead(conversationId, userId, maxId);
    }

    @Transactional
    public void recall(Long userId, Long messageId) {
        ChatMessage message = messageMapper.selectById(messageId);
        if (message == null) throw new BusinessException(404, "消息不存在");
        if (!message.getSenderId().equals(userId)) throw new BusinessException(403, "只能撤回自己的消息");
        if (message.getCreatedAt() != null && message.getCreatedAt().isBefore(LocalDateTime.now().minusMinutes(2))) {
            throw new BusinessException("消息发送超过2分钟，不能撤回");
        }
        messageMapper.update(null, new LambdaUpdateWrapper<ChatMessage>()
                .eq(ChatMessage::getId, messageId)
                .set(ChatMessage::getStatus, "recalled")
                .set(ChatMessage::getContent, ""));
        realtimePublisher.publishRecall(message.getConversationId(), messageId, userId);
    }

    @Transactional
    public void deleteMessage(Long operatorId, Long messageId) {
        ChatMessage message = messageMapper.selectById(messageId);
        if (message == null) throw new BusinessException(404, "消息不存在");
        ChatConversationMember member = permissionService.requireMember(message.getConversationId(), operatorId);
        if (!permissionService.isConversationManager(member)) {
            throw new BusinessException(403, "无消息管理权限");
        }
        messageMapper.update(null, new LambdaUpdateWrapper<ChatMessage>()
                .eq(ChatMessage::getId, messageId)
                .set(ChatMessage::getStatus, "deleted")
                .set(ChatMessage::getContent, ""));
        realtimePublisher.publishRecall(message.getConversationId(), messageId, operatorId);
    }
    public ChatConversationVO conversation(Long userId, Long conversationId) {
        ChatConversationMember m = permissionService.requireMember(conversationId, userId);
        ChatConversation c = permissionService.requireActiveConversation(conversationId);
        return toConversationVO(c, m, userId);
    }

    private void addMember(Long conversationId, Long userId, String role) {
        ChatConversationMember m = new ChatConversationMember();
        m.setConversationId(conversationId);
        m.setUserId(userId);
        m.setRole(role);
        m.setStatus("active");
        m.setLastReadMessageId(0L);
        m.setUnreadCount(0);
        m.setMentionUnread(0);
        m.setNotificationMode("all");
        m.setPinned(0);
        memberMapper.insert(m);
    }

    private void reactivateMember(Long conversationId, Long userId) {
        memberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, conversationId)
                .eq(ChatConversationMember::getUserId, userId)
                .set(ChatConversationMember::getStatus, "active")
                .set(ChatConversationMember::getLeftAt, null));
    }

    private void rateLimit(Long userId) {
        // 清理、占位和扣减在同一锁内；避免删除队列后旧请求继续向游离队列计数。
        synchronized (sendWindows) {
            long now = System.currentTimeMillis();
            if (now - sendWindowsCleanedAt >= 1000) {
                sendWindows.entrySet().removeIf(e -> e.getValue().isEmpty() || now - e.getValue().peekLast() >= 1000);
                sendWindowsCleanedAt = now;
            }
            if (!sendWindows.containsKey(userId) && sendWindows.size() >= MAX_TRACKED_SENDERS) {
                throw new com.eggworld.common.RateLimitException(1);
            }
            ArrayDeque<Long> q = sendWindows.computeIfAbsent(userId, k -> new ArrayDeque<>());
            while (!q.isEmpty() && now - q.peekFirst() >= 1000) q.pollFirst();
            if (q.size() >= MAX_PER_SECOND) throw new com.eggworld.common.RateLimitException(1);
            q.addLast(now);
        }
    }

    private void checkSensitive(String content) {
        List<ChatSensitiveWord> words = sensitiveWordMapper.selectList(new LambdaQueryWrapper<ChatSensitiveWord>()
                .eq(ChatSensitiveWord::getEnabled, 1));
        for (ChatSensitiveWord w : words) {
            if (content.contains(w.getWord())) {
                if ("block".equals(w.getLevel())) throw new BusinessException("消息包含不允许的内容");
                throw new BusinessException("消息包含敏感词，请修改后再发送");
            }
        }
    }

    private ChatConversationVO toConversationVO(ChatConversation c, ChatConversationMember m, Long userId) {
        ChatConversationMember peer = "direct".equals(c.getType()) ? memberMapper.selectOne(new LambdaQueryWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, c.getId()).ne(ChatConversationMember::getUserId, userId).last("LIMIT 1")) : null;
        return toConversationVO(c, m, c.getLastMessageId() == null ? null : messageMapper.selectById(c.getLastMessageId()),
                peer, peer == null ? null : userMapper.selectById(peer.getUserId()));
    }

    private ChatConversationVO toConversationVO(ChatConversation c, ChatConversationMember m, ChatMessage last,
                                                ChatConversationMember peer, User peerUser) {
        ChatConversationVO vo = new ChatConversationVO();
        vo.setId(c.getId()); vo.setType(c.getType()); vo.setTitle(c.getTitle());
        vo.setDescription(c.getDescription()); vo.setVisibility(c.getVisibility()); vo.setReadOnly(c.getReadOnly());
        vo.setMemberCount(c.getMemberCount()); vo.setLastMessageAt(c.getLastMessageAt());
        vo.setUnreadCount(m.getUnreadCount()); vo.setMentionUnread(m.getMentionUnread());
        vo.setNotificationMode(m.getNotificationMode()); vo.setPinned(m.getPinned());
        if (peer != null) {
            vo.setPeerUserId(peer.getUserId()); vo.setPeerNickname(peerUser == null ? "已注销用户" : peerUser.getNickname());
            vo.setTitle(vo.getPeerNickname());
        }
        if (last != null) vo.setLastMessagePreview("recalled".equals(last.getStatus()) ? "消息已撤回" : preview(last.getContent()));
        return vo;
    }

    private ChatMessageVO toMessageVO(ChatMessage m, Long viewerId) {
        return toMessageVO(m, userMapper.selectById(m.getSenderId()));
    }

    private ChatMessageVO toMessageVO(ChatMessage m, User sender) {
        ChatMessageVO vo = new ChatMessageVO();
        vo.setId(m.getId());
        vo.setConversationId(m.getConversationId());
        vo.setSenderId(m.getSenderId());
        vo.setSenderNickname(sender == null ? "已注销用户" : sender.getNickname());
        vo.setMessageType(m.getMessageType());
        vo.setContent("recalled".equals(m.getStatus()) ? "" : m.getContent());
        vo.setReplyToId(m.getReplyToId());
        vo.setStatus(m.getStatus());
        vo.setClientMsgId(m.getClientMsgId());
        vo.setMentionUserIds(parseJson(m.getMentionJson()));
        vo.setCreatedAt(m.getCreatedAt());
        return vo;
    }

    private String preview(String content) {
        if (content == null) return "";
        return content.length() <= 60 ? content : content.substring(0, 60) + "…";
    }

    private String toJson(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return "[]";
        return "[" + ids.stream().map(String::valueOf).collect(Collectors.joining(",")) + "]";
    }

    private List<Long> parseJson(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) return List.of();
        String s = json.replace("[", "").replace("]", "").trim();
        if (s.isBlank()) return List.of();
        return Arrays.stream(s.split(",")).map(String::trim).filter(StringUtils::hasText)
                .map(Long::valueOf).toList();
    }
}
