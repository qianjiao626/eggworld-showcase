package com.eggworld.interceptor;

import com.eggworld.common.JwtUtil;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.entity.User;
import com.eggworld.mapper.UserMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.util.Set;

/**
 * JWT 鉴权拦截器
 * 从 Authorization: Bearer xxx 解析 token，写入 UserContext
 * 未登录访问受保护接口 → 401；已封禁账号的请求 → 403（即时下线）
 */
@Component
@RequiredArgsConstructor
public class JwtInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;
    private final UserMapper userMapper;

    /**
     * 公开接口白名单（无需登录）
     * 与 WebMvcConfig 的 excludePathPatterns 双保险，防止排除失效
     */
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/api/health",
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/send-code"
    );

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 放行浏览器预检请求
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }

        // 读接口匿名可浏览（列表/详情）：八卦、吐槽榜、任务广场/详情、用户公开名片；
        // 带 token 时仍解析登录态（用于 liked / myClaimStatus 等个性化字段）
        // "我的打听" / 任务个人列表（my-published/my-claimed）等仍需登录
        // 匿名可浏览的读接口用 [^/]+ 而不是 \d+：非数字 id 也要按公开读放行，
        // 否则 GET /api/announcements/abc 会先被判成「未登录 401」，而不是由参数类型校验回 400/404。
        String uri = request.getRequestURI();
        boolean gossipRead = uri.startsWith("/api/gossip/posts") || uri.startsWith("/api/gossip/rankings")
                || uri.matches("/api/gossip/reports(?:/[^/]+(?:/comments)?)?");
        boolean announcementRead = uri.matches("/api/announcements(?:/[^/]+)?");
        boolean complaintRead = uri.startsWith("/api/complaints/");
        boolean taskRead = uri.equals("/api/tasks") || uri.matches("/api/tasks/\\d+");
        boolean userPublicRead = uri.equals("/api/users/by-nickname") || uri.equals("/api/users/rankings");
        boolean dormitoryPublicRead = uri.equals("/api/dormitories") || uri.equals("/api/dormitories/notes") || uri.matches("/api/dormitories/images/\\d+");
        // 任务技能证明图片：任务详情是匿名可读接口，图必须跟着可读，否则访客看详情就是破图
        boolean taskProofImageRead = uri.matches("/api/tasks/proof-images/\\d+");
        if (HttpMethod.GET.matches(request.getMethod())
                && (gossipRead || complaintRead || taskRead || userPublicRead || dormitoryPublicRead || announcementRead
                    || taskProofImageRead)
                && !uri.contains("my-posts") && !uri.contains("my-published") && !uri.contains("my-claimed")) {
            parseTokenIfPresent(request);
            // 带 token 的已封禁账号同样拦截（含匿名可浏览的读接口）
            if (writeForbiddenIfBanned(response)) {
                return false;
            }
            return true;
        }

        // 埋点上报：游客可调用（不报错），带 token 时解析登录态供业务侧判定是否落库
        // session-start / heartbeat 同样支持匿名访客追踪（TrackController 里 user==null 照常处理）
        boolean trackWrite = uri.equals("/api/track/page")
                || uri.equals("/api/track/session-start")
                || uri.equals("/api/track/heartbeat");
        if (trackWrite) {
            parseTokenIfPresent(request);
            if (writeForbiddenIfBanned(response)) {
                return false;
            }
            return true;
        }

        // 放行公开接口（登录/注册/发验证码/健康检查）
        if (PUBLIC_PATHS.contains(request.getRequestURI())) {
            return true;
        }

        // 从请求头取 token："Bearer <token>"
        if (!parseTokenIfPresent(request)) {
            // 未登录或 token 无效 → 401
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"msg\":\"未登录或登录已过期\",\"data\":null}");
            return false;
        }
        // 已封禁账号 → 403，使封禁即时生效（无需等 token 过期）
        if (writeForbiddenIfBanned(response)) {
            return false;
        }
        return true;
    }

    /**
     * 同步当前登录用户状态（每次登录态请求主键查一次）：
     * 1) 已封禁 → 写出 403 并返回 true（调用方应阻断请求），封禁即时生效
     * 2) 副管理员（sub_admin=1 且非 admin）→ 将上下文角色归一为 subadmin，
     *    使"设为/撤销副管理员"无需等 token 过期即生效
     */
    private boolean writeForbiddenIfBanned(HttpServletResponse response) throws IOException {
        LoginUser user = UserContext.get();
        if (user == null) {
            return false;
        }
        User db = userMapper.selectById(user.getId());
        if (db == null) {
            return false;
        }
        if (db.getBanned() != null && db.getBanned() == 1) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"msg\":\"该账号已被封禁，请联系管理员\",\"data\":null}");
            return true;
        }
        // 副管理员：数据库为准归一角色（JWT 中仍是 student，每请求重新判定权限）
        if (!"admin".equals(db.getRole())
                && db.getSubAdmin() != null && db.getSubAdmin() == 1
                && !"subadmin".equals(user.getRole())) {
            UserContext.set(new LoginUser(db.getId(), "subadmin", db.getNickname()));
        }
        return false;
    }

    /**
     * 解析请求头 token 并写入 UserContext（无 token 或无效时返回 false）
     */
    private boolean parseTokenIfPresent(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            LoginUser user = jwtUtil.parseToken(header.substring(7));
            if (user != null) {
                UserContext.set(user);
                return true;
            }
        }
        return false;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 请求结束清理上下文，防止线程复用串号
        UserContext.clear();
    }
}
