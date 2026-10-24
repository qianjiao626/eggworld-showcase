package com.eggworld.service.mail;

import com.eggworld.config.AppProperties;
import com.tencentcloudapi.common.exception.TencentCloudSDKException;
import com.tencentcloudapi.ses.v20201002.SesClient;
import com.tencentcloudapi.ses.v20201002.models.SendEmailRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 腾讯云 SES 发信：云 API 错误码 → 可读业务提示的映射 */
class SesMailClientTest {

    private AppProperties configuredProps() {
        AppProperties props = new AppProperties();
        props.getMail().setFromName("蛋蛋世界");
        props.getMail().setFromAddress("noreply@example.com");
        props.getMail().getSes().setSecretId("AKIDtest");
        props.getMail().getSes().setSecretKey("secret");
        props.getMail().getSes().getTemplates().put(MailScene.VERIFY_CODE.getKey(), 100091L);
        return props;
    }

    /**
     * 让底层 SDK 客户端抛出指定错误码的异常。
     * 注意：腾讯云 SDK 的异常构造参数顺序是 (message, requestId, errorCode)，非常反直觉，别写反。
     */
    private SesMailClient clientThrowing(String errorCode) throws Exception {
        SesMailClient client = new SesMailClient(configuredProps());
        SesClient sesClient = mock(SesClient.class);
        when(sesClient.SendEmail(any(SendEmailRequest.class)))
                .thenThrow(new TencentCloudSDKException("stubbed", "", errorCode));
        ReflectionTestUtils.setField(client, "sesClient", sesClient);
        return client;
    }

    private MailSendException send(SesMailClient client) {
        return assertThrows(MailSendException.class, () -> client.sendTemplate(
                "user@example.test", MailScene.VERIFY_CODE, "【蛋蛋世界】邮箱验证码", "code", "123456"));
    }

    @Test void recipientErrorIsReportedAs400() throws Exception {
        MailSendException e = send(clientThrowing("FailedOperation.IncorrectEmail"));
        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("该邮箱不存在"));
    }

    @Test void illegalAddressIsReportedAs400() throws Exception {
        assertEquals(400, send(clientThrowing("InvalidParameterValue.IllegalEmailAddress")).getCode());
    }

    @Test void unapprovedTemplateIsReportedAsConfigError() throws Exception {
        MailSendException e = send(clientThrowing("OperationDenied.TemplateStatusError"));
        assertEquals(500, e.getCode());
        assertTrue(e.getMessage().contains("配置异常"));
    }

    @Test void badSecretIsReportedAsConfigError() throws Exception {
        MailSendException e = send(clientThrowing("AuthFailure.SecretIdNotFound"));
        assertEquals(500, e.getCode());
        assertTrue(e.getMessage().contains("配置异常"));
    }

    @Test void rateLimitAsksToRetryLater() throws Exception {
        MailSendException e = send(clientThrowing("FailedOperation.FrequencyLimit"));
        assertEquals(500, e.getCode());
        assertTrue(e.getMessage().contains("稍后重试"));
    }

    @Test void unexpectedErrorStaysGeneric() throws Exception {
        MailSendException e = send(clientThrowing("InternalError"));
        assertEquals(500, e.getCode());
        assertEquals("邮件服务暂时不可用，请稍后重试", e.getMessage());
    }

    /** 变量值里的引号与换行必须转义，否则 TemplateData 不是合法 JSON */
    @Test void templateDataIsEscapedAsJson() throws Exception {
        SesMailClient client = new SesMailClient(configuredProps());
        SesClient sesClient = mock(SesClient.class);
        ReflectionTestUtils.setField(client, "sesClient", sesClient);

        client.sendTemplate("to@example.test", MailScene.VERIFY_CODE, "主题", "code", "a\"b\nc");

        ArgumentCaptor<SendEmailRequest> captor = ArgumentCaptor.forClass(SendEmailRequest.class);
        verify(sesClient).SendEmail(captor.capture());
        assertEquals("{\"code\":\"a\\\"b\\nc\"}", captor.getValue().getTemplate().getTemplateData());
    }

    /** 多变量模板：每个变量都要进 TemplateData，且转义同样正确（邀请通知用 inviterName + skillList） */
    @Test void multiVariableTemplateDataIsEscapedAsJson() throws Exception {
        SesMailClient client = new SesMailClient(configuredProps());
        SesClient sesClient = mock(SesClient.class);
        ReflectionTestUtils.setField(client, "sesClient", sesClient);

        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("inviterName", "张\"三");
        vars.put("skillList", "高数、英语");

        client.sendTemplate("to@example.test", MailScene.INVITE_TASK, "主题", vars);

        ArgumentCaptor<SendEmailRequest> captor = ArgumentCaptor.forClass(SendEmailRequest.class);
        verify(sesClient).SendEmail(captor.capture());
        assertEquals("{\"inviterName\":\"张\\\"三\",\"skillList\":\"高数、英语\"}",
                captor.getValue().getTemplate().getTemplateData());
    }

    @Test void missingCredentialsMeansNotConfigured() {
        assertFalse(new SesMailClient(new AppProperties()).isConfigured());
    }

    @Test void placeholderCredentialsCountAsNotConfigured() {
        AppProperties props = configuredProps();
        props.getMail().getSes().setSecretId("your-secret-id");
        assertFalse(new SesMailClient(props).isConfigured());
    }
}
