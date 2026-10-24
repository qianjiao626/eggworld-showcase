package com.eggworld.common;

import lombok.Getter;

/** 可预期的资源保护，HTTP 层必须返回 429 而不是仅在 JSON 中写错误码。 */
@Getter
public class RateLimitException extends BusinessException {
    private final long retryAfterSeconds;
    public RateLimitException(long retryAfterSeconds) {
        super(429, "请求过于频繁，请 " + Math.max(1, retryAfterSeconds) + " 秒后重试");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }
}
