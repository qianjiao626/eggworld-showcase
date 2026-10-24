package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.CareerReportService;
import com.eggworld.service.ResumeService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 大师兄简历（学生工坊 /rs/ 静态站）的后端能力。
 *
 * 简历站是纯静态前端，所有账户/余额/收费/历史都在这里：
 *   · /meta            价格 + 当前余额 + 每日次数
 *   · /analyze         深度对标（收费按后台设置，失败退款，requestId 幂等）
 *   · /analyses        历史对标记录
 *   · /drafts          结构化简历草稿（生成的数据）
 *   · /career/meta     职业测评价格 / 余额 / 今日剩余次数
 *   · /career/report   生成职业测评报告（收费 + 落库，返回 HTML）
 *   · /career/reports  职业测评历史报告
 */
@RestController
@RequestMapping("/api/resume")
@RequiredArgsConstructor
public class ResumeController {

    private final ResumeService service;
    private final CareerReportService careerReportService;

    @GetMapping("/meta")
    public Result<Map<String, Object>> meta() {
        return Result.ok(service.meta(UserContext.userId()));
    }

    @PostMapping("/analyze")
    public Result<Map<String, Object>> analyze(@RequestBody(required = false) AnalyzeRequest request) {
        if (request == null
                || !StringUtils.hasText(request.getResumeText())
                || !StringUtils.hasText(request.getJdText())) {
            return Result.badRequest("请提供简历内容和目标岗位 JD");
        }
        try {
            return Result.ok(service.analyze(UserContext.userId(),
                    request.getResumeText(), request.getJdText(), request.getRequestId()));
        } catch (IllegalStateException e) {
            /* AI 侧的可读错误（未配置密钥 / 上游失败 / 格式异常），此时已退款 */
            return Result.fail(500, e.getMessage());
        }
    }

    @GetMapping("/analyses")
    public Result<List<Map<String, Object>>> analyses() {
        return Result.ok(service.listAnalyses(UserContext.userId()));
    }

    /** 职业测评：价格 / 余额 / 今日剩余次数（开始测评前展示与校验）。 */
    @GetMapping("/career/meta")
    public Result<Map<String, Object>> careerMeta() {
        return Result.ok(careerReportService.meta(UserContext.userId()));
    }

    /** 职业测评：生成报告（收费 + 落库；同一 requestId 重试不会重复扣费）。 */
    @PostMapping("/career/report")
    public Result<Map<String, Object>> careerReport(@RequestBody(required = false) CareerReportRequest request) {
        if (request == null || request.getAnswers() == null) {
            return Result.badRequest("请先完成测评题目");
        }
        return Result.ok(careerReportService.generate(
                UserContext.userId(), request.getAnswers(), request.getRequestId()));
    }

    /** 职业测评：历史报告列表。 */
    @GetMapping("/career/reports")
    public Result<List<Map<String, Object>>> careerReports() {
        return Result.ok(careerReportService.listReports(UserContext.userId()));
    }

    /** 职业测评：单份历史报告（含 HTML 快照）。 */
    @GetMapping("/career/reports/{id}")
    public Result<Map<String, Object>> careerReportDetail(@PathVariable long id) {
        return Result.ok(careerReportService.getReport(UserContext.userId(), id));
    }

    /** 职业测评：生成（或复用）公开分享链接。 */
    @PostMapping("/career/reports/{id}/share")
    public Result<Map<String, Object>> shareCareerReport(@PathVariable long id) {
        return Result.ok(careerReportService.shareReport(UserContext.userId(), id));
    }

    /** 职业测评：撤销分享，旧链接立即失效。 */
    @DeleteMapping("/career/reports/{id}/share")
    public Result<Void> unshareCareerReport(@PathVariable long id) {
        careerReportService.unshareReport(UserContext.userId(), id);
        return Result.ok();
    }

    /** 职业测评：公开读取分享报告（免登录，只返回标题与 HTML 快照）。 */
    @GetMapping("/career/shared/{token}")
    public Result<Map<String, Object>> sharedCareerReport(@PathVariable String token) {
        return Result.ok(careerReportService.sharedReport(token));
    }

    @GetMapping("/analyses/{id}")
    public Result<Map<String, Object>> analysis(@PathVariable long id) {
        return Result.ok(service.getAnalysis(UserContext.userId(), id));
    }

    @PostMapping("/drafts")
    public Result<Map<String, Object>> saveDraft(@RequestBody(required = false) DraftRequest request) {
        if (request == null) return Result.badRequest("草稿内容为空");
        long id = service.saveDraft(UserContext.userId(),
                request.getId(), request.getTitle(), request.getTarget(), request.getData());
        return Result.ok(Map.of("id", id));
    }

    @GetMapping("/drafts")
    public Result<List<Map<String, Object>>> drafts() {
        return Result.ok(service.listDrafts(UserContext.userId()));
    }

    @GetMapping("/drafts/{id}")
    public Result<Map<String, Object>> draft(@PathVariable long id) {
        return Result.ok(service.getDraft(UserContext.userId(), id));
    }

    @Data
    public static class AnalyzeRequest {
        private String resumeText;
        private String jdText;
        private String requestId;
    }

    @Data
    public static class DraftRequest {
        private Long id;
        private String title;
        private String target;
        private JsonNode data;
    }

    @Data
    public static class CareerReportRequest {
        /** 19 题的答案数组（选项序号） */
        private JsonNode answers;
        /** 幂等键：同一次点击重试不重复扣费 */
        private String requestId;
    }
}
