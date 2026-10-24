package com.eggworld.controller;

import com.eggworld.annotation.ModeratorOnly;
import com.eggworld.annotation.RequirePermission;
import com.eggworld.common.PermCode;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.GossipReportService;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminGossipReportController {
    private final GossipReportService reports;
    public record RewardInput(JsonNode amount) {}
    public record ReasonInput(@NotBlank @Size(max=500) String reason) {}

    @RequirePermission(PermCode.CONTENT_REVIEW) @GetMapping("/gossip-reports/pending")
    public Result<List<Map<String,Object>>> pending() { return Result.ok(reports.pending()); }
    @RequirePermission(PermCode.CONTENT_REVIEW) @GetMapping("/gossip-reports")
    public Result<List<Map<String,Object>>> manage() { return Result.ok(reports.manage()); }
    @RequirePermission(PermCode.CONTENT_REVIEW) @GetMapping("/gossip-reports/{id}/comments")
    public Result<List<Map<String,Object>>> comments(@PathVariable Long id) { return Result.ok(reports.manageComments(id)); }
    @ModeratorOnly @PostMapping("/gossip-reports/{id}/approve")
    public Result<Void> approve(@PathVariable Long id, @RequestBody RewardInput input) {
        reports.approve(id, UserContext.userId(), reports.parseReward(input.amount())); return Result.ok();
    }
    @RequirePermission(PermCode.CONTENT_REVIEW) @PostMapping("/gossip-reports/{id}/reject")
    public Result<Void> reject(@PathVariable Long id, @Valid @RequestBody ReasonInput input) {
        reports.reject(id, UserContext.userId(), input.reason()); return Result.ok();
    }
    @ModeratorOnly @PostMapping("/gossip-reports/{id}/settle-reward")
    public Result<Void> settle(@PathVariable Long id, @RequestBody RewardInput input) {
        reports.settleReward(id, UserContext.userId(), reports.parseReward(input.amount())); return Result.ok();
    }
    @RequirePermission(PermCode.CONTENT_REVIEW) @PostMapping("/gossip-reports/{id}/hide")
    public Result<Void> hide(@PathVariable Long id, @Valid @RequestBody ReasonInput input) {
        reports.moderateReport(id, UserContext.userId(), "hide", input.reason()); return Result.ok();
    }
    @RequirePermission(PermCode.CONTENT_REVIEW) @PostMapping("/gossip-reports/{id}/delete")
    public Result<Void> delete(@PathVariable Long id, @Valid @RequestBody ReasonInput input) {
        reports.moderateReport(id, UserContext.userId(), "delete", input.reason()); return Result.ok();
    }
    @RequirePermission(PermCode.CONTENT_REVIEW) @PostMapping("/gossip-report-comments/{id}/hide")
    public Result<Void> hideComment(@PathVariable Long id, @Valid @RequestBody ReasonInput input) {
        reports.moderateComment(id, UserContext.userId(), "hide", input.reason()); return Result.ok();
    }
    @RequirePermission(PermCode.CONTENT_REVIEW) @PostMapping("/gossip-report-comments/{id}/delete")
    public Result<Void> deleteComment(@PathVariable Long id, @Valid @RequestBody ReasonInput input) {
        reports.moderateComment(id, UserContext.userId(), "delete", input.reason()); return Result.ok();
    }
}
