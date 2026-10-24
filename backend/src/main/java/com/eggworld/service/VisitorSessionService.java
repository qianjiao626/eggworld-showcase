package com.eggworld.service;

import com.eggworld.entity.VisitorSession;
import com.eggworld.mapper.VisitorSessionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 访客会话服务：会话开始、心跳、页面浏览关联
 */
@Service
@RequiredArgsConstructor
public class VisitorSessionService {

    private final VisitorSessionMapper visitorSessionMapper;

    /**
     * 开始一个新会话（前端页面打开时调用）
     */
    public void startSession(String sessionId, String visitorId, Long userId,
                             String referrer, String uaDevice, boolean isNewVisitor) {
        if (sessionId == null || visitorId == null) return;
        VisitorSession vs = new VisitorSession();
        vs.setSessionId(sessionId);
        vs.setVisitorId(visitorId);
        vs.setUserId(userId);
        vs.setReferrer(referrer != null && referrer.length() > 256 ? referrer.substring(0, 256) : referrer);
        vs.setUaDevice(uaDevice);
        vs.setIsNewVisitor(isNewVisitor ? 1 : 0);
        vs.setPageCount(1);
        LocalDateTime now = LocalDateTime.now();
        vs.setStartedAt(now);
        vs.setLastActiveAt(now);
        try {
            visitorSessionMapper.insert(vs);
        } catch (Exception e) {
            // duplicate session_id — silently ignore (idempotent)
        }
    }

    /**
     * 心跳：更新最后活跃时间并递增页数
     */
    public void heartbeat(String sessionId) {
        if (sessionId == null) return;
        visitorSessionMapper.heartbeat(sessionId, LocalDateTime.now());
    }
}
