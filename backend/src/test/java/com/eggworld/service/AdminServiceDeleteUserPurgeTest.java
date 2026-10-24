package com.eggworld.service;

import com.eggworld.entity.User;
import com.eggworld.mapper.AdminUserMapper;
import com.eggworld.mapper.InviteRecordMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserPurgeMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.BadSqlGrammarException;

import java.sql.SQLSyntaxErrorException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 回归（2026-10-06 本地实测缺陷）：注销账号的清理清单没覆盖本批新模块，
 * 实测「注销发布过爆料的用户后，公开爆料点赞数仍计着这个幽灵点赞」。
 * 这里钉住注销必须清理的新模块表；刻意保留的表见 UserPurgeMapper 注释。
 *
 * 回归（2026-10-07）：职业测评 / 宠物系统 / 猫舍本轮不在线上建表 → 缺表不得让注销整体失败。
 */
class AdminServiceDeleteUserPurgeTest {

    private final UserPurgeMapper purge = mock(UserPurgeMapper.class);
    private final UserMapper userMapper = mock(UserMapper.class);
    private final AdminService admin = new AdminService(
            mock(AdminUserMapper.class), userMapper, purge, mock(TaskMapper.class), mock(TaskClaimMapper.class),
            mock(InviteRecordMapper.class), mock(UserService.class), mock(TaskService.class),
            mock(RatingService.class), mock(PointService.class));

    private User targetUser() {
        User target = new User();
        target.setId(14L);
        target.setRole("student");
        when(userMapper.selectById(14L)).thenReturn(target);
        return target;
    }

    private BadSqlGrammarException missingTable(String sql) {
        return new BadSqlGrammarException("UserPurgeMapper.purge", sql,
                new SQLSyntaxErrorException("Table 'eggworld.pets' doesn't exist", "42S02", 1146));
    }

    @Test
    void deletingUserPurgesNewModuleDataAndKeepsAuditRows() {
        targetUser();

        admin.deleteUser(14L, 1L);

        verify(purge).deleteGossipReportLikes(14L);
        verify(purge).deletePets(14L);
        verify(purge).deletePetInventory(14L);
        verify(purge).deleteCareerTestReports(14L);
        verify(purge).deleteCatReputation(14L);
        verify(purge).deleteCatVotes(14L);
        verify(purge).deleteCatAdoptions(14L);
        verify(purge).deleteCatReviewers(14L);
        verify(purge).hardDeleteUser(14L);
    }

    @Test
    void missingModuleTablesDoNotBreakAccountDeletion() {
        targetUser();
        // 线上未建表：DELETE FROM pets → MySQL 1146
        doThrow(missingTable("DELETE FROM pets WHERE user_id = ?")).when(purge).deletePets(14L);
        doThrow(missingTable("DELETE FROM cat_rooms WHERE user_id = ?")).when(purge).deleteCatVotes(14L);

        assertDoesNotThrow(() -> admin.deleteUser(14L, 1L));

        verify(purge).deleteCareerTestReports(14L);   // 其余清理照常执行
        verify(purge).hardDeleteUser(14L);            // 用户本体仍被删除
    }

    @Test
    void otherPurgeFailuresStillSurface() {
        targetUser();
        doThrow(new BadSqlGrammarException("UserPurgeMapper.purge", "DELETE FROM pets WHERE user_id = ?",
                new SQLSyntaxErrorException("Unknown column 'legacy_col' in 'where clause'", "42S22", 1054)))
                .when(purge).deletePets(14L);

        assertThrows(BadSqlGrammarException.class, () -> admin.deleteUser(14L, 1L));
    }
}
