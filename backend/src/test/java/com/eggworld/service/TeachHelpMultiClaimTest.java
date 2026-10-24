package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.ClaimDTO;
import com.eggworld.dto.PairDTO;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 教学 / 求助「多人认领」：
 * ① 教学：认领即入队（认领时卡名额、拉进任务群；认领时不付款，付款仍在提交完成时），不再需要发布者配对
 * ② 求助：仍是超额报名 + 发布者分批配对（报名只进候选池，入选人数才受 max_claimers 约束）
 * ③ 求助按入选人数补冻（第 1 份发布时已冻，第 2 位起每人补一份）
 * ④ 逐个确认、各自结算；确认完即收尾（未提交的入选者自动置未完成）
 * ⑤ 取消/下架按「尚未花掉的份数」退款
 */
class TeachHelpMultiClaimTest {
 TaskMapper tasks; TaskClaimMapper claims; UserMapper users; PointService points; NotificationService notices; TaskService taskService; ChatGroupService groups; ClaimService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);users=mock(UserMapper.class);
  points=mock(PointService.class);notices=mock(NotificationService.class);taskService=mock(TaskService.class);
  groups=mock(ChatGroupService.class);
  service=new ClaimService(tasks,claims,users,mock(UserCharacterMapper.class),mock(UserStatsMapper.class),
          mock(RatingMapper.class),points,notices,taskService,groups,new AppProperties());
 }

 Task task(String type,int reward,String claimMode,Integer maxClaimers){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("fixture");t.setTaskType(type);
  t.setReward(reward);t.setStatus("approved");t.setClaimMode(claimMode);t.setMaxClaimers(maxClaimers);
  t.setSkillCategory("study");t.setContact("wx-pub");return t;
 }

 TaskClaim claim(long claimerId,String status,int selected){
  TaskClaim c=new TaskClaim();c.setId(claimerId*10);c.setTaskId(7L);c.setClaimerId(claimerId);
  c.setStatus(status);c.setSelected(selected);c.setClaimerContact("wx-"+claimerId);return c;
 }

 PairDTO pick(Long... ids){
  PairDTO dto=new PairDTO();dto.setClaimerIds(List.of(ids));return dto;
 }

 /* ① 教学：认领即入队 + 入群，且认领时不付款（付款仍在提交完成时） */
 @Test void teachClaimJoinsImmediatelyWithoutPaying(){
  Task t=task("teach",20,"multiple",3);t.setConversationId(88L);
  when(tasks.selectById(7L)).thenReturn(t);
  when(claims.selectCount(any())).thenReturn(0L,0L);
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(9L)).thenReturn(50);
  when(users.selectById(anyLong())).thenReturn(new User());
  service.claim(9L,7L,new ClaimDTO());
  ArgumentCaptor<TaskClaim> cap=ArgumentCaptor.forClass(TaskClaim.class);
  verify(claims).insert(cap.capture());
  assertEquals("in_progress",cap.getValue().getStatus());
  assertEquals(1,cap.getValue().getSelected());
  verify(groups).joinIfAbsent(9L,88L);
  verify(points,never()).changeBalance(anyLong(),anyInt(),anyString(),anyString(),anyLong());
 }

 /* ①' 教学：认领后恰好满员 → 结束认领（转 full） */
 @Test void teachClaimFillingLastSlotEndsRecruiting(){
  when(tasks.selectById(7L)).thenReturn(task("teach",20,"multiple",1));
  when(claims.selectCount(any())).thenReturn(0L,0L);
  when(taskService.memberCount(7L)).thenReturn(0L,1L);        // 认领前 0 人；认领后 1 人 = 上限
  when(points.getBalance(9L)).thenReturn(50);
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(1);
  when(users.selectById(anyLong())).thenReturn(new User());
  service.claim(9L,7L,new ClaimDTO());
  verify(tasks).closeRecruitIfApproved(7L);
 }

 /* ② 求助：报名仍进候选池（入选人数在发布者配对时才卡），本次未改动 */
 @Test void helpSignupStillGoesToCandidatePool(){
  when(tasks.selectById(7L)).thenReturn(task("help",20,"multiple",2));
  when(claims.selectCount(any())).thenReturn(0L,5L);          // 查重 0 / 已有 5 人报名
  User claimer=new User();claimer.setNickname("报名者");when(users.selectById(9L)).thenReturn(claimer);
  service.claim(9L,7L,new ClaimDTO());
  ArgumentCaptor<TaskClaim> cap=ArgumentCaptor.forClass(TaskClaim.class);
  verify(claims).insert(cap.capture());
  assertEquals("pending_pairing",cap.getValue().getStatus());
  assertEquals(0,cap.getValue().getSelected());
 }

 /* ②' 教学 single：名额被占满后不再放人（认领即入队 → 第 2 个人被名额挡住） */
 @Test void singleModeStillAllowsOneClaimerOnly(){
  when(tasks.selectById(7L)).thenReturn(task("teach",20,"single",null));
  when(claims.selectCount(any())).thenReturn(0L,0L);
  when(taskService.memberCount(7L)).thenReturn(1L);           // 已有人认领并入队
  BusinessException e=assertThrows(BusinessException.class,()->service.claim(9L,7L,new ClaimDTO()));
  assertEquals("该任务名额已满（1 人），可关注发布者其他任务",e.getMessage());
  verify(claims,never()).insert(any(TaskClaim.class));
 }

 /* ② 求助分批配对：只配 1 人时任务继续招募，未选中的留在候选池 */
 @Test void partialPairingKeepsHelpRecruiting(){
  when(tasks.selectById(7L)).thenReturn(task("help",20,"multiple",3));
  TaskClaim a=claim(2L,"pending_pairing",0), b=claim(3L,"pending_pairing",0);
  when(claims.selectList(any())).thenReturn(List.of(a,b));
  when(taskService.memberCount(7L)).thenReturn(0L);
  PairDTO dto=new PairDTO();dto.setClaimerIds(List.of(2L));
  service.pair(1L,7L,dto);
  assertEquals("in_progress",a.getStatus());assertEquals(1,a.getSelected());
  assertEquals("pending_pairing",b.getStatus());                 // 候选池保留
  verify(tasks,never()).closeRecruitIfApproved(anyLong());       // 没满 → 不结束
 }

 /* ③ 求助补冻：一次选 2 人（发布时已冻第 1 份）→ 只补冻 1 份 */
 @Test void helpFreezesShortfallBySelectedCount(){
  when(tasks.selectById(7L)).thenReturn(task("help",20,"multiple",3));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"pending_pairing",0),claim(3L,"pending_pairing",0)));
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(1L)).thenReturn(100);
  service.pair(1L,7L,pick(2L,3L));
  verify(points,times(1)).changeBalance(eq(1L),eq(-20),eq("freeze"),
          argThat(s->s.contains("第 2 位完成者")),eq(7L));
 }

 /* ③ 已有 1 人入选时再选 1 人 → 补冻 1 份（总计 2 份） */
 @Test void helpFreezesOneMoreForEachExtraMember(){
  when(tasks.selectById(7L)).thenReturn(task("help",20,"multiple",3));
  when(claims.selectList(any())).thenReturn(List.of(claim(3L,"pending_pairing",0)));
  when(taskService.memberCount(7L)).thenReturn(1L);
  when(points.getBalance(1L)).thenReturn(100);
  service.pair(1L,7L,pick(3L));
  verify(points).changeBalance(eq(1L),eq(-20),eq("freeze"),argThat(s->s.contains("第 2 位完成者")),eq(7L));
 }

 /* ③' 余额不足 → 整体拒绝（不发钱、不入选） */
 @Test void helpPairingRejectedWhenBalanceInsufficient(){
  when(tasks.selectById(7L)).thenReturn(task("help",20,"multiple",3));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"pending_pairing",0),claim(3L,"pending_pairing",0)));
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(1L)).thenReturn(0);
  assertThrows(BusinessException.class,
          ()->service.pair(1L,7L,new PairDTO(){{ setClaimerIds(List.of(2L,3L)); }}));
  verify(points,never()).changeBalance(anyLong(),anyInt(),anyString(),anyString(),anyLong());
 }

 /* ② 选满 max_claimers → 结束认领（full）+ 候选池落选 */
 @Test void fillingLastSlotEndsRecruiting(){
  when(tasks.selectById(7L)).thenReturn(task("teach",20,"multiple",2));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"pending_pairing",0)));
  when(taskService.memberCount(7L)).thenReturn(1L);
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(1);
  service.pair(1L,7L,pick(2L));
  verify(tasks).closeRecruitIfApproved(7L);
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("rejected"),anyString());
 }

 /* ② 超出剩余名额被拒 */
 @Test void pairingBeyondRemainingSlotsIsRejected(){
  when(tasks.selectById(7L)).thenReturn(task("teach",20,"multiple",2));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"pending_pairing",0),claim(3L,"pending_pairing",0)));
  when(taskService.memberCount(7L)).thenReturn(1L);
  assertThrows(BusinessException.class,
          ()->service.pair(1L,7L,new PairDTO(){{ setClaimerIds(List.of(2L,3L)); }}));
 }

 /* ④ 逐个确认：求助每确认一人发一份悬赏；还有人在等确认时任务不收尾 */
 @Test void confirmMemberPaysEachHelperSeparately(){
  when(tasks.selectById(7L)).thenReturn(task("help",20,"multiple",3));
  when(claims.selectOne(any())).thenReturn(claim(2L,"submitted",1));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"submitted",1),claim(3L,"submitted",1)));
  service.confirmMember(1L,7L,2L);
  verify(points).changeBalance(eq(2L),eq(20),eq("earn"),anyString(),eq(7L));
  verify(tasks,never()).updateById(any(Task.class));             // 还有人等确认 → 任务不动
 }

 /* ④ 全部确认完 → 收尾：未提交的入选者置未完成，任务 completed */
 @Test void confirmingLastMemberSettlesTaskAndEndsLaggards(){
  when(tasks.selectById(7L)).thenReturn(task("teach",20,"multiple",3));
  TaskClaim done=claim(2L,"submitted",1), laggard=claim(3L,"in_progress",1);
  when(claims.selectOne(any())).thenReturn(done);
  when(claims.selectList(any())).thenReturn(List.of(done,laggard));
  service.confirmMember(1L,7L,2L);
  assertEquals("rejected",laggard.getStatus());                   // 一直不提交 → 未完成
  ArgumentCaptor<Task> cap=ArgumentCaptor.forClass(Task.class);
  verify(tasks).updateById(cap.capture());
  assertEquals("completed",cap.getValue().getStatus());
 }

 /* ④' 教学确认不发钱（钱在提交时各付各收），只置完成 */
 @Test void confirmMemberDoesNotPayForTeach(){
  when(tasks.selectById(7L)).thenReturn(task("teach",20,"multiple",3));
  TaskClaim done=claim(2L,"submitted",1);
  when(claims.selectOne(any())).thenReturn(done);
  when(claims.selectList(any())).thenReturn(List.of(done));
  service.confirmMember(1L,7L,2L);
  verify(points,never()).changeBalance(anyLong(),anyInt(),anyString(),anyString(),anyLong());
  verify(tasks).updateById(any(Task.class));                      // 收尾
 }

 /* ④'' 组队/官方任务不能走逐个确认 */
 @Test void confirmMemberRejectsTeamTask(){
  when(tasks.selectById(7L)).thenReturn(task("team",10,"multiple",3));
  assertThrows(BusinessException.class,()->service.confirmMember(1L,7L,2L));
 }

 /* ⑤ 取消退款份数：2 人入选、其中 1 人已完成 → 只退 1 份 */
 @Test void helpRefundUnitsExcludeCompletedOnes(){
  assertEquals(1, ClaimService.helpPendingUnits(List.of(
          claim(2L,"completed",1), claim(3L,"in_progress",1))));
 }

 @Test void helpRefundUnitsKeepFirstShareAndExcludeCompleted(){
  assertEquals(2, ClaimService.helpPendingUnits(List.of(
          claim(2L,"in_progress",1), claim(3L,"submitted",1))));      // 发布 1 份 + 补冻 1 份
  assertEquals(1, ClaimService.helpPendingUnits(List.of(claim(9L,"pending_pairing",0)))); // 只冻过发布那份
  assertEquals(2, ClaimService.helpPendingUnits(List.of(
          claim(2L,"completed",1), claim(3L,"in_progress",1), claim(4L,"in_progress",1))));
 }

 /* ⑤ 取消时按份数退（求助） */
 @Test void cancelRefundsOnlyUnspentHelpShares(){
  when(tasks.selectById(7L)).thenReturn(task("help",20,"multiple",3));
  when(claims.selectList(any())).thenReturn(List.of(
          claim(2L,"completed",1), claim(3L,"in_progress",1), claim(4L,"pending_pairing",0)));
  service.cancel(1L,7L);
  verify(points).changeBalance(eq(1L),eq(20),eq("refund"),anyString(),eq(7L));   // 只剩 1 份没花
 }
}
