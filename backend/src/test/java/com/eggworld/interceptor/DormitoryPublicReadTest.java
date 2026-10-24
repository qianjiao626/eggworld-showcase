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

class DormitoryPublicReadTest {
    private final JwtUtil jwt = mock(JwtUtil.class);
    private final UserMapper users = mock(UserMapper.class);
    private final JwtInterceptor interceptor = new JwtInterceptor(jwt, users);
    @AfterEach void cleanUp() { UserContext.clear(); }

    @ParameterizedTest
    @ValueSource(strings = {"/api/dormitories", "/api/dormitories/notes", "/api/dormitories/images/1"})
    void guestsCanReadPublishedContent(String path) throws Exception {
        var response = new MockHttpServletResponse();
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("GET", path), response, new Object()));
        assertEquals(200, response.getStatus());
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/dormitories/mine", "/api/dormitories/mine/notes", "/api/dormitories/review/pending",
            "/api/dormitories/review/images/1", "/api/dormitories/review/notes/pending", "/api/dormitories/reviewer/me",
            "/api/dormitories/notes/private"})
    void privateReadsStillRequireLogin(String path) throws Exception {
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest("GET", path), response, new Object()));
        assertEquals(401, response.getStatus());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/dormitories", "/api/dormitories/notes", "/api/dormitories/review/1", "/api/dormitories/review/notes/1"})
    void anonymousWritesStayBlocked(String path) throws Exception {
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest("POST", path), response, new Object()));
        assertEquals(401, response.getStatus());
    }

    @Test void bannedTokenIsBlockedEvenForPublishedNotes() throws Exception {
        when(jwt.parseToken("banned")).thenReturn(new LoginUser(7L, "student", "test"));
        var user = new User(); user.setId(7L); user.setBanned(1);
        when(users.selectById(7L)).thenReturn(user);
        var request = new MockHttpServletRequest("GET", "/api/dormitories/notes");
        request.addHeader("Authorization", "Bearer banned");
        var response = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(request, response, new Object()));
        assertEquals(403, response.getStatus());
    }
}
