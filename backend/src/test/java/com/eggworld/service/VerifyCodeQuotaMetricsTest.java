package com.eggworld.service;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.eggworld.common.BusinessException;
import com.eggworld.common.RateLimitException;
import com.eggworld.config.AppProperties;
import com.eggworld.service.mail.MailScene;
import com.eggworld.service.mail.MailSendException;
import com.eggworld.service.mail.SesMailClient;
import org.junit.jupiter.api.*;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 本地邮件桩：只验证脱敏配额观测，不发送邮件、不开放监控 HTTP 接口。 */
class VerifyCodeQuotaMetricsTest {
    private Logger logger;
    private ListAppender<ILoggingEvent> appender;

    @BeforeEach void captureLogs() {
        logger = (Logger) LoggerFactory.getLogger(VerifyCodeService.class);
        appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
    }
    @AfterEach void releaseLogs() {
        logger.detachAppender(appender);
        appender.stop();
    }
    private SesMailClient mail() {
        SesMailClient client = mock(SesMailClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.templateIdOf(MailScene.VERIFY_CODE)).thenReturn(100091L);
        return client;
    }
    private List<String> quotaLogs() {
        return appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                .filter(s -> s.startsWith("[VERIFY_CODE_QUOTA] ")).toList();
    }

    @Test void cleanupReportsUsageAndRejectionsWithoutSensitiveLabels() {
        AppProperties props = new AppProperties();
        props.getMail().setMaxCodeEntries(2);
        props.getMail().setCodeSendsPerMinute(2);
        VerifyCodeService service = new VerifyCodeService(props, mail());
        service.sendCode("one@example.invalid");
        assertThrows(RateLimitException.class, () -> service.sendCode("one@example.invalid"));
        service.sendCode("two@example.invalid");
        assertThrows(RateLimitException.class, () -> service.sendCode("three@example.invalid"));
        props.getMail().setMaxCodeEntries(3);
        assertThrows(RateLimitException.class, () -> service.sendCode("three@example.invalid"));
        service.cleanupExpired();
        assertEquals(1, quotaLogs().size(), "活动后应有可观察的聚合配额诊断");
        String summary = quotaLogs().get(0);
        for (String field : List.of("entries=2", "capacity=3", "windowUsed=2", "windowLimit=2",
                "inFlight=0", "admittedTotal=2", "cooldownRejected=1", "capacityRejected=1", "budgetRejected=1", "sendFailures=0")) {
            assertTrue(summary.contains(field), "缺少或错误的指标: " + field);
        }
        assertFalse(summary.contains("@"), "指标不得包含邮箱维度");
        var cache = (Map<?, ?>) ReflectionTestUtils.getField(service, "cache");
        for (Object entry : cache.values()) {
            assertFalse(summary.contains((String) ReflectionTestUtils.getField(entry, "code")), "指标不得包含验证码");
        }
    }

    @Test void idleCleanupIsSilentAndActiveLogsAreBoundedToOnePerMinute() {
        VerifyCodeService service = new VerifyCodeService(new AppProperties(), mail());
        service.cleanupExpired();
        assertTrue(quotaLogs().isEmpty(), "空闲清理不刷日志");
        service.sendCode("bounded@example.invalid");
        service.cleanupExpired();
        assertEquals(1, quotaLogs().size());
        for (int i = 0; i < 100; i++) {
            assertThrows(RateLimitException.class, () -> service.sendCode("bounded@example.invalid"));
            service.cleanupExpired();
        }
        assertEquals(1, quotaLogs().size(), "攻击流量不能按每次拒绝扩张日志");
        ReflectionTestUtils.setField(service, "lastQuotaLogAt", 0L);
        service.cleanupExpired();
        assertEquals(2, quotaLogs().size());
        assertTrue(quotaLogs().get(1).contains("cooldownRejected=100"));
    }

    @Test void observationIncludesInflightFailuresAndExpiryWithoutResettingBudget() throws Exception {
        SesMailClient client = mail();
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        doAnswer(i -> {
            entered.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            throw new MailSendException(503, "isolated failure");
        }).when(client).sendTemplate(anyString(), any(), anyString(), anyString(), anyString());
        VerifyCodeService service = new VerifyCodeService(new AppProperties(), client);
        var pool = Executors.newSingleThreadExecutor();
        Future<?> sending = pool.submit(() -> assertThrows(BusinessException.class,
                () -> service.sendCode("slow@example.invalid")));
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            service.cleanupExpired();
            assertEquals(1, quotaLogs().size());
            assertTrue(quotaLogs().get(0).contains("inFlight=1"));
        } finally {
            release.countDown();
            sending.get(5, TimeUnit.SECONDS);
            pool.shutdownNow();
        }
        Object entry = ((Map<?, ?>) ReflectionTestUtils.getField(service, "cache")).get("slow@example.invalid");
        ReflectionTestUtils.setField(entry, "expireAt", 1L);
        ReflectionTestUtils.setField(entry, "sentAt", 1L);
        ReflectionTestUtils.setField(service, "lastQuotaLogAt", 0L);
        service.cleanupExpired();
        String summary = quotaLogs().get(1);
        for (String field : List.of("inFlight=0", "sendFailures=1", "expiredTotal=1", "entries=0", "windowUsed=1")) {
            assertTrue(summary.contains(field), field);
        }
    }
}
