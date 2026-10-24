package com.eggworld.interceptor;

import com.eggworld.common.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 模块可用性闸（2026-10-07）：职业测评 / 宠物系统 / 猫舍这三块**本轮不在线上建表**，
 * 但接口代码仍随 jar 上线。缺表时若直接放行到业务层，SQL 会抛
 * {@code Table 'eggworld.pets' doesn't exist}，经 GlobalExceptionHandler 兜底变成
 * 「HTTP 200 + code:500 + 异常原文」—— 既不是可读提示，也把表名/语句回显给了调用方。
 *
 * 这里在进入 Controller 之前先判定模块核心表是否存在：
 *   · 不存在 → 抛 {@link BusinessException}(404, "该功能暂未开放")，前端拿到的是可读业务码；
 *   · 存在   → 直接放行（运维补跑脚本后**无需重启**，缓存过期即自动放行）。
 *
 * 判定结果缓存 {@link #CACHE_MILLIS} 毫秒，避免每个请求都查 information_schema。
 * 注册在 JwtInterceptor 之后（order 20）：未登录请求仍先拿 401，不会经由这条闸暴露模块状态；
 * 探测本身失败（如连不上库）时**放行**，让真实故障在业务层暴露，不能把连库故障说成「未开放」。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ModuleAvailabilityInterceptor implements HandlerInterceptor {

    /** 缓存时长：兼顾「不每请求查库」与「补表后自动放行」 */
    static final long CACHE_MILLIS = 60_000L;

    /** 路径前缀 → 模块核心表（前缀互不重叠；LinkedHashMap 只为日志顺序稳定） */
    private static final Map<String, String> MODULES = new LinkedHashMap<>();

    static {
        MODULES.put("/api/career-test/", "career_test_reports");
        MODULES.put("/api/pets/", "pets");
        MODULES.put("/api/cats/", "cat_rooms");
    }

    private final JdbcTemplate jdbc;

    private final Map<String, Probe> probes = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String uri = request.getRequestURI();
        for (Map.Entry<String, String> module : MODULES.entrySet()) {
            if (uri.startsWith(module.getKey()) && !available(module.getValue())) {
                throw new BusinessException(404, "该功能暂未开放");
            }
        }
        return true;
    }

    /** 核心表存在即视为模块可用（缓存期内不再查库） */
    private boolean available(String table) {
        long now = System.currentTimeMillis();
        Probe cached = probes.get(table);
        if (cached != null && now - cached.at < CACHE_MILLIS) {
            return cached.exists;
        }
        boolean exists;
        try {
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, table);
            exists = count != null && count > 0;
        } catch (RuntimeException error) {
            // 探测失败不拦业务：真故障交给业务层与全局异常处理器，避免把「连不上库」伪装成「未开放」
            log.warn("[MODULE_GATE] 探测表 {} 失败，本次放行：{}", table, error.getMessage());
            return true;
        }
        probes.put(table, new Probe(now, exists));
        if (!exists) {
            log.info("[MODULE_GATE] 表 {} 不存在 → 该模块视为未开放（缓存 {}s，补跑脚本后自动放行）",
                    table, CACHE_MILLIS / 1000);
        }
        return exists;
    }

    /** 一次探测结果 */
    private record Probe(long at, boolean exists) { }
}
