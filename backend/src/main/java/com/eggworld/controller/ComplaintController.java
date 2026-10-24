package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.ComplaintVO;
import com.eggworld.dto.SubmitComplaintDTO;
import com.eggworld.dto.UpdateComplaintDTO;
import com.eggworld.service.ComplaintService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 大学吐槽榜接口
 * - 排名/统计/详情/吐槽墙：匿名可浏览（拦截器按 GET 放行）
 * - 提交吐槽：需登录（每人限 2 次 + 奖励）
 */
@RestController
@RequestMapping("/api/complaints")
@RequiredArgsConstructor
public class ComplaintController {

    private final ComplaintService complaintService;

    /** 学校排名（metric=all 总榜 / 指定维度榜） */
    @GetMapping("/rankings")
    public Result<List<ComplaintVO.RankItem>> rankings(@RequestParam(required = false) String metric) {
        return Result.ok(complaintService.rankings(metric));
    }

    /** 页面统计（收录高校/总数/平均分/我的次数） */
    @GetMapping("/stats")
    public Result<ComplaintVO.Stats> stats() {
        return Result.ok(complaintService.stats(UserContext.userId()));
    }

    /** 学校详情（聚合 + 16 维均分 + 最近留言） */
    @GetMapping("/school")
    public Result<ComplaintVO.SchoolDetail> school(@RequestParam String name) {
        return Result.ok(complaintService.schoolDetail(name));
    }

    /** 吐槽墙（最近 N 条） */
    @GetMapping("/wall")
    public Result<List<ComplaintVO.Item>> wall(@RequestParam(defaultValue = "20") long limit) {
        return Result.ok(complaintService.wall(limit));
    }

    /** 提交吐槽（限 2 次，+10 币 +10 经验） */
    @PostMapping
    public Result<Void> submit(@Valid @RequestBody SubmitComplaintDTO dto) {
        complaintService.submit(UserContext.userId(), dto);
        return Result.ok();
    }

    /** 我的吐槽列表（用于「修改评分」，需登录） */
    @GetMapping("/mine")
    public Result<List<ComplaintVO.Item>> mine() {
        return Result.ok(complaintService.myComplaints(UserContext.userId()));
    }

    /** 修改自己某条吐槽的评分与留言（不发奖、不占奖励次数） */
    @PutMapping("/{id}")
    public Result<Void> update(@PathVariable Long id, @Valid @RequestBody UpdateComplaintDTO dto) {
        complaintService.updateMetrics(UserContext.userId(), id, dto);
        return Result.ok();
    }
}
