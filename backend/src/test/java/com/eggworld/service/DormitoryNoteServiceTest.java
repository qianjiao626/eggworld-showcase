package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DormitoryNoteServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final DormitoryReviewPermission permission = mock(DormitoryReviewPermission.class);
    private final PointService pointService = mock(PointService.class);
    private final DormitoryNoteService service = new DormitoryNoteService(jdbc, permission, pointService);

    @Test
    void requiresLoginAndNonEmptyBoundedContent() {
        assertEquals(401, assertThrows(BusinessException.class, () ->
                service.submit("北京大学", null, null, "文字", null, null)).getCode());
        assertThrows(BusinessException.class, () ->
                service.submit("北京大学", "", "", "  ", null, 7L));
        assertThrows(BusinessException.class, () ->
                service.submit("北京大学", null, null, "x".repeat(201), null, 7L));
        verifyNoInteractions(jdbc);
    }

    @Test
    void approvedQueryNeverLeaksPendingNotes() {
        service.listApproved("北京大学");
        verify(jdbc).query(argThat(sql -> sql.contains("status = 'approved'") && sql.contains("LIMIT 50")),
                any(RowMapper.class), eq("北京大学"));
    }

    @Test
    void reviewRequiresDedicatedReviewerAndOnlyChangesPendingOnce() {
        when(jdbc.update(anyString(), any(), any(), any(), anyLong(), anyLong())).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.review(7L, 19L, false, ""));
        verify(permission).requireReviewer(7L);
        verify(jdbc).update(argThat(sql -> sql.contains("status = 'pending'")),
                eq("rejected"), eq(7L), isNull(), eq(19L));
        verifyNoInteractions(pointService);
    }

    @Test
    void approvingANoteRewardsUploaderFiveCoinsOnce() {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong()))
                .thenReturn(java.util.Collections.singletonList(33L));
        when(jdbc.update(anyString(), any(), any(), any(), anyLong())).thenReturn(1);
        service.review(7L, 19L, true, "");
        verify(pointService).changeBalance(33L, DormitoryNoteService.NOTE_APPROVAL_REWARD,
                "reward", "宿舍文字介绍通过审核", null);
    }

    @Test
    void rejectingANoteDoesNotReward() {
        when(jdbc.update(anyString(), any(), any(), any(), anyLong())).thenReturn(1);
        service.review(7L, 19L, false, "内容太简略");
        verifyNoInteractions(pointService);
    }
    @Test
    void acceptsOptionalLocationButRejectsUnsafeSourceBeforePersisting() {
        assertThrows(BusinessException.class, () -> service.submit("北京大学", null, null, "文字", "javascript:alert(1)", 7L));
        verifyNoInteractions(jdbc);
        service.submit("北京大学", null, "5号楼", "x".repeat(200), "https://example.org/source", 7L);
        verify(jdbc).update(argThat(sql -> sql.contains("status") && sql.contains("source_url")),
                eq("北京大学"), isNull(), eq("5号楼"), eq("x".repeat(200)), eq("https://example.org/source"), eq(7L));
    }

    @Test
    void pendingRequiresReviewerAndOwnEntriesArePrivate() {
        service.pending(7L);
        verify(permission).requireReviewer(7L);
        assertEquals(401, assertThrows(BusinessException.class, () -> service.listMine(null)).getCode());
    }
}
