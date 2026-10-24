package com.eggworld.controller;

import com.eggworld.annotation.AdminOnly;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.AnnouncementService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/announcements")
@RequiredArgsConstructor
public class AdminAnnouncementController {
    private final AnnouncementService announcements;
    public record Input(@NotBlank @Size(max=120) String title, @NotBlank @Size(max=3000) String content) {}
    @AdminOnly @GetMapping
    public Result<List<Map<String,Object>>> list() { return Result.ok(announcements.manage()); }
    @AdminOnly @PostMapping
    public Result<Long> publish(@Valid @RequestBody Input input) {
        return Result.ok(announcements.publish(UserContext.userId(), input.title(), input.content()));
    }
    @AdminOnly @PutMapping("/{id}")
    public Result<Void> edit(@PathVariable Long id, @Valid @RequestBody Input input) {
        announcements.edit(id, UserContext.userId(), input.title(), input.content()); return Result.ok();
    }
    @AdminOnly @PostMapping("/{id}/unpublish")
    public Result<Void> unpublish(@PathVariable Long id) {
        announcements.unpublish(id, UserContext.userId()); return Result.ok();
    }
}
