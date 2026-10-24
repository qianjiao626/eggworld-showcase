package com.eggworld.common;

import lombok.Getter;

/**
 * 业务异常
 * 用于在 service 层抛出可预期的业务错误，由全局异常处理器捕获并转为 Result
 *
 * 用法：throw new BusinessException("余额不足");
 */
@Getter
public class BusinessException extends RuntimeException {
    private final int code;

    public BusinessException(String message) {
        super(message);
        this.code = 400;
    }

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }
}
