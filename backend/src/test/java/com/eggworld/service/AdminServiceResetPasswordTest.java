package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.entity.User;
import com.eggworld.mapper.InviteRecordMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserPurgeMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证管理员重置用户密码：BCrypt 落库、目标校验与权限边界。
 *
 * <p>不启动 Spring 上下文，用 Mockito 注入 mapper 依赖；密码加密器为 {@link AdminService}
 * 内部真实持有的 BCrypt，故可直接校验哈希结果。
 */
@ExtendWith(MockitoExtension.class)
class AdminServiceResetPasswordTest {

    @Mock
    private UserMapper userMapper;
    @Mock
    private UserPurgeMapper userPurgeMapper;
    @Mock
    private TaskMapper taskMapper;
    @Mock
    private TaskClaimMapper taskClaimMapper;
    @Mock
    private InviteRecordMapper inviteRecordMapper;
    @Mock
    private UserService userService;
    @Mock
    private TaskService taskService;
    @Mock
    private RatingService ratingService;
    @Mock
    private PointService pointService;

    @InjectMocks
    private AdminService adminService;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    private User student(Long id) {
        User u = new User();
        u.setId(id);
        u.setRole("student");
        u.setPasswordHash(encoder.encode("oldPass123"));
        return u;
    }

    @Test
    void resetsPasswordAsBcryptHashAndInvalidatesOldOne() {
        User target = student(9L);
        when(userMapper.selectById(9L)).thenReturn(target);

        adminService.resetPassword(9L, "newPass456");

        assertNotEquals("newPass456", target.getPasswordHash(), "不得明文存储密码");
        assertTrue(encoder.matches("newPass456", target.getPasswordHash()), "新密码应通过 BCrypt 校验");
        assertFalse(encoder.matches("oldPass123", target.getPasswordHash()), "旧密码应立即失效");
        verify(userMapper).updateById(target);
    }

    @Test
    void rejectsUnknownUser() {
        when(userMapper.selectById(404L)).thenReturn(null);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> adminService.resetPassword(404L, "newPass456"));

        assertEquals(404, ex.getCode());
        verify(userMapper, never()).updateById(any(User.class));
    }

    @Test
    void rejectsAdminAccount() {
        User admin = new User();
        admin.setId(1L);
        admin.setRole("admin");
        when(userMapper.selectById(1L)).thenReturn(admin);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> adminService.resetPassword(1L, "newPass456"));

        assertEquals(400, ex.getCode());
        verify(userMapper, never()).updateById(any(User.class));
    }
}
