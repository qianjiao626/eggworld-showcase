package com.eggworld.controller;
import com.eggworld.common.Result;
import com.eggworld.dto.*;
import com.eggworld.entity.Task;
import com.eggworld.service.DecoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class DecoResponseAdviceTest {
 @Test void batchesEntireResponseAndNeverSerializesAnonymousIdentity()throws Exception{
  var service=mock(DecoService.class);var advice=new DecoResponseAdvice(service);
  var task=new Task();task.setPublisherId(7L);var tv=new TaskVO();tv.setTask(task);
  var comment=new ComplaintVO.Item();comment.setDecorationUserId(7L);
  var answer=new GossipPostVO.GossipAnswerVO();answer.setAuthorId(8L);
  var post=new GossipPostVO();post.setPublisherId(7L);post.setAnswers(List.of(answer));
  var d=new DecoVO();d.setAura("a-moon");when(service.loadDecos(anyCollection())).thenReturn(Map.of(7L,d,8L,d));
  advice.enrich(Result.ok(List.of(tv,comment,post)));
  verify(service,times(1)).loadDecos(argThat(ids->ids.size()==2&&ids.containsAll(List.of(7L,8L))));
  assertSame(d,tv.getPublisherDeco());assertSame(d,comment.getDeco());assertSame(d,answer.getDeco());
  assertFalse(new ObjectMapper().writeValueAsString(comment).contains("decorationUserId"));
 }
 @Test void failedDecorationLookupDoesNotBreakOriginalResponse(){
  var service=mock(DecoService.class);var advice=new DecoResponseAdvice(service);var task=new Task();task.setPublisherId(7L);var tv=new TaskVO();tv.setTask(task);var result=Result.ok(tv);
  when(service.loadDecos(anyCollection())).thenThrow(new IllegalStateException("injected-display-failure"));
  assertSame(result,assertDoesNotThrow(()->advice.beforeBodyWrite(result,null,null,null,null,null)));
 }
 @Test void errorResponsesAndUnrelatedDataDoNotQuery(){var service=mock(DecoService.class);var advice=new DecoResponseAdvice(service);advice.enrich(Result.fail(403,"denied"));advice.enrich(Result.ok("ok"));verifyNoInteractions(service);}
}
