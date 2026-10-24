package com.eggworld.service;

import com.eggworld.entity.PageView;
import com.eggworld.mapper.PageViewMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Set;

/**
 * 页面浏览埋点服务
 *
 * 落库条件（全部满足才记录，否则静默丢弃，不抛异常、不影响前端切页）：
 * 1) 已登录（userId 非空）
 * 2) 角色为 student（admin / subadmin 自身的浏览不计入）
 * 3) pageKey 命中后端白名单
 *
 * 不信任前端传入的身份信息，userId 一律由调用方从 JWT 上下文取得。
 */
@Service
@RequiredArgsConstructor
public class PageViewService {

    /** 学生端页面白名单（与前端 STUDENT_PAGES 保持一致） */
    private static final Set<String> PAGE_KEYS = Set.of(
            "plaza", "teamplaza", "helpplaza", "rankhall",
            "gossip", "blacklist", "mytasks", "publish", "profile"
    );

    private final PageViewMapper pageViewMapper;

    /**
     * 记录一次页面浏览（条件不满足时静默丢弃）
     *
     * @param userId  当前登录用户 ID（未登录传 null）
     * @param role    当前登录角色（未登录传 null）
     * @param pageKey 页面标识
     */
    public void record(Long userId, String role, String pageKey) {
        if (userId == null || !"student".equals(role) || pageKey == null || !PAGE_KEYS.contains(pageKey)) {
            return;
        }
        PageView pv = new PageView();
        pv.setUserId(userId);
        pv.setPageKey(pageKey);
        pv.setRole(role);
        pageViewMapper.insert(pv);
    }
}
