package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.GossipReportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/gossip/reports")
@RequiredArgsConstructor
public class GossipReportController {
    private final GossipReportService reports;
    public record ReportInput(@NotBlank @Size(max=120) String title, @NotBlank @Size(max=2000) String content, boolean anonymous) {}
    public record TextInput(@NotBlank @Size(max=3000) String text) {}
    public record CommentInput(@NotBlank @Size(max=500) String content) {}

    @GetMapping
    public Result<Map<String,Object>> list(@RequestParam(defaultValue="1") long page, @RequestParam(defaultValue="20") long size) {
        return Result.ok(reports.list(page, size, UserContext.userId()));
    }
    @GetMapping("/{id}")
    public Result<Map<String,Object>> detail(@PathVariable Long id) {
        return Result.ok(reports.detail(id, UserContext.userId()));
    }
    @GetMapping("/{id}/comments")
    public Result<Map<String,Object>> comments(@PathVariable Long id, @RequestParam(defaultValue="1") long page,
                                                @RequestParam(defaultValue="20") long size) {
        return Result.ok(reports.comments(id, page, size));
    }
    /** 发布前预检不泄露敏感词列表；发布接口必须再次校验，防止绕过。 */
    @PostMapping("/check-text")
    public Result<Void> checkText(@Valid @RequestBody TextInput input) {
        reports.checkText(input.text()); return Result.ok();
    }
    @PostMapping
    public Result<Long> publish(@Valid @RequestBody ReportInput input) {
        return Result.ok(reports.publish(UserContext.userId(), input.title(), input.content(), input.anonymous()));
    }
    @PostMapping("/{id}/comments")
    public Result<Long> comment(@PathVariable Long id, @Valid @RequestBody CommentInput input) {
        return Result.ok(reports.comment(UserContext.userId(), id, input.content()));
    }
    @PostMapping("/{id}/like")
    public Result<Void> like(@PathVariable Long id) {
        reports.like(UserContext.userId(), id); return Result.ok();
    }
}
