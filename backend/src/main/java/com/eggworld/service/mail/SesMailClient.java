package com.eggworld.service.mail;

import com.eggworld.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tencentcloudapi.common.Credential;
import com.tencentcloudapi.common.exception.TencentCloudSDKException;
import com.tencentcloudapi.common.profile.ClientProfile;
import com.tencentcloudapi.common.profile.HttpProfile;
import com.tencentcloudapi.ses.v20201002.SesClient;
import com.tencentcloudapi.ses.v20201002.models.SendEmailRequest;
import com.tencentcloudapi.ses.v20201002.models.Template;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 腾讯云邮件推送 SES 发信客户端（模板发信）
 * <p>
 * 所有场景共用：场景 → 模板 ID 的映射在 eggworld.mail.ses.templates。
 * SES 仅支持模板发信（Simple 直传正文已废弃）；模板变量以 JSON 传给 TemplateData，
 * 变量名必须与控制台模板正文里的写法完全一致。
 * 模板审核要求「业务场景由固定文案承担、变量语义明确且可填充范围窄」：
 * 不要把整句自由文本塞进一个泛化变量（会以「变量可填充范围过广」被拒）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SesMailClient {

    /** SES 接口地址（固定值） */
    private static final String SES_ENDPOINT = "ses.tencentcloudapi.com";
    /** 触发类邮件：验证码、通知等即时邮件 */
    private static final long TRIGGER_TYPE = 1L;

    private static final ObjectMapper JSON = new ObjectMapper();

    private final AppProperties props;

    /** SES 客户端：首次真正发信时创建并复用（未配置发信参数时不会创建） */
    private volatile SesClient sesClient;

    /** 发信参数是否已配置（含占位符判断）；未配置时调用方应降级或跳过 */
    public boolean isConfigured() {
        AppProperties.Mail mail = props.getMail();
        AppProperties.Ses ses = mail.getSes();
        return !isBlank(mail.getFromAddress()) && !isBlank(ses.getSecretId())
                && !isBlank(ses.getSecretKey()) && !ses.getSecretId().startsWith("your-");
    }

    /** 场景对应的模板 ID；未配置返回 0 */
    public long templateIdOf(MailScene scene) {
        Long id = props.getMail().getSes().getTemplates().get(scene.getKey());
        return id == null ? 0L : id;
    }

    /**
     * 模板发信（单变量）
     *
     * @param varName  模板里的变量名（须与控制台模板一致）
     * @param varValue 变量值
     */
    public void sendTemplate(String to, MailScene scene, String subject, String varName, String varValue) {
        sendTemplate(to, scene, subject, Map.of(varName, varValue));
    }

    /**
     * 模板发信（多变量）
     *
     * @param to      收件人
     * @param scene   场景（决定模板 ID）
     * @param subject 邮件主题
     * @param vars    模板变量：key 必须与控制台模板正文里的变量名完全一致
     * @throws MailSendException 发信失败，含可读文案与建议 HTTP 码
     */
    public void sendTemplate(String to, MailScene scene, String subject, Map<String, String> vars) {
        SendEmailRequest request = new SendEmailRequest();
        // 别名与地址之间必须有一个空格，别名即控制台的「发件人别名」
        request.setFromEmailAddress(props.getMail().getFromName() + " <" + props.getMail().getFromAddress() + ">");
        request.setDestination(new String[]{to});
        request.setSubject(subject);
        Template template = new Template();
        template.setTemplateID(templateIdOf(scene));
        // TemplateData 是 JSON 字符串，走 Jackson 保证引号/换行等转义正确
        template.setTemplateData(JSON.valueToTree(vars).toString());
        request.setTemplate(template);
        request.setTriggerType(TRIGGER_TYPE);
        try {
            sesClient().SendEmail(request);
        } catch (TencentCloudSDKException e) {
            throw toMailSendException(e, to, scene);
        }
        log.info("邮件已发送至 {}（场景 {}）", to, scene.getKey());
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /** 懒创建并复用 SES 客户端：未配置密钥时不创建，避免应用启动即失败 */
    private SesClient sesClient() {
        SesClient client = sesClient;
        if (client == null) {
            synchronized (this) {
                if (sesClient == null) {
                    AppProperties.Ses ses = props.getMail().getSes();
                    HttpProfile httpProfile = new HttpProfile();
                    httpProfile.setEndpoint(SES_ENDPOINT);
                    httpProfile.setConnTimeout(ses.getConnectTimeoutSeconds());
                    httpProfile.setReadTimeout(ses.getReadTimeoutSeconds());
                    ClientProfile clientProfile = new ClientProfile();
                    clientProfile.setHttpProfile(httpProfile);
                    sesClient = new SesClient(
                            new Credential(ses.getSecretId(), ses.getSecretKey()), ses.getRegion(), clientProfile);
                }
                client = sesClient;
            }
        }
        return client;
    }

    /**
     * 云 API 异常 → 可读提示。
     * - 收件人地址不合法属用户输入问题
     * - 密钥 / 发信地址 / 模板等属服务端配置问题
     * - 限流与额度问题提示稍后重试
     * 错误码清单见 https://cloud.tencent.com/document/product/1288/51060
     */
    private MailSendException toMailSendException(TencentCloudSDKException e, String to, MailScene scene) {
        log.error("邮件发送失败：{}（场景 {}）", to, scene.getKey(), e);
        String code = e.getErrorCode() == null ? "" : e.getErrorCode();
        if (code.equals("FailedOperation.IncorrectEmail")
                || code.equals("FailedOperation.EmailAddrInBlacklist")
                || code.equals("FailedOperation.UnsupportMailType")
                || code.equals("InvalidParameterValue.IllegalEmailAddress")
                || code.equals("InvalidParameterValue.ReceiverEmailInvalid")) {
            return new MailSendException(400, "该邮箱不存在或无法接收邮件，请检查邮箱地址后重试");
        }
        if (code.startsWith("AuthFailure")
                || code.equals("FailedOperation.NotAuthenticatedSender")
                || code.equals("FailedOperation.WithOutPermission")
                || code.equals("FailedOperation.InvalidTemplateID")
                || code.equals("InvalidParameterValue.NoSuchSender")
                || code.equals("InvalidParameterValue.TemplateNotExist")
                || code.startsWith("OperationDenied.")) {
            return new MailSendException(500, "邮件服务配置异常，请联系管理员");
        }
        if (code.startsWith("RequestLimitExceeded")
                || code.equals("FailedOperation.FrequencyLimit")
                || code.equals("FailedOperation.ExceedSendLimit")
                || code.equals("FailedOperation.InsufficientQuota")
                || code.equals("FailedOperation.InsufficientBalance")) {
            return new MailSendException(500, "邮件发送过于频繁或额度不足，请稍后重试");
        }
        return new MailSendException(500, "邮件服务暂时不可用，请稍后重试");
    }
}
