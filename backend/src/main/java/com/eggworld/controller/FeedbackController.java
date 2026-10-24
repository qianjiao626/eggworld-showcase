package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.CreateFeedbackDTO;
import com.eggworld.dto.FollowUpFeedbackDTO;
import com.eggworld.entity.FeedbackTicket;
import com.eggworld.service.FeedbackService;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 反馈工单接口（学生端）
 * - 提交反馈
 * - 查看「我的反馈」（含管理员回复）与未读数
 * - 标记回复已读
 */
@RestController
@RequestMapping("/api/feedback")
@RequiredArgsConstructor
public class FeedbackController {

    private final FeedbackService feedbackService;

    /** 提交反馈工单 */
    @PostMapping
    public Result<Long> create(@Valid @RequestBody CreateFeedbackDTO dto) {
        return Result.ok(feedbackService.create(UserContext.userId(), dto));
    }

    /** 我的反馈列表（新到旧，含管理员回复） */
    @GetMapping("/mine")
    public Result<Page<FeedbackTicket>> mine(@RequestParam(defaultValue = "1") long page,
                                             @RequestParam(defaultValue = "20") long size) {
        return Result.ok(feedbackService.myTickets(UserContext.userId(), page, size));
    }

    /** 未读回复数（给入口红点用） */
    @GetMapping("/mine/summary")
    public Result<Map<String, Long>> summary() {
        return Result.ok(Map.of("unread", feedbackService.unreadCount(UserContext.userId())));
    }

    /** 标记某条反馈的回复为已读 */
    @PostMapping("/{id}/read")
    public Result<Void> read(@PathVariable Long id) {
        feedbackService.markRead(UserContext.userId(), id);
        return Result.ok();
    }

    /** 对某条反馈继续追问（会追加到会话线程，并把工单退回待处理） */
    @PostMapping("/{id}/follow-up")
    public Result<Void> followUp(@PathVariable Long id, @Valid @RequestBody FollowUpFeedbackDTO dto) {
        feedbackService.followUp(UserContext.userId(), id, dto.getContent());
        return Result.ok();
    }
}
