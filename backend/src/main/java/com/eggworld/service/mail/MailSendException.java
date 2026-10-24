package com.eggworld.service.mail;

import lombok.Getter;

/**
 * 邮件发送失败
 * <p>
 * code 是对外建议的 HTTP 状态码：收件人地址问题=400（用户可自行修正），
 * 密钥/发信地址/模板/限流等服务端问题=500。
 * 同步场景（验证码）据此翻译成 BusinessException；异步场景（通知）只记日志。
 */
@Getter
public class MailSendException extends RuntimeException {

    private final int code;

    public MailSendException(int code, String message) {
        super(message);
        this.code = code;
    }
}
