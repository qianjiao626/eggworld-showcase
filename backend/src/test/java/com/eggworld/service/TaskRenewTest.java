package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 到期后的两条路径：
 * ① 重新发布（expired → approved，只改报名截止，免审核直接上线，管理员知情）
 * ② 广场上「催一下发布者」（同一任务 24 小时去重）
 */
class TaskRenewTest {
 TaskMapper tasks; TaskClaimMapper claims; TaskRevisionMapper revisions; UserMapper users; PointService points; NotificationService notices; TaskService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);revisions=mock(TaskRevisionMapper.class);
  users=mock(UserMapper.class);points=mock(PointService.class);notices=mock(NotificationService.class);
  service=new TaskService(tasks,claims,revisions,users,points,mock(InviteService.class),notices,mock(ChatGroupService.class),new AppProperties());
 }

 Task expired(String type,int reward){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("fixture");t.setTaskType(type);t.setReward(reward);
  t.setStatus("expired");t.setClaimMode("single");t.setCreatedAt(LocalDateTime.now().minusDays(40));
  t.setUpdatedAt(LocalDateTime.now().minusDays(1));return t;
 }

 @Test void renewReopensTaskAndRefreezes(){
  Task t=expired("help",20);when(tasks.selectById(7L)).thenReturn(t);when(tasks.renewIfExpired(eq(7L),any())).thenReturn(1);
  service.renewTask(1L,7L,7);
  ArgumentCaptor<LocalDateTime> cap=ArgumentCaptor.forClass(LocalDateTime.class);
  verify(tasks).renewIfExpired(eq(7L),cap.capture());
  assertEquals(LocalDateTime.now().toLocalDate().plusDays(7),cap.getValue().toLocalDate());
  assertEquals(23,cap.getValue().getHour());
  verify(points).changeBalance(eq(1L),eq(-20),eq("freeze"),anyString(),eq(7L));
  verify(notices).notifyAdmins(argThat(s->s.contains("fixture")&&s.contains("无需再审")),eq("deadline"));
 }

 @Test void renewDoesNotFreezeWhenNothingWasFrozen(){
  Task t=expired("teach",30);when(tasks.selectById(7L)).thenReturn(t);when(tasks.renewIfExpired(eq(7L),any())).thenReturn(1);
  service.renewTask(1L,7L,30);
  verifyNoInteractions(points);
  verify(notices).notifyAdmins(anyString(),eq("deadline"));
 }

 @Test void renewClampsDaysToUpperBound(){
  Task t=expired("teach",10);when(tasks.selectById(7L)).thenReturn(t);when(tasks.renewIfExpired(eq(7L),any())).thenReturn(1);
  service.renewTask(1L,7L,999);
  ArgumentCaptor<LocalDateTime> cap=ArgumentCaptor.forClass(LocalDateTime.class);
  verify(tasks).renewIfExpired(eq(7L),cap.capture());
  assertEquals(LocalDateTime.now().toLocalDate().plusDays(TaskService.MAX_SIGNUP_DAYS),cap.getValue().toLocalDate());
 }

 @Test void renewRejectsNonExpiredTask(){
  Task t=expired("help",20);t.setStatus("approved");when(tasks.selectById(7L)).thenReturn(t);
  assertThrows(BusinessException.class,()->service.renewTask(1L,7L,7));
  verify(tasks,never()).renewIfExpired(anyLong(),any());
  verifyNoInteractions(points,notices);
 }

 @Test void renewRejectsOtherPeoplesTask(){
  when(tasks.selectById(7L)).thenReturn(expired("help",20));
  assertThrows(BusinessException.class,()->service.renewTask(2L,7L,7));
  verify(tasks,never()).renewIfExpired(anyLong(),any());
 }

 @Test void renewRejectsWhenExpiredLongerThanWindow(){
  Task t=expired("help",20);t.setUpdatedAt(LocalDateTime.now().minusDays(TaskService.RENEW_WINDOW_DAYS+1));
  when(tasks.selectById(7L)).thenReturn(t);
  assertThrows(BusinessException.class,()->service.renewTask(1L,7L,7));
  verifyNoInteractions(points);
 }

 @Test void lostRenewRaceDoesNotChargeCoins(){
  Task t=expired("help",20);when(tasks.selectById(7L)).thenReturn(t);when(tasks.renewIfExpired(eq(7L),any())).thenReturn(0);
  assertThrows(BusinessException.class,()->service.renewTask(1L,7L,7));
  verifyNoInteractions(points,notices);
 }

 @Test void nudgingNotifiesThePublisherWithDedupe(){
  Task t=expired("teach",10);t.setSignupDeadline(LocalDateTime.now().minusDays(2));
  when(tasks.selectById(7L)).thenReturn(t);
  service.nudgePublisher(2L,7L);
  verify(notices).notifyOnce(eq(1L),argThat(s->s.contains("fixture")&&s.contains("过期")),eq("deadline"),eq(24));
 }

 @Test void nudgingOwnTaskDoesNotNotify(){
  when(tasks.selectById(7L)).thenReturn(expired("teach",10));
  service.nudgePublisher(1L,7L);
  verifyNoInteractions(notices);
 }

 @Test void nudgingLiveTaskIsRejected(){
  Task t=expired("teach",10);t.setStatus("approved");when(tasks.selectById(7L)).thenReturn(t);
  assertThrows(BusinessException.class,()->service.nudgePublisher(2L,7L));
  verifyNoInteractions(notices);
 }
}
