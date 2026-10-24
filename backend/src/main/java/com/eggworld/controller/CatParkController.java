package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.CatParkService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 猫咪公园（繁育交互）：目录猫 / 好感度互动 / 流浪猫领养 / 繁育申请-同意-拒绝。
 * 鉴权走 JwtInterceptor（/api/** 默认需登录），按 UserContext.userId() 隔离与归属校验。
 */
@RestController
@RequestMapping("/api/cat-park")
@RequiredArgsConstructor
public class CatParkController {

    private final CatParkService service;

    /** 目录猫（平台流浪猫 + 全部用户寄养猫）+ 我的视角繁育资格。 */
    @GetMapping("/cats")
    public Result<List<Map<String, Object>>> cats() {
        return Result.ok(service.listCats(UserContext.userId()));
    }

    /** 公园场景固定 5 只：2 流浪猫 + 至多 3 只他人用户猫（按用户去重随机抽取，不含自己的猫）。 */
    @GetMapping("/scene")
    public Result<List<Map<String, Object>>> scene() {
        return Result.ok(service.sceneCats(UserContext.userId()));
    }

    /** 领养流浪猫（无前置条件）。 */
    @PostMapping("/cats/{id}/adopt")
    public Result<Map<String, Object>> adopt(@PathVariable Long id) {
        return Result.ok(service.adoptStray(UserContext.userId(), id));
    }

    /** 发起繁育申请（目标须为他人用户猫；双方好感度≥Lv.3 + 成年 + 均不在 48h 冷却，服务端校验）。 */
    @PostMapping("/breeding/requests")
    public Result<Map<String, Object>> createRequest(@RequestBody CreateRequest req) {
        return Result.ok(service.createBreedingRequest(UserContext.userId(), req.getTargetCatId(), req.getApplicantCatUid()));
    }

    /** 我收到的繁育申请（归属用户视角）。 */
    @GetMapping("/breeding/requests/received")
    public Result<List<Map<String, Object>>> received() {
        return Result.ok(service.listReceivedRequests(UserContext.userId()));
    }

    /** 我发起的繁育申请（发起方视角，含结果与后代）。 */
    @GetMapping("/breeding/requests/sent")
    public Result<List<Map<String, Object>>> sent() {
        return Result.ok(service.listSentRequests(UserContext.userId()));
    }

    /** 同意繁育（归属用户操作；服务端二次复查冷却 + 裁决后代 + 通知发起方）。 */
    @PostMapping("/breeding/requests/{id}/accept")
    public Result<Map<String, Object>> accept(@PathVariable Long id) {
        return Result.ok(service.acceptRequest(UserContext.userId(), id));
    }

    /** 拒绝繁育（归属用户操作）。 */
    @PostMapping("/breeding/requests/{id}/reject")
    public Result<Void> reject(@PathVariable Long id) {
        service.rejectRequest(UserContext.userId(), id);
        return Result.ok();
    }

    /** 领取繁育后代（发起方操作，幂等）。 */
    @PostMapping("/breeding/requests/{id}/claim")
    public Result<Map<String, Object>> claim(@PathVariable Long id) {
        return Result.ok(service.claimOffspring(UserContext.userId(), id));
    }

    @Data
    public static class CreateRequest {
        private Long targetCatId;
        private String applicantCatUid;
    }
}
