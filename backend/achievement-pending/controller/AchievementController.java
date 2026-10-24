package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.AchievementUnlockVO;
import com.eggworld.dto.AchievementVO;
import com.eggworld.service.AchievementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 成就接口
 * - GET  /api/achievements          全部成就 + 我的进度 + 解锁状态
 * - GET  /api/achievements/unread   未读解锁（驱动红点与解锁弹窗）
 * - POST /api/achievements/{id}/read 标记某次解锁已读
 *
 * 均基于 JWT 中的当前用户，不做跨用户访问。
 */
@RestController
@RequestMapping("/api/achievements")
@RequiredArgsConstructor
public class AchievementController {

    private final AchievementService achievementService;

    /** 成就页数据源 */
    @GetMapping
    public Result<List<AchievementVO>> list() {
        return Result.ok(achievementService.listForUser(UserContext.userId()));
    }

    @GetMapping("/mine")
    public Result<List<AchievementVO>> mine() {
        return Result.ok(achievementService.listMine(UserContext.userId()));
    }

    /** 未读解锁列表（列表长度即红点数量） */
    @GetMapping("/unread")
    public Result<List<AchievementUnlockVO>> unread() {
        return Result.ok(achievementService.listUnread(UserContext.userId()));
    }

    /** 标记某次解锁已读（仅本人记录生效） */
    @PostMapping("/{id}/read")
    public Result<Void> markRead(@PathVariable Long id) {
        achievementService.markRead(UserContext.userId(), id);
        return Result.ok();
    }
}
