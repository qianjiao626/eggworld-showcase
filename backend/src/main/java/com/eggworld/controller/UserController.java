package com.eggworld.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.CheckinVO;
import com.eggworld.dto.ChangePasswordDTO;
import com.eggworld.service.CheckinService;
import com.eggworld.dto.RatingListVO;
import com.eggworld.dto.SwitchCharDTO;
import com.eggworld.dto.UpdateProfileDTO;
import com.eggworld.dto.UpdateSkillsDTO;
import com.eggworld.dto.UserProfileVO;
import com.eggworld.entity.PointLog;
import com.eggworld.service.InviteService;
import com.eggworld.service.NotificationService;
import com.eggworld.service.PointService;
import com.eggworld.service.RatingService;
import com.eggworld.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 用户接口（Task 6 + Task 12 流水查询 + 评价/技能标签）
 * 均基于 JWT 中的当前用户（/api/users/me），不做跨用户访问
 */
@RestController
@RequestMapping("/api/users/me")
@RequiredArgsConstructor
public class UserController {

    private final CheckinService checkinService;
    private final UserService userService;
    private final PointService pointService;
    private final RatingService ratingService;
    private final InviteService inviteService;
    private final NotificationService notificationService;

    /** 获取当前用户完整信息（含五维 + 角色） */
    @GetMapping
    public Result<UserProfileVO> profile() {
        return Result.ok(userService.buildProfile(UserContext.userId()));
    }

    /** 更新当前用户信息 */
    @PutMapping
    public Result<UserProfileVO> update(@Valid @RequestBody UpdateProfileDTO dto) {
        return Result.ok(userService.updateProfile(UserContext.userId(), dto));
    }

    /** 修改当前用户登录密码（「我的信息」页自助改密：校验当前密码，无需邮箱验证码） */
    @PostMapping("/password")
    public Result<Void> changePassword(@Valid @RequestBody ChangePasswordDTO dto) {
        userService.changePassword(UserContext.userId(), dto.getOldPassword(), dto.getNewPassword());
        return Result.ok();
    }

    /** 获取当前用户五维属性 */
    @GetMapping("/stats")
    public Result<UserProfileVO.StatsVO> stats() {
        UserProfileVO profile = userService.buildProfile(UserContext.userId());
        return Result.ok(profile.getStats());
    }

    /** 获取当前用户角色解锁状态 */
    @GetMapping("/characters")
    public Result<java.util.List<UserProfileVO.CharacterVO>> characters() {
        UserProfileVO profile = userService.buildProfile(UserContext.userId());
        return Result.ok(profile.getCharacters());
    }

    /** 切换当前使用角色（持久化 is_current + 同步 egg_category，排行榜/跨用户主页显示一致） */
    @PutMapping("/characters/switch")
    public Result<UserProfileVO> switchCharacter(@Valid @RequestBody SwitchCharDTO dto) {
        return Result.ok(userService.switchCharacter(UserContext.userId(), dto.getCategory()));
    }

    /** 获取当前用户蛋蛋币流水（分页，可按类型筛选） */
    @GetMapping("/point-logs")
    public Result<Page<PointLog>> pointLogs(@RequestParam(defaultValue = "1") long page,
                                            @RequestParam(defaultValue = "20") long size,
                                            @RequestParam(required = false) String type) {
        return Result.ok(pointService.listLogs(UserContext.userId(), type, page, size));
    }

    /** 获取我收到的评价（分页，含均分） */
    @GetMapping("/ratings")
    public Result<RatingListVO> ratings(@RequestParam(defaultValue = "1") long page,
                                        @RequestParam(defaultValue = "20") long size) {
        return Result.ok(ratingService.listMine(UserContext.userId(), page, size));
    }

    /** 获取我给出的评价（任务卡片"已评价"展示用） */
    @GetMapping("/given-ratings")
    public Result<List<com.eggworld.dto.GivenRatingVO>> givenRatings() {
        return Result.ok(ratingService.listMineGiven(UserContext.userId()));
    }

    /** 回复一条我收到的评价（仅被评价者可回复，最长 200 字，不影响评分） */
    @PutMapping("/ratings/{id}/reply")
    public Result<Void> replyRating(@PathVariable Long id,
                                    @RequestBody java.util.Map<String, String> body) {
        String content = body != null ? body.get("content") : null;
        ratingService.reply(UserContext.userId(), id, content);
        return Result.ok();
    }

    /** 获取我的邀请记录（统计 + 列表） */
    @GetMapping("/invites")
    public Result<com.eggworld.dto.InviteListVO> invites() {
        return Result.ok(inviteService.listMine(UserContext.userId()));
    }

    /** 获取我的通知（分页 + 未读数） */
    @GetMapping("/notifications")
    public Result<com.eggworld.dto.NotificationListVO> notifications(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size) {
        return Result.ok(notificationService.listMine(UserContext.userId(), page, size));
    }

    /** 轻量通知角标，用户身份只能来自 JWT。 */
    @GetMapping("/notifications/unread-count")
    public Result<java.util.Map<String, Long>> notificationUnreadCount() {
        return Result.ok(java.util.Map.of("unread", notificationService.unreadCount(UserContext.userId())));
    }

    /** 标记通知已读（id 为空 = 全部已读） */
    @PutMapping("/notifications/read")
    public Result<Void> markNotificationsRead(
            @RequestBody(required = false) com.eggworld.dto.ReadNotificationDTO dto) {
        Long id = dto != null ? dto.getId() : null;
        notificationService.markRead(UserContext.userId(), id);
        return Result.ok();
    }

    /** 获取我的技能标签 */
    @GetMapping("/skills")
    public Result<List<String>> skills() {
        return Result.ok(userService.listSkills(UserContext.userId()));
    }

    /** 全量更新我的技能标签 */
    @PutMapping("/skills")
    public Result<Void> updateSkills(@Valid @RequestBody UpdateSkillsDTO dto) {
        userService.replaceSkills(UserContext.userId(), dto.getSkills());
        return Result.ok();
    }
    /** 每日签到：经验 +5、蛋蛋币 +5，每人每天仅一次 */
    @PostMapping("/checkin")
    public Result<CheckinVO> checkin() {
        return Result.ok(checkinService.checkin(UserContext.userId()));
    }

    /** 查询今日签到状态 */
    @GetMapping("/checkin/status")
    public Result<CheckinVO> checkinStatus() {
        return Result.ok(checkinService.getTodayStatus(UserContext.userId()));
    }
}
