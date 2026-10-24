package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 报名截止的统一口径与认领拦截：
 * ① 组队型 → 永远没有报名截止（长期招募，2026-09-21 起）
 * ② 填了 signupDeadline → 用它
 * ③ 没填：奖励型（官方悬赏）→ 长期有效；教学/求助 → 发布时间 +30 天当天 23:59:59
 * ④ 过期后 claim 必须被拒（前端展示与后端校验同一口径，否则"看得见拦不住"）
 * ⑤ 组队型不受截止约束，任何时候都能报名
 */
class TaskSignupDeadlineTest {
 TaskMapper tasks; TaskClaimMapper claims; UserMapper users; UserCharacterMapper chars; UserStatsMapper stats; RatingMapper ratings; PointService points; NotificationService notices; ClaimService claimService;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);users=mock(UserMapper.class);chars=mock(UserCharacterMapper.class);
  stats=mock(UserStatsMapper.class);ratings=mock(RatingMapper.class);points=mock(PointService.class);notices=mock(NotificationService.class);
  claimService=new ClaimService(tasks,claims,users,chars,stats,ratings,points,notices,mock(TaskService.class),mock(ChatGroupService.class),new AppProperties());
  when(users.selectById(anyLong())).thenReturn(new User());
  when(claims.selectCount(any())).thenReturn(0L);
  when(points.getBalance(anyLong())).thenReturn(1000);
 }

 Task approved(String type, LocalDateTime createdAt, LocalDateTime signupDeadline){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("fixture");t.setTaskType(type);t.setReward(10);
  t.setStatus("approved");t.setClaimMode("single");t.setCreatedAt(createdAt);t.setSignupDeadline(signupDeadline);return t;
 }

 // ---------- 口径 ----------

 @Test void explicitDeadlineWins(){
  LocalDateTime d=LocalDateTime.of(2026,10,15,12,0);
  assertEquals(d,TaskService.effectiveSignupDeadline(approved("teach",LocalDateTime.of(2026,1,1,9,0),d)));
 }

 @Test void rewardWithoutDeadlineIsOpenEnded(){
  assertNull(TaskService.effectiveSignupDeadline(approved("reward",LocalDateTime.of(2020,1,1,9,0),null)));
 }

 @ParameterizedTest @ValueSource(strings={"teach","help"})
 void otherTypesWithoutDeadlineFallBackToPublishDatePlusThirtyDays(String type){
  assertEquals(LocalDateTime.of(2026,1,31,23,59,59),
    TaskService.effectiveSignupDeadline(approved(type,LocalDateTime.of(2026,1,1,9,30),null)));
 }

 /* ---------- 组队型：长期招募，没有报名截止 ---------- */

 @Test void teamWithoutDeadlineIsOpenEnded(){
  /* 组队没填截止 -> null（长期招募），不再回退到「发布时间 +30 天」 */
  assertNull(TaskService.effectiveSignupDeadline(approved("team",LocalDateTime.of(2026,1,1,9,30),null)));
 }

 @Test void teamExplicitDeadlineIsIgnored(){
  /* 组队即使库里存了显式截止（历史数据 / 前端仍会带），也一律忽略 */
  assertNull(TaskService.effectiveSignupDeadline(
    approved("team",LocalDateTime.of(2026,1,1,9,30),LocalDateTime.of(2026,2,1,12,0))));
 }

 @Test void teamTaskPastItsOldDeadlineIsStillClaimable(){
  /* 核心回归：组队报名截止早过了，仍必须能报名（此前会抛「报名已截止」） */
  Task t=approved("team",LocalDateTime.now().minusDays(60),LocalDateTime.now().minusDays(30));
  when(tasks.selectById(7L)).thenReturn(t);
  claimService.claim(2L,7L,null);
  verify(claims).insert(any(TaskClaim.class));
 }

 @Test void teamTaskLongAfterFallbackIsStillClaimable(){
  /* 兜底只由 DeadlineScheduler 负责下架；只要任务还是 approved，claim 就不拦 */
  Task t=approved("team",LocalDateTime.now().minusDays(TaskService.TEAM_RECRUIT_FALLBACK_DAYS+10),null);
  when(tasks.selectById(7L)).thenReturn(t);
  claimService.claim(2L,7L,null);
  verify(claims).insert(any(TaskClaim.class));
 }

 @Test void missingValuesAreOpenEnded(){
  assertNull(TaskService.effectiveSignupDeadline(null));
  assertNull(TaskService.effectiveSignupDeadline(new Task()));
  assertNull(TaskService.effectiveSignupDeadline(approved("teach",null,null)));
 }

 // ---------- 认领拦截 ----------

 @Test void expiredExplicitDeadlineBlocksClaim(){
  Task t=approved("teach",LocalDateTime.of(2026,1,1,9,0),LocalDateTime.now().minusSeconds(5));
  when(tasks.selectById(7L)).thenReturn(t);
  BusinessException e=assertThrows(BusinessException.class,()->claimService.claim(2L,7L,null));
  assertEquals("报名已截止",e.getMessage());
  verifyNoInteractions(claims,points,notices);
 }

 @Test void expiredFallbackDeadlineBlocksClaim(){
  Task t=approved("help",LocalDateTime.now().minusDays(TaskService.SIGNUP_DEFAULT_DAYS+1),null);
  when(tasks.selectById(7L)).thenReturn(t);
  assertThrows(BusinessException.class,()->claimService.claim(2L,7L,null));
  verify(claims,never()).insert(any(TaskClaim.class));
 }

 @Test void lastDayOfFallbackWindowIsStillClaimable(){
  /* 发布时间 +30 天的当天 23:59:59 之前都放行（与前端"截止 MM-DD"一致） */
  Task t=approved("help",LocalDateTime.now().minusDays(TaskService.SIGNUP_DEFAULT_DAYS-1),null);
  when(tasks.selectById(7L)).thenReturn(t);
  claimService.claim(2L,7L,null);
  verify(claims).insert(any(TaskClaim.class));
 }

 @Test void rewardTaskWithoutDeadlineIsStillClaimable(){
  Task t=approved("reward",LocalDateTime.now().minusDays(365),null);
  when(tasks.selectById(7L)).thenReturn(t);
  claimService.claim(2L,7L,null);
  verify(claims).insert(any(TaskClaim.class));
 }

 @Test void futureDeadlineStillAllowsClaim(){
  Task t=approved("help",LocalDateTime.now().minusDays(1),LocalDateTime.now().plusDays(3));
  when(tasks.selectById(7L)).thenReturn(t);
  claimService.claim(2L,7L,null);
  verify(claims).insert(any(TaskClaim.class));
 }
}
