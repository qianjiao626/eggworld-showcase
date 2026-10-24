package com.eggworld.controller;

import com.eggworld.common.LoginUser;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.TrackHeartbeatDTO;
import com.eggworld.dto.TrackPageDTO;
import com.eggworld.dto.TrackSessionDTO;
import com.eggworld.service.PageViewService;
import com.eggworld.service.VisitorSessionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 埋点上报接口（公开写接口）
 *
 * 游客调用不报错，但只有「已登录且 role=student」的切页才落库，
 * 其余情况（游客 / 管理员 / 副管理员 / 非法 pageKey）由 PageViewService 静默丢弃。
 *
 * v2.5 新增：会话开始（session-start）和心跳（heartbeat），支持匿名访客追踪。
 */
@RestController
@RequestMapping("/api/track")
@RequiredArgsConstructor
public class TrackController {

    private final PageViewService pageViewService;
    private final VisitorSessionService visitorSessionService;

    /** 上报一次页面浏览 */
    @PostMapping("/page")
    public Result<Void> page(@Valid @RequestBody TrackPageDTO dto) {
        LoginUser user = UserContext.get();
        pageViewService.record(
                user == null ? null : user.getId(),
                user == null ? null : user.getRole(),
                dto.getPageKey());
        return Result.ok();
    }

    /** 会话开始（页面首次打开时调用，登录和匿名均可） */
    @PostMapping("/session-start")
    public Result<Void> sessionStart(@Valid @RequestBody TrackSessionDTO dto) {
        LoginUser user = UserContext.get();
        visitorSessionService.startSession(
                dto.getSessionId(),
                dto.getVisitorId(),
                user == null ? null : user.getId(),
                dto.getReferrer(),
                dto.getUaDevice(),
                dto.isNewVisitor());
        return Result.ok();
    }

    /** 心跳（每 30 秒调用一次，更新会话活跃时间） */
    @PostMapping("/heartbeat")
    public Result<Void> heartbeat(@Valid @RequestBody TrackHeartbeatDTO dto) {
        visitorSessionService.heartbeat(dto.getSessionId());
        return Result.ok();
    }
}
