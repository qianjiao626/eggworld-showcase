package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.CatService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 猫舍系统（宠物系统外观改造）：
 * 捏猫、我的猫舍、猫市集、领养、投票、榜单、审核、发奖。
 */
@RestController
@RequestMapping("/api/cats")
@RequiredArgsConstructor
public class CatController {

    private final CatService service;

    /* ---------- 我的猫舍 ---------- */

    @GetMapping("/mine")
    public Result<List<Map<String, Object>>> mine() {
        return Result.ok(service.myRooms(UserContext.userId()));
    }

    @GetMapping("/reputation")
    public Result<Integer> reputation() {
        return Result.ok(service.myReputation(UserContext.userId()));
    }

    @PostMapping
    public Result<Map<String, Object>> create(@RequestBody SaveRoomRequest req) {
        return Result.ok(service.createRoom(UserContext.userId(), req.getName(), req.getLook(), req.getIntro()));
    }

    @PutMapping("/{id}")
    public Result<Map<String, Object>> update(@PathVariable long id, @RequestBody SaveRoomRequest req) {
        return Result.ok(service.updateRoom(UserContext.userId(), id, req.getName(), req.getLook(), req.getIntro()));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable long id) {
        service.deleteRoom(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/{id}/submit")
    public Result<Void> submit(@PathVariable long id) {
        service.submitForReview(UserContext.userId(), id);
        return Result.ok();
    }

    /* ---------- 浏览与领养 ---------- */

    @GetMapping("/market")
    public Result<List<Map<String, Object>>> market(@RequestParam(required = false) String keyword,
                                                    @RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "24") int size) {
        return Result.ok(service.market(UserContext.userId(), keyword, page, size));
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable long id) {
        return Result.ok(service.roomDetail(UserContext.userId(), id));
    }

    @PostMapping("/{id}/adopt")
    public Result<Map<String, Object>> adopt(@PathVariable long id) {
        return Result.ok(service.adopt(UserContext.userId(), id));
    }

    /* ---------- 投票与榜单 ---------- */

    @PostMapping("/{id}/vote")
    public Result<Map<String, Object>> vote(@PathVariable long id) {
        return Result.ok(service.vote(UserContext.userId(), id));
    }

    @GetMapping("/votes/remaining")
    public Result<Integer> remainingVotes() {
        return Result.ok(service.remainingVotes(UserContext.userId()));
    }

    @GetMapping("/ranking")
    public Result<List<Map<String, Object>>> ranking(@RequestParam(defaultValue = "50") int limit) {
        return Result.ok(service.ranking(limit));
    }

    /* ---------- 审核（宠物系统管理员） ---------- */

    @GetMapping("/review/pending")
    public Result<List<Map<String, Object>>> pending() {
        return Result.ok(service.pendingRooms(UserContext.userId()));
    }

    @PostMapping("/review/{id}/approve")
    public Result<Void> approve(@PathVariable long id) {
        service.approve(UserContext.userId(), id);
        return Result.ok();
    }

    @PostMapping("/review/{id}/reject")
    public Result<Void> reject(@PathVariable long id, @RequestBody(required = false) RejectRequest req) {
        service.reject(UserContext.userId(), id, req == null ? null : req.getReason());
        return Result.ok();
    }

    @PostMapping("/review/{id}/take-down")
    public Result<Void> takeDown(@PathVariable long id) {
        service.takeDown(UserContext.userId(), id);
        return Result.ok();
    }

    /** 结算总榜第一名奖励（100 蛋蛋币 + 50 声望），同一赛季只发一次。 */
    @PostMapping("/review/grant-reward")
    public Result<Map<String, Object>> grantReward(@RequestBody(required = false) GrantRequest req) {
        return Result.ok(service.grantRankReward(UserContext.userId(), req == null ? null : req.getSeason()));
    }

    /* ---------- 请求体 ---------- */

    @Data
    public static class SaveRoomRequest {
        private String name;
        private Map<String, Object> look;
        private String intro;
    }

    @Data
    public static class RejectRequest {
        private String reason;
    }

    @Data
    public static class GrantRequest {
        private String season;
    }
}
