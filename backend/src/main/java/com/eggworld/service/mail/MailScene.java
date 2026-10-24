package com.eggworld.service.mail;

import lombok.Getter;

/**
 * 邮件场景
 * <p>
 * 每个场景对应腾讯云 SES 控制台一个审核通过的模板（模板 ID 见 eggworld.mail.ses.templates）；
 * key 必须与控制台配置项、SES 模板用途一一对应。
 */
@Getter
public enum MailScene {

    /** 邮箱验证码（注册） */
    VERIFY_CODE("verify-code"),

    /** 有人邀请你发布教学任务 */
    INVITE_TASK("invite-task"),

    /** 你发布的任务有人报名、但还没确认配对（每天汇总一封） */
    PAIRING_REMIND("pairing-remind");

    private final String key;

    MailScene(String key) {
        this.key = key;
    }
}
