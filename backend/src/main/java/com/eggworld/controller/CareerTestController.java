package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.CareerTestService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 职业测评（实验室.beta）：拉题量、生成报告（扣 50 蛋蛋币）、查看历史/详情。
 */
@RestController
@RequestMapping("/api/career-test")
@RequiredArgsConstructor
public class CareerTestController {

    private final CareerTestService service;

    @GetMapping("/meta")
    public Result<Map<String, Integer>> meta() {
        return Result.ok(Map.of("questionCount", service.questionCount(), "cost", CareerTestService.COST));
    }

    @GetMapping("/questions")
    public Result<List<Map<String, Object>>> questions() {
        return Result.ok(service.questions());
    }

    @PostMapping("/generate")
    public Result<Map<String, Long>> generate(@RequestBody GenerateRequest request) {
        long id = service.generate(UserContext.userId(), request == null ? null : request.getAnswers());
        return Result.ok(Map.of("recordId", id));
    }

    @GetMapping("/history")
    public Result<List<Map<String, Object>>> history() {
        return Result.ok(service.history(UserContext.userId()));
    }

    @GetMapping("/reports/{id}")
    public Result<Map<String, Object>> detail(@PathVariable long id) {
        return Result.ok(service.detail(UserContext.userId(), id));
    }

    @Data
    public static class GenerateRequest {
        private List<String> answers;
    }
}
