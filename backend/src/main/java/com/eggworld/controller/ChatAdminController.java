package com.eggworld.controller;

import com.eggworld.annotation.AdminOnly;
import com.eggworld.annotation.ModeratorOnly;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.ChatMuteDTO;
import com.eggworld.dto.ChatSensitiveWordDTO;
import com.eggworld.entity.ChatReport;
import com.eggworld.entity.ChatSensitiveWord;
import com.eggworld.service.ChatModerationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 聊天室后台治理接口。 */
@RestController
@RequestMapping("/api/admin/chat")
@RequiredArgsConstructor
public class ChatAdminController {

    private final ChatModerationService moderationService;

    @ModeratorOnly
    @PostMapping("/mutes/global")
    public Result<Void> muteGlobal(@Valid @RequestBody ChatMuteDTO dto) {
        moderationService.muteGlobal(UserContext.userId(), dto.getUserId(), dto.getMinutes(), dto.getReason());
        return Result.ok();
    }

    @ModeratorOnly
    @PostMapping("/mutes/conversation/{conversationId}")
    public Result<Void> muteConversation(@PathVariable Long conversationId, @Valid @RequestBody ChatMuteDTO dto) {
        moderationService.muteConversation(UserContext.userId(), conversationId, dto.getUserId(), dto.getMinutes(), dto.getReason());
        return Result.ok();
    }

    @ModeratorOnly
    @PostMapping("/mutes/{id}/revoke")
    public Result<Void> revokeMute(@PathVariable Long id) {
        moderationService.revokeMute(UserContext.userId(), id);
        return Result.ok();
    }

    @ModeratorOnly
    @DeleteMapping("/messages/{id}")
    public Result<Void> deleteMessage(@PathVariable Long id) {
        moderationService.deleteMessage(UserContext.userId(), id);
        return Result.ok();
    }

    @ModeratorOnly
    @GetMapping("/reports")
    public Result<List<ChatReport>> reports(@RequestParam(required = false) String status) {
        return Result.ok(moderationService.reports(status));
    }

    @ModeratorOnly
    @PostMapping("/reports/{id}")
    public Result<Void> handleReport(@PathVariable Long id,
                                     @RequestParam String status,
                                     @RequestParam(required = false) Long ticketId) {
        moderationService.handleReport(UserContext.userId(), id, status, ticketId);
        return Result.ok();
    }

    @AdminOnly
    @GetMapping("/sensitive-words")
    public Result<List<ChatSensitiveWord>> words() {
        return Result.ok(moderationService.words());
    }

    @AdminOnly
    @PostMapping("/sensitive-words")
    public Result<Void> saveWord(@RequestBody ChatSensitiveWordDTO dto) {
        moderationService.saveWord(UserContext.userId(), null, dto.getWord(), dto.getLevel(), dto.getEnabled());
        return Result.ok();
    }

    @AdminOnly
    @PutMapping("/sensitive-words/{id}")
    public Result<Void> updateWord(@PathVariable Long id, @RequestBody ChatSensitiveWordDTO dto) {
        moderationService.saveWord(UserContext.userId(), id, dto.getWord(), dto.getLevel(), dto.getEnabled());
        return Result.ok();
    }

    @AdminOnly
    @DeleteMapping("/sensitive-words/{id}")
    public Result<Void> deleteWord(@PathVariable Long id) {
        moderationService.deleteWord(UserContext.userId(), id);
        return Result.ok();
    }
}

