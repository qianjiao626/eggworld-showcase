package com.eggworld.common;

import lombok.Data;

/**
 * 统一响应体
 * 所有接口返回此结构：{ code, msg, data }
 * - code: 200 成功，400 客户端错误，401 未登录，403 无权限，500 服务端错误
 * - msg:  提示信息
 * - data: 业务数据
 */
@Data
public class Result<T> {
    private int code;
    private String msg;
    private T data;

    /** 成功响应（带数据） */
    public static <T> Result<T> ok(T data) {
        Result<T> r = new Result<>();
        r.code = 200;
        r.msg = "ok";
        r.data = data;
        return r;
    }

    /** 成功响应（无数据） */
    public static <T> Result<T> ok() {
        return ok(null);
    }

    /** 失败响应 */
    public static <T> Result<T> fail(int code, String msg) {
        Result<T> r = new Result<>();
        r.code = code;
        r.msg = msg;
        return r;
    }

    /** 400 客户端错误 */
    public static <T> Result<T> badRequest(String msg) {
        return fail(400, msg);
    }

    /** 401 未登录 */
    public static <T> Result<T> unauthorized(String msg) {
        return fail(401, msg);
    }

    /** 403 无权限 */
    public static <T> Result<T> forbidden(String msg) {
        return fail(403, msg);
    }
}
