package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/** 聊天室治理：禁言、举报、敏感词和审计。 */
@Service
@RequiredArgsConstructor
public class ChatModerationService {

    private final ChatMuteMapper muteMapper;
    private final ChatReportMapper reportMapper;
    private final ChatSensitiveWordMapper sensitiveWordMapper;
    private final ChatAuditLogMapper auditLogMapper;
    private final ChatConversationMapper conversationMapper;
    private final ChatConversationMemberMapper memberMapper;
    private final ChatMessageMapper messageMapper;
    private final ChatGroupMapper groupMapper;
    private final ChatPermissionService permissionService;
    private final NotificationService notificationService;

    @Transactional
    public void muteGlobal(Long operatorId, Long userId, int minutes, String reason) {
        if (operatorId.equals(userId)) throw new BusinessException("不能禁言自己");
        ChatMute m = new ChatMute();
        m.setScope("global"); m.setUserId(userId); m.setOperatorId(operatorId);
        m.setReason(reason); m.setMutedUntil(LocalDateTime.now().plusMinutes(minutes));
        muteMapper.insert(m);
        notificationService.notify(userId, "你已被全站禁言，截止 " + m.getMutedUntil(), "chat_mute");
        audit(operatorId, "mute_global", "user", userId, "{\"minutes\":" + minutes + "}");
    }

    @Transactional
    public void muteConversation(Long operatorId, Long conversationId, Long userId, int minutes, String reason) {
        ChatConversation c = permissionService.requireActiveConversation(conversationId);
        ChatConversationMember operator = permissionService.requireMember(conversationId, operatorId);
        if (!permissionService.isConversationManager(operator)) throw new BusinessException(403, "无会话管理权限");
        if (operatorId.equals(userId)) throw new BusinessException("不能禁言自己");
        ChatMute m = new ChatMute();
        m.setScope("conversation"); m.setConversationId(conversationId); m.setUserId(userId);
        m.setOperatorId(operatorId); m.setReason(reason); m.setMutedUntil(LocalDateTime.now().plusMinutes(minutes));
        muteMapper.insert(m);
        memberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, conversationId)
                .eq(ChatConversationMember::getUserId, userId)
                .set(ChatConversationMember::getMutedUntil, m.getMutedUntil()));
        notificationService.notify(userId, "你已被「" + (c.getTitle() == null ? "会话" : c.getTitle()) + "」禁言，截止 " + m.getMutedUntil(), "chat_mute");
        audit(operatorId, "mute_conversation", "conversation", conversationId, "{\"userId\":" + userId + ",\"minutes\":" + minutes + "}");
    }

    @Transactional
    public void revokeMute(Long operatorId, Long muteId) {
        ChatMute m = muteMapper.selectById(muteId);
        if (m == null || m.getRevokedAt() != null) throw new BusinessException(404, "禁言记录不存在或已解除");
        muteMapper.update(null, new LambdaUpdateWrapper<ChatMute>()
                .eq(ChatMute::getId, muteId).set(ChatMute::getRevokedAt, LocalDateTime.now()).set(ChatMute::getRevokedBy, operatorId));
        if ("conversation".equals(m.getScope())) {
            memberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                    .eq(ChatConversationMember::getConversationId, m.getConversationId())
                    .eq(ChatConversationMember::getUserId, m.getUserId())
                    .set(ChatConversationMember::getMutedUntil, null));
        }
        audit(operatorId, "revoke_mute", "mute", muteId, "{}");
    }

    @Transactional
    public void deleteMessage(Long operatorId, Long messageId) {
        ChatMessage m = messageMapper.selectById(messageId);
        if (m == null) throw new BusinessException(404, "消息不存在");
        messageMapper.update(null, new LambdaUpdateWrapper<ChatMessage>()
                .eq(ChatMessage::getId, messageId).set(ChatMessage::getStatus, "deleted").set(ChatMessage::getContent, ""));
        audit(operatorId, "delete_message", "chat_message", messageId, "{}");
    }

    @Transactional
    public Long report(Long reporterId, Long conversationId, Long messageId, Long targetUserId, String reason, String detail) {
        if (conversationId != null) permissionService.requireMember(conversationId, reporterId);
        ChatReport r = new ChatReport();
        r.setReporterId(reporterId); r.setConversationId(conversationId); r.setMessageId(messageId);
        r.setTargetUserId(targetUserId); r.setReason(reason); r.setDetail(detail); r.setStatus("open");
        if (messageId != null) {
            ChatMessage m = messageMapper.selectById(messageId);
            if (m != null) {
                if (targetUserId == null) r.setTargetUserId(m.getSenderId());
                r.setContextJson("{\"messageId\":" + messageId + "}");
            }
        }
        reportMapper.insert(r);
        notificationService.notifyAdmins("收到新的聊天举报 #" + r.getId(), "chat_report");
        audit(reporterId, "report", "chat_report", r.getId(), "{\"reason\":\"" + safe(reason) + "\"}");
        return r.getId();
    }

    public List<ChatReport> reports(String status) {
        LambdaQueryWrapper<ChatReport> q = new LambdaQueryWrapper<>();
        if (status != null && !status.isBlank()) q.eq(ChatReport::getStatus, status);
        return reportMapper.selectList(q.orderByDesc(ChatReport::getCreatedAt).last("LIMIT 200"));
    }

    @Transactional
    public void handleReport(Long operatorId, Long reportId, String status, Long ticketId) {
        if (!List.of("processing", "resolved", "rejected").contains(status)) throw new BusinessException("举报状态不合法");
        ChatReport r = reportMapper.selectById(reportId);
        if (r == null) throw new BusinessException(404, "举报不存在");
        reportMapper.update(null, new LambdaUpdateWrapper<ChatReport>()
                .eq(ChatReport::getId, reportId).set(ChatReport::getStatus, status)
                .set(ChatReport::getTicketId, ticketId).set(ChatReport::getHandledBy, operatorId)
                .set(ChatReport::getHandledAt, LocalDateTime.now()));
        audit(operatorId, "handle_report", "chat_report", reportId, "{\"status\":\"" + status + "\"}");
    }

    public List<ChatSensitiveWord> words() {
        return sensitiveWordMapper.selectList(new LambdaQueryWrapper<ChatSensitiveWord>()
                .orderByDesc(ChatSensitiveWord::getUpdatedAt));
    }

    @Transactional
    public void saveWord(Long operatorId, Long id, String word, String level, Integer enabled) {
        if (!"review".equals(level) && !"block".equals(level)) throw new BusinessException("敏感词级别不合法");
        if (id == null) {
            if (sensitiveWordMapper.selectCount(new LambdaQueryWrapper<ChatSensitiveWord>().eq(ChatSensitiveWord::getWord, word)) > 0) {
                throw new BusinessException("敏感词已存在");
            }
            ChatSensitiveWord w = new ChatSensitiveWord();
            w.setWord(word); w.setLevel(level); w.setEnabled(enabled == null ? 1 : enabled); w.setCreatedBy(operatorId);
            sensitiveWordMapper.insert(w);
        } else {
            ChatSensitiveWord w = sensitiveWordMapper.selectById(id);
            if (w == null) throw new BusinessException(404, "敏感词不存在");
            w.setWord(word); w.setLevel(level); w.setEnabled(enabled == null ? 1 : enabled);
            sensitiveWordMapper.updateById(w);
        }
        audit(operatorId, "save_sensitive_word", "sensitive_word", id, "{}");
    }

    public void deleteWord(Long operatorId, Long id) {
        sensitiveWordMapper.deleteById(id);
        audit(operatorId, "delete_sensitive_word", "sensitive_word", id, "{}");
    }

    public void audit(Long operatorId, String action, String targetType, Long targetId, String detailJson) {
        ChatAuditLog log = new ChatAuditLog();
        log.setOperatorId(operatorId); log.setAction(action); log.setTargetType(targetType);
        log.setTargetId(targetId); log.setDetailJson(detailJson);
        auditLogMapper.insert(log);
    }

    private String safe(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}

