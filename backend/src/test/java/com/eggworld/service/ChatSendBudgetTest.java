package com.eggworld.service;
import com.eggworld.common.RateLimitException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class ChatSendBudgetTest {
 ChatMessageService service(){return new ChatMessageService(null,null,null,null,null,null,null,null,null,null);}
 void send(ChatMessageService s,long id){ReflectionTestUtils.invokeMethod(s,"rateLimit",id);}
 @SuppressWarnings("unchecked") Map<Long,ArrayDeque<Long>> windows(ChatMessageService s){return (Map<Long,ArrayDeque<Long>>)ReflectionTestUtils.getField(s,"sendWindows");}
 @Test void exceededBudgetUsesHttpRateLimitException(){var s=service();for(int i=0;i<3;i++)send(s,1);assertThrows(RateLimitException.class,()->send(s,1));}
 @Test void expiredSendersAreReclaimed(){var s=service();windows(s).put(1L,new ArrayDeque<>(List.of(1L)));send(s,2);assertFalse(windows(s).containsKey(1L));}
 @Test void senderStorageHasAHardCeiling(){var s=service();long now=System.currentTimeMillis();for(long i=1;i<=20000;i++)windows(s).put(i,new ArrayDeque<>(List.of(now)));assertThrows(RateLimitException.class,()->send(s,20001));assertEquals(20000,windows(s).size());}
 @Test void concurrentCallsCannotOverdraw()throws Exception{
  var s=service();var pool=Executors.newFixedThreadPool(8);var accepted=new AtomicInteger();
  try{List<Callable<Void>> tasks=new ArrayList<>();for(int i=0;i<100;i++)tasks.add(()->{try{send(s,1);accepted.incrementAndGet();}catch(RateLimitException expected){}return null;});for(var f:pool.invokeAll(tasks))f.get();assertEquals(3,accepted.get());}finally{pool.shutdownNow();}
 }
}
