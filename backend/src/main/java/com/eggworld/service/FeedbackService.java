package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.CreateFeedbackDTO;
import com.eggworld.entity.FeedbackMessage;
import com.eggworld.entity.FeedbackTicket;
import com.eggworld.entity.User;
import com.eggworld.mapper.FeedbackMessageMapper;
import com.eggworld.mapper.FeedbackTicketMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 反馈工单服务
 * - 学生：提交、查看自己的反馈（含管理员回复）、标记已读
 * - 管理员：列表、回复、关闭；回复时给用户发站内通知
 */
@Service
@RequiredArgsConstructor
public class FeedbackService {

    /** 反馈类型白名单 */
    private static final Set<String> TYPE_KEYS = Set.of("bug", "suggestion", "report", "other");

    private final FeedbackTicketMapper feedbackTicketMapper;
    private final FeedbackMessageMapper feedbackMessageMapper;
    private final UserMapper userMapper;
    private final NotificationService notificationService;

    /**
     * 学生提交反馈工单
     */
    public Long create(Long userId, CreateFeedbackDTO dto) {
        FeedbackTicket ticket = new FeedbackTicket();
        ticket.setUserId(userId);
        ticket.setContent(dto.getContent());
        ticket.setType(normalizeType(dto.getType()));
        ticket.setContact(dto.getContact());
        ticket.setStatus("open");
        ticket.setUserRead(1);              // 自己提交的，不需要"已读回复"提醒
        feedbackTicketMapper.insert(ticket);
        return ticket.getId();
    }

    /**
     * 学生：我的反馈列表（新到旧），含管理员回复与已读状态
     */
    public Page<FeedbackTicket> myTickets(Long userId, long page, long size) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        Page<FeedbackTicket> result = feedbackTicketMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<FeedbackTicket>()
                        .eq(FeedbackTicket::getUserId, userId)
                        .orderByDesc(FeedbackTicket::getCreatedAt));
        fillMessages(result.getRecords());
        return result;
    }

    /**
     * 学生：未读回复数（入口红点用）；未登录返回 0 而不是报错
     */
    public long unreadCount(Long userId) {
        if (userId == null) {
            return 0;
        }
        return feedbackTicketMapper.selectCount(new LambdaQueryWrapper<FeedbackTicket>()
                .eq(FeedbackTicket::getUserId, userId)
                .eq(FeedbackTicket::getUserRead, 0));
    }

    /**
     * 学生：把某条反馈的回复标记为已读（只能操作自己的）
     */
    public void markRead(Long userId, Long ticketId) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        FeedbackTicket ticket = getTicketOrThrow(ticketId);
        if (!userId.equals(ticket.getUserId())) {
            throw new BusinessException(403, "只能查看自己的反馈");
        }
        if (ticket.getUserRead() != null && ticket.getUserRead() == 1) {
            return;                          // 已读，无需重复写库
        }
        ticket.setUserRead(1);
        feedbackTicketMapper.updateById(ticket);
    }

    /**
     * 管理员：工单列表（可按状态筛选，附带提交人昵称）
     */
    public Page<FeedbackTicket> list(String status, long page, long size) {
        LambdaQueryWrapper<FeedbackTicket> wrapper = new LambdaQueryWrapper<FeedbackTicket>()
                .eq(status != null && !status.isBlank(), FeedbackTicket::getStatus, status)
                .orderByAsc(FeedbackTicket::getStatus)
                .orderByDesc(FeedbackTicket::getCreatedAt);
        Page<FeedbackTicket> result = feedbackTicketMapper.selectPage(new Page<>(page, size), wrapper);

        // 批量填充提交人昵称（避免 N+1）
        List<Long> userIds = result.getRecords().stream()
                .map(FeedbackTicket::getUserId)
                .filter(id -> id != null)
                .distinct()
                .toList();
        if (!userIds.isEmpty()) {
            Map<Long, String> nickMap = userMapper.selectBatchIds(userIds).stream()
                    .collect(Collectors.toMap(User::getId, User::getNickname));
            result.getRecords().forEach(t -> t.setUserName(nickMap.get(t.getUserId())));
        }
        fillMessages(result.getRecords());
        return result;
    }

    /**
     * 管理员：回复工单（open → replied）
     * 回复会追加到会话线程；同时把工单标为「用户未读」并发站内通知，
     * 用户才知道被回复了
     */
    @Transactional
    public void reply(Long ticketId, String adminReply) {
        FeedbackTicket ticket = getTicketOrThrow(ticketId);
        ticket.setAdminReply(adminReply);          // 保留一份"最近一次回复"，管理端列表直接用
        ticket.setStatus("replied");
        ticket.setRepliedAt(LocalDateTime.now());
        ticket.setUserRead(0);
        ticket.setUpdatedAt(LocalDateTime.now());
        feedbackTicketMapper.updateById(ticket);

        appendMessage(ticketId, "admin", adminReply);

        notificationService.notify(ticket.getUserId(),
                "你的反馈已回复，去「帮助与反馈 → 我的反馈」查看～", "feedback_reply");
    }

    /**
     * 学生：对已提交的反馈继续追问
     * 追问会追加到会话线程，并把工单退回「待处理」让管理员看到；
     * 已关闭的工单不允许追问（避免无限拉扯）
     */
    @Transactional
    public void followUp(Long userId, Long ticketId, String content) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        FeedbackTicket ticket = getTicketOrThrow(ticketId);
        if (!userId.equals(ticket.getUserId())) {
            throw new BusinessException(403, "只能追问自己的反馈");
        }
        if ("closed".equals(ticket.getStatus())) {
            throw new BusinessException("该反馈已关闭，如有新问题请重新提交一条反馈");
        }
        appendMessage(ticketId, "user", content);

        ticket.setStatus("open");                  // 退回待处理，管理员侧会重新出现
        ticket.setUserRead(1);                      // 自己发的，不需要提醒自己
        ticket.setUpdatedAt(LocalDateTime.now());
        feedbackTicketMapper.updateById(ticket);
    }

    /**
     * 管理员：关闭工单（open/replied → closed）
     */
    public void close(Long ticketId) {
        FeedbackTicket ticket = getTicketOrThrow(ticketId);
        ticket.setStatus("closed");
        ticket.setUpdatedAt(LocalDateTime.now());
        feedbackTicketMapper.updateById(ticket);
    }

    /** 追加一条会话消息 */
    private void appendMessage(Long ticketId, String senderType, String content) {
        FeedbackMessage m = new FeedbackMessage();
        m.setTicketId(ticketId);
        m.setSenderType(senderType);
        m.setContent(content);
        feedbackMessageMapper.insert(m);
    }

    /** 批量填充会话消息（按工单分组，避免 N+1） */
    private void fillMessages(List<FeedbackTicket> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        List<Long> ids = records.stream().map(FeedbackTicket::getId).filter(id -> id != null).toList();
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, List<FeedbackMessage>> grouped = feedbackMessageMapper
                .selectList(new LambdaQueryWrapper<FeedbackMessage>()
                        .in(FeedbackMessage::getTicketId, ids)
                        .orderByAsc(FeedbackMessage::getCreatedAt)
                        .orderByAsc(FeedbackMessage::getId))
                .stream()
                .collect(Collectors.groupingBy(FeedbackMessage::getTicketId));
        records.forEach(t -> t.setMessages(grouped.getOrDefault(t.getId(), new ArrayList<>())));
    }

    private FeedbackTicket getTicketOrThrow(Long ticketId) {
        FeedbackTicket ticket = feedbackTicketMapper.selectById(ticketId);
        if (ticket == null) {
            throw new BusinessException(404, "工单不存在");
        }
        return ticket;
    }

    /** 类型白名单校验：非法/缺省一律归为 other */
    private String normalizeType(String type) {
        if (type == null || type.isBlank() || !TYPE_KEYS.contains(type)) {
            return "other";
        }
        return type;
    }
}
