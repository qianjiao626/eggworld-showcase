package com.eggworld.service;

import com.eggworld.common.JwtUtil;
import com.eggworld.dto.RegisterDTO;
import com.eggworld.entity.User;
import com.eggworld.entity.UserCharacter;
import com.eggworld.mapper.UserCharacterMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserStatsMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceRegistrationTest {
    private static final Set<String> CATEGORIES = Set.of("study", "job", "side", "hobby", "game", "life");

    @Mock UserMapper userMapper;
    @Mock UserStatsMapper userStatsMapper;
    @Mock UserCharacterMapper userCharacterMapper;
    @Mock VerifyCodeService verifyCodeService;
    @Mock PointService pointService;
    @Mock JwtUtil jwtUtil;
    @Mock UserService userService;
    @Mock InviteService inviteService;
    @InjectMocks AuthService authService;

    /** 注册不由用户选蛋：后端随机抽一个分类，且用户资料与角色解锁表必须是同一个 */
    @Test
    void registrationRandomlyDrawsInitialEggAndSynchronizesItToUserProfile() {
        RegisterDTO dto = new RegisterDTO();
        dto.setEmail("student@example.com"); dto.setCode("123456"); dto.setPassword("pass123456");
        dto.setNickname("测试用户");
        when(userMapper.selectByEmail(dto.getEmail())).thenReturn(null);
        when(inviteService.generateInviteCode()).thenReturn("INVITE01");
        doNothing().when(verifyCodeService).verify(dto.getEmail(), dto.getCode());

        authService.register(dto);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        org.mockito.Mockito.verify(userMapper).insert(userCaptor.capture());
        String drawn = userCaptor.getValue().getEggCategory();
        assertTrue(CATEGORIES.contains(drawn), "抽到的初始蛋分类应属于 6 大分类，实际：" + drawn);

        ArgumentCaptor<UserCharacter> charCaptor = ArgumentCaptor.forClass(UserCharacter.class);
        org.mockito.Mockito.verify(userCharacterMapper, times(CATEGORIES.size())).insert(charCaptor.capture());
        List<UserCharacter> chars = charCaptor.getAllValues();
        List<String> unlocked = chars.stream()
                .filter(c -> c.getUnlocked() != null && c.getUnlocked() == 1)
                .map(UserCharacter::getCategory)
                .toList();
        List<String> current = chars.stream()
                .filter(c -> c.getIsCurrent() != null && c.getIsCurrent() == 1)
                .map(UserCharacter::getCategory)
                .toList();
        assertEquals(List.of(drawn), unlocked, "只应解锁随机抽到的那个蛋");
        assertEquals(List.of(drawn), current, "抽到的蛋应被设为当前角色");
    }
}
