package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.*;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
class TeamRefundServiceTest {
 TaskMapper tasks; TaskClaimMapper claims; UserMapper users; PointService points; NotificationService notices; TaskService service; RatingService ratings;
 @BeforeEach void setup() {
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);users=mock(UserMapper.class);points=mock(PointService.class);notices=mock(NotificationService.class);
  service=new TaskService(tasks,claims,mock(TaskRevisionMapper.class),users,points,mock(InviteService.class),notices,mock(ChatGroupService.class),new AppProperties());
  ratings=new RatingService(mock(RatingMapper.class),tasks,claims,users,mock(UserStatsMapper.class),points,notices);
 }
 Task task(String type,int reward) {Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("fixture");t.setTaskType(type);t.setReward(reward);t.setStatus("pending");t.setSettled(0);return t;}
 @ParameterizedTest @CsvSource({"teach,9999,0","team,9999,10","help,20,20","reward,9999,0"})
 void rejectRefundsOnlyActualFreeze(String type,int amount,int refund) {
  Task t=task(type,amount);when(tasks.selectById(7L)).thenReturn(t);when(tasks.rejectIfPending(7L)).thenReturn(1);service.reject(7L,null);
  if(refund==0) {verifyNoInteractions(points);verify(notices).notify(eq(1L),argThat(s->!s.contains("已退回")),eq("review"));}
  else verify(points).changeBalance(eq(1L),eq(refund),eq("refund"),anyString(),eq(7L));
 }
 @ParameterizedTest @CsvSource({"team,9999,10,-10","help,20,20,-20","teach,9999,9999,0"})
 void publishNormalizesRewardBeforeFreezing(String type,int amount,int stored,int delta) {
  User u=new User();u.setId(1L);when(users.selectById(1L)).thenReturn(u);
  when(tasks.insert(any(Task.class))).thenAnswer(i->{((Task)i.getArgument(0)).setId(7L);return 1;});
  PublishTaskDTO d=new PublishTaskDTO();d.setTaskType(type);d.setTitle("fixture");d.setReward(amount);d.setMaxClaimers(2);service.publish(1L,d);
  ArgumentCaptor<Task> cap=ArgumentCaptor.forClass(Task.class);verify(tasks).insert(cap.capture());assertEquals(stored,cap.getValue().getReward());
  if(delta==0) verifyNoInteractions(points);else verify(points).changeBalance(eq(1L),eq(delta),eq("freeze"),anyString(),eq(7L));
 }
 @Test void unratedCompletedTeamRefundsBothParticipants() {
  Task t=task("team",9999);t.setStatus("completed");when(tasks.selectById(7L)).thenReturn(t);
  TaskClaim c=new TaskClaim();c.setClaimerId(2L);c.setStatus("completed");c.setSelected(1);
  when(claims.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(c));when(tasks.markSettled(7L)).thenReturn(1);ratings.settleTask(7L);
  verify(points).changeBalance(eq(1L),eq(8),eq("refund"),anyString(),eq(7L));verify(points).changeBalance(eq(2L),eq(8),eq("refund"),anyString(),eq(7L));
 }

 @Test void settlementSkipsStaleClaimsButKeepsLateMembers() {
  // 上一轮超期下架后残留的 cancelled/selected=1 记录不能再退一次（否则凭空发币）；
  // 「一人提交=全队提交」空档里后进队的搭子停在 in_progress，必须照退（否则吞钱）。
  Task t=task("team",10);t.setStatus("completed");when(tasks.selectById(7L)).thenReturn(t);
  TaskClaim stale=new TaskClaim();stale.setClaimerId(2L);stale.setStatus("cancelled");stale.setSelected(1);
  TaskClaim late=new TaskClaim();late.setClaimerId(3L);late.setStatus("in_progress");late.setSelected(1);
  when(claims.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(stale,late));
  when(tasks.markSettled(7L)).thenReturn(1);
  ratings.settleTask(7L);
  verify(points,never()).changeBalance(eq(2L),anyInt(),anyString(),anyString(),anyLong());
  verify(points).changeBalance(eq(3L),eq(8),eq("refund"),anyString(),eq(7L));
  verify(points).changeBalance(eq(1L),eq(8),eq("refund"),anyString(),eq(7L));
 }

 @Test void settlementClaimPrecedesEveryPayment() {
  Task t=task("team",10);t.setStatus("completed");when(tasks.selectById(7L)).thenReturn(t);
  when(tasks.markSettled(7L)).thenReturn(1);when(claims.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
  ratings.settleTask(7L);
  InOrder order=inOrder(tasks,points);order.verify(tasks).markSettled(7L);
  order.verify(points).changeBalance(eq(1L),eq(8),eq("refund"),anyString(),eq(7L));
  verify(tasks,never()).updateById(any(Task.class));
 }
 @Test void lostSettlementClaimHasNoSideEffects() {
  Task t=task("team",10);t.setStatus("completed");when(tasks.selectById(7L)).thenReturn(t);
  when(tasks.markSettled(7L)).thenReturn(0);ratings.settleTask(7L);
  verifyNoInteractions(points,notices,claims);
 }
 @Test void alreadySettledOrIncompleteDoesNotClaim() {
  Task t=task("team",10);t.setStatus("completed");t.setSettled(1);when(tasks.selectById(7L)).thenReturn(t);
  ratings.settleTask(7L);t.setSettled(0);t.setStatus("in_progress");ratings.settleTask(7L);
  verify(tasks,never()).markSettled(anyLong());verifyNoInteractions(points,notices);
 }
 @Test void rejectedClaimCannotRefundTwice() {
  when(tasks.selectById(7L)).thenReturn(task("team",9999));when(tasks.rejectIfPending(7L)).thenReturn(0);
  assertThrows(com.eggworld.common.BusinessException.class,()->service.reject(7L,null));verifyNoInteractions(points,notices);
 }
 @Test void lostApprovalDoesNotAwardExperience() {
  when(tasks.selectById(7L)).thenReturn(task("help",20));when(tasks.approveIfPending(7L)).thenReturn(0);
  assertThrows(com.eggworld.common.BusinessException.class,()->service.approve(7L));verifyNoInteractions(users,notices);
 }
 @Test void frozenAmountIsCompatibleWithMissingValues() {
  assertEquals(0,TaskService.frozenAmountOf(null));assertEquals(0,TaskService.frozenAmountOf(new Task()));
  Task help=task("help",20);help.setReward(null);assertEquals(0,TaskService.frozenAmountOf(help));
  assertEquals(10,TaskService.frozenAmountOf(task("team",9999)));
 }
}
