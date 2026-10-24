package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.entity.User;
import com.eggworld.mapper.AdminUserMapper;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证管理员删除用户时的清理清单：每一类关联数据都必须显式删除。
 *
 * <p>回归背景：合并分支时 {@link UserPurgeMapper} 曾丢掉成就/签到/装扮三个方法，
 * 而 {@code AdminService} 仍在调用，导致编译失败；同时 {@code visitor_sessions}
 * 只加了 mapper 方法却没有接进删号流程，注销后仍留有行为记录。
 * 本测试用严格校验把「删号要清理哪些表」钉住，避免再次漂移。
 */
@ExtendWith(MockitoExtension.class)
class AdminServicePurgeUserTest {

    @Mock
    private AdminUserMapper adminUserMapper;
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

    private User student(Long id) {
        User u = new User();
        u.setId(id);
        u.setRole("student");
        return u;
    }

    @Test
    void purgeCallsEveryRelatedTableCleaner() {
        when(userMapper.selectById(9L)).thenReturn(student(9L));

        adminService.deleteUser(9L, 1L);

        // 冗余计数先修正
        verify(userPurgeMapper).decrementLikeeLikes(9L);
        verify(userPurgeMapper).decrementAnswerLikes(9L);

        // 私有资料与关联数据
        verify(userPurgeMapper).deleteStats(9L);
        verify(userPurgeMapper).deleteCharacters(9L);
        verify(userPurgeMapper).deleteSkills(9L);
        verify(userPurgeMapper).deleteNotifications(9L);
        verify(userPurgeMapper).deletePointLogs(9L);
        verify(userPurgeMapper).deleteInviteRecords(9L);
        verify(userPurgeMapper).deleteFeedbackTickets(9L);
        verify(userPurgeMapper).deleteSchoolComplaints(9L);

        // 行为埋点与访客会话：无外键，必须显式清理
        verify(userPurgeMapper).deletePageViews(9L);
        verify(userPurgeMapper).deleteVisitorSessions(9L);

        // 签到
        verify(userPurgeMapper).deleteDailyCheckins(9L);

        // 互动数据
        verify(userPurgeMapper).deleteClaims(9L);
        verify(userPurgeMapper).deleteUserLikes(9L);
        verify(userPurgeMapper).deleteGossipLikes(9L);
        verify(userPurgeMapper).deleteRatings(9L);

        // 最后物理删除用户本体
        verify(userPurgeMapper).hardDeleteUser(9L);
    }

    @Test
    void rejectsAdminAccountWithoutPurge() {
        User admin = student(2L);
        admin.setRole("admin");
        when(userMapper.selectById(2L)).thenReturn(admin);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> adminService.deleteUser(2L, 1L));

        assertEquals(400, ex.getCode());
        verify(userPurgeMapper, never()).hardDeleteUser(2L);
    }

    @Test
    void rejectsDeletingSelfWithoutPurge() {
        when(userMapper.selectById(1L)).thenReturn(student(1L));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> adminService.deleteUser(1L, 1L));

        assertEquals(400, ex.getCode());
        verify(userPurgeMapper, never()).hardDeleteUser(1L);
    }
}
