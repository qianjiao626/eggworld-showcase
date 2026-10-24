package com.eggworld.service.mail;

import com.eggworld.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 通知类邮件：全局开关、缺邮箱跳过、模板缺失跳过、失败不外抛 */
class MailNotifyServiceTest {

    private AppProperties props(boolean notifyEnabled) {
        AppProperties props = new AppProperties();
        props.getMail().setNotifyEnabled(notifyEnabled);
        return props;
    }

    private SesMailClient configuredClient() {
        SesMailClient client = mock(SesMailClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.templateIdOf(MailScene.INVITE_TASK)).thenReturn(200001L);
        return client;
    }

    @Test void disabledSwitchSkipsSending() {
        SesMailClient client = configuredClient();
        new MailNotifyService(props(false), client).sendInviteTaskNotice("to@example.test", "张三", List.of("高数"));
        verifyNoInteractions(client);
    }

    @Test void blankEmailSkipsSending() {
        SesMailClient client = configuredClient();
        new MailNotifyService(props(true), client).sendInviteTaskNotice("   ", "张三", List.of("高数"));
        verify(client, never()).sendTemplate(anyString(), any(), anyString(), anyMap());
    }

    @Test void missingInviteTemplateSkipsSending() {
        SesMailClient client = mock(SesMailClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.templateIdOf(MailScene.INVITE_TASK)).thenReturn(0L);
        new MailNotifyService(props(true), client).sendInviteTaskNotice("to@example.test", "张三", List.of("高数"));
        verify(client, never()).sendTemplate(anyString(), any(), anyString(), anyMap());
    }

    /**
     * 模板变量必须是语义明确的窄字段（inviterName / skillList 各一个值），
     * 不能像旧写法那样把整句自由文本塞进一个泛化变量——那样会被 SES 模板审核拒绝。
     */
    @Test void contentCarriesInviterAndSkills() {
        SesMailClient client = configuredClient();
        new MailNotifyService(props(true), client).sendInviteTaskNotice("to@example.test", "张三", List.of("高数", "英语"));

        ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
        verify(client).sendTemplate(eq("to@example.test"), eq(MailScene.INVITE_TASK), anyString(), captor.capture());
        assertEquals("张三", captor.getValue().get("inviterName"));
        assertEquals("高数、英语", captor.getValue().get("skillList"));
        assertEquals(2, captor.getValue().size(), "只传模板里声明过的两个变量，不要多传");
    }

    /** 通知邮件是额外触达：发送失败只记日志，不能把异常抛回调用方 */
    @Test void sendFailureDoesNotPropagate() {
        SesMailClient client = configuredClient();
        doThrow(new MailSendException(500, "邮件服务暂时不可用，请稍后重试"))
                .when(client).sendTemplate(anyString(), any(), anyString(), anyMap());
        assertDoesNotThrow(() -> new MailNotifyService(props(true), client)
                .sendInviteTaskNotice("to@example.test", "张三", List.of("高数")));
    }

    // ---------- 配对提醒（任务有人报名、发布者还没选人） ----------

    private SesMailClient pairingConfiguredClient() {
        SesMailClient client = mock(SesMailClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.templateIdOf(MailScene.PAIRING_REMIND)).thenReturn(300001L);
        return client;
    }

    /** 变量只放昵称与任务标题列表两个窄字段，文案由模板里的固定正文承担 */
    @Test void pairingRemindCarriesNicknameAndTaskTitles() {
        SesMailClient client = pairingConfiguredClient();
        new MailNotifyService(props(true), client)
                .sendPairingRemind("boss@example.test", "蛋总", List.of("组队打球", "高数辅导"));

        ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
        verify(client).sendTemplate(eq("boss@example.test"), eq(MailScene.PAIRING_REMIND), anyString(),
                captor.capture());
        assertEquals("蛋总", captor.getValue().get("nickname"));
        assertEquals("组队打球、高数辅导", captor.getValue().get("taskList"));
        assertEquals(2, captor.getValue().size(), "只传模板里声明过的两个变量，不要多传");
    }

    @Test void missingPairingTemplateSkipsSending() {
        SesMailClient client = mock(SesMailClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.templateIdOf(MailScene.PAIRING_REMIND)).thenReturn(0L);
        new MailNotifyService(props(true), client)
                .sendPairingRemind("boss@example.test", "蛋总", List.of("组队打球"));
        verify(client, never()).sendTemplate(anyString(), any(), anyString(), anyMap());
    }

    /** 没有待配对任务时不该发出一封空邮件 */
    @Test void emptyTaskTitlesSkipsSending() {
        SesMailClient client = pairingConfiguredClient();
        new MailNotifyService(props(true), client).sendPairingRemind("boss@example.test", "蛋总", List.of());
        verify(client, never()).sendTemplate(anyString(), any(), anyString(), anyMap());
    }

    @Test void pairingRemindFailureDoesNotPropagate() {
        SesMailClient client = pairingConfiguredClient();
        doThrow(new MailSendException(500, "邮件服务暂时不可用，请稍后重试"))
                .when(client).sendTemplate(anyString(), any(), anyString(), anyMap());
        assertDoesNotThrow(() -> new MailNotifyService(props(true), client)
                .sendPairingRemind("boss@example.test", "蛋总", List.of("组队打球")));
    }
}
