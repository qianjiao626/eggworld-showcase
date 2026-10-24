package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.JwtUtil;
import com.eggworld.entity.User;
import com.eggworld.mapper.UserCharacterMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserStatsMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 忘记密码（登录页）：验证码校验、邮箱不存在时的统一文案、只改 password_hash
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceResetPasswordTest {

    @Mock UserMapper userMapper;
    @Mock UserStatsMapper userStatsMapper;
    @Mock UserCharacterMapper userCharacterMapper;
    @Mock VerifyCodeService verifyCodeService;
    @Mock PointService pointService;
    @Mock JwtUtil jwtUtil;
    @Mock UserService userService;
    @Mock InviteService inviteService;
    @InjectMocks AuthService authService;

    private User user(long id, String email) {
        User u = new User();
        u.setId(id);
        u.setEmail(email);
        u.setPasswordHash(new BCryptPasswordEncoder().encode("oldPass123"));
        return u;
    }

    @Test
    void resetPasswordWritesNewHashForRegisteredEmail() {
        when(userMapper.selectByEmail("student@example.com")).thenReturn(user(7L, "student@example.com"));

        authService.resetPassword("student@example.com", "123456", "newPass456");

        verify(verifyCodeService).verify("student@example.com", "123456");
        ArgumentCaptor<User> cap = ArgumentCaptor.forClass(User.class);
        verify(userMapper).updateById(cap.capture());
        assertEquals(7L, cap.getValue().getId());
        assertTrue(new BCryptPasswordEncoder().matches("newPass456", cap.getValue().getPasswordHash()),
                "落库的应是新密码的 BCrypt 哈希");
    }

    @Test
    void unknownEmailGetsSameMessageAndNoWrite() {
        when(userMapper.selectByEmail(anyString())).thenReturn(null);

        BusinessException e = assertThrows(BusinessException.class,
                () -> authService.resetPassword("nobody@example.com", "123456", "newPass456"));

        assertEquals("邮箱或验证码不正确", e.getMessage(), "不能暴露账号是否存在");
        verify(userMapper, never()).updateById(any(User.class));
    }

    @Test
    void badCodeStopsBeforeAnyWrite() {
        doThrow(new BusinessException("验证码错误，还可尝试 4 次"))
                .when(verifyCodeService).verify(anyString(), anyString());

        assertThrows(BusinessException.class,
                () -> authService.resetPassword("student@example.com", "000000", "newPass456"));

        verify(userMapper, never()).updateById(any(User.class));
    }

    /** 验证码缓存按小写归一：输入大小写与库中不一致时，退化为小写再查一次 */
    @Test
    void mixedCaseEmailFallsBackToLowercaseLookup() {
        when(userMapper.selectByEmail("Student@Example.com")).thenReturn(null);
        when(userMapper.selectByEmail("student@example.com")).thenReturn(user(7L, "student@example.com"));

        authService.resetPassword(" Student@Example.com ", "123456", "newPass456");

        verify(userMapper).updateById(any(User.class));
    }
}
