package com.eggworld.job;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import com.eggworld.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.LocalDateTime;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 报名截止定时任务（教学 / 求助）：
 * ① 截止前 3 / 1 天提醒
 * ② 到期且无人认领 → expired + 退币 + 通知可重新发布
 * ③ 有人认领 / 已被别的流程处理 → 不动手
 * ④ 已有人入选 → 不退回，按现有人数开局（转 full）
 *
 * ⚠️ 组队型自 2026-09-21 起**没有报名截止**（长期招募），
 *    不走本类的截止路径，其生命周期见 {@link DeadlineSchedulerTeamTest}。
 */
class DeadlineSchedulerTest {
 TaskMapper tasks; TaskClaimMapper claims; PointService points; NotificationService notices; TaskService taskService; DeadlineScheduler job;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);
  points=mock(PointService.class);notices=mock(NotificationService.class);
  taskService=mock(TaskService.class);
  job=new DeadlineScheduler(tasks,claims,points,notices,taskService);
 }

 Task approved(String type,int reward,LocalDateTime deadline){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("fixture");t.setTaskType(type);t.setReward(reward);
  t.setStatus("approved");t.setClaimMode("single");t.setCreatedAt(LocalDateTime.now().minusDays(10));
  t.setSignupDeadline(deadline);return t;
 }

 void scan(Task t){
  when(tasks.selectList(any())).thenReturn(java.util.List.of(t));
  job.scanSignupDeadlines();
 }

 @Test void expiryEndsUnclaimedTaskAndRefunds(){
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(tasks.expireIfApproved(7L)).thenReturn(1);
  scan(approved("help",20,LocalDateTime.now().minusMinutes(1)));
  verify(tasks).expireIfApproved(7L);
  verify(points).changeBalance(eq(1L),eq(20),eq("refund"),anyString(),eq(7L));
  verify(notices).notifyOnce(eq(1L),argThat(s->s.contains("重新发布")),eq("deadline"),anyInt());
 }

 @Test void expiryDisbandsTaskWhereNobodyWasSelected(){
  // 有人报名但发布者一个人都没选 → 与组队同口径：到期解散下架并退币
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(tasks.expireIfApproved(7L)).thenReturn(1);
  scan(approved("help",20,LocalDateTime.now().minusMinutes(1)));
  verify(tasks).expireIfApproved(7L);
  verify(points).changeBalance(eq(1L),eq(20),eq("refund"),anyString(),eq(7L));
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("cancelled"),anyString());
 }

 @Test void lostRaceAgainstOtherSchedulerDoesNotRefundTwice(){
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(tasks.expireIfApproved(7L)).thenReturn(0);
  scan(approved("help",20,LocalDateTime.now().minusMinutes(1)));
  verifyNoInteractions(points);
  verify(notices,never()).notifyOnce(anyLong(),anyString(),anyString(),anyInt());
 }

 @Test void longRunningRewardTaskIsUntouched(){
  scan(approved("reward",50,null));
  verify(tasks,never()).expireIfApproved(anyLong());
  verifyNoInteractions(points,notices);
 }

 @Test void remindsThreeDaysBeforeDeadline(){
  scan(approved("teach",10,LocalDateTime.now().plusDays(3).toLocalDate().atTime(23,59,59)));
  verify(notices).notifyOnce(eq(1L),argThat(s->s.contains("还剩 3 天")),eq("deadline"),anyInt());
  verify(tasks,never()).expireIfApproved(anyLong());
 }

 @Test void remindsOneDayBeforeDeadline(){
  scan(approved("teach",10,LocalDateTime.now().plusDays(1).toLocalDate().atTime(23,59,59)));
  verify(notices).notifyOnce(eq(1L),argThat(s->s.contains("还剩 1 天")),eq("deadline"),anyInt());
 }

 @Test void doesNotRemindOnOtherDays(){
  scan(approved("teach",10,LocalDateTime.now().plusDays(10).toLocalDate().atTime(23,59,59)));
  verifyNoInteractions(notices,points);
 }

 /* ===== 已有人入选：到期时「不退回，只按现有人数开工」（教学/求助/组队同一口径） ===== */

 /* 组队已不在参数里：它没有报名截止，不会走到「到期按现有人数开工」这条路径 */
 @ParameterizedTest @ValueSource(strings = {"teach", "help"})
 void taskWithSelectedMembersStartsInsteadOfExpiring(String type){
  when(taskService.memberCount(7L)).thenReturn(2L);
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(1);
  TaskClaim member=new TaskClaim();member.setClaimerId(2L);
  when(claims.selectList(any())).thenReturn(java.util.List.of(member));
  scan(approved(type,20,LocalDateTime.now().minusMinutes(1)));
  verify(tasks,never()).expireIfApproved(anyLong());
  verify(tasks).closeRecruitIfApproved(7L);
  verifyNoInteractions(points);                                   // 已开工 → 一分钱都不退
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("rejected"),anyString());
  verify(notices).notifyOnce(eq(1L),argThat(s->s.contains("按现有人数开工")),eq("deadline"),anyInt());
 }

 /* ===== 组队型：报名截止对它无效（长期招募），只有 90 天兜底能收口 ===== */

 @Test void teamTaskIgnoresSignupDeadlineEvenWithNobodyClaimed(){
  /* 旧行为：截止一到、无人认领 → 下架退币。
     新行为（2026-09-21）：组队没有报名截止，继续挂着招募，不退还。
     详见 DeadlineSchedulerTeamTest（含 90 天兜底的正反向用例）。 */
  scan(approved("team",9999,LocalDateTime.now().minusMinutes(1)));
  verify(tasks,never()).expireIfApproved(anyLong());
  verifyNoInteractions(points);
 }

 @Test void teamTaskDoesNotGetDeadlineReminder(){
  /* 组队没有报名截止 → 也不该收到「还剩 N 天」提醒 */
  scan(approved("team",9999,LocalDateTime.now().plusDays(3).toLocalDate().atTime(23,59,59)));
  verifyNoInteractions(notices);
 }

 @Test void lostRecruitRaceDoesNotNotifyAsStarted(){
  when(taskService.memberCount(7L)).thenReturn(1L);
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(0);           // 已被别的流程处理
  scan(approved("team",9999,LocalDateTime.now().minusMinutes(1)));
  verifyNoInteractions(points);
  verify(notices,never()).notifyOnce(anyLong(),anyString(),anyString(),anyInt());
 }
}
