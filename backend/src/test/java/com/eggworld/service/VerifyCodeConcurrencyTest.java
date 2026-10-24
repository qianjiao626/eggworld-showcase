package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.config.AppProperties;
import com.eggworld.service.mail.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class VerifyCodeConcurrencyTest {
    private SesMailClient client() {
        SesMailClient c = mock(SesMailClient.class);
        when(c.isConfigured()).thenReturn(true);
        when(c.templateIdOf(MailScene.VERIFY_CODE)).thenReturn(1L);
        return c;
    }
    private VerifyCodeService service(SesMailClient c) {
        AppProperties p = new AppProperties();
        p.getMail().setCodeExpireMinutes(5);
        p.getMail().setCodeResendIntervalSeconds(60);
        return new VerifyCodeService(p, c);
    }
    @Test void concurrentRequestsReserveBeforeCallingMail() throws Exception {
        SesMailClient c = client(); VerifyCodeService s = service(c);
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        AtomicInteger sends = new AtomicInteger();
        doAnswer(inv -> { if (sends.incrementAndGet() == 1) {
            entered.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS));
        } return null; }).when(c).sendTemplate(anyString(), any(), anyString(), anyString(), anyString());
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> first = executor.submit(() -> s.sendCode("race@example.test"));
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertThrows(BusinessException.class, () -> s.sendCode("race@example.test"));
        } finally { release.countDown(); first.get(5, TimeUnit.SECONDS); executor.shutdownNow(); }
        assertEquals(1, sends.get());
    }
    @Test void consumingCodeDoesNotRemoveResendCooldown() {
        SesMailClient c = client(); VerifyCodeService s = service(c);
        s.sendCode("once@example.test");
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(c).sendTemplate(anyString(), any(), anyString(), anyString(), code.capture());
        s.verify("once@example.test", code.getValue());
        assertThrows(BusinessException.class, () -> s.verify("once@example.test", code.getValue()));
        assertThrows(BusinessException.class, () -> s.sendCode("once@example.test"));
    }
    @Test void failedSendCannotBeRetriedInTightLoopButOtherEmailCanProceed() {
        SesMailClient c = client(); VerifyCodeService s = service(c);
        doThrow(new MailSendException(503, "邮件暂不可用")).when(c)
                .sendTemplate(eq("fail@example.test"), any(), anyString(), anyString(), anyString());
        assertThrows(BusinessException.class, () -> s.sendCode("fail@example.test"));
        assertThrows(BusinessException.class, () -> s.sendCode("fail@example.test"));
        verify(c, times(1)).sendTemplate(eq("fail@example.test"), any(), anyString(), anyString(), anyString());
        assertDoesNotThrow(() -> s.sendCode("other@example.test"));
    }

    @Test void capacityAndGlobalSendBudgetRejectBeforeMail() {
        SesMailClient c=client();AppProperties p=new AppProperties();p.getMail().setMaxCodeEntries(2);
        VerifyCodeService s=new VerifyCodeService(p,c);s.sendCode("one@example.test");s.sendCode("two@example.test");
        assertThrows(com.eggworld.common.RateLimitException.class,()->s.sendCode("three@example.test"));
        verify(c,times(2)).sendTemplate(anyString(),any(),anyString(),anyString(),anyString());
        c=client();p=new AppProperties();p.getMail().setCodeSendsPerMinute(1);
        VerifyCodeService budgeted=new VerifyCodeService(p,c);budgeted.sendCode("one@example.test");
        assertThrows(com.eggworld.common.RateLimitException.class,()->budgeted.sendCode("two@example.test"));
        verify(c,times(1)).sendTemplate(anyString(),any(),anyString(),anyString(),anyString());
    }
    @Test void expiredEntriesAreReclaimedWithoutSendingRealMail() {
        SesMailClient c=client();AppProperties p=new AppProperties();p.getMail().setMaxCodeEntries(1);
        VerifyCodeService s=new VerifyCodeService(p,c);s.sendCode("expired@example.test");
        var cache=(java.util.Map<?,?>)org.springframework.test.util.ReflectionTestUtils.getField(s,"cache");
        Object entry=cache.get("expired@example.test");
        org.springframework.test.util.ReflectionTestUtils.setField(entry,"expireAt",1L);
        org.springframework.test.util.ReflectionTestUtils.setField(entry,"sentAt",1L);
        s.cleanupExpired();assertTrue(cache.isEmpty());assertDoesNotThrow(()->s.sendCode("new@example.test"));
    }
    @Test void sameCodeCanBeConsumedOnlyOnceConcurrently()throws Exception {
        SesMailClient c=client();VerifyCodeService s=service(c);s.sendCode("consume@example.test");
        var code=ArgumentCaptor.forClass(String.class);verify(c).sendTemplate(anyString(),any(),anyString(),anyString(),code.capture());
        var pool=Executors.newFixedThreadPool(8);var accepted=new AtomicInteger();
        try{var tasks=new java.util.ArrayList<Callable<Void>>();for(int i=0;i<50;i++)tasks.add(()->{try{s.verify("consume@example.test",code.getValue());accepted.incrementAndGet();}catch(BusinessException expected){}return null;});
            for(var f:pool.invokeAll(tasks))f.get();assertEquals(1,accepted.get());
        }finally{pool.shutdownNow();}
    }
    @Test void slowMailboxDoesNotBlockOtherMailboxes()throws Exception {
        SesMailClient c=client();VerifyCodeService s=service(c);CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        doAnswer(i->{entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));return null;}).when(c).sendTemplate(eq("slow@example.test"),any(),anyString(),anyString(),anyString());
        var pool=Executors.newSingleThreadExecutor();var first=pool.submit(()->s.sendCode("slow@example.test"));
        try{assertTrue(entered.await(5,TimeUnit.SECONDS));s.sendCode("fast@example.test");verify(c).sendTemplate(eq("fast@example.test"),any(),anyString(),anyString(),anyString());}
        finally{release.countDown();first.get(5,TimeUnit.SECONDS);pool.shutdownNow();}
    }
}
