package com.eggworld.interceptor;

import com.eggworld.common.RateLimitException;
import com.eggworld.common.UserContext;
import com.eggworld.config.AppProperties;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import java.time.Clock;
import java.util.*;

/** 单实例、有界内存、固定窗口。粗限流在 JWT/业务 SQL 之前，账号限流在 JWT 之后。 */
@Component
public class ApiTrafficInterceptor implements HandlerInterceptor {
    private final AppProperties.Traffic props;
    private final Clock clock;
    private final Map<String, Window> windows = new HashMap<>();
    private long lastCleanup;
    private static final class Window {
        final long expiresAt; int used;
        Window(long expiresAt) { this.expiresAt = expiresAt; }
    }
    @org.springframework.beans.factory.annotation.Autowired
    public ApiTrafficInterceptor(AppProperties props) { this(props, Clock.systemUTC()); }
    ApiTrafficInterceptor(AppProperties props, Clock clock) {
        this.props = props.getTraffic(); this.clock = clock;
        if (this.props.getWindowSeconds() < 1 || this.props.getMaxKeys() < 10) throw new IllegalArgumentException("非法限流配置");
        for (AppProperties.Quota q : List.of(this.props.getRead(), this.props.getWrite(), this.props.getAuth(),
                this.props.getVerifyCode(), this.props.getUpload())) {
            if (q.getAccount() < 1 || q.getIp() < 1 || q.getGlobal() < 1) throw new IllegalArgumentException("配额必须大于零");
        }
    }
    @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (skip(request)) return true;
        String category = category(request);
        AppProperties.Quota q = quota(category);
        // 客户端来源地址见 clientIp：只有直连来自本机 nginx（回环）时才采信 X-Real-IP，其它来源一律用 TCP 对端地址。
        consume(Map.of(category + ":ip:" + clientIp(request), q.getIp(), category + ":global", q.getGlobal()));
        for (String name : List.of("page", "size", "limit")) {
            String[] values = request.getParameterValues(name);
            if (values == null) continue;
            boolean valid = values.length == 1;
            try {
                long value = Long.parseLong(values[0]);
                valid &= value >= 1 && value <= (name.equals("page") ? 10000 : 100);
            } catch (NumberFormatException e) { valid = false; }
            if (!valid) {
                response.setStatus(400); response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"code\":400,\"msg\":\"分页参数非法：page 为 1–10000，size/limit 为 1–100\",\"data\":null}");
                return false;
            }
        }
        return true;
    }

    /**
     * 客户端来源地址（2026-10-07）：线上 nginx 反代后，容器看到的对端永远是 127.0.0.1，
     * 于是「每个 IP」的额度实际退化成「全站」额度（认证/验证码 120 次/分、上传 200 次/分），
     * 高峰会误伤正常用户。
     *
     * 取法：**只有**直连对端是回环（本机 nginx）时才采信 `X-Real-IP`；nginx 的
     * `proxy_set_header X-Real-IP $remote_addr` 会用真实来源**覆写**该头，客户端自带的同名头到不了这里。
     * 其它来源（例如有人直连 8090、或将来前面再挂一层代理）一律返回 TCP 对端地址 —— 伪造请求头
     * 不会开出新的计数桶。`X-Forwarded-For` 依旧不读：它是可追加的列表，最左值可被伪造。
     */
    private static String clientIp(HttpServletRequest request) {
        String peer = request.getRemoteAddr();
        if (isLoopback(peer)) {
            String real = request.getHeader("X-Real-IP");
            if (real != null && !real.isBlank()) return real.trim();
        }
        return peer;
    }

    /** 回环地址的常见形态（Tomcat 可能给出 IPv4 或两种 IPv6 写法）；只认字面量，不做域名解析 */
    private static boolean isLoopback(String address) {
        if (address == null) return false;
        if (address.startsWith("127.")) return true;
        return "::1".equals(address) || "0:0:0:0:0:0:0:1".equals(address);
    }

    public HandlerInterceptor accountLimits() {
        return new HandlerInterceptor() {
            @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                if (!skip(request) && UserContext.userId() != null) {
                    String c = category(request);
                    consume(Map.of(c + ":account:" + UserContext.userId(), quota(c).getAccount()));
                }
                return true;
            }
        };
    }
    /** 匿名登录/注册没有 UserContext；邮箱预算在密码计算/数据库工作前扣除，不保存明文邮箱。 */
    public void limitAuthentication(String email) {
        if (email == null || email.length() > 254) throw new com.eggworld.common.BusinessException("邮箱格式不正确");
        try {
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(
                    email.trim().toLowerCase(Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            consume(Map.of("auth:email:" + HexFormat.of().formatHex(hash), props.getAuth().getAccount()));
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private boolean skip(HttpServletRequest r) { return "OPTIONS".equals(r.getMethod()) || "/api/health".equals(r.getRequestURI()); }
    private String category(HttpServletRequest r) {
        String path = r.getRequestURI();
        if ("/api/auth/send-code".equals(path)) return "verify";
        if (path.startsWith("/api/auth/")) return "auth";
        if (r.getContentType() != null && r.getContentType().toLowerCase(Locale.ROOT).startsWith("multipart/")) return "upload";
        return "GET".equals(r.getMethod()) || "HEAD".equals(r.getMethod()) ? "read" : "write";
    }
    private AppProperties.Quota quota(String c) {
        return switch (c) {
            case "verify" -> props.getVerifyCode(); case "auth" -> props.getAuth(); case "upload" -> props.getUpload();
            case "read" -> props.getRead(); default -> props.getWrite();
        };
    }
    synchronized void consume(Map<String, Integer> quotas) {
        long now = clock.millis();
        long duration = props.getWindowSeconds() * 1000L;
        if (now - lastCleanup >= duration) { windows.entrySet().removeIf(e -> e.getValue().expiresAt <= now); lastCleanup = now; }
        int needed = 0;
        for (var q : quotas.entrySet()) {
            Window w = windows.get(q.getKey());
            if (w == null) needed++;
            else if (w.expiresAt > now && w.used >= q.getValue()) throw new RateLimitException((w.expiresAt - now + 999) / 1000);
        }
        if (windows.size() + needed > props.getMaxKeys()) throw new RateLimitException(props.getWindowSeconds());
        for (String key : quotas.keySet()) {
            Window w = windows.get(key);
            if (w == null || w.expiresAt <= now) { w = new Window(now + duration); windows.put(key, w); }
            w.used++;
        }
    }
}
