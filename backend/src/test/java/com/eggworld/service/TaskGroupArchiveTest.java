package com.eggworld.service;
import com.eggworld.entity.ChatConversation;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 任务群归档：只置 read_only、不动 status，且绝不因聊天室状况打断任务收尾。 */
class TaskGroupArchiveTest {

 ChatGroupMapper groupMapper; ChatGroupMemberMapper groupMembers; ChatConversationMapper conversations;
 ChatConversationMemberMapper conversationMembers; ChatGroupService groups;

 @BeforeEach void setup(){
  groupMapper=mock(ChatGroupMapper.class);groupMembers=mock(ChatGroupMemberMapper.class);
  conversations=mock(ChatConversationMapper.class);conversationMembers=mock(ChatConversationMemberMapper.class);
  groups=new ChatGroupService(groupMapper,groupMembers,conversations,conversationMembers,mock(ChatPermissionService.class));
 }

 ChatConversation conv(Long ownerId,Integer readOnly){
  ChatConversation c=new ChatConversation();c.setId(88L);c.setType("group");
  c.setStatus("active");c.setOwnerId(ownerId);c.setReadOnly(readOnly);return c;
 }

 @Test void archiveOnlyFlipsReadOnly(){
  when(conversations.selectById(88L)).thenReturn(conv(1L,0));

  groups.archive(1L,88L);

  verify(conversations).archiveReadOnly(88L);
  /* 群必须留在 active：置 archived 会让会话从列表消失、连历史消息都读不了 */
  verify(conversations,never()).updateById(any(ChatConversation.class));
 }

 @Test void archiveSkipsWhenOwnerDiffers(){
  when(conversations.selectById(88L)).thenReturn(conv(2L,0));

  groups.archive(1L,88L);

  verify(conversations,never()).archiveReadOnly(anyLong());
 }

 @Test void archiveIsIdempotent(){
  when(conversations.selectById(88L)).thenReturn(conv(1L,1));

  groups.archive(1L,88L);

  verify(conversations,never()).archiveReadOnly(anyLong());
 }

 @Test void archiveSkipsWhenConversationMissing(){
  when(conversations.selectById(88L)).thenReturn(null);

  groups.archive(1L,88L);     // 不抛异常：任务收尾不能被聊天室数据问题回滚

  verify(conversations,never()).archiveReadOnly(anyLong());
 }

 @Test void archiveSkipsNullConversationId(){
  groups.archive(1L,null);

  verify(conversations,never()).selectById(any());
 }
}
