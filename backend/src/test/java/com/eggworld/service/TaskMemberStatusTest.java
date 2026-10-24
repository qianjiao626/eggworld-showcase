package com.eggworld.service;

import com.eggworld.config.AppProperties;
import com.eggworld.dto.TaskVO;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.junit.jupiter.api.*;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 多人逐个确认的回归：发布者视角的 selectedClaimStatus。
 * 只要还有人「已提交待确认」就必须按 submitted 展示 —— 否则第一个人确认完，
 * 卡片上的「确认完成」按钮就消失了，剩下的人无从确认（浏览器验证时真实踩到）。
 */
class TaskMemberStatusTest {
 TaskMapper tasks; TaskClaimMapper claims; UserMapper users; TaskService service;

 @BeforeEach void setup(){
  tasks=mock(TaskMapper.class);claims=mock(TaskClaimMapper.class);users=mock(UserMapper.class);
  service=new TaskService(tasks,claims,mock(TaskRevisionMapper.class),users,mock(PointService.class),
          mock(InviteService.class),mock(NotificationService.class),mock(ChatGroupService.class),new AppProperties());
 }

 Task task(){
  Task t=new Task();t.setId(7L);t.setPublisherId(1L);t.setTaskType("help");t.setStatus("full");
  t.setReward(20);t.setClaimMode("multiple");t.setMaxClaimers(2);t.setSkillCategory("study");return t;
 }
 TaskClaim claim(long id,String status){TaskClaim c=new TaskClaim();c.setClaimerId(id);c.setStatus(status);c.setSelected(1);return c;}

 @Test void publisherStillSeesSubmittedWhenSomeoneWaitsForConfirm(){
  when(tasks.selectById(7L)).thenReturn(task());
  when(claims.selectCount(any())).thenReturn(2L);
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"completed"),claim(3L,"submitted")));
  TaskVO vo=service.getDetail(7L,1L);
  assertEquals("submitted",vo.getSelectedClaimStatus());
 }

 @Test void publisherSeesMemberStatusWhenNobodyWaitsForConfirm(){
  when(tasks.selectById(7L)).thenReturn(task());
  when(claims.selectCount(any())).thenReturn(2L);
  when(claims.selectList(any())).thenReturn(List.of(claim(2L,"in_progress"),claim(3L,"in_progress")));
  TaskVO vo=service.getDetail(7L,1L);
  assertEquals("in_progress",vo.getSelectedClaimStatus());
 }
}
