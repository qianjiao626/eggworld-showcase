package com.eggworld.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.eggworld.common.Result;
import com.eggworld.dto.*;
import com.eggworld.service.DecoService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.*;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
import java.util.*;
import java.util.function.Consumer;

/** 装饰属于展示数据：先收集整个响应的用户 ID，再一次查询后回填，禁止循环查库。
 * 仅处理明确列出的公开 VO，不反射扫描实体、不输出吐槽用户 ID、不从通知文字猜用户。
 */
@lombok.extern.slf4j.Slf4j
@RestControllerAdvice(basePackages="com.eggworld.controller")
@RequiredArgsConstructor
public class DecoResponseAdvice implements ResponseBodyAdvice<Object> {
 private final DecoService decoService;
 public boolean supports(MethodParameter p, Class<? extends HttpMessageConverter<?>> c){return true;}
 public Object beforeBodyWrite(Object body,MethodParameter p,MediaType m,Class<? extends HttpMessageConverter<?>> c,ServerHttpRequest req,ServerHttpResponse res){
  try { enrich(body); } catch (Exception e) { log.warn("Decoration enrichment failed; retaining original response",e); }
  return body;
 }
 public void enrich(Object body){
  Map<Long,List<Consumer<DecoVO>>> targets=new LinkedHashMap<>(); collect(body,targets);
  if(targets.isEmpty())return;
  Map<Long,DecoVO> values=decoService.loadDecos(targets.keySet());
  targets.forEach((id,setters)->setters.forEach(setter->setter.accept(values.get(id))));
 }
 private void bind(Map<Long,List<Consumer<DecoVO>>> t,Long id,Consumer<DecoVO> setter){
  if(id!=null)t.computeIfAbsent(id,k->new ArrayList<>()).add(setter);
 }
 @SuppressWarnings("unchecked")
 private void collect(Object o,Map<Long,List<Consumer<DecoVO>>> t){
  if(o==null)return;
  if(o instanceof Result<?> r){if(r.getCode()==200)collect(r.getData(),t);}
  else if(o instanceof IPage<?> p)collect(p.getRecords(),t);
  else if(o instanceof Collection<?> l)l.forEach(v->collect(v,t));
  else if(o instanceof TaskVO v){if(v.getTask()!=null)bind(t,v.getTask().getPublisherId(),v::setPublisherDeco);}
  else if(o instanceof GossipPostVO v){bind(t,v.getPublisherId(),v::setDeco);collect(v.getAnswers(),t);}
  else if(o instanceof GossipPostVO.GossipAnswerVO v)bind(t,v.getAuthorId(),v::setDeco);
  else if(o instanceof ComplaintVO.Item v)bind(t,v.getDecorationUserId(),v::setDeco);
  else if(o instanceof ComplaintVO.SchoolDetail v)collect(v.getComments(),t);
  else if(o instanceof InviteListVO v)collect(v.getRecords(),t);
  else if(o instanceof InviteListVO.InviteItemVO v)bind(t,v.getInviteeId(),v::setDeco);
  else if(o instanceof Map<?,?> v){
   if(v.get("claimerId") instanceof Number id){Map<String,Object> row=(Map<String,Object>)v;bind(t,id.longValue(),d->row.put("deco",d));}
  }
 }
}
