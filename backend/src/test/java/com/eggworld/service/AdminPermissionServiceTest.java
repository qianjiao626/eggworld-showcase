package com.eggworld.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.common.PermCode;
import com.eggworld.dto.AdminPermissionUserVO;
import com.eggworld.dto.PermissionBatchResultVO;
import com.eggworld.dto.PermissionGrantDTO;
import com.eggworld.entity.PermissionAudit;
import com.eggworld.entity.User;
import com.eggworld.entity.UserPermission;
import com.eggworld.mapper.AdminPermissionMapper;
import com.eggworld.mapper.PermissionAuditMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserPermissionMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 权限授予 / 收回：幂等、部分失败、审计落库
 */
class AdminPermissionServiceTest {

    private final UserMapper userMapper = mock(UserMapper.class);
    private final UserPermissionMapper permMapper = mock(UserPermissionMapper.class);
    private final PermissionAuditMapper auditMapper = mock(PermissionAuditMapper.class);
    private final AdminPermissionMapper listMapper = mock(AdminPermissionMapper.class);
    private final AdminPermissionService service =
            new AdminPermissionService(userMapper, permMapper, auditMapper, listMapper);

    private User student(long id) {
        User u = new User();
        u.setId(id);
        u.setRole("student");
        u.setDeleted(0);
        return u;
    }

    private PermissionGrantDTO dto(Long... ids) {
        PermissionGrantDTO d = new PermissionGrantDTO();
        d.setUserIds(List.of(ids));
        d.setPermCode(PermCode.CONTENT_REVIEW.code());
        return d;
    }

    @Test
    void grantInsertsRowAndWritesAudit() {
        when(userMapper.selectById(7L)).thenReturn(student(7L));
        when(permMapper.selectCount(any())).thenReturn(0L);

        PermissionBatchResultVO r = service.grant(1L, dto(7L));

        assertEquals(1, r.getSuccess());
        assertEquals(0, r.getSkipped());
        assertTrue(r.getFailed().isEmpty());
        verify(permMapper).insert(any(UserPermission.class));
        ArgumentCaptor<PermissionAudit> cap = ArgumentCaptor.forClass(PermissionAudit.class);
        verify(auditMapper).insert(cap.capture());
        assertEquals("grant", cap.getValue().getAction());
        assertEquals(7L, cap.getValue().getTargetUserId());
        assertEquals(1L, cap.getValue().getOperatorId());
    }

    @Test
    void grantAgainIsSkipped() {
        when(userMapper.selectById(7L)).thenReturn(student(7L));
        when(permMapper.selectCount(any())).thenReturn(1L);

        PermissionBatchResultVO r = service.grant(1L, dto(7L));

        assertEquals(0, r.getSuccess());
        assertEquals(1, r.getSkipped());
        verify(permMapper, never()).insert(any(UserPermission.class));
        verifyNoInteractions(auditMapper);
    }

    @Test
    void grantUnknownUserFails() {
        when(userMapper.selectById(7L)).thenReturn(null);

        PermissionBatchResultVO r = service.grant(1L, dto(7L));

        assertEquals(0, r.getSuccess());
        assertEquals(1, r.getFailed().size());
        assertEquals(7L, r.getFailed().get(0).getUserId());
        verifyNoInteractions(auditMapper);
    }

    @Test
    void grantAdminTargetFails() {
        User admin = student(1L);
        admin.setRole("admin");
        when(userMapper.selectById(1L)).thenReturn(admin);

        PermissionBatchResultVO r = service.grant(1L, dto(1L));

        assertEquals(1, r.getFailed().size());
        verify(permMapper, never()).insert(any(UserPermission.class));
        verifyNoInteractions(auditMapper);
    }

    @Test
    void revokeDeletesRowAndWritesAudit() {
        when(userMapper.selectById(7L)).thenReturn(student(7L));
        when(permMapper.selectCount(any())).thenReturn(1L);

        PermissionBatchResultVO r = service.revoke(1L, dto(7L));

        assertEquals(1, r.getSuccess());
        verify(permMapper).delete(any());
        ArgumentCaptor<PermissionAudit> cap = ArgumentCaptor.forClass(PermissionAudit.class);
        verify(auditMapper).insert(cap.capture());
        assertEquals("revoke", cap.getValue().getAction());
    }

    @Test
    void revokeNotGrantedIsSkipped() {
        when(userMapper.selectById(7L)).thenReturn(student(7L));
        when(permMapper.selectCount(any())).thenReturn(0L);

        PermissionBatchResultVO r = service.revoke(1L, dto(7L));

        assertEquals(1, r.getSkipped());
        verify(permMapper, never()).delete(any());
        verifyNoInteractions(auditMapper);
    }

    @Test
    void unknownPermCodeIsRejected() {
        PermissionGrantDTO d = dto(7L);
        d.setPermCode("nope");
        assertThrows(BusinessException.class, () -> service.grant(1L, d));
    }

    @Test
    void listCodesReturnsEnumCodes() {
        assertEquals(2, service.listCodes().size());
    }

    @Test
    void listUsersFillsGrantedPermCodesInDeclarationOrder() {
        AdminPermissionUserVO u = new AdminPermissionUserVO();
        u.setId(7L);
        Page<AdminPermissionUserVO> page = new Page<>(1, 20);
        page.setRecords(List.of(u));
        page.setTotal(1);
        when(listMapper.selectUserPage(any(), any())).thenReturn(page);
        when(permMapper.selectList(any())).thenReturn(List.of(
                perm(7L, PermCode.DATA_DASHBOARD.code()),
                perm(7L, PermCode.CONTENT_REVIEW.code())));

        IPage<AdminPermissionUserVO> result = service.listUsers("   ", 1, 20);

        // 声明顺序（内容审核在前）而不是入库顺序
        assertEquals(List.of(PermCode.CONTENT_REVIEW.code(), PermCode.DATA_DASHBOARD.code()),
                result.getRecords().get(0).getPermCodes());
    }

    @Test
    void listUsersWithNoPermissionRowsGivesEmptyList() {
        AdminPermissionUserVO u = new AdminPermissionUserVO();
        u.setId(8L);
        Page<AdminPermissionUserVO> page = new Page<>(1, 20);
        page.setRecords(List.of(u));
        page.setTotal(1);
        when(listMapper.selectUserPage(any(), any())).thenReturn(page);
        when(permMapper.selectList(any())).thenReturn(List.of());

        IPage<AdminPermissionUserVO> result = service.listUsers("kim", 1, 20);

        assertEquals(List.of(), result.getRecords().get(0).getPermCodes());
    }

    private UserPermission perm(Long userId, String code) {
        UserPermission p = new UserPermission();
        p.setUserId(userId);
        p.setPermCode(code);
        return p;
    }
}
