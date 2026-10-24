package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.EditTaskDTO;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 第二期：任务修改稿
 * ① 提交修改：仅发布者、无人认领、pending/approved 可改；pending 直接改本体，approved 走修改稿 + 回 pending 重审
 * ② 审核通过：新值写回任务上线；求助型报酬变动时补/退冻结差额
 * ③ 审核驳回：丢弃修改，任务按原内容恢复上线，原因转达发布者
 */
class TaskRevisionTest {
 TaskMapper tasks; TaskClaimMapper claims; TaskRevisionMapper revisions; UserMapper users; PointService points; NotificationService notices; TaskService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);revisions=mock(TaskRevisionMapper.class);
  users=mock(UserMapper.class);points=mock(PointService.class);notices=mock(NotificationService.class);
  service=new TaskService(tasks,claims,revisions,users,points,mock(InviteService.class),notices,mock(ChatGroupService.class),new AppProperties());
  when(claims.selectCount(any())).thenReturn(0L);
 }

 Task task(String type,String status,int reward){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("旧标题");t.setTaskType(type);t.setReward(reward);
  t.setStatus(status);t.setClaimMode("single");t.setContact("wx:old");return t;
 }

 EditTaskDTO edit(int reward){
  EditTaskDTO d=new EditTaskDTO();
  d.setTitle("新标题");d.setDescription("新描述");d.setRequirements("新要求");
  d.setSkillCategory("study");d.setSkillSub("数学");d.setReward(reward);
  d.setClaimMode("single");d.setContact("wx:new");return d;
 }

 // ---------- 提交修改 ----------

 @Test void approvedTaskCreatesRevisionAndGoesBackToPending(){
  when(tasks.selectById(7L)).thenReturn(task("teach","approved",10));
  when(tasks.markPendingForRevision(7L)).thenReturn(1);
  service.submitRevision(1L,7L,edit(20));
  ArgumentCaptor<TaskRevision> cap=ArgumentCaptor.forClass(TaskRevision.class);
  verify(revisions).insert(cap.capture());
  assertEquals("pending",cap.getValue().getStatus());
  assertEquals("新标题",cap.getValue().getTitle());
  assertEquals(20,cap.getValue().getReward());
  verify(tasks).markPendingForRevision(7L);
  verify(notices).notifyAdmins(argThat(s->s.contains("修改稿")),eq("review"));
 }

 @Test void pendingTaskIsEditedInPlaceWithoutExtraReview(){
  when(tasks.selectById(7L)).thenReturn(task("teach","pending",10));
  service.submitRevision(1L,7L,edit(20));
  verify(revisions,never()).insert(any(TaskRevision.class));
  ArgumentCaptor<Task> cap=ArgumentCaptor.forClass(Task.class);
  verify(tasks).updateById(cap.capture());
  assertEquals("新标题",cap.getValue().getTitle());
  assertEquals(20,cap.getValue().getReward());
  verify(tasks,never()).markPendingForRevision(anyLong());
 }

 /* ---------- 2026-10-07：改稿也能补充 / 替换 / 移除证明图，联系方式与发布表单对齐 ---------- */

 @Test void revisionWithoutNewImageKeepsTheExistingOne(){
  Task t=task("teach","approved",10); t.setProofImageId(42L);
  when(tasks.selectById(7L)).thenReturn(t);
  when(tasks.markPendingForRevision(7L)).thenReturn(1);
  service.submitRevision(1L,7L,edit(20));
  ArgumentCaptor<TaskRevision> cap=ArgumentCaptor.forClass(TaskRevision.class);
  verify(revisions).insert(cap.capture());
  assertEquals(42L,cap.getValue().getProofImageId(),"没选新图时沿用任务当前那张");
 }

 @Test void revisionCanReplaceTheProofImage(){
  Task t=task("teach","approved",10); t.setProofImageId(42L);
  when(tasks.selectById(7L)).thenReturn(t);
  when(tasks.markPendingForRevision(7L)).thenReturn(1);
  EditTaskDTO d=edit(20); d.setProofImageId(99L);
  service.submitRevision(1L,7L,d);
  ArgumentCaptor<TaskRevision> cap=ArgumentCaptor.forClass(TaskRevision.class);
  verify(revisions).insert(cap.capture());
  assertEquals(99L,cap.getValue().getProofImageId());
 }

 @Test void revisionCanClearTheProofImage(){
  Task t=task("teach","approved",10); t.setProofImageId(42L);
  when(tasks.selectById(7L)).thenReturn(t);
  when(tasks.markPendingForRevision(7L)).thenReturn(1);
  EditTaskDTO d=edit(20); d.setProofImageId(99L); d.setClearProofImage(true);
  service.submitRevision(1L,7L,d);
  ArgumentCaptor<TaskRevision> cap=ArgumentCaptor.forClass(TaskRevision.class);
  verify(revisions).insert(cap.capture());
  assertNull(cap.getValue().getProofImageId(),"明确移除时以「移除」为准，通过后任务没有证明图");
 }

 @Test void pendingTaskProofImageIsWrittenInPlace(){
  Task t=task("teach","pending",10); t.setProofImageId(42L);
  when(tasks.selectById(7L)).thenReturn(t);
  EditTaskDTO d=edit(20); d.setProofImageId(99L);
  service.submitRevision(1L,7L,d);
  ArgumentCaptor<Task> cap=ArgumentCaptor.forClass(Task.class);
  verify(tasks).updateById(cap.capture());
  assertEquals(99L,cap.getValue().getProofImageId(),"待审核任务直接改本体时也要把图写进去");
 }

 @Test void contactIsRequiredOnlyInTheLegacyFlow(){
  when(tasks.markPendingForRevision(7L)).thenReturn(1);
  /* 新流程（自动建群，默认）：教学 / 组队不填联系方式也能改 */
  when(tasks.selectById(7L)).thenReturn(task("teach","approved",10));
  EditTaskDTO noContact=edit(20); noContact.setContact(null);
  service.submitRevision(1L,7L,noContact);
  verify(revisions,atLeastOnce()).insert(any(TaskRevision.class));

  /* 旧流程（开关关闭）：非奖励型必须填，提示语与发布侧同口径 */
  AppProperties legacyProps=new AppProperties(); legacyProps.getFeatures().setTaskAutoGroup(false);
  TaskService legacy=new TaskService(tasks,claims,revisions,users,points,mock(InviteService.class),notices,
      mock(ChatGroupService.class),legacyProps);
  BusinessException e=assertThrows(BusinessException.class,()->legacy.submitRevision(1L,7L,noContact));
  assertTrue(e.getMessage().contains("联系方式"));

  /* 奖励型官方任务不受这条限制（与发布一致） */
  when(tasks.selectById(7L)).thenReturn(task("reward","approved",10));
  legacy.submitRevision(1L,7L,noContact);
 }

 @Test void reviseMapperWritesTheResolvedProofImage() throws Exception {
  String mapper=java.nio.file.Files.readString(
      java.nio.file.Path.of("src/main/java/com/eggworld/mapper/TaskMapper.java"));
  assertTrue(mapper.contains("proof_image_id = #{r.proofImageId}"),
      "采纳改稿时要把服务层解析后的证明图写回 tasks（否则「补充图片」会在审核通过后失效）");
 }

 @Test void claimedTaskCannotBeEdited(){  when(tasks.selectById(7L)).thenReturn(task("teach","approved",10));
  when(claims.selectCount(any())).thenReturn(1L);
  assertThrows(BusinessException.class,()->service.submitRevision(1L,7L,edit(20)));
  verify(revisions,never()).insert(any(TaskRevision.class));
 }

 @Test void otherPeoplesTaskCannotBeEdited(){
  when(tasks.selectById(7L)).thenReturn(task("teach","approved",10));
  assertThrows(BusinessException.class,()->service.submitRevision(2L,7L,edit(20)));
 }

 @Test void inProgressTaskCannotBeEdited(){
  when(tasks.selectById(7L)).thenReturn(task("teach","in_progress",10));
  assertThrows(BusinessException.class,()->service.submitRevision(1L,7L,edit(20)));
 }

 @Test void secondRevisionWhileOnePendingIsRejected(){
  when(tasks.selectById(7L)).thenReturn(task("teach","approved",10));
  when(revisions.selectOne(any())).thenReturn(new TaskRevision());
  assertThrows(BusinessException.class,()->service.submitRevision(1L,7L,edit(20)));
  verify(revisions,never()).insert(any(TaskRevision.class));
 }

 @Test void teamRewardIsForcedToDepositOnEdit(){
  when(tasks.selectById(7L)).thenReturn(task("team","approved",10));
  when(tasks.markPendingForRevision(7L)).thenReturn(1);
  service.submitRevision(1L,7L,edit(999));
  ArgumentCaptor<TaskRevision> cap=ArgumentCaptor.forClass(TaskRevision.class);
  verify(revisions).insert(cap.capture());
  assertEquals(TaskService.TEAM_DEPOSIT,cap.getValue().getReward());
 }

 @Test void multipleModeRequiresMaxClaimers(){
  when(tasks.selectById(7L)).thenReturn(task("teach","approved",10));
  EditTaskDTO d=edit(10);d.setClaimMode("multiple");d.setMaxClaimers(null);
  assertThrows(BusinessException.class,()->service.submitRevision(1L,7L,d));
 }

 // ---------- 审核通过 ----------

 @Test void approvingRevisionAppliesNewValuesAndFreezesTheDifference(){
  Task t=task("help","pending",20);
  when(tasks.selectById(7L)).thenReturn(t);
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setTaskId(7L);rev.setStatus("pending");
  rev.setTitle("新标题");rev.setReward(35);
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.applyRevisionIfRevisable(eq(7L),any())).thenReturn(1);

  service.approve(7L);

  verify(tasks).applyRevisionIfRevisable(7L,rev);
  verify(points).changeBalance(eq(1L),eq(-15),eq("freeze"),anyString(),eq(7L));   // 20 → 35 补冻 15
  verify(tasks,never()).approveIfPending(anyLong());
  assertEquals("approved",rev.getStatus());
  verify(notices).notify(eq(1L),argThat(s->s.contains("修改已通过")),eq("review"));
 }

 @Test void loweringRewardOnRevisionRefundsTheDifference(){
  Task t=task("help","pending",40);
  when(tasks.selectById(7L)).thenReturn(t);
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setStatus("pending");rev.setTitle("新标题");rev.setReward(25);
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.applyRevisionIfRevisable(eq(7L),any())).thenReturn(1);

  service.approve(7L);

  verify(points).changeBalance(eq(1L),eq(15),eq("refund"),anyString(),eq(7L));   // 40 → 25 退回 15
 }

 @Test void teachRevisionNeverTouchesCoins(){
  Task t=task("teach","pending",10);
  when(tasks.selectById(7L)).thenReturn(t);
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setStatus("pending");rev.setTitle("新标题");rev.setReward(99);
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.applyRevisionIfRevisable(eq(7L),any())).thenReturn(1);

  service.approve(7L);

  verifyNoInteractions(points);
 }

 @Test void firstTimeApprovalStillAwardsExperience(){
  when(tasks.selectById(7L)).thenReturn(task("teach","pending",10));
  when(revisions.selectOne(any())).thenReturn(null);
  when(tasks.approveIfPending(7L)).thenReturn(1);
  User publisher=new User();publisher.setId(1L);publisher.setExp(0);
  when(users.selectById(1L)).thenReturn(publisher);

  service.approve(7L);

  verify(tasks).approveIfPending(7L);
  assertEquals(TaskService.TASK_APPROVE_EXP,publisher.getExp());
 }

 // ---------- 审核驳回 ----------

 @Test void rejectingRevisionRestoresTaskAndReportsReason(){
  Task t=task("help","pending",20);
  when(tasks.selectById(7L)).thenReturn(t);
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setStatus("pending");rev.setTitle("旧标题");
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.restoreIfPending(7L)).thenReturn(1);

  service.reject(7L,"描述里有联系方式广告");

  assertEquals("rejected",rev.getStatus());
  assertEquals("描述里有联系方式广告",rev.getRejectReason());
  verify(tasks).restoreIfPending(7L);
  verify(tasks,never()).rejectIfPending(anyLong());
  verifyNoInteractions(points);   // 修改被驳回不动蛋蛋币（原内容继续有效）
  verify(notices).notify(eq(1L),argThat(s->s.contains("修改未通过")&&s.contains("描述里有联系方式广告")),eq("review"));
 }

 @Test void rejectingRevisionWithoutReasonUsesDefaultText(){
  Task t=task("teach","pending",10);
  when(tasks.selectById(7L)).thenReturn(t);
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setStatus("pending");
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.restoreIfPending(7L)).thenReturn(1);

  service.reject(7L,null);

  assertNotNull(rev.getRejectReason());
  assertFalse(rev.getRejectReason().isBlank());
 }

 @Test void lostRaceOnRevisionApprovalDoesNotTouchCoins(){
  when(tasks.selectById(7L)).thenReturn(task("help","pending",20));
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setStatus("pending");rev.setReward(35);
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.applyRevisionIfRevisable(eq(7L),any())).thenReturn(0);

  assertThrows(BusinessException.class,()->service.approve(7L));
  verifyNoInteractions(points);
 }

 // ---------- 过期任务：改了内容照样走重审，审过直接复活 ----------

 @Test void expiredTaskRevisionKeepsItOfflineWhileWaiting(){
  when(tasks.selectById(7L)).thenReturn(task("teach","expired",10));
  service.submitRevision(1L,7L,edit(20));
  ArgumentCaptor<TaskRevision> cap=ArgumentCaptor.forClass(TaskRevision.class);
  verify(revisions).insert(cap.capture());
  assertEquals("pending",cap.getValue().getStatus());
  verify(tasks,never()).markPendingForRevision(anyLong());   // 本来就在下架状态，不重复改状态
  verify(notices).notifyAdmins(argThat(s->s.contains("修改稿")),eq("review"));
 }

 @Test void approvingRevisionOfExpiredTaskBringsItBackOnline(){
  Task t=task("help","expired",20);
  when(tasks.selectById(7L)).thenReturn(t);
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setStatus("pending");rev.setTitle("新标题");rev.setReward(35);
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.applyRevisionIfRevisable(eq(7L),any())).thenReturn(1);

  service.approve(7L);

  verify(tasks).applyRevisionIfRevisable(7L,rev);
  verify(points).changeBalance(eq(1L),eq(-15),eq("freeze"),anyString(),eq(7L));
 }

 @Test void rejectingRevisionOfExpiredTaskKeepsItExpired(){
  when(tasks.selectById(7L)).thenReturn(task("teach","expired",10));
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setStatus("pending");
  when(revisions.selectOne(any())).thenReturn(rev);

  service.reject(7L,"要求写得太笼统");

  assertEquals("rejected",rev.getStatus());
  verify(tasks,never()).restoreIfPending(anyLong());   // 过期任务驳回后仍保持下架
  verify(notices).notify(eq(1L),argThat(s->s.contains("仍保持过期下架")),eq("review"));
 }

 @Test void renewIsBlockedWhileRevisionIsPending(){
  when(tasks.selectById(7L)).thenReturn(task("help","expired",20));
  when(revisions.selectOne(any())).thenReturn(new TaskRevision());

  BusinessException e=assertThrows(BusinessException.class,()->service.renewTask(1L,7L,30));

  assertTrue(e.getMessage().contains("修改稿在审核中"));
  verify(tasks,never()).renewIfExpired(anyLong(),any());
 }

 // ---------- 审核列表带修改稿（对比用） ----------

 @Test void pendingListCarriesRevisionForDiff(){
  Task t=task("teach","pending",10);t.setId(7L);
  com.baomidou.mybatisplus.extension.plugins.pagination.Page<Task> page=new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1,20);
  page.setRecords(List.of(t));page.setTotal(1);
  when(tasks.selectPage(any(),any())).thenReturn(page);
  TaskRevision rev=new TaskRevision();rev.setTaskId(7L);rev.setStatus("pending");rev.setTitle("新标题");
  when(revisions.selectList(any())).thenReturn(List.of(rev));

  var result=service.pendingTasks(1,20);

  assertEquals(1,result.getRecords().size());
  assertNotNull(result.getRecords().get(0).getPendingRevision());
  assertEquals("新标题",result.getRecords().get(0).getPendingRevision().getTitle());
 }

 // ---------- 过期任务的改稿也要进审核中心（否则谁都看不到、无法审） ----------

 @Test void expiredTaskWaitingForReviewStillShowsUpInTheReviewList(){
  when(tasks.selectPage(any(),any())).thenReturn(pageOf(task("teach","expired",10)));
  TaskRevision rev=new TaskRevision();rev.setTaskId(7L);rev.setStatus("pending");rev.setTitle("新标题");
  when(revisions.selectList(any())).thenReturn(List.of(rev));

  var result=service.pendingTasks(1,20);

  assertEquals(1,result.getRecords().size());
  assertEquals("expired",result.getRecords().get(0).getTask().getStatus());
  assertNotNull(result.getRecords().get(0).getPendingRevision(),"expired 任务的改稿要带出来才能渲染对比");
 }

 // ---------- 我的任务：驳回提示只认"最近一次审核结果" ----------

 @Test void myPublishedFlagsLatestRejectedRevisionAsHint(){
  when(tasks.selectPage(any(),any())).thenReturn(pageOf(task("teach","approved",10)));
  TaskRevision rejected=new TaskRevision();rejected.setTaskId(7L);rejected.setStatus("rejected");
  rejected.setRejectReason("要求太笼统");rejected.setReviewedAt(LocalDateTime.now());
  when(revisions.selectList(any())).thenReturn(List.of()).thenReturn(List.of(rejected));

  var vo=service.myPublished(1L,1,20).getRecords().get(0);

  assertNull(vo.getPendingRevision());
  assertNotNull(vo.getLastRejectedRevision());
  assertEquals("要求太笼统",vo.getLastRejectedRevision().getRejectReason());
 }

 @Test void newestRevisionWinsSoOldRejectionStopsShowingOnceResubmitted(){
  when(tasks.selectPage(any(),any())).thenReturn(pageOf(task("teach","approved",10)));
  TaskRevision pending=new TaskRevision();pending.setTaskId(7L);pending.setStatus("pending");pending.setTitle("新标题");
  TaskRevision rejected=new TaskRevision();rejected.setTaskId(7L);rejected.setStatus("rejected");
  rejected.setReviewedAt(LocalDateTime.now());
  when(revisions.selectList(any())).thenReturn(List.of(pending)).thenReturn(List.of(rejected));

  var vo=service.myPublished(1L,1,20).getRecords().get(0);

  assertNotNull(vo.getPendingRevision());
  assertNull(vo.getLastRejectedRevision());   // 已在审新稿，不再提上一轮驳回
 }

 @Test void latestApprovedRevisionHidesOlderRejection(){
  when(tasks.selectPage(any(),any())).thenReturn(pageOf(task("teach","approved",10)));
  TaskRevision approved=new TaskRevision();approved.setTaskId(7L);approved.setStatus("approved");
  approved.setReviewedAt(LocalDateTime.now());
  when(revisions.selectList(any())).thenReturn(List.of()).thenReturn(List.of(approved));

  var vo=service.myPublished(1L,1,20).getRecords().get(0);

  assertNull(vo.getLastRejectedRevision());   // 后来改稿通过了，驳回提示自动消失
 }

 private com.baomidou.mybatisplus.extension.plugins.pagination.Page<Task> pageOf(Task t){
  var page=new com.baomidou.mybatisplus.extension.plugins.pagination.Page<Task>(1,20);
  page.setRecords(List.of(t));page.setTotal(1);return page;
 }
}
