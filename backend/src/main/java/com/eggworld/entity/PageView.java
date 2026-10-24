package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 页面浏览埋点实体，对应表 page_views
 * 仅记录已登录学生的学生端页面切页（游客与管理员不落库），
 * 供管理员工作台「页面热度榜」统计 PV / UV。
 */
@Data
@TableName("page_views")
public class PageView {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 浏览用户（当前仅登录学生，保留可空以兼容未来游客统计） */
    private Long userId;

    /** 页面标识：plaza/teamplaza/helpplaza/rankhall/gossip/blacklist/mytasks/publish/profile */
    private String pageKey;

    /** 记录时的角色：student */
    private String role;

    private LocalDateTime createdAt;
}
