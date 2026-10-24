package com.eggworld.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.dto.AdminUserVO;
import com.eggworld.mapper.AdminUserMapper;
import com.eggworld.mapper.InviteRecordMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserPurgeMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证管理员用户列表的查询参数处理：排序白名单、关键词语义与分页透传。
 *
 * <p>不启动 Spring 上下文；{@link AdminUserMapper} 为 mock，故这里只覆盖入参处理与结果透传。
 * SQL 本身的 ORDER BY / 聚合语义需要真实数据库，不在本单测范围内。
 */
@ExtendWith(MockitoExtension.class)
class AdminServiceListUsersTest {

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

    /** 模拟 MyBatis-Plus 分页：把记录与总数写回传入的 Page 并返回 */
    private void stubMapperReturnsOneRow() {
        when(adminUserMapper.selectUserPage(any(), any(), any(), any(), any())).thenAnswer(inv -> {
            Page<AdminUserVO> p = inv.getArgument(0);
            AdminUserVO vo = new AdminUserVO();
            vo.setId(7L);
            vo.setNickname("蛋蛋");
            vo.setInviteCount(3L);
            vo.setInvitePendingCount(1L);
            p.setRecords(List.of(vo));
            p.setTotal(1);
            return p;
        });
    }

    @Test
    void unknownSortFallsBackToCreatedDesc() {
        stubMapperReturnsOneRow();
        adminService.listUsers(null, null, null, 1, 100, null);
        adminService.listUsers(null, null, null, 1, 100, "");
        adminService.listUsers(null, null, null, 1, 100, "points_desc");
        // 注入尝试也必须被白名单挡掉
        adminService.listUsers(null, null, null, 1, 100, "invite_desc; DROP TABLE users");

        ArgumentCaptor<String> sort = ArgumentCaptor.forClass(String.class);
        verify(adminUserMapper, times(4)).selectUserPage(any(), any(), any(), any(), sort.capture());
        assertEquals(List.of("created_desc", "created_desc", "created_desc", "created_desc"), sort.getAllValues());
    }

    @Test
    void inviteSortValuesPassThrough() {
        stubMapperReturnsOneRow();
        adminService.listUsers(null, null, null, 1, 100, "invite_desc");
        adminService.listUsers(null, null, null, 1, 100, "invite_asc");

        ArgumentCaptor<String> sort = ArgumentCaptor.forClass(String.class);
        verify(adminUserMapper, times(2)).selectUserPage(any(), any(), any(), any(), sort.capture());
        assertEquals(List.of("invite_desc", "invite_asc"), sort.getAllValues());
    }

    @Test
    void statusWhitelistKeepsActiveAndBannedOnly() {
        stubMapperReturnsOneRow();
        adminService.listUsers(null, null, "active", 1, 20, "created_desc");
        adminService.listUsers(null, null, "banned", 1, 20, "created_desc");
        adminService.listUsers(null, null, "all", 1, 20, "created_desc");
        adminService.listUsers(null, null, null, 1, 20, "created_desc");
        // 注入尝试也必须被白名单挡掉
        adminService.listUsers(null, null, "banned' OR 1=1 --", 1, 20, "created_desc");

        ArgumentCaptor<String> status = ArgumentCaptor.forClass(String.class);
        verify(adminUserMapper, times(5)).selectUserPage(any(), any(), any(), status.capture(), any());
        assertEquals(Arrays.asList("active", "banned", null, null, null), status.getAllValues());
    }

    @Test
    void blankKeywordBecomesNullAndKeywordIsTrimmed() {
        stubMapperReturnsOneRow();
        adminService.listUsers(null, null, null, 1, 100, "created_desc");
        adminService.listUsers("   ", null, null, 1, 100, "created_desc");
        adminService.listUsers("  蛋蛋  ", null, null, 1, 100, "created_desc");

        ArgumentCaptor<String> keyword = ArgumentCaptor.forClass(String.class);
        verify(adminUserMapper, times(3)).selectUserPage(any(), keyword.capture(), any(), any(), any());
        // 用 Arrays.asList：List.of 不允许 null 元素
        assertEquals(Arrays.asList(null, null, "蛋蛋"), keyword.getAllValues());
        assertNull(keyword.getAllValues().get(0));
        assertNull(keyword.getAllValues().get(1));
    }

    @Test
    @SuppressWarnings("unchecked")
    void pageSizeAndCreatedFromArePassedThrough() {
        stubMapperReturnsOneRow();
        LocalDateTime from = LocalDateTime.of(2026, 9, 1, 0, 0);
        Page<AdminUserVO> result = adminService.listUsers("x", from, null, 3, 20, "invite_desc");

        ArgumentCaptor<Page<AdminUserVO>> page = ArgumentCaptor.forClass(Page.class);
        ArgumentCaptor<LocalDateTime> createdFrom = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(adminUserMapper).selectUserPage(page.capture(), any(), createdFrom.capture(), any(), any());
        assertEquals(3, page.getValue().getCurrent());
        assertEquals(20, page.getValue().getSize());
        assertEquals(from, createdFrom.getValue());

        // 记录与总数原样返回（含新增的邀请数字段）
        assertNotNull(result.getRecords());
        assertEquals(1, result.getTotal());
        assertEquals(1, result.getRecords().size());
        assertEquals(3L, result.getRecords().get(0).getInviteCount());
        assertEquals(1L, result.getRecords().get(0).getInvitePendingCount());
    }

    /**
     * 回归：前端角标曾用「当前页行数」当总数，线上 153 个用户显示成 100（每页 100 条）。
     * 这里保证分页查询的 total 与 records 相互独立地透传出去，前端才拿得到真实总数。
     */
    @Test
    void totalIsPassedThroughIndependentlyOfPageRecords() {
        when(adminUserMapper.selectUserPage(any(), any(), any(), any(), any())).thenAnswer(inv -> {
            Page<AdminUserVO> p = inv.getArgument(0);
            List<AdminUserVO> rows = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                AdminUserVO vo = new AdminUserVO();
                vo.setId((long) i + 1);
                rows.add(vo);
            }
            p.setRecords(rows);
            p.setTotal(153);
            return p;
        });

        Page<AdminUserVO> result = adminService.listUsers(null, null, null, 4, 20, "created_desc");
        assertEquals(20, result.getRecords().size());
        assertEquals(153, result.getTotal());
    }
}
