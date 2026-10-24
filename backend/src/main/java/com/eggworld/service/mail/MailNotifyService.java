package com.eggworld.service.mail;

import com.eggworld.config.AppProperties;
import com.eggworld.config.AsyncConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 业务通知类邮件的发送入口
 * <p>
 * 站内通知是主渠道，邮件只是额外触达：因此一律异步发送、失败只记日志，
 * 绝不影响调用方的主流程（邀请接口该成功还是成功）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailNotifyService {

    /** 邀请通知邮件主题 */
    private static final String INVITE_SUBJECT = "【蛋蛋世界】新的任务邀请";

    /** 配对提醒邮件主题 */
    private static final String PAIRING_REMIND_SUBJECT = "【蛋蛋世界】任务配对提醒";

    private final AppProperties props;
    private final SesMailClient mailClient;

    /**
     * 有人邀请你发布教学任务
     * <p>
     * 异步执行：调用方（UserService.inviteTask）写站内通知后立即返回，不等待发信结果。
     */
    @Async(AsyncConfig.MAIL_EXECUTOR)
    public void sendInviteTaskNotice(String toEmail, String inviterNickname, List<String> skills) {
        if (!props.getMail().isNotifyEnabled() || toEmail == null || toEmail.isBlank()) {
            return;
        }
        if (!mailClient.isConfigured() || mailClient.templateIdOf(MailScene.INVITE_TASK) <= 0) {
            log.debug("未配置邀请通知模板，跳过邮件通知：{}", toEmail);
            return;
        }
        /* 模板变量只放「字段级」的值，不拼整句：审核要求业务场景由模板里的固定文案承担，
           变量必须语义明确、可填充范围窄（旧写法把一整句塞进一个 content 变量，被审核拒绝） */
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("inviterName", inviterNickname);
        vars.put("skillList", String.join("、", skills));
        try {
            mailClient.sendTemplate(toEmail, MailScene.INVITE_TASK, INVITE_SUBJECT, vars);
        } catch (Exception e) {
            log.warn("邀请通知邮件发送失败：{}", toEmail, e);
        }
    }

    /**
     * 你发布的任务有人报名、但还没确认配对（每天汇总一封）
     * <p>
     * 主题与站内提醒由调用方（PairingRemindService）负责去重：本方法只负责发信。
     *
     * @param taskTitles 该发布者名下所有「有报名未配对」的任务标题
     */
    @Async(AsyncConfig.MAIL_EXECUTOR)
    public void sendPairingRemind(String toEmail, String nickname, List<String> taskTitles) {
        if (!props.getMail().isNotifyEnabled() || toEmail == null || toEmail.isBlank()) {
            return;
        }
        if (taskTitles == null || taskTitles.isEmpty()) {
            return;
        }
        if (!mailClient.isConfigured() || mailClient.templateIdOf(MailScene.PAIRING_REMIND) <= 0) {
            log.debug("未配置配对提醒模板，跳过邮件通知：{}", toEmail);
            return;
        }
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("nickname", nickname);
        vars.put("taskList", String.join("、", taskTitles));
        try {
            mailClient.sendTemplate(toEmail, MailScene.PAIRING_REMIND, PAIRING_REMIND_SUBJECT, vars);
        } catch (Exception e) {
            log.warn("配对提醒邮件发送失败：{}", toEmail, e);
        }
    }
}
