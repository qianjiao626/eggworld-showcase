package com.eggworld.interceptor;

import com.eggworld.common.JwtUtil;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GossipReportPublicReadTest {
    private final JwtInterceptor interceptor = new JwtInterceptor(mock(JwtUtil.class), mock(UserMapper.class));
    /** 回归（2026-10-06 实测）：非数字 id 也要按公开读放行（随后由参数类型校验回 400），不能先判 401。 */
    @ParameterizedTest @ValueSource(strings = {"/api/gossip/reports", "/api/gossip/reports/1", "/api/gossip/reports/1/comments", "/api/gossip/reports/abc"})
    void guestCanReadPublishedOnly(String path) throws Exception {
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("GET", path), new MockHttpServletResponse(), new Object()));
    }
    @ParameterizedTest @ValueSource(strings = {"/api/gossip/reports", "/api/gossip/reports/1/comments", "/api/gossip/reports/1/like", "/api/gossip/reports/check-text", "/api/admin/gossip-reports/pending"})
    void guestCannotWriteOrModerate(String path) throws Exception {
        var resp = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest("POST", path), resp, new Object()));
        assertEquals(401, resp.getStatus());
    }
}
