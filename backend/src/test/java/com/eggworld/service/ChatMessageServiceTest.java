package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.dto.ChatMessageDTO;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 聊天室核心权限与消息行为单元测试。 */
class ChatMessageServiceTest {

    private ChatConversationMapper conversationMapper;
    private ChatConversationMemberMapper memberMapper;
    private ChatMessageMapper messageMapper;
    private ChatReadStateMapper readStateMapper;
    private ChatSensitiveWordMapper sensitiveWordMapper;
    private ChatAuditLogMapper auditLogMapper;
    private UserMapper userMapper;
    private ChatPermissionService permissionService;
    private ChatRealtimePublisher publisher;
    private ChatOnlineRewardService onlineRewardService;
    private ChatMessageService service;

    @BeforeEach
    void setUp() {
        conversationMapper = mock(ChatConversationMapper.class);
        memberMapper = mock(ChatConversationMemberMapper.class);
        messageMapper = mock(ChatMessageMapper.class);
        readStateMapper = mock(ChatReadStateMapper.class);
        sensitiveWordMapper = mock(ChatSensitiveWordMapper.class);
        auditLogMapper = mock(ChatAuditLogMapper.class);
        userMapper = mock(UserMapper.class);
        permissionService = mock(ChatPermissionService.class);
        publisher = mock(ChatRealtimePublisher.class);
        onlineRewardService = mock(ChatOnlineRewardService.class);
        service = new ChatMessageService(conversationMapper, memberMapper, messageMapper, readStateMapper,
                sensitiveWordMapper, auditLogMapper, userMapper, permissionService, publisher, onlineRewardService);
    }

    @Test
    void duplicateClientMessageReturnsExistingWithoutInsert() {
        ChatConversation c = new ChatConversation(); c.setId(7L); c.setType("direct"); c.setStatus("active");
        when(permissionService.requireActiveConversation(7L)).thenReturn(c);
        when(permissionService.requireMember(7L, 1L)).thenReturn(member(7L, 1L));
        when(sensitiveWordMapper.selectList(any())).thenReturn(List.of());
        ChatMessage existing = new ChatMessage(); existing.setId(8L); existing.setConversationId(7L); existing.setSenderId(1L); existing.setContent("旧消息");
        when(messageMapper.selectOne(any())).thenReturn(existing);
        when(userMapper.selectById(1L)).thenReturn(user(1L, "发送者"));
        ChatMessageDTO dto = new ChatMessageDTO(); dto.setContent("重复"); dto.setClientMsgId("same");

        var vo = service.send(1L, 7L, dto);

        assertEquals(8L, vo.getId());
        verify(messageMapper, never()).insert(any(ChatMessage.class));
    }

    @Test
    void blockAndFriendRulesAreDelegatedToPermissionService() {
        doThrow(new BusinessException(403, "陌生人需先成为好友才能私聊"))
                .when(permissionService).requireDirectAllowed(1L, 2L);
        assertThrows(BusinessException.class, () -> service.createDirect(1L, 2L));
    }

    private ChatConversationMember member(Long conv, Long user) {
        ChatConversationMember m = new ChatConversationMember();
        m.setConversationId(conv); m.setUserId(user); m.setStatus("active"); m.setUnreadCount(0); m.setMentionUnread(0);
        return m;
    }

    private User user(Long id, String nickname) {
        User u = new User(); u.setId(id); u.setNickname(nickname); return u;
    }
}





