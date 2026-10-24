package com.eggworld.interceptor;

import com.eggworld.common.JwtUtil;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.entity.User;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 回归：游客首屏必须能匿名调用埋点与榜单读接口，否则控制台报 401。
 * - /api/track/session-start、/api/track/heartbeat：TrackController 支持匿名访客追踪
 *   （user==null 时照常落库），拦截器不能把它们判成需登录。
 * - /api/users/rankings：神蛋榜单是公开读接口，前端启动即拉取，未登录也应放行。
 */
class TrackAndRankingPublicReadTest {
    private final JwtUtil jwt = mock(JwtUtil.class);
    private final UserMapper users = mock(UserMapper.class);
    private final JwtInterceptor interceptor = new JwtInterceptor(jwt, users);

    @AfterEach void cleanUp() { UserContext.clear(); }

    @ParameterizedTest
    @ValueSource(strings = {"/api/track/page", "/api/track/session-start", "/api/track/heartbeat"})
    void guestsCanReportTrackEvents(String path) throws Exception {
        var response = new MockHttpServletResponse();
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("POST", path), response, new Object()));
        assertEquals(200, response.getStatus());
        verifyNoInteractions(users);
    }

    @Test void guestsCanReadRankings() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/users/rankings");
        request.setQueryString("cat=all");
        var response = new MockHttpServletResponse();
        assertTrue(interceptor.preHandle(request, response, new Object()));
        assertEquals(200, response.getStatus());
        verifyNoInteractions(users);
    }

    @Test void rankingsWriteStillRequiresLogin() throws Exception {
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest("POST", "/api/users/rankings"), response, new Object()));
        assertEquals(401, response.getStatus());
    }

    @Test void bannedTokenStillBlockedForTrackSessionStart() throws Exception {
        when(jwt.parseToken("banned")).thenReturn(new LoginUser(9L, "student", "test"));
        var user = new User(); user.setId(9L); user.setBanned(1);
        when(users.selectById(9L)).thenReturn(user);
        var request = new MockHttpServletRequest("POST", "/api/track/session-start");
        request.addHeader("Authorization", "Bearer banned");
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(request, response, new Object()));
        assertEquals(403, response.getStatus());
    }
}
