package com.eggworld.service;
import com.eggworld.config.AppProperties; import com.eggworld.dto.*; import com.eggworld.entity.*; import com.eggworld.mapper.*;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.junit.jupiter.api.*; import org.junit.jupiter.params.ParameterizedTest; import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*; import static org.mockito.Mockito.*; import static org.mockito.ArgumentMatchers.*;
class TaskQueryBudgetTest {
    UserMapper users=mock(UserMapper.class); TaskClaimMapper claims=mock(TaskClaimMapper.class);
    TaskService service=new TaskService(mock(TaskMapper.class),claims,mock(TaskRevisionMapper.class),users,
            mock(PointService.class),mock(InviteService.class),mock(NotificationService.class),mock(ChatGroupService.class),new AppProperties());
    Task task(long id) { Task t=new Task(); t.setId(id); t.setPublisherId(id); t.setContact("private-fixture"); return t; }
    @ParameterizedTest @ValueSource(ints={20,50,100}) void taskPageUsesBoundedBatchReads(int size) {
        List<Task> tasks=new ArrayList<>(); for(long i=1;i<=size;i++)tasks.add(task(i));
        Page<Task> page=new Page<>(1,size,size); page.setRecords(tasks);
        Page<TaskVO> output=ReflectionTestUtils.invokeMethod(service,"toTaskVOPage",page,null);
        assertEquals(size,output.getRecords().size());
        verify(users,never()).selectById(anyLong()); verify(claims,never()).selectCount(any());
        verify(users,times(1)).selectBatchIds(anyCollection());
    }
    @Test void hiddenContactCannotLeakThroughNestedTask() {
        Task t=task(1); TaskVO vo=service.buildVO(t,null);
        assertNull(vo.getContact()); assertNull(vo.getTask().getContact());
        assertEquals("private-fixture",t.getContact(),"组装视图不能修改持久化实体");
    }

    @Test void listDefaultsMissingCountsToZeroAndKeepsPendingContactHidden() {
        Task t=task(1); t.setPublisherId(99L);
        Page<Task> page=new Page<>(1,1,1); page.setRecords(List.of(t));
        TaskClaim mine=new TaskClaim();
        mine.setTaskId(1L); mine.setClaimerId(7L); mine.setStatus("pending_pairing");
        when(claims.selectList(any())).thenReturn(List.of(mine));

        Page<TaskVO> output=ReflectionTestUtils.invokeMethod(service,"toTaskVOPage",page,7L);
        TaskVO vo=output.getRecords().get(0);

        assertEquals(0,vo.getClaimCount());
        assertEquals(0,vo.getMemberCount());
        assertEquals("pending_pairing",vo.getMyClaimStatus());
        assertNull(vo.getContact());
        assertNull(vo.getTask().getContact());
        assertEquals("private-fixture",t.getContact(),"列表脱敏不能污染持久化实体");
    }

    @Test void listShowsPairedContactAndPublisherSelectedStatus() {
        Task paired=task(1); paired.setPublisherId(99L);
        Task owned=task(2); owned.setPublisherId(7L);
        Page<Task> page=new Page<>(1,2,2); page.setRecords(List.of(paired,owned));

        TaskClaim mine=new TaskClaim();
        mine.setTaskId(1L); mine.setClaimerId(7L); mine.setStatus("submitted");
        TaskClaimCounts pairedCounts=new TaskClaimCounts();
        pairedCounts.setTaskId(1L); pairedCounts.setClaimCount(3L); pairedCounts.setMemberCount(2L);
        TaskClaimCounts ownedCounts=new TaskClaimCounts();
        ownedCounts.setTaskId(2L); ownedCounts.setClaimCount(4L); ownedCounts.setMemberCount(2L);
        TaskClaim completed=new TaskClaim();
        completed.setTaskId(2L); completed.setSelected(1); completed.setStatus("completed");
        TaskClaim submitted=new TaskClaim();
        submitted.setTaskId(2L); submitted.setSelected(1); submitted.setStatus("submitted");

        when(claims.countForTasks(any(),any())).thenReturn(List.of(pairedCounts,ownedCounts));
        when(claims.selectList(any())).thenReturn(List.of(mine),List.of(completed,submitted));

        Page<TaskVO> output=ReflectionTestUtils.invokeMethod(service,"toTaskVOPage",page,7L);
        TaskVO pairedVO=output.getRecords().get(0);
        TaskVO ownedVO=output.getRecords().get(1);

        assertEquals(3,pairedVO.getClaimCount());
        assertEquals(2,pairedVO.getMemberCount());
        assertEquals("submitted",pairedVO.getMyClaimStatus());
        assertEquals("private-fixture",pairedVO.getContact());
        assertEquals("private-fixture",pairedVO.getTask().getContact());
        assertEquals("submitted",ownedVO.getSelectedClaimStatus());
        assertEquals(4,ownedVO.getClaimCount());
        assertEquals(2,ownedVO.getMemberCount());
        assertEquals("private-fixture",ownedVO.getContact());
        assertEquals("private-fixture",ownedVO.getTask().getContact());
        assertEquals("private-fixture",paired.getContact());
        assertEquals("private-fixture",owned.getContact());
    }
}
