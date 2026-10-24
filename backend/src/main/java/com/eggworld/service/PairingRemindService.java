package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.service.mail.MailNotifyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 配对提醒：发布者的任务有人报名、但一直没确认配对（认领还停在 pending_pairing）时，
 * 每天汇总一封邮件提醒他，直到配对完成或任务关闭。
 * <p>
 * - 触发口径：任务 status=approved 且存在 pending_pairing 的认领记录。
 *   完全没有报名的任务不提醒（没人可选，提醒也没用）。
 * - 每人每天最多一封：站内提醒的固定文案就是去重键（见 {@link #REMIND_TEXT}），
 *   按**自然日**判断（今天已提醒过就整体跳过），邮件与站内提醒同进同退——管理员在工作台
 *   点「提醒发布者」也走这套去重。
 * - 邮件是额外触达：发送失败只记日志（{@link MailNotifyService} 内部兜底），不影响主流程。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PairingRemindService {

    /** 认领状态：已报名、还没被发布者选中 */
    public static final String PENDING_PAIRING = "pending_pairing";

    /**
     * 站内提醒文案。
     * <p>
     * 必须是**固定文案**：它同时充当「今天已提醒过」的去重键（{@link NotificationService#hasSameSince}），
     * 一旦把任务标题或数量拼进去，每天文案都会变，去重就形同虚设、一天会发好几封。
     */
    public static final String REMIND_TEXT =
            "你有任务还有报名没确认配对，到「我的任务 → 我发布的」任务卡片上确认配对，任务才能正式开始（本提醒每天最多一次）";

    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final UserMapper userMapper;
    private final NotificationService notificationService;
    private final MailNotifyService mailNotifyService;

    /**
     * 批量提醒结果，供定时任务日志与后台「提醒全部」按钮的反馈使用
     *
     * @param sent                本次实际发出提醒的发布者数
     * @param skippedToday        因今天已提醒过而跳过的发布者数（每人每天最多一封）
     * @param skippedUnavailable  因账号不可用（已注销 / 已封禁）而跳过的发布者数
     */
    public record RemindSummary(int sent, int skippedToday, int skippedUnavailable) {

        /** 本次扫描到的发布者总数（含被跳过的） */
        public int total() {
            return sent + skippedToday + skippedUnavailable;
        }
    }

    /** 每天 10:00 的定时任务入口：给所有「有报名、还没配对」的发布者各发一封汇总提醒 */
    public RemindSummary remindAll() {
        Map<Long, List<String>> byPublisher = pendingTitlesByPublisher();
        int sent = 0, skippedToday = 0, skippedUnavailable = 0;
        for (Map.Entry<Long, List<String>> entry : byPublisher.entrySet()) {
            User publisher = userMapper.selectById(entry.getKey());
            if (publisher == null || Integer.valueOf(1).equals(publisher.getBanned())) {
                skippedUnavailable++;   // 账号已注销 / 已封禁：不再发邮件
                continue;
            }
            if (remindPublisher(publisher, entry.getValue())) {
                sent++;
            } else {
                skippedToday++;
            }
        }
        return new RemindSummary(sent, skippedToday, skippedUnavailable);
    }

    /**
     * 管理员在工作台点「提醒全部待配对发布者」：给所有「有报名、还没配对」的发布者各发一封。
     * 口径与定时任务完全一致（含每人每天一封的去重），这里只把结果整理成给后台看的文案。
     *
     * @return 给后台展示的结果文案
     */
    public String remindAllForAdmin() {
        RemindSummary summary = remindAll();
        if (summary.total() == 0) {
            return "当前没有「有报名、还没确认配对」的任务，无需提醒";
        }
        StringBuilder message = new StringBuilder("已给 " + summary.sent() + " 位发布者发送配对提醒邮件");
        if (summary.skippedToday() > 0) {
            message.append("；").append(summary.skippedToday()).append(" 位今天已提醒过（跳过）");
        }
        if (summary.skippedUnavailable() > 0) {
            message.append("；").append(summary.skippedUnavailable()).append(" 位账号已注销或已封禁（跳过）");
        }
        return message.toString();
    }

    /**
     * 管理员在工作台任务列表点「提醒发布者」：提醒该任务的发布者。
     * 与定时任务共用同一套去重——当天已提醒过就只返回提示，不再发邮件。
     *
     * @return 给后台展示的结果文案
     */
    public String remindForTask(Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        if (!"approved".equals(task.getStatus())) {
            throw new BusinessException("任务已不在招募中，无需提醒配对");
        }
        if (!hasPendingPairing(taskId)) {
            throw new BusinessException("该任务当前没有待配对的报名");
        }
        User publisher = userMapper.selectById(task.getPublisherId());
        if (publisher == null) {
            throw new BusinessException(404, "发布者账号已注销，无法发送提醒");
        }
        if (Integer.valueOf(1).equals(publisher.getBanned())) {
            throw new BusinessException("发布者已被封禁，暂不发送提醒");
        }
        // 邮件内容按发布者汇总：他名下所有待配对任务一起列出，不重复发多封
        List<String> titles = pendingTitlesByPublisher().get(task.getPublisherId());
        if (titles == null || titles.isEmpty()) {
            throw new BusinessException("该任务当前没有待配对的报名");
        }
        if (!remindPublisher(publisher, titles)) {
            return "今天已经提醒过「" + publisher.getNickname() + "」，不再重复发送";
        }
        return "已给「" + publisher.getNickname() + "」发送配对提醒邮件";
    }

    /**
     * 发布者维度查「有报名、还没配对」的任务标题（新发布在前）。
     * 只有 status=approved 的任务才算在招募中：满员转 full、下架 expired 之后
     * 候选池已由 closeCandidatePool 统一收尾，不会再有 pending_pairing 记录。
     */
    private Map<Long, List<String>> pendingTitlesByPublisher() {
        List<TaskClaim> pending = taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getStatus, PENDING_PAIRING));
        if (pending.isEmpty()) {
            return Map.of();
        }
        Set<Long> taskIds = pending.stream().map(TaskClaim::getTaskId).collect(Collectors.toSet());
        List<Task> tasks = taskMapper.selectList(new LambdaQueryWrapper<Task>()
                .in(Task::getId, taskIds)
                .eq(Task::getStatus, "approved")
                .orderByDesc(Task::getCreatedAt));
        Map<Long, List<String>> byPublisher = new LinkedHashMap<>();
        for (Task task : tasks) {
            byPublisher.computeIfAbsent(task.getPublisherId(), k -> new ArrayList<>()).add(task.getTitle());
        }
        return byPublisher;
    }

    /** 该任务是否还有待配对（已报名未入选）的认领记录 */
    private boolean hasPendingPairing(Long taskId) {
        Long count = taskClaimMapper.selectCount(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getTaskId, taskId)
                .eq(TaskClaim::getStatus, PENDING_PAIRING));
        return count != null && count > 0;
    }

    /**
     * 提醒单个发布者（站内 + 邮件），返回是否真的发出了本次提醒。
     * 返回 false 表示**今天**已经提醒过，本次整体跳过。
     */
    private boolean remindPublisher(User publisher, List<String> taskTitles) {
        if (notificationService.hasSameSince(publisher.getId(), REMIND_TEXT, LocalDate.now().atStartOfDay())) {
            return false;
        }
        notificationService.notify(publisher.getId(), REMIND_TEXT, "pair");
        mailNotifyService.sendPairingRemind(publisher.getEmail(), publisher.getNickname(), taskTitles);
        return true;
    }
}
