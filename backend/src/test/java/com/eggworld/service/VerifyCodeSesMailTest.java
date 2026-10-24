package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.config.AppProperties;
import com.eggworld.service.mail.MailScene;
import com.eggworld.service.mail.MailSendException;
import com.eggworld.service.mail.SesMailClient;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 验证码发信：成功路径、降级行为与失败翻译（SES 错误码映射由 SesMailClientTest 覆盖） */
class VerifyCodeSesMailTest {

    private VerifyCodeService serviceWith(SesMailClient mailClient) {
        return new VerifyCodeService(new AppProperties(), mailClient);
    }

    /** 发信参数与验证码模板都已配置 */
    private SesMailClient configuredClient() {
        SesMailClient client = mock(SesMailClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.templateIdOf(MailScene.VERIFY_CODE)).thenReturn(100091L);
        return client;
    }

    @Test void developmentFallbackDoesNotLogEmailOrVerificationCode() {
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger)
                org.slf4j.LoggerFactory.getLogger(VerifyCodeService.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender =
                new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            for (boolean configured : new boolean[]{false, true}) {
                SesMailClient client = mock(SesMailClient.class);
                when(client.isConfigured()).thenReturn(configured);
                VerifyCodeService service = serviceWith(client);
                String email = "local@example.test";
                appender.list.clear();
                service.sendCode(email);
                Object entry = ((Map<?, ?>) ReflectionTestUtils.getField(service, "cache")).get(email);
                String code = (String) ReflectionTestUtils.getField(entry, "code");
                assertFalse(appender.list.isEmpty(), "缺少邮件配置应保留不含敏感数据的诊断提示");
                for (var event : appender.list) {
                    assertFalse(event.getFormattedMessage().contains(email), "诊断日志不得包含邮箱");
                    assertFalse(event.getFormattedMessage().contains(code), "诊断日志不得包含验证码");
                }
                verify(client, never()).sendTemplate(anyString(), any(), anyString(), anyString(), anyString());
            }
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test void sentCodeIsCachedAfterSuccessfulSend() {
        SesMailClient client = configuredClient();
        VerifyCodeService service = serviceWith(client);
        service.sendCode("local@example.test");
        verify(client).sendTemplate(eq("local@example.test"), eq(MailScene.VERIFY_CODE), anyString(), eq("code"), anyString());
        assertTrue(((Map<?, ?>) ReflectionTestUtils.getField(service, "cache")).containsKey("local@example.test"));
    }

    @Test void sendFailureIsTranslatedToBusinessException() {
        SesMailClient client = configuredClient();
        doThrow(new MailSendException(400, "该邮箱不存在或无法接收邮件，请检查邮箱地址后重试"))
                .when(client).sendTemplate(anyString(), any(), anyString(), anyString(), anyString());
        BusinessException e = assertThrows(BusinessException.class,
                () -> serviceWith(client).sendCode("bad@example.test"));
        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("该邮箱不存在"));
    }

    /** 失败保留冷却占位：同邮箱不能快速重试，修正为其他邮箱可重试 */
    @Test void failedSendKeepsCooldownWithoutBlockingCorrectedEmail() {
        SesMailClient client = configuredClient();
        doThrow(new MailSendException(400, "该邮箱不存在或无法接收邮件，请检查邮箱地址后重试"))
                .when(client).sendTemplate(eq("bad@example.test"), any(), anyString(), anyString(), anyString());
        VerifyCodeService service = serviceWith(client);
        assertThrows(BusinessException.class, () -> service.sendCode("bad@example.test"));
        assertTrue(((Map<?, ?>) ReflectionTestUtils.getField(service, "cache")).containsKey("bad@example.test"));
        assertThrows(BusinessException.class, () -> service.sendCode("bad@example.test"));
        // 修正邮箱后可立刻重试，不会被防刷拦住
        assertDoesNotThrow(() -> service.sendCode("good@example.test"));
        verify(client).sendTemplate(eq("good@example.test"), eq(MailScene.VERIFY_CODE), anyString(), eq("code"), anyString());
    }

    /** 未配置发信参数或验证码模板时降级：不发信，但验证码仍入缓存（测试通过隔离缓存验证，不靠日志取码） */
    @Test void unconfiguredSesSkipsSendingButStillCachesCode() {
        VerifyCodeService service = serviceWith(mock(SesMailClient.class));
        service.sendCode("local@example.test");
        assertTrue(((Map<?, ?>) ReflectionTestUtils.getField(service, "cache")).containsKey("local@example.test"));
    }

    /** 已配置密钥但验证码模板 ID 未配（如控制台模板还没建）时同样降级，不真发信 */
    @Test void missingVerifyTemplateSkipsSending() {
        SesMailClient client = mock(SesMailClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.templateIdOf(MailScene.VERIFY_CODE)).thenReturn(0L);
        VerifyCodeService service = serviceWith(client);
        service.sendCode("local@example.test");
        verify(client, never()).sendTemplate(anyString(), any(), anyString(), anyString(), anyString());
        assertTrue(((Map<?, ?>) ReflectionTestUtils.getField(service, "cache")).containsKey("local@example.test"));
    }
}
