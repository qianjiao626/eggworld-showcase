package com.eggworld.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.ClaimDTO;
import com.eggworld.dto.EditTaskDTO;
import com.eggworld.dto.PairDTO;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.dto.RateTaskDTO;
import com.eggworld.dto.RenewTaskDTO;
import com.eggworld.dto.TaskQueryDTO;
import com.eggworld.dto.TaskProofImageVO;
import com.eggworld.dto.TaskVO;
import com.eggworld.service.ClaimService;
import com.eggworld.service.RatingService;
import com.eggworld.service.TaskProofImageService;
import com.eggworld.service.TaskService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 任务接口（Task 7~10）
 * - 发布 / 广场查询 / 详情 / 我的任务（TaskService）
 * - 认领 / 认领者列表 / 配对 / 提交 / 确认 / 取消（ClaimService）
 * - 任务互评（RatingService）
 */
@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;
    private final ClaimService claimService;
    private final RatingService ratingService;
    private final TaskProofImageService proofImageService;

    /** 发布任务（冻结蛋蛋币） */
    @PostMapping
    public Result<Long> publish(@Valid @RequestBody PublishTaskDTO dto) {
        return Result.ok(taskService.publish(UserContext.userId(), dto));
    }

    /**
     * 上传任务「技能证明图片」（发布任务时选填）：
     * 返回的 id 原样回填到 PublishTaskDTO.proofImageId，任务详情页在「任务描述」之前展示。
     * 路径放在 POST /api/tasks 旁边，避免与 /api/tasks/{id} 家族抢匹配。
     */
    @PostMapping(value = "/proof-images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<TaskProofImageVO> uploadProofImage(@RequestParam("file") MultipartFile file) {
        return Result.ok(proofImageService.save(UserContext.userId(), file));
    }

    /** 读取任务证明图片（匿名可读，与宿舍图同一策略；见 JwtInterceptor 白名单） */
    @GetMapping("/proof-images/{id}")
    public void proofImage(@PathVariable Long id, HttpServletResponse response) throws IOException {
        byte[] bytes = proofImageService.load(id);
        String type = proofImageService.contentTypeOf(id);
        response.setContentType(type == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : type);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setContentLength(bytes.length);
        response.getOutputStream().write(bytes);
    }

    /** 任务广场（筛选/分页）；status=expired 时只返回"过期 3 天内"的，供已登录用户在广场看到过期卡 */
    @GetMapping
    public Result<Page<TaskVO>> list(TaskQueryDTO query) {
        return Result.ok(taskService.listTasks(query, UserContext.userId()));
    }

    /** 重新发布过期任务（只改报名截止，免审核直接上线；管理员会收到知情通知） */
    @PostMapping("/{id}/renew")
    public Result<Void> renew(@PathVariable Long id, @Valid @RequestBody RenewTaskDTO dto) {
        taskService.renewTask(UserContext.userId(), id, dto.getSignupDays());
        return Result.ok();
    }

    /** 广场上对已过期任务「催一下发布者」：通知发布者重新发布（同一任务 24 小时去重） */
    @PostMapping("/{id}/remind-publisher")
    public Result<Void> remindPublisher(@PathVariable Long id) {
        taskService.nudgePublisher(UserContext.userId(), id);
        return Result.ok();
    }

    /**
     * 修改任务（第二期）：仅发布者、且无人认领时可改。
     * - 首次审核还没过（pending）→ 直接改本体
     * - 已审核通过（approved）→ 生成修改稿并回到 pending 等待重审（广场暂时下架）
     */
    @PostMapping("/{id}/edit")
    public Result<Void> edit(@PathVariable Long id, @Valid @RequestBody EditTaskDTO dto) {
        taskService.submitRevision(UserContext.userId(), id, dto);
        return Result.ok();
    }

    /** 任务详情 */
    @GetMapping("/{id}")
    public Result<TaskVO> detail(@PathVariable Long id) {
        return Result.ok(taskService.getDetail(id, UserContext.userId()));
    }

    /** 我发布的任务 */
    @GetMapping("/my-published")
    public Result<Page<TaskVO>> myPublished(@RequestParam(defaultValue = "1") long page,
                                            @RequestParam(defaultValue = "20") long size) {
        return Result.ok(taskService.myPublished(UserContext.userId(), page, size));
    }

    /** 我认领的任务 */
    @GetMapping("/my-claimed")
    public Result<Page<TaskVO>> myClaimed(@RequestParam(defaultValue = "1") long page,
                                          @RequestParam(defaultValue = "20") long size) {
        return Result.ok(taskService.myClaimed(UserContext.userId(), page, size));
    }

    /** 认领/报名任务（可携带认领者联系方式） */
    @PostMapping("/{id}/claim")
    public Result<Void> claim(@PathVariable Long id, @RequestBody(required = false) ClaimDTO dto) {
        claimService.claim(UserContext.userId(), id, dto);
        return Result.ok();
    }

    /** 认领者列表（仅发布者可见） */
    @GetMapping("/{id}/claimers")
    public Result<List<Map<String, Object>>> claimers(@PathVariable Long id) {
        return Result.ok(claimService.listClaimers(UserContext.userId(), id));
    }

    /** 确认配对（发布者选择认领者）；组队型可分批选，未选中的留在候选池 */
    @PostMapping("/{id}/pair")
    public Result<Void> pair(@PathVariable Long id, @Valid @RequestBody PairDTO dto) {
        claimService.pair(UserContext.userId(), id, dto);
        return Result.ok();
    }

    /** 结束招募（组队）/ 结束认领（教学、求助）：不等满员也开工，停止报名，已入选的人照常提交确认 */
    @PostMapping("/{id}/close-recruit")
    public Result<Void> closeRecruit(@PathVariable Long id) {
        claimService.closeRecruit(UserContext.userId(), id);
        return Result.ok();
    }

    /** 我的搭子：本队成员（发布者 + 已入队搭子）与联系方式；仅本队成员可看 */
    @GetMapping("/{id}/teammates")
    public Result<Map<String, Object>> teammates(@PathVariable Long id) {
        return Result.ok(claimService.teammates(UserContext.userId(), id));
    }

    /** 认领者提交完成 */
    @PostMapping("/{id}/submit")
    public Result<Void> submit(@PathVariable Long id) {
        claimService.submit(UserContext.userId(), id);
        return Result.ok();
    }

    /** 发布者确认完成（组队：一次确认全队；官方任务：一次给所有已提交者发币） */
    @PostMapping("/{id}/confirm")
    public Result<Void> confirm(@PathVariable Long id) {
        claimService.confirm(UserContext.userId(), id);
        return Result.ok();
    }

    /** 发布者逐个确认完成（教学/求助可多人）：每个完成者单独结算，全部确认完任务才收尾 */
    @PostMapping("/{id}/claims/{claimerId}/confirm")
    public Result<Void> confirmMember(@PathVariable Long id, @PathVariable Long claimerId) {
        claimService.confirmMember(UserContext.userId(), id, claimerId);
        return Result.ok();
    }

    /** 取消任务（教学型48小时内，退款） */
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable Long id) {
        claimService.cancel(UserContext.userId(), id);
        return Result.ok();
    }

    /** 提交任务评价（任务完成后参与双方互评） */
    @PostMapping("/{id}/rate")
    public Result<Void> rate(@PathVariable Long id, @Valid @RequestBody RateTaskDTO dto) {
        ratingService.rate(UserContext.userId(), id, dto);
        return Result.ok();
    }

    /** 组队互评目标列表（参与方除自己外的可评价对象，含已评标记） */
    @GetMapping("/{id}/rate-targets")
    public Result<List<Map<String, Object>>> rateTargets(@PathVariable Long id) {
        return Result.ok(ratingService.listRateTargets(UserContext.userId(), id));
    }
}
