package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.service.AnnouncementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/announcements")
@RequiredArgsConstructor
public class AnnouncementController {
    private final AnnouncementService announcements;
    @GetMapping
    public Result<Map<String,Object>> list(@RequestParam(defaultValue="1") long page,
                                           @RequestParam(defaultValue="10") long size) {
        return Result.ok(announcements.list(page, size));
    }
    @GetMapping("/{id}")
    public Result<Map<String,Object>> detail(@PathVariable Long id) {
        return Result.ok(announcements.detail(id));
    }
}
