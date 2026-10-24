package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DormitoryReviewPermissionTest {
    @Test
    void rejectsUsersWithoutDormitoryReviewerAssignment() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(17L))).thenReturn(false);
        BusinessException error = assertThrows(BusinessException.class, () ->
                new DormitoryReviewPermission(jdbc).requireReviewer(17L));
        assertEquals(403, error.getCode());
    }

    @Test
    void allowsOnlyUsersWithDedicatedDormitoryReviewerAssignment() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(17L))).thenReturn(true);
        assertDoesNotThrow(() -> new DormitoryReviewPermission(jdbc).requireReviewer(17L));
    }
}
