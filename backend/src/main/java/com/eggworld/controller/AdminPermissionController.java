package com.eggworld.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.eggworld.annotation.AdminOnly;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.AdminPermissionUserVO;
import com.eggworld.dto.PermCodeVO;
import com.eggworld.dto.PermissionAuditVO;
import com.eggworld.dto.PermissionBatchResultVO;
import com.eggworld.dto.PermissionGrantDTO;
import com.eggworld.service.AdminPermissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 权限管理（学生协管员）—— 仅主管理员
 *
 * <p>后台「权限管理」页专用：用户列表 / 批量授予 / 批量收回 / 审计 / 权限点清单。
 */
@RestController
@RequestMapping("/api/admin/permissions")
@RequiredArgsConstructor
public class AdminPermissionController {

    private final AdminPermissionService adminPermissionService;

    /** 权限点清单（代码内枚举，供前端筛选与勾选） */
    @GetMapping("/codes")
    @AdminOnly
    public Result<List<PermCodeVO>> codes() {
        return Result.ok(adminPermissionService.listCodes());
    }

    /** 用户列表：keyword 模糊搜索 + 分页（每人带已授权的权限点） */
    @GetMapping("/users")
    @AdminOnly
    public Result<IPage<AdminPermissionUserVO>> users(@RequestParam(required = false) String keyword,
                                                      @RequestParam(defaultValue = "1") long page,
                                                      @RequestParam(defaultValue = "20") long size) {
        return Result.ok(adminPermissionService.listUsers(keyword, page, size));
    }

    /** 批量授予（勾选 1 人即单人授予） */
    @PostMapping("/grant")
    @AdminOnly
    public Result<PermissionBatchResultVO> grant(@Valid @RequestBody PermissionGrantDTO dto) {
        return Result.ok(adminPermissionService.grant(UserContext.userId(), dto));
    }

    /** 批量收回 */
    @PostMapping("/revoke")
    @AdminOnly
    public Result<PermissionBatchResultVO> revoke(@Valid @RequestBody PermissionGrantDTO dto) {
        return Result.ok(adminPermissionService.revoke(UserContext.userId(), dto));
    }

    /** 审计记录（时间倒序，分页） */
    @GetMapping("/audit")
    @AdminOnly
    public Result<IPage<PermissionAuditVO>> audit(@RequestParam(defaultValue = "1") long page,
                                                  @RequestParam(defaultValue = "20") long size) {
        return Result.ok(adminPermissionService.listAudit(page, size));
    }
}
