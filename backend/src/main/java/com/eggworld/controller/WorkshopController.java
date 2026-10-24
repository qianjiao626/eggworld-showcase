package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.service.AppSettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 学生工坊（公开只读）。
 *
 * 卡片的名称/图标在前端注册表里，后端只保存管理员调整过的顺序；
 * 未配置时返回空数组，前端按自己的默认顺序渲染。无用户数据，允许匿名访问。
 */
@RestController
@RequestMapping("/api/workshop")
@RequiredArgsConstructor
public class WorkshopController {

    private final AppSettingsService settingsService;

    @GetMapping("/order")
    public Result<Map<String, Object>> order() {
        return Result.ok(Map.of("order", settingsService.workshopOrder()));
    }
}
