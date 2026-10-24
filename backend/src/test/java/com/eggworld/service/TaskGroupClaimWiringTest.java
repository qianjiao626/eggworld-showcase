package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.dto.PairDTO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import java.util.List;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 配对成功拉人进群 + 任务完成归档（ClaimService 侧）。 */
class TaskGroupClaimWiringTest {

 TaskMapper tasks; TaskClaimMapper claims; TaskService taskService; PointService points;
 ChatGroupService groups; ClaimService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);taskService=mock(TaskService.class);
  points=mock(PointService.class);groups=mock(ChatGroupService.class);
  service=new ClaimService(tasks,claims,mock(UserMapper.class),mock(UserCharacterMapper.class),
          mock(UserStatsMapper.class),mock(RatingMapper.class),points,mock(NotificationService.class),taskService,groups,new AppProperties());
 }

 Task teamApproved(){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTitle("组队刷题");
  t.setTaskType("team");t.setStatus("approved");t.setMaxClaimers(3);t.setSkillCategory("study");
  t.setConversationId(88L);return t;
 }

 @Test void pairJoinsSelectedClaimerIntoTaskGroup(){
  when(tasks.selectById(7L)).thenReturn(teamApproved());
  TaskClaim c=new TaskClaim();c.setClaimerId(2L);c.setStatus("pending_pairing");
  when(claims.selectList(any())).thenReturn(List.of(c));
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(2L)).thenReturn(1000);

  PairDTO dto=new PairDTO();dto.setClaimerIds(List.of(2L));
  service.pair(1L,7L,dto);

  verify(groups).joinIfAbsent(2L,88L);
 }

 @Test void pairWithoutGroupStillSucceeds(){
  Task t=teamApproved();t.setConversationId(null);
  when(tasks.selectById(7L)).thenReturn(t);
  TaskClaim c=new TaskClaim();c.setClaimerId(2L);c.setStatus("pending_pairing");
  when(claims.selectList(any())).thenReturn(List.of(c));
  when(taskService.memberCount(7L)).thenReturn(0L);
  when(points.getBalance(2L)).thenReturn(1000);

  PairDTO dto=new PairDTO();dto.setClaimerIds(List.of(2L));
  service.pair(1L,7L,dto);        // 没有群也要能正常配对

  verify(groups,never()).joinIfAbsent(anyLong(),anyLong());
 }

 @Test void confirmArchivesTaskGroup(){
  Task t=teamApproved();t.setStatus("in_progress");
  when(tasks.selectById(7L)).thenReturn(t);
  TaskClaim c=new TaskClaim();c.setClaimerId(2L);c.setStatus("submitted");c.setSelected(1);
  when(claims.selectList(any())).thenReturn(List.of(c));

  service.confirm(1L,7L);

  verify(groups).archive(1L,88L);
 }
}
