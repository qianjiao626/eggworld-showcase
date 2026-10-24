package com.eggworld.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.annotation.AdminOnly;
import com.eggworld.common.Result;
import com.eggworld.dto.TaskGovernanceDTO;
import com.eggworld.dto.TaskVO;
import com.eggworld.entity.TaskGovernanceLog;
import com.eggworld.service.TaskGovernanceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 任务治理接口（管理后台「任务管理」页，**仅主管理员**）。
 * <p>
 * 为什么不并进 {@link AdminController}：那边的构造参数被多个 MockMvc 测试逐个钉住
 * （见 {@code AdminPairingRemindApiTest}），加一个依赖就要连带改一批测试；
 * 任务治理是一块独立能力，单独成类边界更清楚、改动面更小。
 * <p>
 * 前端 js/admin-task-manage.js 把这些路径写死了，改路径必须同步改前端。
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminTaskGovernanceController {

    private final TaskGovernanceService governanceService;

    /**
     * 任务管理列表（治理视角，**含已屏蔽 / 已删除**）
     *
     * @param status 空 / all 全部；pending/approved/in_progress/submitted/completed 精确状态；
     *               hidden 已屏蔽；deleted 已删除；suspended 已屏蔽或已删除；featured 仅看加精
     * @param type   教学/求助/组队/奖励，空表示不限
     */
    @AdminOnly
    @GetMapping("/tasks/manage")
    public Result<Page<TaskVO>> manage(@RequestParam(required = false) String status,
                                       @RequestParam(required = false) String type,
                                       @RequestParam(required = false) String keyword,
                                       @RequestParam(defaultValue = "1") long page,
                                       @RequestParam(defaultValue = "20") long size) {
        return Result.ok(governanceService.manageTasks(status, type, keyword, page, size));
    }

    /** 屏蔽任务（下架但保留数据，可恢复；reason 必填） */
    @AdminOnly
    @PostMapping("/tasks/{id}/hide")
    public Result<Void> hide(@PathVariable Long id,
                             @RequestBody(required = false) @Valid TaskGovernanceDTO dto) {
        governanceService.hide(id, dto == null ? null : dto.getReason());
        return Result.ok();
    }

    /** 恢复任务（解除屏蔽；reason 选填） */
    @AdminOnly
    @PostMapping("/tasks/{id}/restore")
    public Result<Void> restore(@PathVariable Long id,
                                @RequestBody(required = false) @Valid TaskGovernanceDTO dto) {
        governanceService.restore(id, dto == null ? null : dto.getReason());
        return Result.ok();
    }

    /** 删除任务（逻辑删除；reason 必填） */
    @AdminOnly
    @PostMapping("/tasks/{id}/delete")
    public Result<Void> delete(@PathVariable Long id,
                               @RequestBody(required = false) @Valid TaskGovernanceDTO dto) {
        governanceService.delete(id, dto == null ? null : dto.getReason());
        return Result.ok();
    }

    /** 退回审核（任务回到 pending，重新进审核中心；reason 选填） */
    @AdminOnly
    @PostMapping("/tasks/{id}/return-review")
    public Result<Void> returnReview(@PathVariable Long id,
                                     @RequestBody(required = false) @Valid TaskGovernanceDTO dto) {
        governanceService.returnReview(id, dto == null ? null : dto.getReason());
        return Result.ok();
    }

    /** 处置流水（taskId 为空返回全部任务的最新处置记录） */
    @AdminOnly
    @GetMapping("/task-governance-logs")
    public Result<Page<TaskGovernanceLog>> logs(@RequestParam(required = false) Long taskId,
                                                @RequestParam(defaultValue = "1") long page,
                                                @RequestParam(defaultValue = "20") long size) {
        return Result.ok(governanceService.logs(taskId, page, size));
    }
}
