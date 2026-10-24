package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.entity.ChatMessage;
import com.eggworld.entity.ChatMessageArchive;
import com.eggworld.mapper.ChatMessageArchiveMapper;
import com.eggworld.mapper.ChatMessageMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 聊天室保留策略：先归档，再分批清理。
 *
 * 默认公共频道与私聊/群聊均为 30 天（2026-09-20 统一）；处罚、举报、审计不在这里清理。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatRetentionService {

    private final ChatMessageMapper messageMapper;
    private final ChatMessageArchiveMapper archiveMapper;
    private final UserMapper userMapper;

    @Value("${eggworld.chat.retention.channel-days:30}")
    private int channelDays;
    @Value("${eggworld.chat.retention.direct-group-days:30}")
    private int directGroupDays;
    @Value("${eggworld.chat.retention.batch-size:1000}")
    private int batchSize;

    @Transactional
    public int archiveAndDeleteOnce() {
        LocalDateTime channelCutoff = LocalDateTime.now().minusDays(channelDays);
        LocalDateTime directCutoff = LocalDateTime.now().minusDays(directGroupDays);
        // 真实截止条件由 SQL 子查询完成，避免按会话逐条查询造成 N+1。
        List<ChatMessage> messages = messageMapper.selectList(new LambdaQueryWrapper<ChatMessage>()
                .apply("(conversation_id IN (SELECT id FROM chat_conversations WHERE type='channel') AND created_at < {0}) OR " +
                                "(conversation_id IN (SELECT id FROM chat_conversations WHERE type IN ('direct','group')) AND created_at < {1})",
                        channelCutoff, directCutoff)
                .orderByAsc(ChatMessage::getId)
                .last("LIMIT " + Math.max(1, Math.min(batchSize, 5000))));
        if (messages.isEmpty()) return 0;

        for (ChatMessage m : messages) {
            ChatMessageArchive a = new ChatMessageArchive();
            a.setId(m.getId()); a.setConversationId(m.getConversationId()); a.setSenderId(m.getSenderId());
            var sender = userMapper.selectById(m.getSenderId());
            a.setSenderSnapshot(sender == null ? "已注销用户" : sender.getNickname());
            a.setMessageType(m.getMessageType()); a.setContent(m.getContent()); a.setReplyToId(m.getReplyToId());
            a.setMentionJson(m.getMentionJson()); a.setStatus(m.getStatus()); a.setCreatedAt(m.getCreatedAt());
            if (archiveMapper.selectById(m.getId()) == null) archiveMapper.insert(a);
        }
        List<Long> ids = messages.stream().map(ChatMessage::getId).toList();
        messageMapper.deleteBatchIds(ids);
        log.info("聊天室归档清理完成：archived={} deleted={}", ids.size(), ids.size());
        return ids.size();
    }
}


