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

class AnnouncementPublicReadTest {
    private final JwtInterceptor interceptor = new JwtInterceptor(mock(JwtUtil.class), mock(UserMapper.class));
    /** 回归（2026-10-06 实测）：非数字 id 也必须按公开读放行，让参数校验回 400，而不是匿名先撞 401。 */
    @ParameterizedTest @ValueSource(strings = {"/api/announcements", "/api/announcements/2", "/api/announcements/abc", "/api/announcements/-1"})
    void guestCanRead(String path) throws Exception {
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("GET", path), new MockHttpServletResponse(), new Object()));
    }
    @Test void guestCannotPublish() throws Exception {
        var resp = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest("POST", "/api/admin/announcements"), resp, new Object()));
        assertEquals(401, resp.getStatus());
    }
}
