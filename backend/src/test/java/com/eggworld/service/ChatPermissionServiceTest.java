package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 聊天室权限规则测试：黑名单优先、好友、任务关系和禁言。 */
class ChatPermissionServiceTest {

    private ChatConversationMapper conversationMapper;
    private ChatConversationMemberMapper memberMapper;
    private ChatGroupMemberMapper groupMemberMapper;
    private ChatBlockMapper blockMapper;
    private ChatFriendMapper friendMapper;
    private ChatMuteMapper muteMapper;
    private TaskMapper taskMapper;
    private TaskClaimMapper taskClaimMapper;
    private ChatPermissionService service;

    @BeforeEach
    void setUp() {
        conversationMapper = mock(ChatConversationMapper.class);
        memberMapper = mock(ChatConversationMemberMapper.class);
        groupMemberMapper = mock(ChatGroupMemberMapper.class);
        blockMapper = mock(ChatBlockMapper.class);
        friendMapper = mock(ChatFriendMapper.class);
        muteMapper = mock(ChatMuteMapper.class);
        taskMapper = mock(TaskMapper.class);
        taskClaimMapper = mock(TaskClaimMapper.class);
        service = new ChatPermissionService(conversationMapper, memberMapper, groupMemberMapper, blockMapper,
                friendMapper, muteMapper, taskMapper, taskClaimMapper);
    }

    @Test
    void blockedUsersCannotDirectChatEvenWhenFriends() {
        when(blockMapper.selectCount(any())).thenReturn(1L);
        assertThrows(BusinessException.class, () -> service.requireDirectAllowed(1L, 2L));
    }

    @Test
    void friendsCanDirectChat() {
        when(blockMapper.selectCount(any())).thenReturn(0L);
        when(friendMapper.selectCount(any())).thenReturn(1L);
        assertDoesNotThrow(() -> service.requireDirectAllowed(1L, 2L));
    }

    @Test
    void strangersCannotDirectChat() {
        when(blockMapper.selectCount(any())).thenReturn(0L);
        when(friendMapper.selectCount(any())).thenReturn(0L);
        when(taskClaimMapper.selectCount(any())).thenReturn(0L);
        when(taskClaimMapper.selectList(any())).thenReturn(java.util.List.of());
        when(taskMapper.selectList(any())).thenReturn(java.util.List.of());
        assertThrows(BusinessException.class, () -> service.requireDirectAllowed(1L, 2L));
    }

    @Test
    void globalMuteIsDetected() {
        when(muteMapper.selectCount(any())).thenReturn(1L);
        assertTrue(service.isGloballyMuted(9L));
    }

    @Test
    void readableConversationUsesOneImmediateJoinCheck() {
        when(memberMapper.selectReadableConversation(11L, 7L)).thenReturn(1);

        assertDoesNotThrow(() -> service.requireReadableConversation(11L, 7L));

        verify(memberMapper).selectReadableConversation(11L, 7L);
        verifyNoInteractions(conversationMapper);
    }

    @Test
    void unreadableConversationFailsClosedWhenJoinCheckReturnsNoRow() {
        when(memberMapper.selectReadableConversation(11L, 7L)).thenReturn(0);

        assertThrows(BusinessException.class, () -> service.requireReadableConversation(11L, 7L));
    }
}
