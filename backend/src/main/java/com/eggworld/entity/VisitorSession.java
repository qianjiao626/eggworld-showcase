package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 访客会话实体，对应表 visitor_sessions
 * 追踪所有访客（含匿名）的会话信息，供管理员看板 DAU/留存/时段/会话时长分析。
 */
@Data
@TableName("visitor_sessions")
public class VisitorSession {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 前端生成的会话标识（UUID） */
    private String sessionId;

    /** 访客标识（localStorage 持久化 UUID，跨会话不变） */
    private String visitorId;

    /** 登录用户 ID，匿名访客为 NULL */
    private Long userId;

    /** 会话开始时间 */
    private LocalDateTime startedAt;

    /** 最后活跃时间（心跳更新） */
    private LocalDateTime lastActiveAt;

    /** 本次会话浏览页数 */
    private Integer pageCount;

    /** 来源页（首次进入的 document.referrer） */
    private String referrer;

    /** 设备类型：mobile / desktop / tablet */
    private String uaDevice;

    /** 是否首次访问（基于 localStorage 标记） */
    private Integer isNewVisitor;
}
