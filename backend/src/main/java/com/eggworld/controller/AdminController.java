package com.eggworld.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.annotation.AdminOnly;
import com.eggworld.annotation.ModeratorOnly;
import com.eggworld.annotation.RequirePermission;
import com.eggworld.common.Result;
import com.eggworld.common.PermCode;
import com.eggworld.common.UserContext;
import com.eggworld.dto.AdminFrozenCoinVO;
import com.eggworld.dto.AdminHiddenRatingVO;
import com.eggworld.dto.AdminPointLogVO;
import com.eggworld.dto.AdminStatsVO;
import com.eggworld.dto.AdminUserOverviewVO;
import com.eggworld.dto.AdminUserVO;
import com.eggworld.dto.GivenRatingVO;
import com.eggworld.dto.PageViewDetailVO;
import com.eggworld.dto.PointTypeSummaryVO;
import com.eggworld.dto.RatingListVO;
import com.eggworld.dto.RejectTaskDTO;
import com.eggworld.dto.ReplyFeedbackDTO;
import com.eggworld.dto.ResetPasswordDTO;
import com.eggworld.dto.TaskChatBackfillVO;
import com.eggworld.dto.TaskVO;
import com.eggworld.entity.FeedbackTicket;
import com.eggworld.entity.PointLog;
import com.eggworld.service.AdminService;
import com.eggworld.service.AdminStatsService;
import com.eggworld.service.FeedbackService;
import com.eggworld.service.LegacyDataMigrationService;
import com.eggworld.service.PairingRemindService;
import com.eggworld.service.RatingService;
import com.eggworld.service.TaskService;
import com.eggworld.service.UserActivityService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 管理后台接口（Task 15/16）
 * 所有接口 @AdminOnly 校验管理员身份
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final TaskService taskService;
    private final AdminService adminService;
    private final AdminStatsService adminStatsService;
    private final FeedbackService feedbackService;
    private final RatingService ratingService;
    private final UserActivityService userActivityService;
    private final PairingRemindService pairingRemindService;
    private final LegacyDataMigrationService legacyDataMigrationService;

    /**
     * 工作台聚合统计（运营概览 / 任务 / 资金 / 风险 / 趋势 / 页面热度）
     * 主管理员与副管理员均下发全部板块
     *
     * @param range today / 7d / 30d，缺省与非法值均按 7d
     */
    @RequirePermission(PermCode.DATA_DASHBOARD)
    @GetMapping("/stats")
    public Result<AdminStatsVO> stats(@RequestParam(required = false) String range) {
        return Result.ok(adminStatsService.stats(range));
    }

    /** 资金详情：按流水类型汇总（主管理员） */
    @RequirePermission(PermCode.DATA_DASHBOARD)
    @GetMapping("/point-logs/summary")
    public Result<List<PointTypeSummaryVO>> pointLogSummary(@RequestParam(required = false) String range) {
        return Result.ok(adminStatsService.pointTypeSummary(range));
    }

    /** 资金详情：全局流水明细（主管理员，可筛选 + 分页） */
    @RequirePermission(PermCode.DATA_DASHBOARD)
    @GetMapping("/point-logs")
    public Result<IPage<AdminPointLogVO>> pointLogs(@RequestParam(required = false) String range,
                                                    @RequestParam(required = false) String type,
                                                    @RequestParam(required = false) Integer minAbs,
                                                    @RequestParam(required = false) String keyword,
                                                    @RequestParam(defaultValue = "1") long page,
                                                    @RequestParam(defaultValue = "20") long size) {
        return Result.ok(adminStatsService.pointLogs(range, type, minAbs, keyword, page, size));
    }

    /** 资金详情：冻结清单（主管理员） */
    @RequirePermission(PermCode.DATA_DASHBOARD)
    @GetMapping("/frozen-coins")
    public Result<List<AdminFrozenCoinVO>> frozenCoins() {
        return Result.ok(adminStatsService.frozenCoins());
    }

    /**
     * 任务列表（管理员/副管理员）：工作台「任务完成率」下钻
     *
     * @param status closed / completed / abnormal / active / pending，缺省不限
     */
    @ModeratorOnly
    @GetMapping("/tasks")
    public Result<Page<TaskVO>> tasks(@RequestParam(required = false) String status,
                                     @RequestParam(defaultValue = "1") long page,
                                     @RequestParam(defaultValue = "20") long size) {
        List<String> statuses = switch (status == null ? "" : status) {
            case "" -> List.of();
            case "closed" -> List.of("completed", "cancelled", "expired");
            case "abnormal" -> List.of("cancelled", "expired");
            case "active" -> List.of("approved", "in_progress", "full");
            default -> List.of(status);
        };
        return Result.ok(taskService.tasksByStatuses(statuses, page, size));
    }

    /**
     * 存量任务补群（主管理员，一次性数据修复）：给「改版前已在线」的教学/组队任务补建任务群，
     * 并把已入选的老成员拉进群（对应 tasks.conversation_id 这一列上线时对历史数据的洗刷）。
     *
     * 幂等、可重复调用：已建群的任务会跳过；单个任务失败只记入 failures，不影响其余任务，
     * 失败任务的事务已整体回滚（conversation_id 仍为空），修掉原因后重跑即可。
     */
    @AdminOnly
    @PostMapping("/tasks/backfill-chat-groups")
    public Result<TaskChatBackfillVO> backfillTaskChatGroups() {
        return Result.ok(legacyDataMigrationService.backfillTaskChatGroups());
    }

    /** 页面热度明细（主管理员）：热度榜点进去看单页 PV/UV 与访问最多的用户 */
    @RequirePermission(PermCode.DATA_DASHBOARD)
    @GetMapping("/page-views/detail")
    public Result<PageViewDetailVO> pageViewDetail(@RequestParam String pageKey,
                                                   @RequestParam(required = false) String range) {
        return Result.ok(adminStatsService.pageViewDetail(pageKey, range));
    }

    /** 被隐藏的评价列表（主管理员）：风险板块下钻 */
    @RequirePermission(PermCode.DATA_DASHBOARD)
    @GetMapping("/ratings/hidden")
    public Result<IPage<AdminHiddenRatingVO>> hiddenRatings(@RequestParam(defaultValue = "1") long page,
                                                            @RequestParam(defaultValue = "20") long size) {
        return Result.ok(adminStatsService.hiddenRatings(page, size));
    }

    /** 待审核任务列表（管理员/副管理员） */
    @RequirePermission(PermCode.CONTENT_REVIEW)
    @GetMapping("/tasks/pending")
    public Result<Page<TaskVO>> pendingTasks(@RequestParam(defaultValue = "1") long page,
                                             @RequestParam(defaultValue = "20") long size) {
        return Result.ok(taskService.pendingTasks(page, size));
    }

    /** 审核通过（管理员/副管理员） */
    @RequirePermission(PermCode.CONTENT_REVIEW)
    @PostMapping("/tasks/{id}/approve")
    public Result<Void> approve(@PathVariable Long id) {
        taskService.approve(id);
        return Result.ok();
    }

    /**
     * 审核驳回（管理员/副管理员）
     * - 首次审核驳回：任务置 rejected 并退回冻结币
     * - 修改稿驳回：丢弃修改、任务按原内容恢复上线，reason 会转达给发布者
     */
    @RequirePermission(PermCode.CONTENT_REVIEW)
    @PostMapping("/tasks/{id}/reject")
    public Result<Void> reject(@PathVariable Long id,
                              @RequestBody(required = false) @Valid RejectTaskDTO dto) {
        taskService.reject(id, dto == null ? null : dto.getReason());
        return Result.ok();
    }

    /** 切换任务优质标签（管理员/副管理员） */
    @ModeratorOnly
    @PostMapping("/tasks/{id}/feature")
    public Result<Void> toggleFeatured(@PathVariable Long id) {
        taskService.toggleFeatured(id);
        return Result.ok();
    }

    /**
     * 一键提醒任务的发布者去完成配对（管理员/副管理员，工作台任务列表）
     * 邮件内容按发布者汇总其名下所有待配对任务；同一发布者每天最多提醒一次，
     * 当天已提醒过时返回提示文案而不是报错。
     */
    @ModeratorOnly
    @PostMapping("/tasks/{id}/remind-pairing")
    public Result<String> remindPairing(@PathVariable Long id) {
        return Result.ok(pairingRemindService.remindForTask(id));
    }

    /**
     * 一键提醒「所有」有待确认配对报名的发布者（管理员/副管理员，工作台任务列表）
     * 口径与每天 10:00 的定时任务完全一致：每人每天最多一封，今天已提醒过的跳过并在文案里说明。
     */
    @ModeratorOnly
    @PostMapping("/tasks/remind-pairing/all")
    public Result<String> remindPairingAll() {
        return Result.ok(pairingRemindService.remindAllForAdmin());
    }

    /**
     * 用户管理列表（分页，可按昵称/邮箱搜索 + 注册时间下限 + 状态筛选 + 按邀请人数/注册时间排序）
     *
     * <p>只列学生（含副管理员），返回的 total 即学生总数，前端角标与「共 N 条」都用它。
     */
    @AdminOnly
    @GetMapping("/users")
    public Result<Page<AdminUserVO>> users(@RequestParam(required = false) String keyword,
                                           @RequestParam(required = false)
                                           @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime createdFrom,
                                           @RequestParam(required = false) String status,
                                           @RequestParam(defaultValue = "1") long page,
                                           @RequestParam(defaultValue = "20") long size,
                                           @RequestParam(defaultValue = "created_desc") String sort) {
        return Result.ok(adminService.listUsers(keyword, createdFrom, status, page, size, sort));
    }

    /** 查看单个用户总览（资料 + 行为统计，弹窗默认板块） */
    @AdminOnly
    @GetMapping("/users/{id}/overview")
    public Result<AdminUserOverviewVO> userOverview(@PathVariable Long id) {
        return Result.ok(adminService.overview(id));
    }

    /** 查看用户发布/认领的任务（role=published|claimed，分页） */
    @AdminOnly
    @GetMapping("/users/{id}/tasks")
    public Result<Page<TaskVO>> userTasks(@PathVariable Long id,
                                          @RequestParam(defaultValue = "published") String role,
                                          @RequestParam(defaultValue = "1") long page,
                                          @RequestParam(defaultValue = "10") long size) {
        return Result.ok(adminService.userTasks(id, role, page, size));
    }

    /** 查看用户收到的评价（分页，含均分） */
    @AdminOnly
    @GetMapping("/users/{id}/ratings")
    public Result<RatingListVO> receivedRatings(@PathVariable Long id,
                                                @RequestParam(defaultValue = "1") long page,
                                                @RequestParam(defaultValue = "10") long size) {
        return Result.ok(adminService.receivedRatings(id, page, size));
    }

    /** 查看用户给出的评价 */
    @AdminOnly
    @GetMapping("/users/{id}/given-ratings")
    public Result<List<GivenRatingVO>> givenRatings(@PathVariable Long id) {
        return Result.ok(adminService.givenRatings(id));
    }

    /** 隐藏用户收到的某条不当评价（治理：隐藏后不计口碑与条数，入口评列表不再展示） */
    @AdminOnly
    @PostMapping("/ratings/{id}/hide")
    public Result<Void> hideRating(@PathVariable Long id) {
        ratingService.hideRating(id, true);
        return Result.ok();
    }

    /** 查看用户蛋蛋币流水（分页，可按类型筛选） */
    @AdminOnly
    @GetMapping("/users/{id}/point-logs")
    public Result<Page<PointLog>> userPointLogs(@PathVariable Long id,
                                                @RequestParam(defaultValue = "1") long page,
                                                @RequestParam(defaultValue = "10") long size,
                                                @RequestParam(required = false) String type) {
        return Result.ok(adminService.userPointLogs(id, type, page, size));
    }

    /** 封禁用户（管理员不可封禁，登录与已有 token 立即失效） */
    @AdminOnly
    @PostMapping("/users/{id}/ban")
    public Result<Void> ban(@PathVariable Long id) {
        adminService.ban(id, UserContext.userId());
        return Result.ok();
    }

    /** 解封用户 */
    @AdminOnly
    @PostMapping("/users/{id}/unban")
    public Result<Void> unban(@PathVariable Long id) {
        adminService.unban(id);
        return Result.ok();
    }

    /** 修改用户登录密码（主管理员，重置后该用户需用新密码登录） */
    @AdminOnly
    @PostMapping("/users/{id}/reset-password")
    public Result<Void> resetPassword(@PathVariable Long id, @Valid @RequestBody ResetPasswordDTO dto) {
        adminService.resetPassword(id, dto.getPassword());
        return Result.ok();
    }

    /** 删除用户（物理删除该用户及其关联数据，不可恢复；保留其发布的任务与打听内容） */
    @AdminOnly
    @PostMapping("/users/{id}/delete")
    public Result<Void> deleteUser(@PathVariable Long id) {
        adminService.deleteUser(id, UserContext.userId());
        return Result.ok();
    }

    /** 设置/撤销副管理员（enable=true 设为副管理，false 撤销；仅主管理员） */
    @AdminOnly
    @PostMapping("/users/{id}/sub-admin")
    public Result<Void> setSubAdmin(@PathVariable Long id, @RequestParam boolean enable) {
        adminService.setSubAdmin(id, enable);
        return Result.ok();
    }

    /** 反馈工单列表 */
    @AdminOnly
    @GetMapping("/feedback")
    public Result<Page<FeedbackTicket>> feedback(@RequestParam(required = false) String status,
                                                 @RequestParam(defaultValue = "1") long page,
                                                 @RequestParam(defaultValue = "20") long size) {
        return Result.ok(feedbackService.list(status, page, size));
    }

    /** 回复反馈工单 */
    @AdminOnly
    @PostMapping("/feedback/{id}/reply")
    public Result<Void> reply(@PathVariable Long id, @Valid @RequestBody ReplyFeedbackDTO dto) {
        feedbackService.reply(id, dto.getAdminReply());
        return Result.ok();
    }

    /** 关闭反馈工单 */
    @AdminOnly
    @PostMapping("/feedback/{id}/close")
    public Result<Void> close(@PathVariable Long id) {
        feedbackService.close(id);
        return Result.ok();
    }

    // ==================== 用户活跃看板 ====================

    /** 用户活跃统计：DAU/WAU/MAU、留存、时段热力、转化漏斗 */
    @RequirePermission(PermCode.DATA_DASHBOARD)
    @GetMapping("/user-activity")
    public Result<java.util.Map<String, Object>> userActivity(
            @RequestParam(defaultValue = "7d") String range) {
        return Result.ok(userActivityService.getStats(range));
    }
}
