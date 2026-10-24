package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.entity.User;
import com.eggworld.mapper.RatingMapper;
import com.eggworld.mapper.UserCharacterMapper;
import com.eggworld.mapper.UserLikeMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserPermissionMapper;
import com.eggworld.mapper.UserSkillMapper;
import com.eggworld.mapper.UserStatsMapper;
import com.eggworld.service.mail.MailNotifyService;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「我的信息」页自助改密：必须校验当前密码，且只写 password_hash
 */
@ExtendWith(MockitoExtension.class)
class UserServiceChangePasswordTest {

    @Mock UserMapper userMapper;
    @Mock UserStatsMapper userStatsMapper;
    @Mock UserCharacterMapper userCharacterMapper;
    @Mock UserSkillMapper userSkillMapper;
    @Mock UserLikeMapper userLikeMapper;
    @Mock RatingMapper ratingMapper;
    @Mock NotificationService notificationService;
    @Mock MailNotifyService mailNotifyService;
    @Mock UserPermissionMapper userPermissionMapper;
    @InjectMocks UserService userService;

    private User user(long id) {
        User u = new User();
        u.setId(id);
        u.setPasswordHash(new BCryptPasswordEncoder().encode("oldPass123"));
        return u;
    }

    @Test
    void changePasswordWritesNewHash() {
        when(userMapper.selectById(7L)).thenReturn(user(7L));

        userService.changePassword(7L, "oldPass123", "newPass456");

        ArgumentCaptor<User> cap = ArgumentCaptor.forClass(User.class);
        verify(userMapper).updateById(cap.capture());
        assertEquals(7L, cap.getValue().getId());
        assertTrue(new BCryptPasswordEncoder().matches("newPass456", cap.getValue().getPasswordHash()),
                "落库的应是新密码的 BCrypt 哈希");
    }

    @Test
    void wrongOldPasswordIsRejected() {
        when(userMapper.selectById(7L)).thenReturn(user(7L));

        BusinessException e = assertThrows(BusinessException.class,
                () -> userService.changePassword(7L, "wrongPass123", "newPass456"));

        assertEquals("当前密码不正确", e.getMessage());
        verify(userMapper, never()).updateById(any(User.class));
    }

    @Test
    void unknownUserIsRejected() {
        when(userMapper.selectById(404L)).thenReturn(null);

        assertThrows(BusinessException.class,
                () -> userService.changePassword(404L, "oldPass123", "newPass456"));

        verify(userMapper, never()).updateById(any(User.class));
    }
}
