package com.eggworld.service;
import com.eggworld.dto.*; import com.eggworld.entity.*; import com.eggworld.mapper.*;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.junit.jupiter.api.*; import org.junit.jupiter.params.ParameterizedTest; import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*; import static org.mockito.Mockito.*; import static org.mockito.ArgumentMatchers.*;
class ChatQueryBudgetTest {
    ChatConversationMapper conversations=mock(ChatConversationMapper.class);
    ChatConversationMemberMapper members=mock(ChatConversationMemberMapper.class);
    ChatMessageMapper messages=mock(ChatMessageMapper.class); UserMapper users=mock(UserMapper.class);
    ChatMessageService service=new ChatMessageService(conversations,members,messages,mock(ChatReadStateMapper.class),
            mock(ChatSensitiveWordMapper.class),mock(ChatAuditLogMapper.class),users,mock(ChatPermissionService.class),
            mock(ChatRealtimePublisher.class),mock(ChatOnlineRewardService.class));
    @ParameterizedTest @ValueSource(ints={20,50}) void historyDoesNotReadEachSender(int count) {
        List<ChatMessage> data=new ArrayList<>();
        for(long i=1;i<=count;i++){var m=new ChatMessage(); m.setId(i);m.setSenderId(i);m.setConversationId(7L); data.add(m);}
        when(messages.selectPage(any(Page.class),any())).thenAnswer(inv->{Page<ChatMessage> p=inv.getArgument(0);p.setRecords(data);return p;});
        assertEquals(count,service.history(1L,7L,null,count).getRecords().size());
        verify(users,never()).selectById(anyLong());
        verify(users,times(1)).selectBatchIds(anyCollection());
    }
    @ParameterizedTest @ValueSource(ints={20,50,100}) void conversationPreviewsUseBatchReads(int count) {
        List<ChatConversationMember> ms=new ArrayList<>(); List<ChatConversation> cs=new ArrayList<>();
        for(long i=1;i<=count;i++) { var m=new ChatConversationMember();m.setConversationId(i);ms.add(m);
            var c=new ChatConversation();c.setId(i);c.setType("group");c.setStatus("active");c.setLastMessageId(i);cs.add(c);
            lenient().when(conversations.selectById(i)).thenReturn(c);
        }
        when(members.selectList(any())).thenReturn(ms);
        lenient().when(conversations.selectBatchIds(anyCollection())).thenReturn(cs);
        assertEquals(count,service.listConversations(7L).size());
        verify(conversations,never()).selectById(anyLong()); verify(messages,never()).selectById(anyLong());
        verify(conversations).selectBatchIds(anyCollection()); verify(messages).selectBatchIds(anyCollection());
    }
    @Test void inactiveConversationsDoNotTriggerPreviewOrPeerReads() {
        var activeMember = membership(1L, "active");
        var inactiveMember = membership(2L, "active");
        when(members.selectList(any())).thenReturn(List.of(activeMember, inactiveMember));

        var active = new ChatConversation();
        active.setId(1L); active.setType("group"); active.setStatus("active");
        var inactive = new ChatConversation();
        inactive.setId(2L); inactive.setType("direct"); inactive.setStatus("archived"); inactive.setLastMessageId(99L);
        when(conversations.selectBatchIds(anyCollection())).thenReturn(List.of(active, inactive));

        assertEquals(1, service.listConversations(7L).size());

        verify(messages, never()).selectBatchIds(anyCollection());
        verify(users, never()).selectBatchIds(anyCollection());
        verify(members, times(1)).selectList(any());
    }

    @Test void sendingDoesNotReadEveryMember() {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
            new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(),"test"),ChatConversation.class);

        ChatMessageDTO dto=new ChatMessageDTO();dto.setContent("local fixture");
        service.send(1L,7L,dto);
        verify(members,never()).selectList(any());
    }
    @BeforeEach void initializeMembershipMetadata() {
        var assistant = new org.apache.ibatis.builder.MapperBuilderAssistant(
                new com.baomidou.mybatisplus.core.MybatisConfiguration(), "membership-budget");
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(assistant, ChatConversation.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(assistant, ChatConversationMember.class);
    }
    private ChatConversation channel(long id) {
        var c = new ChatConversation(); c.setId(id); c.setType("channel"); c.setStatus("active"); return c;
    }
    private ChatConversationMember membership(long id, String status) {
        var m = new ChatConversationMember(); m.setConversationId(id); m.setUserId(7L); m.setStatus(status); return m;
    }
    @ParameterizedTest @ValueSource(ints={1,20,50,100})
    void existingOfficialChannelsUseOneMembershipReadAndNoWrites(int count) {
        var channels = new ArrayList<ChatConversation>();
        var memberships = new ArrayList<ChatConversationMember>();
        for (long i=1; i<=count; i++) { channels.add(channel(i)); memberships.add(membership(i,"active")); }
        when(conversations.selectList(any())).thenReturn(channels);
        when(members.selectList(any())).thenReturn(memberships);
        // Old per-channel implementation can return the same data, but must fail the query budget.
        when(members.selectOne(any())).thenAnswer(inv -> membership(1,"active"));
        service.ensureOfficialChannelMembership(7L);
        verify(conversations).selectList(any()); verify(members).selectList(any());
        verify(members,never()).selectOne(any()); verify(conversations,never()).selectOne(any());
        verify(members,never()).insert(any(ChatConversationMember.class)); verify(members,never()).update(isNull(),any());
        verify(conversations,never()).update(isNull(),any());
    }
    @Test void absentOfficialChannelsDoNotReadMemberships() {
        service.ensureOfficialChannelMembership(7L);
        verifyNoInteractions(members);
    }
    @Test void inactiveOfficialMembershipsAreReactivatedInOneScopedUpdate() {
        when(conversations.selectList(any())).thenReturn(List.of(channel(11),channel(12),channel(13)));
        when(members.selectList(any())).thenReturn(List.of(membership(11,"left"),membership(12,"left"),membership(13,"active")));
        service.ensureOfficialChannelMembership(7L);
        var captor = org.mockito.ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper.class);
        verify(members).update(isNull(),captor.capture());
        var update = captor.getValue();
        assertTrue(update.getSqlSegment().contains("user_id"));
        assertTrue(update.getSqlSegment().contains("conversation_id IN"));
        assertTrue(update.getSqlSegment().contains("status <>"));
        assertTrue(update.getSqlSet().contains("left_at"));
        assertTrue(update.getParamNameValuePairs().containsValue(7L));
        assertTrue(update.getParamNameValuePairs().containsValue(11L));
        assertTrue(update.getParamNameValuePairs().containsValue(12L));
        assertFalse(update.getParamNameValuePairs().containsValue(13L));
        verify(members,never()).selectOne(any()); verify(members,never()).insert(any(ChatConversationMember.class));
        verify(conversations,never()).update(isNull(),any());
    }
    @Test void concurrentJoinIsRecheckedBeforeInsertingOrCounting() {
        when(conversations.selectList(any())).thenReturn(List.of(channel(11)));
        when(conversations.selectOne(any())).thenReturn(channel(11));
        when(members.selectList(any())).thenReturn(List.of());
        when(members.selectOne(any())).thenReturn(membership(11,"active"));
        service.ensureOfficialChannelMembership(7L);
        var order = inOrder(conversations,members);
        order.verify(conversations).selectOne(argThat(w -> w.getSqlSegment().endsWith("FOR UPDATE")));
        order.verify(members).selectOne(argThat(w -> w.getSqlSegment().endsWith("FOR UPDATE")));
        verify(members,never()).insert(any(ChatConversationMember.class)); verify(conversations,never()).update(isNull(),any());
    }
    @Test void listEntryPointHasTransactionForItsInternalMembershipWrites() throws Exception {
        var transaction = ChatMessageService.class.getMethod("listConversations",Long.class)
                .getAnnotation(org.springframework.transaction.annotation.Transactional.class);
        assertNotNull(transaction);
        assertEquals(org.springframework.transaction.annotation.Isolation.READ_COMMITTED,transaction.isolation());
    }
    @Test void firstJoinInsertsDefaultMemberAndIncrementsCountOnce() {
        when(conversations.selectList(any())).thenReturn(List.of(channel(11)));
        when(conversations.selectOne(any())).thenReturn(channel(11));
        service.ensureOfficialChannelMembership(7L);
        var captor = org.mockito.ArgumentCaptor.forClass(ChatConversationMember.class);
        verify(members).insert(captor.capture());
        var m = captor.getValue();
        assertEquals(11L,m.getConversationId()); assertEquals(7L,m.getUserId());
        assertEquals("active",m.getStatus()); assertEquals("member",m.getRole());
        assertEquals(0,m.getUnreadCount()); assertEquals(0,m.getMentionUnread()); assertEquals(0L,m.getLastReadMessageId());
        assertEquals("all",m.getNotificationMode()); assertEquals(0,m.getPinned());
        verify(conversations).update(isNull(),any());
    }
    @Test void channelArchivedBeforeLockDoesNotCreateMembership() {
        when(conversations.selectList(any())).thenReturn(List.of(channel(11)));
        service.ensureOfficialChannelMembership(7L);
        verify(conversations).selectOne(any());
        verify(members,never()).selectOne(any()); verify(members,never()).insert(any(ChatConversationMember.class));
        verify(conversations,never()).update(isNull(),any());
    }
    @Test void missingChannelsAreLockedInStableOrder() {
        when(conversations.selectList(any())).thenReturn(List.of(channel(13),channel(11),channel(12)));
        service.ensureOfficialChannelMembership(7L);
        var captor = org.mockito.ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class);
        verify(conversations,times(3)).selectOne(captor.capture());
        var expected = List.of(11L,12L,13L);
        for (int i=0;i<3;i++) {
            var query = captor.getAllValues().get(i); query.getSqlSegment();
            assertTrue(query.getParamNameValuePairs().containsValue(expected.get(i)));
        }
    }
}
