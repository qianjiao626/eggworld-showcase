package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.*;
import com.eggworld.entity.ChatGroup;
import com.eggworld.entity.ChatSensitiveWord;
import com.eggworld.entity.ChatReport;
import com.eggworld.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 聊天室学生端接口。 */
@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatMessageService messageService;
    private final ChatSocialService socialService;
    private final ChatGroupService groupService;
    private final ChatModerationService moderationService;
    private final ChatOnlineRewardService onlineRewardService;
    private final ChatContextService contextService;

    /** 聊天室在线奖励心跳：按服务端时钟结算在线金币，返回今日状态。 */
    @PostMapping("/online-reward/tick")
    public Result<ChatOnlineRewardVO> onlineRewardTick() {
        return Result.ok(onlineRewardService.tick(UserContext.userId()));
    }

    /** 查询今日在线奖励状态（不结算）。 */
    @GetMapping("/online-reward/status")
    public Result<ChatOnlineRewardVO> onlineRewardStatus() {
        return Result.ok(onlineRewardService.status(UserContext.userId()));
    }

    @GetMapping("/conversations")
    public Result<List<ChatConversationVO>> conversations() {
        return Result.ok(messageService.listConversations(UserContext.userId()));
    }

    @PostMapping("/conversations/direct")
    public Result<ChatConversationVO> direct(@Valid @RequestBody ChatCreateDirectDTO dto) {
        return Result.ok(messageService.createDirect(UserContext.userId(), dto.getTargetUserId()));
    }

    @GetMapping("/conversations/{id}")
    public Result<ChatConversationVO> conversation(@PathVariable Long id) {
        return Result.ok(messageService.conversation(UserContext.userId(), id));
    }

    /** 任务群上下文：关联任务 + 群成员任务角色（聊天室右侧面板一次拉取） */
    @GetMapping("/conversations/{id}/context")
    public Result<ChatConversationContextVO> conversationContext(@PathVariable Long id) {
        return Result.ok(contextService.context(UserContext.userId(), id));
    }

    @GetMapping("/conversations/{id}/messages")
    public Result<ChatHistoryVO> history(@PathVariable Long id,
                                          @RequestParam(required = false) Long beforeId,
                                          @RequestParam(defaultValue = "30") int size) {
        return Result.ok(messageService.history(UserContext.userId(), id, beforeId, size));
    }

    @PostMapping("/conversations/{id}/messages")
    public Result<ChatMessageVO> send(@PathVariable Long id, @Valid @RequestBody ChatMessageDTO dto) {
        return Result.ok(messageService.send(UserContext.userId(), id, dto));
    }

    @PostMapping("/messages/{id}/recall")
    public Result<Void> recall(@PathVariable Long id) {
        messageService.recall(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/conversations/{id}/read")
    public Result<Void> read(@PathVariable Long id, @RequestParam(required = false) Long messageId) {
        messageService.markRead(UserContext.userId(), id, messageId);
        return Result.ok();
    }

    @GetMapping("/friend-requests")
    public Result<List<?>> friendRequests() {
        return Result.ok(socialService.pendingRequests(UserContext.userId()));
    }

    @PostMapping("/friend-requests")
    public Result<Void> requestFriend(@Valid @RequestBody ChatFriendRequestDTO dto) {
        socialService.requestFriend(UserContext.userId(), dto.getTargetUserId(), dto.getMessage());
        return Result.ok();
    }

    @PostMapping("/friend-requests/{id}/{action}")
    public Result<Void> handleFriendRequest(@PathVariable Long id, @PathVariable String action) {
        if (!"accept".equals(action) && !"reject".equals(action)) throw new IllegalArgumentException("动作不合法");
        socialService.handleFriendRequest(UserContext.userId(), id, "accept".equals(action));
        return Result.ok();
    }

    @DeleteMapping("/friends/{id}")
    public Result<Void> removeFriend(@PathVariable Long id) {
        socialService.removeFriend(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/follows/{id}")
    public Result<Void> follow(@PathVariable Long id) {
        socialService.follow(UserContext.userId(), id);
        return Result.ok();
    }

    @DeleteMapping("/follows/{id}")
    public Result<Void> unfollow(@PathVariable Long id) {
        socialService.unfollow(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/blocks/{id}")
    public Result<Void> block(@PathVariable Long id) {
        socialService.block(UserContext.userId(), id);
        return Result.ok();
    }

    @DeleteMapping("/blocks/{id}")
    public Result<Void> unblock(@PathVariable Long id) {
        socialService.unblock(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/groups")
    public Result<Long> createGroup(@Valid @RequestBody ChatCreateGroupDTO dto) {
        return Result.ok(groupService.create(UserContext.userId(), dto.getName(), dto.getDescription(),
                dto.getVisibility(), dto.getMemberIds()));
    }

    @GetMapping("/groups/search")
    public Result<List<ChatGroup>> searchGroups(@RequestParam(required = false) String keyword) {
        return Result.ok(groupService.search(keyword));
    }

    @PostMapping("/groups/{id}/join")
    public Result<Void> joinGroup(@PathVariable Long id) {
        groupService.join(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/groups/{id}/leave")
    public Result<Void> leaveGroup(@PathVariable Long id) {
        groupService.leave(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/groups/{id}/members/{userId}")
    public Result<Void> invite(@PathVariable Long id, @PathVariable Long userId) {
        groupService.invite(UserContext.userId(), id, userId);
        return Result.ok();
    }

    @DeleteMapping("/groups/{id}/members/{userId}")
    public Result<Void> kick(@PathVariable Long id, @PathVariable Long userId) {
        groupService.kick(UserContext.userId(), id, userId);
        return Result.ok();
    }

    @PostMapping("/groups/{id}/admins/{userId}")
    public Result<Void> setAdmin(@PathVariable Long id, @PathVariable Long userId,
                                 @RequestParam(defaultValue = "true") boolean enabled) {
        groupService.setAdmin(UserContext.userId(), id, userId, enabled);
        return Result.ok();
    }

    @PostMapping("/groups/{id}/transfer/{userId}")
    public Result<Void> transfer(@PathVariable Long id, @PathVariable Long userId) {
        groupService.transferOwner(UserContext.userId(), id, userId);
        return Result.ok();
    }

    @DeleteMapping("/groups/{id}")
    public Result<Void> dissolve(@PathVariable Long id) {
        groupService.dissolve(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/reports")
    public Result<Long> report(@Valid @RequestBody ChatReportDTO dto) {
        return Result.ok(moderationService.report(UserContext.userId(), dto.getConversationId(), dto.getMessageId(),
                dto.getTargetUserId(), dto.getReason(), dto.getDetail()));
    }
}

