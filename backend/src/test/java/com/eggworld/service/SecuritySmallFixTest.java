package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.config.AppProperties;
import com.eggworld.dto.PairDTO;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import com.eggworld.service.mail.MailNotifyService;
import com.eggworld.service.mail.SesMailClient;
import org.junit.jupiter.api.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.Constructor;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
class SecuritySmallFixTest {
 @Test void fiveWrongCodesInvalidateAndSixthRequiresNewCode() throws Exception {
  VerifyCodeService s=new VerifyCodeService(new AppProperties(),mock(SesMailClient.class));
  Class<?> cls=Class.forName("com.eggworld.service.VerifyCodeService$CodeEntry");Constructor<?> c=cls.getDeclaredConstructor(String.class,long.class,long.class);c.setAccessible(true);
  Map cache=(Map)ReflectionTestUtils.getField(s,"cache");cache.put("local@example.test",c.newInstance("123456",System.currentTimeMillis()+60000,System.currentTimeMillis()));
  for(int i=1;i<=4;i++) assertTrue(assertThrows(BusinessException.class,()->s.verify("local@example.test","000000")).getMessage().contains("验证码错误"));
  assertTrue(assertThrows(BusinessException.class,()->s.verify("local@example.test","000000")).getMessage().contains("已失效"));
  assertEquals("请先获取验证码",assertThrows(BusinessException.class,()->s.verify("local@example.test","123456")).getMessage());
 }
 @Test void cannotLikeOwnAnswerOrPost() {
  GossipAnswerMapper am=mock(GossipAnswerMapper.class);GossipPostMapper pm=mock(GossipPostMapper.class);GossipLikeMapper lm=mock(GossipLikeMapper.class);
  GossipService s=new GossipService(pm,am,lm,mock(UserMapper.class),mock(PointService.class),mock(NotificationService.class));
  GossipAnswer a=new GossipAnswer();a.setAuthorId(1L);when(am.selectById(7L)).thenReturn(a);
  assertTrue(assertThrows(BusinessException.class,()->s.likeAnswer(1L,7L)).getMessage().contains("不能给自己的回答点赞"));
  GossipPost p=new GossipPost();p.setPublisherId(1L);p.setDeleted(0);when(pm.selectById(8L)).thenReturn(p);
  assertThrows(BusinessException.class,()->s.likePost(1L,8L));verifyNoInteractions(lm);
 }
 @Test void duplicateLikeDatabaseRaceIsBusinessError() {
  GossipAnswerMapper am=mock(GossipAnswerMapper.class);GossipLikeMapper lm=mock(GossipLikeMapper.class);
  GossipService s=new GossipService(mock(GossipPostMapper.class),am,lm,mock(UserMapper.class),mock(PointService.class),mock(NotificationService.class));
  GossipAnswer a=new GossipAnswer();a.setAuthorId(2L);when(am.selectById(7L)).thenReturn(a);
  when(lm.insert(any(GossipLike.class))).thenThrow(new DuplicateKeyException("test unique"));
  assertEquals("你已经点过赞啦",assertThrows(BusinessException.class,()->s.likeAnswer(1L,7L)).getMessage());
 }
 @Test void pairingUnknownIdDoesNotChangeTask() {
  TaskMapper tm=mock(TaskMapper.class);TaskClaimMapper cm=mock(TaskClaimMapper.class);PointService ps=mock(PointService.class);
  ClaimService s=new ClaimService(tm,cm,mock(UserMapper.class),mock(UserCharacterMapper.class),mock(UserStatsMapper.class),mock(RatingMapper.class),ps,mock(NotificationService.class),mock(TaskService.class),mock(ChatGroupService.class),new AppProperties());
  Task t=new Task();t.setId(7L);t.setTaskType("team");t.setStatus("approved");t.setPublisherId(1L);t.setMaxClaimers(3);when(tm.selectById(7L)).thenReturn(t);
  TaskClaim c=new TaskClaim();c.setClaimerId(2L);c.setStatus("pending_pairing");when(cm.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(c));
  PairDTO d=new PairDTO();d.setClaimerIds(List.of(999L));assertThrows(BusinessException.class,()->s.pair(1L,7L,d));assertEquals("approved",t.getStatus());verify(tm,never()).updateById(any(Task.class));verifyNoInteractions(ps);
 }
 @Test void cannotInviteSelfAndNotificationIsBounded() {
  UserMapper um=mock(UserMapper.class);NotificationService ns=mock(NotificationService.class);
  UserService s=new UserService(um,mock(UserStatsMapper.class),mock(UserCharacterMapper.class),mock(UserSkillMapper.class),mock(UserLikeMapper.class),mock(RatingMapper.class),ns,mock(MailNotifyService.class),mock(UserPermissionMapper.class));
  User u=new User();u.setNickname("x".repeat(600));when(um.selectById(anyLong())).thenReturn(u);
  assertThrows(BusinessException.class,()->s.inviteTask(1L,1L,List.of("a")));s.inviteTask(1L,2L,List.of("a"));verify(ns).notify(eq(2L),argThat(v->v.length()<=500),eq("invite"));
 }

 @Test void differentUsersLikeAnswerThroughAtomicMapper() {
  GossipAnswerMapper am=mock(GossipAnswerMapper.class);GossipLikeMapper lm=mock(GossipLikeMapper.class);
  GossipService s=new GossipService(mock(GossipPostMapper.class),am,lm,mock(UserMapper.class),mock(PointService.class),mock(NotificationService.class));
  GossipAnswer a=new GossipAnswer();a.setAuthorId(3L);a.setLikes(0);when(am.selectById(7L)).thenReturn(a);
  s.likeAnswer(1L,7L);s.likeAnswer(2L,7L);
  verify(am,times(2)).incrLikes(7L);verify(am,never()).updateById(any(GossipAnswer.class));verify(lm,times(2)).insert(any(GossipLike.class));
 }
 @Test void validCodeIsConsumableOnlyOnceConcurrently() throws Exception {
  VerifyCodeService s=new VerifyCodeService(new AppProperties(),mock(SesMailClient.class));
  Class<?> cls=Class.forName("com.eggworld.service.VerifyCodeService$CodeEntry");Constructor<?> c=cls.getDeclaredConstructor(String.class,long.class,long.class);c.setAccessible(true);
  Map cache=(Map)ReflectionTestUtils.getField(s,"cache");cache.put("local@example.test",c.newInstance("123456",System.currentTimeMillis()+60000,System.currentTimeMillis()));
  var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var start=new java.util.concurrent.CountDownLatch(1);
  java.util.concurrent.Callable<Boolean> verify=()->{start.await();try{s.verify("local@example.test","123456");return true;}catch(BusinessException ex){return false;}};
  try {var a=pool.submit(verify);var b=pool.submit(verify);start.countDown();assertNotEquals(a.get(5,java.util.concurrent.TimeUnit.SECONDS),b.get(5,java.util.concurrent.TimeUnit.SECONDS));assertFalse(cache.isEmpty());assertThrows(BusinessException.class,()->s.verify("local@example.test","123456"));}
  finally {pool.shutdownNow();}
 }

 @Test void exhaustingCodeDoesNotBypassResendCooldown() throws Exception {
  AppProperties props=new AppProperties();props.getMail().setCodeResendIntervalSeconds(60);
  SesMailClient mail=mock(SesMailClient.class);VerifyCodeService s=new VerifyCodeService(props,mail);
  Class<?> cls=Class.forName("com.eggworld.service.VerifyCodeService$CodeEntry");Constructor<?> c=cls.getDeclaredConstructor(String.class,long.class,long.class);c.setAccessible(true);
  Map cache=(Map)ReflectionTestUtils.getField(s,"cache");cache.put("local@example.test",c.newInstance("123456",System.currentTimeMillis()+60000,System.currentTimeMillis()));
  for(int i=0;i<5;i++) assertThrows(BusinessException.class,()->s.verify("local@example.test","000000"));
  assertTrue(assertThrows(BusinessException.class,()->s.sendCode("local@example.test")).getMessage().contains("过于频繁"));
  verifyNoInteractions(mail);
 }
 @Test void concurrentWrongAttemptsStopAtFive() throws Exception {
  VerifyCodeService s=new VerifyCodeService(new AppProperties(),mock(SesMailClient.class));
  Class<?> cls=Class.forName("com.eggworld.service.VerifyCodeService$CodeEntry");Constructor<?> c=cls.getDeclaredConstructor(String.class,long.class,long.class);c.setAccessible(true);
  Map cache=(Map)ReflectionTestUtils.getField(s,"cache");cache.put("local@example.test",c.newInstance("123456",System.currentTimeMillis()+60000,System.currentTimeMillis()));
  var pool=java.util.concurrent.Executors.newFixedThreadPool(8);var start=new java.util.concurrent.CountDownLatch(1);
  var futures=new ArrayList<java.util.concurrent.Future<String>>();
  try {
   for(int i=0;i<8;i++)futures.add(pool.submit(()->{start.await();return assertThrows(BusinessException.class,()->s.verify("local@example.test","000000")).getMessage();}));
   start.countDown();var messages=new ArrayList<String>();for(var f:futures)messages.add(f.get(5,java.util.concurrent.TimeUnit.SECONDS));
   assertEquals(4,messages.stream().filter(m->m.contains("还可尝试")).count());
   assertEquals(1,messages.stream().filter(m->m.contains("已失效")).count());
   assertEquals(3,messages.stream().filter(m->m.equals("请先获取验证码")).count());
   assertEquals("请先获取验证码",assertThrows(BusinessException.class,()->s.verify("local@example.test","123456")).getMessage());
  } finally {pool.shutdownNow();}
 }
}
