package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskRevision;
import com.eggworld.entity.User;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 教学/组队任务上线自动建群（TaskService 侧）。 */
class TaskConversationBindingTest {

 TaskMapper tasks; TaskClaimMapper claims; TaskRevisionMapper revisions; UserMapper users;
 PointService points; NotificationService notices; ChatGroupService groups; TaskService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);revisions=mock(TaskRevisionMapper.class);
  users=mock(UserMapper.class);points=mock(PointService.class);notices=mock(NotificationService.class);
  groups=mock(ChatGroupService.class);
  service=new TaskService(tasks,claims,revisions,users,points,mock(InviteService.class),notices,groups,new AppProperties());
 }

 @AfterEach void tearDown(){ UserContext.clear(); }

 /**
  * 发布者替身：经验 100 = 进阶蛋，认领人数上限 3（LevelPolicy：新手蛋 2、每升一级 +1）。
  * 本类里组队任务用 maxClaimers=3，给新用户等级会被等级校验拦下。
  */
 User publisherWithExp(){
  User u=new User();u.setId(1L);u.setNickname("发布者");u.setExp(100);return u;
 }

 Task teachPending(){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("高数辅导");
  t.setTaskType("teach");t.setStatus("pending");t.setReward(10);return t;
 }

 @Test void approveOfTeachTaskCreatesGroup(){
  when(tasks.selectById(7L)).thenReturn(teachPending());
  when(tasks.approveIfPending(7L)).thenReturn(1);
  when(users.selectById(1L)).thenReturn(publisherWithExp());
  when(groups.createTaskGroup(anyLong(),anyString(),anyString())).thenReturn(88L);

  service.approve(7L);

  verify(groups).createTaskGroup(eq(1L),eq("高数辅导"),contains("任务群"));
  verify(tasks).bindConversation(7L,88L);
 }

 @Test void approveNeverWritesTaskBackThroughUpdateById(){
  when(tasks.selectById(7L)).thenReturn(teachPending());
  when(tasks.approveIfPending(7L)).thenReturn(1);
  when(users.selectById(1L)).thenReturn(publisherWithExp());
  when(groups.createTaskGroup(anyLong(),anyString(),anyString())).thenReturn(88L);

  service.approve(7L);

  /* 内存里的 task 还是 pending 快照，走 updateById 会把 status 写回 pending、把任务重新送回审核队列 */
  verify(tasks,never()).updateById(any(Task.class));
 }

 @Test void approveOfHelpTaskDoesNotCreateGroup(){
  Task t=teachPending();t.setTaskType("help");
  when(tasks.selectById(7L)).thenReturn(t);
  when(tasks.approveIfPending(7L)).thenReturn(1);
  when(users.selectById(1L)).thenReturn(publisherWithExp());

  service.approve(7L);

  verify(groups,never()).createTaskGroup(anyLong(),anyString(),anyString());
  verify(tasks,never()).bindConversation(anyLong(),anyLong());
 }

 @Test void approveOfRevisionAlsoCreatesGroup(){
  Task t=teachPending();
  TaskRevision rev=new TaskRevision();rev.setId(3L);rev.setTaskId(7L);
  rev.setTitle("高数辅导（改）");rev.setReward(10);rev.setStatus("pending");
  when(tasks.selectById(7L)).thenReturn(t);
  when(revisions.selectOne(any())).thenReturn(rev);
  when(tasks.applyRevisionIfRevisable(eq(7L),any(TaskRevision.class))).thenReturn(1);
  when(groups.createTaskGroup(anyLong(),anyString(),anyString())).thenReturn(77L);

  service.approve(7L);

  verify(groups).createTaskGroup(eq(1L),anyString(),anyString());
 }

 @Test void moderatorPublishOfTeamTaskCreatesGroup(){
  UserContext.set(new LoginUser(1L,"admin","蛋总"));
  when(users.selectById(1L)).thenReturn(publisherWithExp());
  doAnswer(inv->{ ((Task)inv.getArgument(0)).setId(33L); return 1; }).when(tasks).insert(any(Task.class));
  when(tasks.selectCount(any())).thenReturn(0L);
  when(groups.createTaskGroup(anyLong(),anyString(),anyString())).thenReturn(99L);

  PublishTaskDTO dto=new PublishTaskDTO();
  dto.setTitle("组队刷题");dto.setTaskType("team");dto.setSkillCategory("study");
  dto.setReward(10);dto.setClaimMode("multiple");dto.setMaxClaimers(3);

  assertEquals(33L,service.publish(1L,dto).longValue());
  verify(groups).createTaskGroup(eq(1L),eq("组队刷题"),anyString());
 }

 @Test void normalUserPublishStaysPendingAndDoesNotCreateGroup(){
  when(users.selectById(1L)).thenReturn(publisherWithExp());
  doAnswer(inv->{ ((Task)inv.getArgument(0)).setId(34L); return 1; }).when(tasks).insert(any(Task.class));
  when(tasks.selectCount(any())).thenReturn(0L);

  PublishTaskDTO dto=new PublishTaskDTO();
  dto.setTitle("求带高数");dto.setTaskType("teach");dto.setSkillCategory("study");dto.setReward(10);

  assertEquals(34L,service.publish(1L,dto).longValue());
  verify(groups,never()).createTaskGroup(anyLong(),anyString(),anyString());
 }
}
