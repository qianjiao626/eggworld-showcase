package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.RateTaskDTO;
import com.eggworld.dto.GivenRatingVO;
import com.eggworld.dto.RatingListVO;
import com.eggworld.entity.Rating;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.entity.UserStats;
import com.eggworld.mapper.RatingMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserStatsMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 评价服务：任务互评（发布者 ↔ 认领者）
 * - 提交评价：任务完成后参与双方互评，防重复（数据库唯一约束兜底）
 * - 查询评价：返回我收到的评价列表 + 均分，并同步更新口碑值
 * - 组队结算：完成后保留 3 天互评期，到期退 80% 出资，评价仅影响口碑
 */
@Service
@RequiredArgsConstructor
public class RatingService {

    private final RatingMapper ratingMapper;
    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final UserMapper userMapper;
    private final UserStatsMapper userStatsMapper;
    private final PointService pointService;
    private final NotificationService notificationService;

    /** 通用评价窗口：教学/求助任务完成后 N 天内可评价，逾期锁定（组队走自身的 3 天互评期） */
    public static final int GENERAL_RATE_WINDOW_DAYS = 7;

    /**
     * 评价方向策略（单一数据源，前后端保持一致）：
     * - teach 教学：认领者(学员) 评价 发布者(导师)，发布者不可反向评
     * - help 求助：发布者(求助人) 评价 认领者(帮助者)，认领者不可反向评
     * - team 组队：参与方两两互评
     * - reward 官方任务：不参与互评（前端入口已拦截，此处兜底）
     */
    public enum RatePolicy {
        CLAIMER_TO_PUBLISHER, PUBLISHER_TO_CLAIMER, ALL_TO_ALL, NONE;

        /** 由任务类型推导评价策略：新增任务类型只需在此登记一行 */
        public static RatePolicy of(String taskType) {
            if ("teach".equals(taskType)) {
                return CLAIMER_TO_PUBLISHER;
            }
            if ("help".equals(taskType)) {
                return PUBLISHER_TO_CLAIMER;
            }
            if ("team".equals(taskType)) {
                return ALL_TO_ALL;
            }
            return NONE; // reward 及其它类型不参与互评
        }
    }

    /**
     * 校验评价方向是否符合任务类型的策略，返回 null 表示允许，否则返回拒绝原因
     */
    private String checkDirection(Task task, Long raterId, Long rateeId) {
        boolean raterIsPublisher = task.getPublisherId().equals(raterId);
        boolean rateeIsPublisher = task.getPublisherId().equals(rateeId);
        switch (RatePolicy.of(task.getTaskType())) {
            case CLAIMER_TO_PUBLISHER:
                if (raterIsPublisher) {
                    return "教学任务由认领者（学员）评价发布者（导师），发布者不能评价认领者";
                }
                if (!rateeIsPublisher) {
                    return "教学任务只能评价发布者（导师）";
                }
                break;
            case PUBLISHER_TO_CLAIMER:
                if (!raterIsPublisher) {
                    return "求助任务由发布者（求助人）评价帮助者（认领者），认领者不能评价发布者";
                }
                if (rateeIsPublisher) {
                    return "求助任务只能评价帮助者（认领者）";
                }
                break;
            case ALL_TO_ALL:
                break; // 全员互评，无需方向限制
            case NONE:
            default:
                return "该任务类型不参与互评";
        }
        return null;
    }

    /**
     * 提交评价（文档 6.3：同一任务同一对评价者→被评价者只能评一次）
     * 组队互评：仅评价期内可评（完成后 3 天），结算后锁定
     */
    @Transactional
    public void rate(Long raterId, Long taskId, RateTaskDTO dto) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        if (!"completed".equals(task.getStatus())) {
            throw new BusinessException("任务完成后才能评价");
        }
        // 评价窗口：统一"完成后限时评价，逾期锁定"
        // - 组队：沿用 rateDeadline(3天互评期)，结算后直接锁定
        // - 教学/求助：完成后 7 天内可评（updated_at 由确认完成时刷新）
        if (RatePolicy.of(task.getTaskType()) == RatePolicy.NONE) {
            throw new BusinessException("该任务类型不参与互评");
        }
        if ("team".equals(task.getTaskType())) {
            if (task.getSettled() != null && task.getSettled() == 1) {
                throw new BusinessException("该任务已结算，无法再评价");
            }
            if (task.getRateDeadline() != null && LocalDateTime.now().isAfter(task.getRateDeadline())) {
                throw new BusinessException("互评期已结束，无法再评价");
            }
        } else if (task.getUpdatedAt() != null
                && LocalDateTime.now().isAfter(task.getUpdatedAt().plusDays(GENERAL_RATE_WINDOW_DAYS))) {
            throw new BusinessException("评价窗口已结束（任务完成后 " + GENERAL_RATE_WINDOW_DAYS + " 天内可评价）");
        }

        // 任务参与者：发布者 + 被选中的认领者
        List<Long> participantIds = new ArrayList<>();
        participantIds.add(task.getPublisherId());
        taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getTaskId, taskId)
                        .eq(TaskClaim::getSelected, 1))
                .forEach(c -> participantIds.add(c.getClaimerId()));

        // 评价者必须是参与者
        if (!participantIds.contains(raterId)) {
            throw new BusinessException(403, "只有任务参与方可评价");
        }
        // 被评价者必须是参与者且不能是自己
        if (dto.getRateeId().equals(raterId)) {
            throw new BusinessException("不能评价自己");
        }
        if (!participantIds.contains(dto.getRateeId())) {
            throw new BusinessException("被评价者不是该任务参与者");
        }

        // 方向鉴权统一收敛到 RatePolicy（单一数据源），拒绝信息直接给出
        String denyReason = checkDirection(task, raterId, dto.getRateeId());
        if (denyReason != null) {
            throw new BusinessException(denyReason);
        }

        // 防重复评价（ratings 表 uk_rating 唯一约束兜底）
        Long exists = ratingMapper.selectCount(new LambdaQueryWrapper<Rating>()
                .eq(Rating::getTaskId, taskId)
                .eq(Rating::getRaterId, raterId)
                .eq(Rating::getRateeId, dto.getRateeId()));
        if (exists > 0) {
            throw new BusinessException("你已评价过该任务");
        }

        Rating rating = new Rating();
        rating.setTaskId(taskId);
        rating.setTaskType(task.getTaskType());
        rating.setRaterId(raterId);
        rating.setRateeId(dto.getRateeId());
        rating.setScore(dto.getScore());
        rating.setComment(dto.getComment());
        rating.setRaterRole(task.getPublisherId().equals(raterId) ? "publisher" : "claimer");
        rating.setIsAuto(0);   // 用户真实评价
        rating.setVisible(1);  // 默认可见
        ratingMapper.insert(rating);

        // 通知被评价者：收到新评价
        notificationService.notify(dto.getRateeId(),
                "你在「" + task.getTitle() + "」任务中收到一条 " + dto.getScore() + " 星评价", "rating");

        // 被评价者口碑值 = 收到的评价均分
        refreshReputation(dto.getRateeId());
    }

    /**
     * 查询我收到的评价（分页），返回记录 + 均分 + 总数
     * 只含真实可见评价（visible=1 且 is_auto=0），隐藏/系统补录不计入
     */
    public RatingListVO listMine(Long userId, long page, long size) {
        Page<Rating> p = ratingMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<Rating>()
                        .eq(Rating::getRateeId, userId)
                        .eq(Rating::getVisible, 1)
                        .eq(Rating::getIsAuto, 0)
                        .orderByDesc(Rating::getCreatedAt));

        RatingListVO vo = new RatingListVO();
        vo.setCount(ratingMapper.countByRatee(userId));
        vo.setAvg(ratingMapper.avgByRatee(userId));
        vo.setRecords(p.getRecords().stream().map(r -> {
            RatingListVO.RatingItemVO item = new RatingListVO.RatingItemVO();
            item.setId(r.getId());
            item.setTaskId(r.getTaskId());
            item.setScore(r.getScore());
            item.setComment(r.getComment());
            item.setReply(r.getReply());
            item.setTaskType(r.getTaskType());
            item.setCreatedAt(r.getCreatedAt());
            User rater = userMapper.selectById(r.getRaterId());
            item.setRaterId(r.getRaterId());
            item.setRaterNickname(rater != null ? rater.getNickname() : "未知用户");
            Task t = taskMapper.selectById(r.getTaskId());
            item.setTaskTitle(t != null ? t.getTitle() : "任务已删除");
            return item;
        }).toList());
        return vo;
    }

    /** 我给出的评价（前端任务卡片"已评价"展示用，无需分页；系统补录/被隐藏的不列出） */
    public List<GivenRatingVO> listMineGiven(Long userId) {
        return ratingMapper.selectList(new LambdaQueryWrapper<Rating>()
                        .eq(Rating::getRaterId, userId)
                        .eq(Rating::getVisible, 1)
                        .eq(Rating::getIsAuto, 0)
                        .orderByDesc(Rating::getCreatedAt))
                .stream().map(r -> {
                    GivenRatingVO item = new GivenRatingVO();
                    item.setTaskId(r.getTaskId());
                    item.setScore(r.getScore());
                    item.setComment(r.getComment());
                    item.setRateeId(r.getRateeId());
                    item.setReply(r.getReply());
                    item.setCreatedAt(r.getCreatedAt());
                    User ratee = userMapper.selectById(r.getRateeId());
                    item.setRateeNickname(ratee != null ? ratee.getNickname() : "未知用户");
                    Task t = taskMapper.selectById(r.getTaskId());
                    item.setTaskTitle(t != null ? t.getTitle() : "任务已删除");
                    return item;
                }).toList();
    }

    /**
     * 被评价者回复一条收到的评价（治理补强：rater 与 ratee 只能由 ratee 回复）
     * 回复更新后不会影响评分，仅作为公开澄清展示
     */
    public void reply(Long rateeId, Long ratingId, String content) {
        if (content == null || content.isBlank()) {
            throw new BusinessException("回复内容不能为空");
        }
        if (content.length() > 200) {
            throw new BusinessException("回复最多 200 字");
        }
        Rating rating = ratingMapper.selectById(ratingId);
        if (rating == null || !Integer.valueOf(1).equals(rating.getVisible()) || !Integer.valueOf(0).equals(rating.getIsAuto())) {
            throw new BusinessException(404, "评价不存在");
        }
        if (!rating.getRateeId().equals(rateeId)) {
            throw new BusinessException(403, "只有被评价者可回复该评价");
        }
        rating.setReply(content);
        ratingMapper.updateById(rating);
    }

    /**
     * 管理后台隐藏不当评价（治理补强）：隐藏后该评价不再对外展示、不计入口碑与条数
     * 返回最新口碑快照供前端刷新
     */
    public void hideRating(Long ratingId, boolean hide) {
        Rating rating = ratingMapper.selectById(ratingId);
        if (rating == null) {
            throw new BusinessException(404, "评价不存在");
        }
        if ((hide && Integer.valueOf(1).equals(rating.getVisible()))
                || (!hide && Integer.valueOf(0).equals(rating.getVisible()))) {
            rating.setVisible(hide ? 0 : 1);
            ratingMapper.updateById(rating);
        }
        refreshReputation(rating.getRateeId());
    }

    /** 重算某用户口碑值：users.reputation 与 user_stats.reputation 同步为均分 */
    private void refreshReputation(Long userId) {
        BigDecimal avg = ratingMapper.avgByRatee(userId);

        User user = userMapper.selectById(userId);
        if (user != null) {
            user.setReputation(avg);
            userMapper.updateById(user);
        }

        UserStats stats = userStatsMapper.selectById(userId);
        if (stats != null) {
            stats.setReputation(avg);
            userStatsMapper.updateById(stats);
        } else {
            // 历史用户可能缺五维行：补齐再回填口碑，保证前端五维图能展示最新值
            stats = new UserStats();
            stats.setUserId(userId);
            stats.setKnowledge(BigDecimal.ZERO);
            stats.setSkills(BigDecimal.ZERO);
            stats.setCharm(BigDecimal.ZERO);
            stats.setMoney(BigDecimal.ZERO);
            stats.setReputation(avg);
            userStatsMapper.insert(stats);
        }
    }

    /**
     * 组队互评目标列表（GET /api/tasks/{id}/rate-targets）
     * 任务参与方（发布者 + 被选中认领者）中除自己外的可评价对象
     * 返回昵称 / 角色 / 是否已评价，前端据此生成互评入口
     */
    public List<Map<String, Object>> listRateTargets(Long viewerId, Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        if (!"team".equals(task.getTaskType())) {
            throw new BusinessException("仅组队任务支持互评");
        }
        if (!"completed".equals(task.getStatus())) {
            throw new BusinessException("任务完成后才能互评");
        }

        // 参与者：发布者 + 被选中认领者
        List<Long> participants = new ArrayList<>();
        participants.add(task.getPublisherId());
        taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getTaskId, taskId)
                        .eq(TaskClaim::getSelected, 1))
                .forEach(c -> participants.add(c.getClaimerId()));
        if (!participants.contains(viewerId)) {
            throw new BusinessException(403, "仅任务参与方可互评");
        }

        // 我已评价过的被评者集合
        Set<Long> rated = ratingMapper.selectList(new LambdaQueryWrapper<Rating>()
                        .eq(Rating::getTaskId, taskId)
                        .eq(Rating::getRaterId, viewerId))
                .stream().map(Rating::getRateeId).collect(Collectors.toSet());

        List<Map<String, Object>> targets = new ArrayList<>();
        for (Long pid : participants) {
            if (pid.equals(viewerId)) {
                continue;
            }
            User u = userMapper.selectById(pid);
            Map<String, Object> m = new HashMap<>();
            m.put("userId", pid);
            m.put("nickname", u != null ? u.getNickname() : "未知用户");
            m.put("role", task.getPublisherId().equals(pid) ? "publisher" : "claimer");
            m.put("ratedByMe", rated.contains(pid));
            targets.add(m);
        }
        return targets;
    }

    /**
     * 组队任务完成锁定 80% 退款，仍由原调度器在 3 天互评期到期后调用。
     * 真实评价仅影响口碑；条件更新前置，事务失败时连同资金流水一起回滚。
     */
    @Transactional
    public void settleTask(Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null || !"team".equals(task.getTaskType())
                || !"completed".equals(task.getStatus())
                || (task.getSettled() != null && task.getSettled() == 1)) return;
        if (taskMapper.markSettled(taskId) != 1) return;

        List<Long> participants = new ArrayList<>();
        participants.add(task.getPublisherId());
        /* 只退给「仍在参与中」的成员（in_progress/submitted/completed）：被取消 / 未入选的历史记录
           （例如上一轮超期下架后残留的 selected=1）不能再退一次 8 币，否则就是凭空发币。
           注意不能只看 completed —— 组队「一人提交=全队提交」的空档里后进队的搭子会停在 in_progress，
           那也是真出过资的人，漏掉他们就等于吞钱。 */
        taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getTaskId, taskId).eq(TaskClaim::getSelected, 1))
                .stream()
                .filter(c -> TaskService.SELECTED_STATUSES.contains(c.getStatus()))
                .forEach(c -> participants.add(c.getClaimerId()));
        int refund = (int) Math.round(TaskService.TEAM_DEPOSIT * TaskService.TEAM_REFUND_RATIO);
        for (Long pid : participants) {
            pointService.changeBalance(pid, refund, "refund",
                    "组队任务完成，退还 80% 出资：" + task.getTitle(), taskId);
            notificationService.notify(pid,
                    "你在「" + task.getTitle() + "」的组队任务已完成，已退还 " + refund
                            + " 蛋蛋币（出资 " + TaskService.TEAM_DEPOSIT + " 币的 80%）", "settle");
        }
    }
}
