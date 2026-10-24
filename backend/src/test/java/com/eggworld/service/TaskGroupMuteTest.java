package com.eggworld.service;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.ChatConversation;
import com.eggworld.entity.ChatConversationMember;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 归档后的任务群必须真的发不出消息。
 * read_only 原先只对 channel 生效，群聊置 1 等于没禁言 —— 这条是本次前端/后端口径的守门测试。
 */
class TaskGroupMuteTest {

 ChatConversationMapper conversations; ChatConversationMemberMapper members; ChatMuteMapper mutes;
 ChatPermissionService permissions;

 @BeforeEach void setup(){
  conversations=mock(ChatConversationMapper.class);
  members=mock(ChatConversationMemberMapper.class);
  mutes=mock(ChatMuteMapper.class);
  permissions=new ChatPermissionService(conversations,members,mock(ChatGroupMemberMapper.class),
          mock(ChatBlockMapper.class),mock(ChatFriendMapper.class),mutes,mock(TaskMapper.class),mock(TaskClaimMapper.class));
 }

 ChatConversation group(int readOnly){
  ChatConversation c=new ChatConversation();c.setId(88L);c.setType("group");
  c.setVisibility("public");c.setStatus("active");c.setReadOnly(readOnly);return c;
 }

 ChatConversationMember owner(){
  ChatConversationMember m=new ChatConversationMember();m.setUserId(1L);m.setStatus("active");m.setRole("owner");return m;
 }

 @Test void archivedGroupIsMutedEvenForOwner(){
  when(conversations.selectById(88L)).thenReturn(group(1));
  when(members.selectOne(any())).thenReturn(owner());
  when(mutes.selectCount(any())).thenReturn(0L);

  assertEquals("该任务已结束，群聊已归档，不能再发言",
          assertThrows(BusinessException.class,()->permissions.requireCanSend(88L,1L)).getMessage());
 }

 @Test void activeGroupStillSends(){
  when(conversations.selectById(88L)).thenReturn(group(0));
  when(members.selectOne(any())).thenReturn(owner());
  when(mutes.selectCount(any())).thenReturn(0L);

  permissions.requireCanSend(88L,1L);     // 不抛异常即通过
 }
}
