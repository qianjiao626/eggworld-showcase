package com.eggworld.interceptor;

import com.eggworld.common.RateLimitException;
import com.eggworld.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 回归（2026-10-07）：线上 nginx 反代后容器看到的对端全是 127.0.0.1 → 「每个 IP」的额度
 * 退化成「全站」额度（认证/验证码 120 次/分、上传 200 次/分），高峰会误伤正常用户。
 * 修法：只在直连对端是回环（本机 nginx）时采信 X-Real-IP（nginx 用 $remote_addr 覆写该头，
 * 客户端自带的同名头到不了应用）；其它来源一律用 TCP 对端地址防伪造。
 */
class ApiTrafficClientIpTest {

    /** 只把「读」这一档的 IP 额度压到 1，便于观察计数桶是否按真实客户端分开 */
    private ApiTrafficInterceptor guard(int ipQuota) {
        AppProperties props = new AppProperties();
        props.getTraffic().getRead().setIp(ipQuota);
        props.getTraffic().getRead().setGlobal(1000);
        return new ApiTrafficInterceptor(props, new ApiTrafficBudgetTest.Time());
    }

    private MockHttpServletRequest request(String peer, String realIp) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tasks");
        request.setRemoteAddr(peer);
        if (realIp != null) request.addHeader("X-Real-IP", realIp);
        return request;
    }

    private boolean pass(ApiTrafficInterceptor guard, String peer, String realIp) throws Exception {
        return guard.preHandle(request(peer, realIp), new MockHttpServletResponse(), null);
    }

    @Test
    void behindLocalNginxTheRealClientIpIsCounted() throws Exception {
        ApiTrafficInterceptor guard = guard(1);

        assertTrue(pass(guard, "127.0.0.1", "203.0.113.9"));
        // 同一个真实 IP 的第二次请求被限 —— 说明用的是 X-Real-IP，而不是所有请求共用的 127.0.0.1
        assertThrows(RateLimitException.class, () -> pass(guard, "127.0.0.1", "203.0.113.9"));
        // 换一个真实 IP 仍有额度 —— 说明不再退化成「全站一个桶」
        assertTrue(pass(guard, "127.0.0.1", "203.0.113.10"));
    }

    @Test
    void ipv6LoopbackIsAlsoTreatedAsLocalNginx() throws Exception {
        ApiTrafficInterceptor guard = guard(1);

        assertTrue(pass(guard, "0:0:0:0:0:0:0:1", "203.0.113.20"));
        assertThrows(RateLimitException.class, () -> pass(guard, "::1", "203.0.113.20"));
    }

    @Test
    void nonLoopbackPeerCannotSpoofWithRealIpHeader() throws Exception {
        ApiTrafficInterceptor guard = guard(1);

        assertTrue(pass(guard, "198.51.100.7", "203.0.113.9"));
        // 直连（非回环）来源伪造 X-Real-IP 不得开出新桶：第二次即被限
        assertThrows(RateLimitException.class, () -> pass(guard, "198.51.100.7", "203.0.113.99"));
    }

    @Test
    void missingRealIpHeaderFallsBackToPeerAddress() throws Exception {
        ApiTrafficInterceptor guard = guard(1);

        assertTrue(pass(guard, "127.0.0.1", null));
        assertThrows(RateLimitException.class, () -> pass(guard, "127.0.0.1", null));
    }
}
