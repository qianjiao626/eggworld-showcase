package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.dto.ChatConversationContextVO;
import com.eggworld.entity.ChatConversation;
import com.eggworld.entity.ChatConversationMember;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.mapper.ChatConversationMapper;
import com.eggworld.mapper.ChatConversationMemberMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 任务群会话上下文（关联任务 + 成员任务角色）单元测试。 */
class ChatContextServiceTest {

    private ChatConversationMapper conversationMapper;
    private ChatConversationMemberMapper memberMapper;
    private TaskMapper taskMapper;
    private TaskClaimMapper taskClaimMapper;
    private UserMapper userMapper;
    private ChatPermissionService permissionService;
    private ChatContextService service;

    @BeforeEach
    void setUp() {
        conversationMapper = mock(ChatConversationMapper.class);
        memberMapper = mock(ChatConversationMemberMapper.class);
        taskMapper = mock(TaskMapper.class);
        taskClaimMapper = mock(TaskClaimMapper.class);
        userMapper = mock(UserMapper.class);
        permissionService = mock(ChatPermissionService.class);
        service = new ChatContextService(conversationMapper, memberMapper, taskMapper, taskClaimMapper,
                userMapper, permissionService);
    }

    @Test
    void rejectsUserWhoIsNotInTheConversation() {
        when(permissionService.requireMember(9L, 5L))
                .thenThrow(new BusinessException(403, "你不在该会话中"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.context(5L, 9L));

        assertEquals(403, ex.getCode());
    }

    @Test
    void returnsNullTaskForConversationWithoutBoundTask() {
        givenMemberPasses();
        when(conversationMapper.selectById(9L)).thenReturn(conversation(9L, 0));
        when(taskMapper.selectOne(any())).thenReturn(null);
        givenMembers(member(9L, 1L), member(9L, 2L));
        givenUsers(user(1L, "赵明"), user(2L, "李同学"));

        ChatConversationContextVO vo = service.context(1L, 9L);

        assertNull(vo.getTask(), "没有绑定任务时 task 必须为 null");
        assertEquals(0, vo.getReadOnly());
        assertEquals(2, vo.getMembers().size());
        assertNull(vo.getMembers().get(0).getTaskRole(), "无任务时不标注任务角色");
        assertNull(vo.getMembers().get(1).getClaimStatus());
    }

    @Test
    void marksPublisherAndClaimerWithTheirClaimStatus() {
        givenMemberPasses();
        when(conversationMapper.selectById(9L)).thenReturn(conversation(9L, 0));
        when(taskMapper.selectOne(any())).thenReturn(task(9L, 100L, "in_progress"));
        when(taskClaimMapper.selectList(any())).thenReturn(List.of(claim(20L, "submitted")));
        givenMembers(member(9L, 100L), member(9L, 20L));
        givenUsers(user(100L, "赵明"), user(20L, "李同学"));

        ChatConversationContextVO vo = service.context(100L, 9L);

        assertEquals(100L, vo.getTask().getId());
        assertEquals("in_progress", vo.getTask().getStatus());
        assertEquals("publisher", vo.getTask().getMyTaskRole());
        assertNull(vo.getTask().getMyClaimStatus(), "发布者没有认领状态");

        ChatConversationContextVO.MemberVO publisher = vo.getMembers().get(0);
        assertEquals("publisher", publisher.getTaskRole());
        assertEquals("赵明", publisher.getNickname());
        assertTrue(publisher.isMe());
        assertNull(publisher.getClaimStatus());

        ChatConversationContextVO.MemberVO claimer = vo.getMembers().get(1);
        assertEquals("claimer", claimer.getTaskRole());
        assertEquals("submitted", claimer.getClaimStatus());
        assertFalse(claimer.isMe());
    }

    @Test
    void exposesClaimerViewForMyRoleAndArchiveFlag() {
        givenMemberPasses();
        when(conversationMapper.selectById(9L)).thenReturn(conversation(9L, 1));
        when(taskMapper.selectOne(any())).thenReturn(task(9L, 100L, "completed"));
        when(taskClaimMapper.selectList(any())).thenReturn(List.of(claim(20L, "completed")));
        givenMembers(member(9L, 100L), member(9L, 20L));
        givenUsers(user(100L, "赵明"), user(20L, "李同学"));

        ChatConversationContextVO vo = service.context(20L, 9L);

        assertEquals(1, vo.getReadOnly(), "归档群必须把 readOnly 回传给前端");
        assertEquals("claimer", vo.getTask().getMyTaskRole());
        assertEquals("completed", vo.getTask().getMyClaimStatus());
        assertTrue(vo.getMembers().get(1).isMe());
    }

    @Test
    void outsiderInPublicTaskGroupIsNotLabeledAsClaimer() {
        // 任务群是公开群，路人可能自己搜到并加进来 —— 没有认领记录就不能标成「认领者」，
        // 否则前端会把 TA 当成可确认的对象
        givenMemberPasses();
        when(conversationMapper.selectById(9L)).thenReturn(conversation(9L, 0));
        when(taskMapper.selectOne(any())).thenReturn(task(9L, 100L, "in_progress"));
        when(taskClaimMapper.selectList(any())).thenReturn(List.of(claim(20L, "in_progress")));
        givenMembers(member(9L, 100L), member(9L, 20L), member(9L, 77L));
        givenUsers(user(100L, "赵明"), user(20L, "李同学"), user(77L, "路人"));

        ChatConversationContextVO vo = service.context(100L, 9L);

        ChatConversationContextVO.MemberVO outsider = vo.getMembers().get(2);
        assertEquals(77L, outsider.getUserId());
        assertNull(outsider.getTaskRole(), "无认领记录的群成员不应被标成认领者");
        assertNull(outsider.getClaimStatus());
        verify(permissionService).requireMember(9L, 100L);
    }

    private void givenMemberPasses() {
        when(permissionService.requireMember(anyLong(), anyLong())).thenReturn(new ChatConversationMember());
    }

    private void givenMembers(ChatConversationMember... rows) {
        when(memberMapper.selectList(any())).thenReturn(List.of(rows));
    }

    private void givenUsers(User... users) {
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(users));
    }

    private static ChatConversation conversation(Long id, int readOnly) {
        ChatConversation c = new ChatConversation();
        c.setId(id);
        c.setType("group");
        c.setTitle("教你做高数期中复习笔记");
        c.setStatus("active");
        c.setReadOnly(readOnly);
        return c;
    }

    private static Task task(Long conversationId, Long publisherId, String status) {
        Task t = new Task();
        t.setId(100L);
        t.setTitle("教你做高数期中复习笔记");
        t.setTaskType("teach");
        t.setStatus(status);
        t.setReward(10);
        t.setPublisherId(publisherId);
        t.setConversationId(conversationId);
        return t;
    }

    private static TaskClaim claim(Long claimerId, String status) {
        TaskClaim c = new TaskClaim();
        c.setTaskId(100L);
        c.setClaimerId(claimerId);
        c.setSelected(1);
        c.setStatus(status);
        return c;
    }

    private static ChatConversationMember member(Long conversationId, Long userId) {
        ChatConversationMember m = new ChatConversationMember();
        m.setConversationId(conversationId);
        m.setUserId(userId);
        m.setRole("member");
        m.setStatus("active");
        return m;
    }

    private static User user(Long id, String nickname) {
        User u = new User();
        u.setId(id);
        u.setNickname(nickname);
        return u;
    }
}
