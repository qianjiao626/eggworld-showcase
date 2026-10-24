package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.Task;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TaskFeaturedTest {
 TaskMapper tasks; TaskClaimMapper claims; TaskRevisionMapper revisions; UserMapper users; PointService points; NotificationService notices; TaskService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);revisions=mock(TaskRevisionMapper.class);
  users=mock(UserMapper.class);points=mock(PointService.class);notices=mock(NotificationService.class);
  service=new TaskService(tasks,claims,revisions,users,points,mock(InviteService.class),notices,mock(ChatGroupService.class),new AppProperties());
 }

 Task approved(){
  Task t=new Task();t.setId(5L);t.setPublisherId(1L);t.setTitle("test");t.setTaskType("help");
  t.setStatus("approved");t.setFeatured(0);return t;
 }

 @Test void toggleFeaturedCallsMapper(){
  when(tasks.selectById(5L)).thenReturn(approved());
  when(tasks.toggleFeatured(5L)).thenReturn(1);
  service.toggleFeatured(5L);
  verify(tasks).toggleFeatured(5L);
 }

 @Test void toggleFeaturedThrowsWhenTaskNotFound(){
  when(tasks.selectById(99L)).thenReturn(null);
  assertThrows(BusinessException.class,()->service.toggleFeatured(99L));
  verify(tasks,never()).toggleFeatured(anyLong());
 }
}
