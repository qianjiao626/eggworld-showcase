package com.eggworld.service;
import com.eggworld.mapper.*; import com.eggworld.entity.Notification;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.junit.jupiter.api.Test; import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*; import static org.mockito.Mockito.*; import static org.mockito.ArgumentMatchers.*;
class NotificationQueryBudgetTest {
 @Test void unreadCountDoesNotLoadBodiesAndListDoesNotCountPageTotal(){
  NotificationMapper m=mock(NotificationMapper.class);var service=new NotificationService(m,mock(UserMapper.class));
  when(m.selectCount(any())).thenReturn(50L);
  assertEquals(50,service.unreadCount(7L));verify(m,never()).selectPage(any(),any());verify(m,never()).selectList(any());
  when(m.selectPage(any(Page.class),any())).thenAnswer(i->i.getArgument(0));
  assertEquals(50,service.listMine(7L,1,50).getUnread());
  ArgumentCaptor<Page<Notification>> page=ArgumentCaptor.forClass(Page.class);verify(m).selectPage(page.capture(),any());
  assertFalse(page.getValue().searchCount());
 }
}
