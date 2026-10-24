package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.dto.NotificationListVO;
import com.eggworld.entity.Notification;
import com.eggworld.entity.User;
import com.eggworld.mapper.NotificationMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 通知服务：创建通知（业务动作触发）、查询列表、标记已读
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationMapper notificationMapper;
    private final UserMapper userMapper;

    /**
     * 给指定用户创建一条通知
     *
     * @param userId 接收者（可为空，空则忽略）
     * @param text   通知内容
     * @param type   类型：claim/pair/submit/confirm/cancel/review/rating/info
     */
    public void notify(Long userId, String text, String type) {
        if (userId == null) {
            return;
        }
        Notification n = new Notification();
        n.setUserId(userId);
        n.setText(text);
        n.setType(type == null || type.isBlank() ? "info" : type);
        n.setIsRead(0);
        notificationMapper.insert(n);
    }

    /**
     * 同样的文案在 withinHours 小时内已发过就跳过（返回 false）。
     * 用于定时提醒 / "催一下"这类会被反复触发的通知，避免刷屏。
     * 文案里带任务 id 与本次截止日期，所以任务重新发布后截止日期变了不会被误判为已发过。
     */
    public boolean notifyOnce(Long userId, String text, String type, int withinHours) {
        if (userId == null || hasSameWithin(userId, text, withinHours)) {
            return false;
        }
        notify(userId, text, type);
        return true;
    }

    /**
     * 同一文案在 withinHours 小时内是否已存在。
     * 除 notifyOnce 去重外，也用于「站内已通知过就不再发邮件」这类外部触达节流。
     */
    public boolean hasSameWithin(Long userId, String text, int withinHours) {
        if (userId == null) {
            return false;
        }
        Long exists = notificationMapper.selectCount(new LambdaQueryWrapper<Notification>()
                .eq(Notification::getUserId, userId)
                .eq(Notification::getText, text)
                .gt(Notification::getCreatedAt, LocalDateTime.now().minusHours(withinHours)));
        return exists != null && exists > 0;
    }

    /**
     * 指定时刻（含）之后是否已发过同样文案。
     * 供「今天已经提醒过就不再发」这类**按自然日**判断的节流使用（滚动窗口用 {@link #hasSameWithin}）。
     */
    public boolean hasSameSince(Long userId, String text, LocalDateTime since) {
        if (userId == null || since == null) {
            return false;
        }
        Long exists = notificationMapper.selectCount(new LambdaQueryWrapper<Notification>()
                .eq(Notification::getUserId, userId)
                .eq(Notification::getText, text)
                .gt(Notification::getCreatedAt, since));
        return exists != null && exists > 0;
    }

    /**
     * 通知所有主管理员（重新发布免审核直接上线这类"需要知情"的动作）
     */
    public void notifyAdmins(String text, String type) {
        List<User> admins = userMapper.selectList(new LambdaQueryWrapper<User>()
                .eq(User::getRole, "admin"));
        for (User admin : admins) {
            notify(admin.getId(), text, type);
        }
    }

    /**
     * 全站通知：给所有用户创建通知（蛋总发布官方任务等运营场景）
     */
    public void notifyAll(String text, String type) {
        List<User> users = userMapper.selectList(null);
        for (User u : users) {
            Notification n = new Notification();
            n.setUserId(u.getId());
            n.setText(text);
            n.setType(type == null || type.isBlank() ? "info" : type);
            n.setIsRead(0);
            notificationMapper.insert(n);
        }
    }

    /**
     * 查询我的通知（新到旧，分页）+ 未读数
     */
    public NotificationListVO listMine(Long userId, long page, long size) {
        Long unread = unreadCount(userId);

        Page<Notification> p = notificationMapper.selectPage(new Page<>(page, size, false),
                new LambdaQueryWrapper<Notification>()
                        .eq(Notification::getUserId, userId)
                        .orderByDesc(Notification::getCreatedAt));

        NotificationListVO vo = new NotificationListVO();
        vo.setUnread(unread);
        vo.setRecords(p.getRecords());
        return vo;
    }

    /** 角标轮询只读 count，不取正文、不做分页总数查询。 */
    public long unreadCount(Long userId) {
        Long count = notificationMapper.selectCount(new LambdaQueryWrapper<Notification>()
                .eq(Notification::getUserId, userId).eq(Notification::getIsRead, 0));
        return count == null ? 0 : count;
    }

    /**
     * 标记已读：id 为空则全部已读，否则仅标记本人该条
     */
    @Transactional
    public void markRead(Long userId, Long id) {
        if (id != null) {
            // 单条已读（校验归属，防止越权）
            notificationMapper.update(null,
                    new LambdaUpdateWrapper<Notification>()
                            .eq(Notification::getId, id)
                            .eq(Notification::getUserId, userId)
                            .set(Notification::getIsRead, 1));
        } else {
            // 全部已读
            notificationMapper.update(null,
                    new LambdaUpdateWrapper<Notification>()
                            .eq(Notification::getUserId, userId)
                            .eq(Notification::getIsRead, 0)
                            .set(Notification::getIsRead, 1));
        }
    }

    /**
     * 未读通知列表（供内部/后续轮询用）
     */
    public List<Notification> listUnread(Long userId) {
        return notificationMapper.selectList(
                new LambdaQueryWrapper<Notification>()
                        .eq(Notification::getUserId, userId)
                        .eq(Notification::getIsRead, 0)
                        .orderByDesc(Notification::getCreatedAt));
    }
}
