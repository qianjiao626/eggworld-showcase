package com.eggworld.controller;

import com.eggworld.annotation.AdminOnly;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.AppSettingsService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 管理后台 · 系统设置（仅主管理员）。
 *
 * 两组同结构的收费配置：是否收费 / 单次价格 / 每人每天次数
 *   · /resume  大师兄简历 · 深度对标
 *   · /career  大师兄找方向 · 职业测评
 * 保存后业务侧下一次请求即生效（不缓存、不重启）。
 */
@RestController
@RequestMapping("/api/admin/settings")
@RequiredArgsConstructor
public class AdminSettingsController {

    private final AppSettingsService settingsService;

    @AdminOnly
    @GetMapping("/resume")
    public Result<Map<String, Object>> resumeSettings() {
        return Result.ok(settingsService.resumeSettings().toMap());
    }

    @AdminOnly
    @PutMapping("/resume")
    public Result<Map<String, Object>> saveResumeSettings(@RequestBody(required = false) ChargeSettingsRequest request) {
        if (request == null) return Result.badRequest("请填写设置项");
        return Result.ok(settingsService.saveResumeSettings(
                request.getChargeEnabled(), request.getAnalyzeCost(),
                request.getDailyLimit(), UserContext.userId()).toMap());
    }

    @AdminOnly
    @GetMapping("/career")
    public Result<Map<String, Object>> careerSettings() {
        return Result.ok(settingsService.careerSettings().toMap());
    }

    @AdminOnly
    @PutMapping("/career")
    public Result<Map<String, Object>> saveCareerSettings(@RequestBody(required = false) ChargeSettingsRequest request) {
        if (request == null) return Result.badRequest("请填写设置项");
        return Result.ok(settingsService.saveCareerSettings(
                request.getChargeEnabled(), request.getAnalyzeCost(),
                request.getDailyLimit(), UserContext.userId()).toMap());
    }

    /** 学生工坊卡片顺序。 */
    @AdminOnly
    @GetMapping("/workshop")
    public Result<Map<String, Object>> workshopOrder() {
        return Result.ok(Map.of("order", settingsService.workshopOrder()));
    }

    @AdminOnly
    @PutMapping("/workshop")
    public Result<Map<String, Object>> saveWorkshopOrder(@RequestBody(required = false) WorkshopOrderRequest request) {
        if (request == null || request.getOrder() == null) return Result.badRequest("请提供排序列表");
        return Result.ok(Map.of("order",
                settingsService.saveWorkshopOrder(request.getOrder(), UserContext.userId())));
    }

    @Data
    public static class ChargeSettingsRequest {
        /** true 收费 / false 免费 */
        private Boolean chargeEnabled;
        /** 单次价格（蛋蛋币），免费期间保留，恢复收费时直接使用 */
        private Integer analyzeCost;
        /** 每人每天可用次数，0 表示不限 */
        private Integer dailyLimit;
    }

    @Data
    public static class WorkshopOrderRequest {
        /** 功能 id，按展示先后排列 */
        private List<String> order;
    }
}
