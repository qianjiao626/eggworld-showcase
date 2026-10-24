package com.eggworld.common;

import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * 全局异常处理器
 * 统一拦截各类异常，转换为标准 Result 响应
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RateLimitException.class)
    public org.springframework.http.ResponseEntity<Result<Void>> handleRateLimit(RateLimitException e) {
        return org.springframework.http.ResponseEntity.status(429)
                .header("Retry-After", String.valueOf(e.getRetryAfterSeconds()))
                .body(Result.fail(429, e.getMessage()));
    }


    /** 业务异常：可预期的错误，按其携带的 code 返回 */
    @ExceptionHandler(BusinessException.class)
    public Result<Void> handleBusiness(BusinessException e) {
        log.warn("业务异常: {}", e.getMessage());
        return Result.fail(e.getCode(), e.getMessage());
    }

    /** 请求格式错误：非 JSON 或 JSON 解析失败 */
    @ExceptionHandler({HttpMediaTypeNotSupportedException.class, HttpMessageNotReadableException.class})
    public Result<Void> handleMediaType(Exception e) {
        log.warn("请求格式错误: {}", e.getMessage());
        return Result.badRequest("请求体格式不正确，请使用 application/json 格式发送");
    }

    /** 参数校验异常：@Valid 触发 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .orElse("参数校验失败");
        log.warn("参数校验失败: {}", msg);
        return Result.badRequest(msg);
    }

    /** 约束违反异常：路径变量/请求参数校验失败 */
    @ExceptionHandler(ConstraintViolationException.class)
    public Result<Void> handleConstraint(ConstraintViolationException e) {
        String msg = e.getConstraintViolations().stream()
                .findFirst()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .orElse("参数校验失败");
        return Result.badRequest(msg);
    }

    /**
     * 参数类型不匹配：例如 GET /api/announcements/abc 里的 id 不是数字。
     * 这类请求是客户端输入问题（400），此前落到兜底分支返回 500 并把内部异常文本回显给前端。
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public Result<Void> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        log.warn("参数类型不匹配: {}={}", e.getName(), e.getValue());
        return Result.badRequest("参数格式不正确：" + e.getName());
    }

    /** 兜底异常：未预期的错误 */
    @ExceptionHandler(Exception.class)
    public Result<Void> handleOther(Exception e) {
        log.error("未预期异常", e);
        return Result.fail(500, "服务器内部错误: " + e.getMessage());
    }
}
