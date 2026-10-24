package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.LevelPolicy;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.config.AppProperties;
import com.eggworld.dto.EditTaskDTO;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskRevision;
import com.eggworld.entity.User;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.TaskRevisionMapper;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 认领人数按用户等级收敛（2026-10-07 需求）：新手蛋最多 2 人，每升一级 +1（→ 传奇蛋 6 人）。
 *
 * 这里钉住两件事：
 *   ① 等级阈值与前端 LEVELS 一致（0/100/300/600/1000）；
 *   ② 发布与「提交修改稿」两条写入口都按**发布者当前经验值**收敛 —— 前端绕过也拦得住。
 */
class ClaimerLevelLimitTest {

    private TaskMapper tasks;
    private TaskRevisionMapper revisions;
    private UserMapper users;
    private TaskService service;

    @BeforeEach
    void setup() {
        tasks = mock(TaskMapper.class);
        revisions = mock(TaskRevisionMapper.class);
        users = mock(UserMapper.class);
        service = new TaskService(
                tasks,
                mock(TaskClaimMapper.class),
                revisions,
                users,
                mock(PointService.class),
                mock(InviteService.class),
                mock(NotificationService.class),
                mock(ChatGroupService.class),
                new AppProperties());
    }

    /** 角色从 UserContext 取，用例之间必须清掉，否则会把管理身份漏给下一个用例 */
    @AfterEach
    void clearSession() {
        UserContext.clear();
    }

    private void publisherWithExp(Integer exp) {
        User publisher = new User();
        publisher.setId(1L);
        publisher.setNickname("测试蛋");
        publisher.setExp(exp);
        when(users.selectById(1L)).thenReturn(publisher);
    }

    private PublishTaskDTO publishDto(Integer maxClaimers) {
        PublishTaskDTO dto = new PublishTaskDTO();
        dto.setTitle("教你做高数笔记");
        dto.setTaskType("teach");
        dto.setSkillCategory("study");
        dto.setReward(10);
        dto.setClaimMode("multiple");
        dto.setMaxClaimers(maxClaimers);
        return dto;
    }

    private void existingTask(String status, Integer maxClaimers) {
        Task task = new Task();
        task.setId(7L);
        task.setPublisherId(1L);
        task.setTaskType("teach");
        task.setStatus(status);
        task.setClaimMode("multiple");
        task.setMaxClaimers(maxClaimers);
        when(tasks.selectById(7L)).thenReturn(task);
    }

    private EditTaskDTO revisionDto(Integer maxClaimers) {
        EditTaskDTO dto = new EditTaskDTO();
        dto.setTitle("新标题");
        dto.setSkillCategory("study");
        dto.setReward(10);
        dto.setClaimMode("multiple");
        dto.setMaxClaimers(maxClaimers);
        return dto;
    }

    /* ---------- 等级阈值口径 ---------- */

    @Test
    void levelThresholdsMatchFrontendTable() {
        assertEquals(1, LevelPolicy.levelOf(0));
        assertEquals(1, LevelPolicy.levelOf(99));
        assertEquals(2, LevelPolicy.levelOf(100));
        assertEquals(2, LevelPolicy.levelOf(299));
        assertEquals(3, LevelPolicy.levelOf(300));
        assertEquals(4, LevelPolicy.levelOf(600));
        assertEquals(5, LevelPolicy.levelOf(1000));
        assertEquals(5, LevelPolicy.levelOf(999999), "超过最高档仍按传奇蛋算");
        assertEquals(1, LevelPolicy.levelOf(null), "经验为空按新用户算，不能放开限制");
        assertEquals("新手蛋", LevelPolicy.levelNameOf(0));
        assertEquals("传奇蛋", LevelPolicy.levelNameOf(1000));
    }

    @Test
    void allowedClaimersStartAtTwoAndGrowOnePerLevel() {
        assertEquals(2, LevelPolicy.maxClaimersAllowed(0));
        assertEquals(2, LevelPolicy.maxClaimersAllowed(99));
        assertEquals(3, LevelPolicy.maxClaimersAllowed(100));
        assertEquals(4, LevelPolicy.maxClaimersAllowed(300));
        assertEquals(5, LevelPolicy.maxClaimersAllowed(600));
        assertEquals(6, LevelPolicy.maxClaimersAllowed(1000));
    }

    @Test
    void nextLevelExpIsOnlyVisibleBeforeTopLevel() {
        assertEquals(100, LevelPolicy.nextLevelMinExp(0));
        assertEquals(300, LevelPolicy.nextLevelMinExp(150));
        assertNull(LevelPolicy.nextLevelMinExp(1000), "满级没有下一级");
    }

    /* ---------- 发布：按等级收敛 ---------- */

    @Test
    void newUserCanPickAtMostTwoClaimers() {
        publisherWithExp(0);
        assertThrows(BusinessException.class, () -> service.publish(1L, publishDto(3)),
                "新手蛋最多 2 人，第 3 个人要被拒");
        verify(tasks, never()).insert(any(Task.class));

        service.publish(1L, publishDto(2));
        ArgumentCaptor<Task> saved = ArgumentCaptor.forClass(Task.class);
        verify(tasks).insert(saved.capture());
        assertEquals(2, saved.getValue().getMaxClaimers(), "正好 2 人应当放行");
    }

    @Test
    void rejectionMessageTellsTheUserWhy() {
        publisherWithExp(0);
        BusinessException error = assertThrows(BusinessException.class, () -> service.publish(1L, publishDto(5)));
        assertTrue(error.getMessage().contains("新手蛋"), "提示要说清当前等级，实际：" + error.getMessage());
        assertTrue(error.getMessage().contains("2"), "提示要给出允许的人数，实际：" + error.getMessage());
        assertTrue(error.getMessage().contains("升一级"), "提示要给出升级出路，实际：" + error.getMessage());
    }

    @Test
    void eachLevelUpAddsOneClaimer() {
        publisherWithExp(100);
        service.publish(1L, publishDto(3));
        publisherWithExp(300);
        service.publish(1L, publishDto(4));
        publisherWithExp(1000);
        service.publish(1L, publishDto(6));
        verify(tasks, times(3)).insert(any(Task.class));

        publisherWithExp(100);
        assertThrows(BusinessException.class, () -> service.publish(1L, publishDto(4)), "进阶蛋只能带 3 人");
    }

    @Test
    void unspecifiedClaimerCountIsStillAllowed() {
        /* 「不填 = 不限」是既有口径（配对时再定人）：等级限制只约束**填了的具体数字** */
        publisherWithExp(0);
        service.publish(1L, publishDto(null));
        verify(tasks).insert(any(Task.class));
    }

    @Test
    void nullExpIsTreatedAsNewUser() {
        publisherWithExp(null);
        assertThrows(BusinessException.class, () -> service.publish(1L, publishDto(3)),
                "经验为空的账号不能因为「算不出等级」就放开限制");
    }

    @Test
    void singleClaimModeIsNotBlockedByTheLimit() {
        /* 单人认领恒为 1 人，天然不超限；这里确认等级校验不会误伤 single */
        publisherWithExp(0);
        PublishTaskDTO dto = publishDto(null);
        dto.setClaimMode("single");
        service.publish(1L, dto);
        verify(tasks).insert(any(Task.class));
    }

    /* ---------- 改稿：同样按现在的等级收敛 ---------- */

    @Test
    void revisionCannotRaiseClaimersBeyondCurrentLevel() {
        publisherWithExp(0);
        existingTask("approved", 2);

        assertThrows(BusinessException.class, () -> service.submitRevision(1L, 7L, revisionDto(5)));
        verify(revisions, never()).insert(any(TaskRevision.class));
    }

    @Test
    void revisionWithinLevelStillGoesThrough() {
        publisherWithExp(300);   /* 达人蛋 4 人 */
        existingTask("pending", 2);

        service.submitRevision(1L, 7L, revisionDto(4));

        verify(revisions, never()).insert(any(TaskRevision.class));   /* pending 直接改本体，不产生修改稿 */
        ArgumentCaptor<Task> saved = ArgumentCaptor.forClass(Task.class);
        verify(tasks).updateById(saved.capture());
        assertEquals(4, saved.getValue().getMaxClaimers());
    }

    /* ---------- 官方任务按角色放宽（2026-10-07 需求修订）---------- */

    @Test
    void adminPublishingAnyTypeHasNoLevelLimit() {
        /* 主管理员：教学/求助/组队/奖励都不设限（实际仍受 DTO 的 50 人硬上限约束） */
        publisherWithExp(0);
        UserContext.set(new LoginUser(1L, "admin", "蛋总"));
        for (String type : new String[]{"teach", "help", "team", "reward"}) {
            PublishTaskDTO dto = publishDto(20);
            dto.setTaskType(type);
            service.publish(1L, dto);
        }
        verify(tasks, times(4)).insert(any(Task.class));
    }

    @Test
    void subAdminOnlyGetsUnlimitedOnRewardTasks() {
        publisherWithExp(0);
        UserContext.set(new LoginUser(1L, "subadmin", "副管理"));

        /* 奖励型官方任务：不设限 */
        PublishTaskDTO reward = publishDto(20);
        reward.setTaskType("reward");
        service.publish(1L, reward);
        verify(tasks, times(1)).insert(any(Task.class));

        /* 自己发教学任务：仍按自己的等级（新手蛋 2 人）—— 副管理员同时也是学生，不拿管理身份绕开学生侧规则 */
        assertThrows(BusinessException.class, () -> service.publish(1L, publishDto(3)));
        /* 求助/组队同样受限 */
        PublishTaskDTO help = publishDto(3);
        help.setTaskType("help");
        assertThrows(BusinessException.class, () -> service.publish(1L, help));
        PublishTaskDTO team = publishDto(3);
        team.setTaskType("team");
        assertThrows(BusinessException.class, () -> service.publish(1L, team));
        verify(tasks, times(1)).insert(any(Task.class));
    }

    @Test
    void plainStudentNeverGetsTheModeratorRelaxation() {
        publisherWithExp(0);
        UserContext.set(new LoginUser(1L, "student", "同学"));
        /* 普通学生连奖励型都发不了（另有 403 把关），这里只确认放宽不会漏给学生 */
        PublishTaskDTO dto = publishDto(20);
        dto.setTaskType("reward");
        BusinessException error = assertThrows(BusinessException.class, () -> service.publish(1L, dto));
        assertEquals(403, error.getCode());
        assertThrows(BusinessException.class, () -> service.publish(1L, publishDto(3)));
    }

    @Test
    void policyReportsTheSameRelaxation() {
        assertEquals(50, LevelPolicy.maxClaimersAllowedFor(0, "teach", true, true), "主管理员全类型不设限");
        assertEquals(50, LevelPolicy.maxClaimersAllowedFor(0, "reward", false, true), "副管理员奖励型不设限");
        assertEquals(2, LevelPolicy.maxClaimersAllowedFor(0, "teach", false, true), "副管理员非奖励型按等级");
        assertEquals(2, LevelPolicy.maxClaimersAllowedFor(0, "reward", false, false), "学生不享受放宽");
    }
}
