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
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 组队任务招募生命周期：
 * ① 认领即入队：认领当场占名额、当场冻 10 币出资、当场拉进任务群，不再走候选池等发布者配对
 * ② 存量兼容：pair() 对改版前遗留的「待配对」记录仍可用（分批选中即入队，未选中的留在候选池）
 * ③ 已入队人数达到 max_claimers 才转 full（满员 / 结束招募）
 * ④ 发布者可主动「结束招募」提前开局（但一个搭子都没有时只能取消任务）
 * ⑤ 搭子名单只对本队成员开放（入队后双方联系方式互相可见）
 * ⑥ 招募中（approved）也能确认完成，避免搭子交完卡住
 */
class TeamRecruitLifecycleTest {
 TaskMapper tasks; TaskClaimMapper claims; UserMapper users; PointService points; NotificationService notices; TaskService taskService; ChatGroupService groups; ClaimService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);users=mock(UserMapper.class);
  points=mock(PointService.class);notices=mock(NotificationService.class);taskService=mock(TaskService.class);
  groups=mock(ChatGroupService.class);
  service=new ClaimService(tasks,claims,users,mock(UserCharacterMapper.class),mock(UserStatsMapper.class),
          mock(RatingMapper.class),points,notices,taskService,groups,new AppProperties());
 }

 Task team(int max){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("组队fixture");t.setTaskType("team");
  t.setReward(10);t.setStatus("approved");t.setClaimMode("multiple");t.setMaxClaimers(max);
  t.setSkillCategory("study");t.setContact("wx-publisher");return t;
 }

 TaskClaim claim(long claimerId,String status,int selected){
  TaskClaim c=new TaskClaim();c.setId(claimerId*10);c.setTaskId(7L);c.setClaimerId(claimerId);
  c.setStatus(status);c.setSelected(selected);c.setClaimerContact("wx-"+claimerId);return c;
 }

 /* ① 认领即入队：当场占名额、当场冻 10 币出资，记录直接是 in_progress/已入队 */
 @Test void teamClaimJoinsSquadImmediately(){
  when(tasks.selectById(7L)).thenReturn(team(3));
  when(claims.selectCount(any())).thenReturn(0L,0L);          // 查重 0 条
  when(taskService.memberCount(7L)).thenReturn(0L);           // 队内还没有人
  when(points.getBalance(9L)).thenReturn(50);                 // 够 10 币出资
  User claimer=new User();claimer.setNickname("小明");when(users.selectById(9L)).thenReturn(claimer);
  service.claim(9L,7L,new ClaimDTO());
  ArgumentCaptor<TaskClaim> cap=ArgumentCaptor.forClass(TaskClaim.class);
  verify(claims).insert(cap.capture());
  assertEquals("in_progress",cap.getValue().getStatus());
  assertEquals(1,cap.getValue().getSelected());
  verify(points).changeBalance(eq(9L),eq(-10),eq("freeze"),argThat(s->s.contains("组队任务出资")),eq(7L));
  verify(tasks,never()).updateById(any(Task.class));          // 还在招募，任务状态不动
 }

 /* ①' 认领即入群：任务上线时已建好群 → 认领当场把认领者拉进去 */
 @Test void teamClaimJoinsTaskGroupImmediately(){
  Task t=team(2);t.setConversationId(88L);
  when(tasks.selectById(7L)).thenReturn(t);
  when(claims.selectCount(any())).thenReturn(0L,0L);
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(9L)).thenReturn(50);
  when(users.selectById(anyLong())).thenReturn(new User());
  service.claim(9L,7L,new ClaimDTO());
  verify(groups).joinIfAbsent(9L,88L);
 }

 /* ①'' 认领后恰好满员 → 结束招募（与发布者配对满员共用同一收尾口径） */
 @Test void teamClaimFillingLastSlotEndsRecruit(){
  when(tasks.selectById(7L)).thenReturn(team(1));
  when(claims.selectCount(any())).thenReturn(0L,0L);
  when(taskService.memberCount(7L)).thenReturn(0L,1L);        // 认领前 0 人；认领后 1 人 = 上限
  when(points.getBalance(9L)).thenReturn(50);
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(1);
  when(users.selectById(anyLong())).thenReturn(new User());
  service.claim(9L,7L,new ClaimDTO());
  verify(tasks).closeRecruitIfApproved(7L);
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("rejected"),anyString());
 }

 /* ①''' 名额已满不再放人（先到先得 → 认领时就得卡名额，不能再超额报名） */
 @Test void teamClaimRejectedWhenSquadAlreadyFull(){
  when(tasks.selectById(7L)).thenReturn(team(2));
  when(claims.selectCount(any())).thenReturn(0L,0L);
  when(taskService.memberCount(7L)).thenReturn(2L);           // 已满
  BusinessException e=assertThrows(BusinessException.class,()->service.claim(9L,7L,new ClaimDTO()));
  assertEquals("该任务名额已满（2 人），可关注发布者其他任务",e.getMessage());
  verify(claims,never()).insert(any(TaskClaim.class));
  verifyNoInteractions(points);                               // 名额都没过，不该碰钱
 }

 /* ①'''' 出资不够 → 认领失败（不冻钱、不入队） */
 @Test void teamClaimRejectedWhenDepositInsufficient(){
  when(tasks.selectById(7L)).thenReturn(team(3));
  when(claims.selectCount(any())).thenReturn(0L,0L);
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(9L)).thenReturn(5);                  // 不足 10 币
  assertThrows(BusinessException.class,()->service.claim(9L,7L,new ClaimDTO()));
  verify(claims,never()).insert(any(TaskClaim.class));
  verify(points,never()).changeBalance(anyLong(),anyInt(),anyString(),anyString(),anyLong());
 }

 /* ② 分批配对：只配 1 个人不关闭任务，未选中的仍留在候选池 */
 @Test void pairingPartOfTeamKeepsRecruiting(){
  when(tasks.selectById(7L)).thenReturn(team(3));
  TaskClaim a=claim(2L,"pending_pairing",0), b=claim(3L,"pending_pairing",0);
  when(claims.selectList(any())).thenReturn(List.of(a,b));
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(2L)).thenReturn(50);
  PairDTO dto=new PairDTO();dto.setClaimerIds(List.of(2L));
  service.pair(1L,7L,dto);
  assertEquals("in_progress",a.getStatus());assertEquals(1,a.getSelected());
  assertEquals("pending_pairing",b.getStatus());                   // 未选中的留在候选池，可下次再选
  verify(tasks,never()).closeRecruitIfApproved(anyLong());         // 没满员 → 不结束招募
  verify(tasks,never()).updateById(any(Task.class));               // 任务状态不变，继续挂在广场
  verify(taskService,never()).closeCandidatePool(anyLong(),anyString(),anyString(),anyString());
 }

 /* ③ 配满最后一个名额才转 full，并把候选池里的人明确告知落选 */
 @Test void fillingLastSlotEndsRecruit(){
  when(tasks.selectById(7L)).thenReturn(team(2));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"pending_pairing",0),claim(3L,"pending_pairing",0)));
  when(taskService.memberCount(7L)).thenReturn(1L);     // 已入队 1 人，只剩 1 个名额
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(1);
  when(points.getBalance(3L)).thenReturn(50);
  PairDTO dto=new PairDTO();dto.setClaimerIds(List.of(3L));
  service.pair(1L,7L,dto);
  verify(tasks).closeRecruitIfApproved(7L);
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("rejected"),anyString());
  verify(notices).notify(eq(1L),argThat(s->s.contains("已招满")),eq("pair"));
 }

 /* ③' 超出剩余名额的配对整体被拒，不产生任何扣款 */
 @Test void pairingBeyondRemainingSlotsIsRejected(){
  when(tasks.selectById(7L)).thenReturn(team(2));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"pending_pairing",0),claim(3L,"pending_pairing",0)));
  when(taskService.memberCount(7L)).thenReturn(1L);
  PairDTO dto=new PairDTO();dto.setClaimerIds(List.of(2L,3L));
  assertThrows(BusinessException.class,()->service.pair(1L,7L,dto));
  verifyNoInteractions(points);
 }

 /* ④ 发布者不等满员也能结束招募 */
 @Test void publisherCanCloseRecruitBeforeFullTeam(){
  when(tasks.selectById(7L)).thenReturn(team(4));
  when(taskService.memberCount(7L)).thenReturn(2L);
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(1);
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"in_progress",1),claim(3L,"in_progress",1)));
  service.closeRecruit(1L,7L);
  verify(tasks).closeRecruitIfApproved(7L);
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("rejected"),anyString());
  verify(notices,atLeastOnce()).notify(eq(2L),anyString(),eq("pair"));
 }

 @Test void closingRecruitWithoutAnyMemberIsRejected(){
  when(tasks.selectById(7L)).thenReturn(team(4));
  when(taskService.memberCount(7L)).thenReturn(0L);
  assertThrows(BusinessException.class,()->service.closeRecruit(1L,7L));
  verify(tasks,never()).closeRecruitIfApproved(anyLong());
 }

 /* ⑤ 搭子名单：路人看不到（联系方式只对队员解锁） */
 @Test void teammatesAreVisibleToTeamMembersOnly(){
  when(tasks.selectById(7L)).thenReturn(team(2));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"in_progress",1)));
  assertThrows(BusinessException.class,()->service.teammates(99L,7L));
 }

 @Test void memberSeesOnlyOwnAndPublisherContact(){
  when(tasks.selectById(7L)).thenReturn(team(3));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"in_progress",1),claim(3L,"in_progress",1)));
  User publisher=new User();publisher.setNickname("发布者");when(users.selectById(1L)).thenReturn(publisher);
  User me=new User();me.setNickname("我");when(users.selectById(2L)).thenReturn(me);
  User other=new User();other.setNickname("另一搭子");when(users.selectById(3L)).thenReturn(other);
  Map<String,Object> result=service.teammates(2L,7L);              // 搭子（uid=2）视角
  assertEquals(2,result.get("memberCount"));
  assertEquals(Boolean.FALSE,result.get("canSeeAllContacts"));
  assertEquals("wx-publisher",((Map<?,?>)result.get("publisher")).get("contact"));   // 发布者的能看到
  List<Map<String,Object>> members=(List<Map<String,Object>>)(List<?>)result.get("members");
  assertEquals("wx-2",members.get(0).get("contact"));              // 自己的能看到
  assertEquals(Boolean.TRUE,members.get(0).get("self"));
  assertNull(members.get(1).get("contact"));                       // 其他队友的看不到（也就无法复制）
  assertEquals(Boolean.FALSE,members.get(1).get("self"));
 }

 @Test void publisherSeesEveryMemberContact(){
  when(tasks.selectById(7L)).thenReturn(team(3));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"in_progress",1),claim(3L,"in_progress",1)));
  when(users.selectById(anyLong())).thenReturn(new User());
  Map<String,Object> result=service.teammates(1L,7L);              // 发布者视角
  assertEquals(Boolean.TRUE,result.get("canSeeAllContacts"));
  List<Map<String,Object>> members=(List<Map<String,Object>>)(List<?>)result.get("members");
  assertEquals("wx-2",members.get(0).get("contact"));
  assertEquals("wx-3",members.get(1).get("contact"));
 }

 /* ⑥ 招募中（approved）且已有搭子提交 → 发布者可以确认完成，不必先点结束招募 */
 @Test void teamCanBeConfirmedWhileStillRecruiting(){
  when(tasks.selectById(7L)).thenReturn(team(4));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"submitted",1)));
  when(users.selectById(anyLong())).thenReturn(new User());
  service.confirm(1L,7L);
  ArgumentCaptor<Task> cap=ArgumentCaptor.forClass(Task.class);
  verify(tasks).updateById(cap.capture());
  assertEquals("completed",cap.getValue().getStatus());
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("rejected"),anyString());
 }

 /* ⑦ 团队提交即收尾：报名关闭（转 full），否则提交之后仍可能有人认领进来、永远停在 in_progress */
 @Test void teamSubmitClosesRecruitment(){
  when(tasks.selectById(7L)).thenReturn(team(3));
  when(claims.selectOne(any())).thenReturn(claim(2L,"in_progress",1));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"in_progress",1)));
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(1);

  service.submit(2L,7L);

  verify(tasks).closeRecruitIfApproved(7L);
  verify(taskService).closeCandidatePool(eq(7L),anyString(),eq("rejected"),anyString());
  verify(notices).notify(eq(1L),contains("请确认"),eq("submit"));
 }

 @Test void teamSubmitDoesNotRecloseAlreadyClosedRecruit(){
  // 满员/发布者已结束招募（full）时抢不到收尾权（返回 0）→ 不再重复收候选池
  when(tasks.selectById(7L)).thenReturn(team(3));
  when(claims.selectOne(any())).thenReturn(claim(2L,"in_progress",1));
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"in_progress",1)));
  when(tasks.closeRecruitIfApproved(7L)).thenReturn(0);

  service.submit(2L,7L);

  verify(taskService,never()).closeCandidatePool(anyLong(),anyString(),anyString(),anyString());
 }
}
