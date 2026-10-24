package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.config.AppProperties;
import com.eggworld.dto.ClaimDTO;
import com.eggworld.dto.PairDTO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.entity.UserCharacter;
import com.eggworld.entity.UserStats;
import com.eggworld.entity.Rating;
import com.eggworld.mapper.RatingMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserCharacterMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserStatsMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * 认领服务（Task 9/10）：认领、配对、提交完成、确认完成、取消
 * 实现文档 6.2 任务状态机 + 6.1 蛋蛋币流转规则
 */
@Service
@RequiredArgsConstructor
public class ClaimService {

    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final UserMapper userMapper;
    private final UserCharacterMapper userCharacterMapper;
    private final UserStatsMapper userStatsMapper;
    private final RatingMapper ratingMapper;
    private final PointService pointService;
    private final NotificationService notificationService;
    private final TaskService taskService;
    private final ChatGroupService chatGroupService;
    private final AppProperties appProperties;

    /** 技能分类 → 五维映射（与前端 STAT_MAP 保持一致） */
    private static final Map<String, String> CATEGORY_STAT_MAP = Map.of(
            "study", "knowledge",   // 学业技术 → 学识值
            "job", "skills",        // 就业技能 → 打工值
            "side", "money",        // 副业技能 → 搞钱值
            "hobby", "charm",       // 兴趣爱好 → 魅力值
            "game", "charm",        // 游戏搭子 → 魅力值
            "life", "charm"         // 生活互助 → 魅力值
    );

    /** 每个完成任务的经验奖励（发布者与认领者统一，此前为 +1，调大以加快升级） */
    private static final int TASK_EXP_REWARD = 10;

    /** 角色分类加成倍率：已解锁对应分类角色时，完成任务经验 ×1.2（新手引导规则对齐） */
    private static final double CATEGORY_EXP_BONUS = 1.2;

    /**
     * 认领/报名任务
     * 校验：不能认领自己 / 任务状态 / 重复认领 / 名额限制 / teach 型余额
     * 联系方式选填，配对后展示给发布者
     */
    @Transactional
    public void claim(Long userId, Long taskId, ClaimDTO dto) {
        Task task = getTaskOrThrow(taskId);

        // 被后台屏蔽/逻辑删除的任务不可认领：详情页已经打不开，这里挡住直接调接口的绕行
        if (Integer.valueOf(1).equals(task.getHidden()) || Integer.valueOf(1).equals(task.getDeleted())) {
            throw new BusinessException("该任务已下架，无法认领");
        }

        // 不能认领自己发布的任务（文档 6.3）
        if (task.getPublisherId().equals(userId)) {
            throw new BusinessException("不能认领自己发布的任务");
        }
        boolean isTeam = "team".equals(task.getTaskType());
        // 只有审核通过（招募中）的任务可认领；满员/结束认领后为 full，给更具体的提示
        if (!"approved".equals(task.getStatus())) {
            throw new BusinessException("full".equals(task.getStatus())
                    ? "该任务已满员，报名已关闭"
                    : "任务当前不可认领");
        }
        // 报名截止（唯一口径见 TaskService.effectiveSignupDeadline）：
        // 组队型 = 长期招募（该函数对 team 返回 null，不设截止）；奖励型没填 = 长期有效；
        // 教学/求助没填 = 发布时间 +30 天。规则只在 effectiveSignupDeadline 里定义一次，此处不重复判断。
        LocalDateTime signupDeadline = TaskService.effectiveSignupDeadline(task);
        if (signupDeadline != null && LocalDateTime.now().isAfter(signupDeadline)) {
            throw new BusinessException("报名已截止");
        }
        // 不能重复认领（数据库唯一约束兜底）
        Long exists = taskClaimMapper.selectCount(
                new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getTaskId, taskId)
                        .eq(TaskClaim::getClaimerId, userId));
        if (exists > 0) {
            throw new BusinessException("你已经认领过该任务");
        }

        boolean isReward = "reward".equals(task.getTaskType());
        boolean isTeach = "teach".equals(task.getTaskType());
        /* 应急开关（eggworld.features.task-auto-group）：置 false 后教学/组队整体退回旧流程
           （报名进候选池 → 发布者 pair() 挑人 → 线下加微信），一行配置即可止血，无需回滚代码。 */
        boolean autoGroupOn = appProperties.getFeatures().isTaskAutoGroup();

        // 旧流程没有任务群，配对后双方只能靠联系方式对接 → 教学/组队报名时必须填（与发布侧同口径）。
        // 只拦「没填」，不写任何占位字符串：假的联系方式会让对方以为联系得上，比直接报错更伤人。
        if (!autoGroupOn && (isTeach || isTeam)
                && !StringUtils.hasText(dto != null ? dto.getContact() : null)) {
            throw new BusinessException("已切换回旧流程，请填写联系方式后再报名");
        }

        /* 教学/组队：认领即入队（进任务群、占名额），不再需要发布者配对；
           求助型保持原流程（报名进候选池 → 发布者配对时才补冻悬赏、才受名额约束）。
           下面每一处分支（名额、冻资、状态、入群、招募收尾）都以 isJoinOnClaim 为准，
           开关关闭时它恒为 false，教学/组队自动走回旧流程，不需要各自再判开关。 */
        boolean isJoinOnClaim = autoGroupOn && (isTeach || isTeam);

        // 名额限制：
        // · 教学/组队（认领即入队）：认领者当场占名额，必须在这里卡上限 ——
        //   single 恒为 1、multiple 由 max_claimers 约束（不填 = 不限），口径与 claimCapOf 一致
        // · 求助型：报名只是候选池，入选人数在发布者配对时才受 max_claimers 限制
        // · 奖励型（官方任务）：认领即开始，允许多人同时参与，不受单人限制
        Long claimCount = taskClaimMapper.selectCount(
                new LambdaQueryWrapper<TaskClaim>().eq(TaskClaim::getTaskId, taskId));
        if (isJoinOnClaim) {
            Integer cap = claimCapOf(task);
            if (cap != null && taskService.memberCount(taskId) >= cap) {
                throw new BusinessException("该任务名额已满（" + cap + " 人），可关注发布者其他任务");
            }
        } else if (!isReward && "single".equals(task.getClaimMode()) && claimCount >= 1) {
            throw new BusinessException("该任务已被认领，可关注发布者其他任务");
        }

        // 教学型：认领者需有足够蛋蛋币（提交完成时扣款，这里提前校验）
        if (isTeach && pointService.getBalance(userId) < task.getReward()) {
            throw new BusinessException("蛋蛋币余额不足，无法认领该教学任务");
        }
        // 组队型：认领即入队 → 出资在认领时就冻（原先拖到发布者选中才冻；
        // 改后若不定时冻结，就会出现"队伍里有人但没人出钱"，也让超期退款不对称）
        // 开关关闭时 isJoinOnClaim=false → 回到「发布者选中（pair）时才冻」，这里跳过
        if (isJoinOnClaim && isTeam) {
            if (pointService.getBalance(userId) < TaskService.TEAM_DEPOSIT) {
                throw new BusinessException("蛋蛋币余额不足（需 " + TaskService.TEAM_DEPOSIT + " 币出资），无法加入该组队任务");
            }
            pointService.changeBalance(userId, -TaskService.TEAM_DEPOSIT, "freeze",
                    "组队任务出资：" + task.getTitle(), taskId);
        }

        // 创建认领记录：奖励型、教学/组队（认领即入队）直接进行中；求助型待发布者配对
        TaskClaim claim = new TaskClaim();
        claim.setTaskId(taskId);
        claim.setClaimerId(userId);
        if (isReward || isJoinOnClaim) {
            claim.setStatus("in_progress");
            claim.setSelected(1);
            claim.setPairedAt(LocalDateTime.now());     // 认领即入队：配对时间 = 认领时间（taskMembers 按它排序）
            // 只有官方奖励任务把任务本身置为进行中；教学/组队要继续招募到满员（满了由下面 finishRecruit 收尾）
            if (isReward && !"in_progress".equals(task.getStatus())) {
                task.setStatus("in_progress");
                taskMapper.updateById(task);
            }
        } else {
            claim.setStatus("pending_pairing");
            claim.setSelected(0);
        }
        claim.setClaimerContact(dto != null ? dto.getContact() : null);
        taskClaimMapper.insert(claim);

        // 教学/组队：认领即拉进任务群（群在上线时已自动建好；joinIfAbsent 幂等）
        if (isJoinOnClaim && task.getConversationId() != null) {
            chatGroupService.joinIfAbsent(userId, task.getConversationId());
        }

        // 通知发布者：教学/组队是"加入"，求助/奖励仍是"认领"
        User claimer = userMapper.selectById(userId);
        String action = isJoinOnClaim
                ? "加入了你的" + (isTeam ? "组队" : "教学") + "任务「"
                : "认领了你的任务「";
        notificationService.notify(task.getPublisherId(),
                (claimer != null ? claimer.getNickname() : "有人") + action + task.getTitle() + "」", "claim");

        // 教学/组队：认领后恰好满员 → 结束招募（与发布者配对满员共用同一收尾口径）
        if (isJoinOnClaim) {
            Integer cap = claimCapOf(task);
            long members = taskService.memberCount(taskId);
            if (cap != null && members >= cap) {
                finishRecruit(task, members, "名额已满，本次未能入选",
                        "「" + task.getTitle() + "」已" + (isTeam ? "招" : "选") + "满 " + members + " 人，报名已关闭");
            }
        }
    }

    /**
     * 认领者列表（仅发布者可见）
     */
    public List<Map<String, Object>> listClaimers(Long viewerId, Long taskId) {
        Task task = getTaskOrThrow(taskId);
        if (!task.getPublisherId().equals(viewerId)) {
            throw new BusinessException(403, "仅发布者可查看认领者列表");
        }
        /* 发布者已评价过的认领者（rateeId 集合），供前端过滤"待评价"认领者 */
        java.util.Set<Long> ratedIds = ratingMapper.selectList(
                        new LambdaQueryWrapper<Rating>()
                                .eq(Rating::getTaskId, taskId)
                                .eq(Rating::getRaterId, viewerId))
                .stream().map(Rating::getRateeId).collect(java.util.stream.Collectors.toSet());
        return taskClaimMapper.selectList(
                        new LambdaQueryWrapper<TaskClaim>()
                                .eq(TaskClaim::getTaskId, taskId)
                                .orderByAsc(TaskClaim::getCreatedAt))
                .stream()
                .map(c -> {
                    User u = userMapper.selectById(c.getClaimerId());
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("claimId", c.getId());
                    m.put("claimerId", c.getClaimerId());
                    m.put("nickname", u != null ? u.getNickname() : "未知");
                    m.put("school", u != null ? u.getSchool() : null);
                    m.put("status", c.getStatus());
                    m.put("selected", c.getSelected());
                    m.put("ratedByMe", ratedIds.contains(c.getClaimerId()));
                    // 认领者联系方式仅配对后展示
                    boolean paired = "in_progress".equals(c.getStatus()) || "submitted".equals(c.getStatus());
                    m.put("contact", paired ? c.getClaimerContact() : null);
                    return m;
                })
                .toList();
    }

    /**
     * 我的搭子：本队成员名单（发布者 + 已入选成员）及联系方式。
     * 权限与可见性：
     * - 仅本队成员可看（发布者本人，或已入选的成员），其他人一律 403
     * - **发布者可见全部人的联系方式**；**队内成员只能看到「自己 + 发布者」的**，
     *   其他队友的联系方式一律不返回（前端也就没有可复制的内容）
     */
    public Map<String, Object> teammates(Long viewerId, Long taskId) {
        Task task = getTaskOrThrow(taskId);
        if (!"team".equals(task.getTaskType())) {
            throw new BusinessException("只有组队任务有搭子名单");
        }
        List<TaskClaim> members = taskMembers(taskId);
        boolean isPublisher = task.getPublisherId().equals(viewerId);
        boolean isMember = members.stream().anyMatch(c -> c.getClaimerId().equals(viewerId));
        if (!isPublisher && !isMember) {
            throw new BusinessException(403, "仅本队成员可查看搭子名单");
        }

        User publisher = userMapper.selectById(task.getPublisherId());
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("taskId", taskId);
        result.put("title", task.getTitle());
        result.put("status", task.getStatus());
        result.put("maxClaimers", task.getMaxClaimers());
        result.put("memberCount", members.size());
        /* 前端据此提示「你能看到谁的联系方式」 */
        result.put("canSeeAllContacts", isPublisher);
        Map<String, Object> pub = new java.util.HashMap<>();
        pub.put("userId", task.getPublisherId());
        pub.put("nickname", publisher != null ? publisher.getNickname() : "未知");
        pub.put("school", publisher != null ? publisher.getSchool() : null);
        pub.put("contact", task.getContact());
        result.put("publisher", pub);
        result.put("members", members.stream().map(c -> {
            User u = userMapper.selectById(c.getClaimerId());
            boolean isSelf = c.getClaimerId().equals(viewerId);
            Map<String, Object> m = new java.util.HashMap<>();
            m.put("userId", c.getClaimerId());
            m.put("nickname", u != null ? u.getNickname() : "未知");
            m.put("school", u != null ? u.getSchool() : null);
            m.put("contact", (isPublisher || isSelf) ? c.getClaimerContact() : null);
            m.put("self", isSelf);
            m.put("status", c.getStatus());
            return m;
        }).toList());
        return result;
    }

    /** 已入选成员（被发布者选中且仍在参与中的认领记录，按入选时间排序） */
    private List<TaskClaim> taskMembers(Long taskId) {
        return taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getTaskId, taskId)
                .eq(TaskClaim::getSelected, 1)
                .in(TaskClaim::getStatus, TaskService.SELECTED_STATUSES)
                .orderByAsc(TaskClaim::getPairedAt));
    }

    /**
     * 任务收尾时把绑定群聊置为只读归档。
     * 无群（求助/奖励型，或建群失败）时直接跳过；群已被解散/转让时 ChatGroupService.archive 内部静默跳过 ——
     * 群聊是任务流程的附带产物，绝不能因为它让蛋蛋币结算回滚。
     */
    private void archiveTaskGroup(Task task) {
        if (task.getConversationId() == null) return;
        chatGroupService.archive(task.getPublisherId(), task.getConversationId());
    }

    /**
     * 发布者选人（配对/认领）：从报名者里挑人，可**分批多选**
     * - 选中者进入进行中；未选中的留在候选池，发布者可下次继续选
     * - 教学/求助/组队都遵循同一套：满员（或发布者点「结束认领/结束招募」）才停止报名
     * - 资金：组队每个入选者冻 10；求助第 2 位起每人补冻一份悬赏（第 1 份发布时已冻）；教学不冻
     */
    @Transactional
    public void pair(Long publisherId, Long taskId, PairDTO dto) {
        Task task = getTaskOrThrow(taskId);
        if (!task.getPublisherId().equals(publisherId)) {
            throw new BusinessException(403, "仅发布者可确认配对");
        }
        if (!"approved".equals(task.getStatus())) {
            throw new BusinessException("任务不在可配对状态");
        }
        // 奖励型（官方任务）：认领即进行中，无需配对
        if ("reward".equals(task.getTaskType())) {
            throw new BusinessException("官方奖励任务认领即开始，无需配对");
        }

        boolean isTeam = "team".equals(task.getTaskType());
        boolean isHelp = "help".equals(task.getTaskType());
        List<Long> ids = dto.getClaimerIds();
        if (ids == null || ids.isEmpty()) {
            throw new BusinessException("请选择认领者");
        }

        // 全部认领记录
        List<TaskClaim> claims = taskClaimMapper.selectList(
                new LambdaQueryWrapper<TaskClaim>().eq(TaskClaim::getTaskId, taskId));

        java.util.Set<Long> validIds = claims.stream().map(TaskClaim::getClaimerId)
                .collect(java.util.stream.Collectors.toSet());
        if (!validIds.containsAll(ids)) {
            throw new BusinessException("选择的认领者不存在或已被处理");
        }

        // 校验选中的认领者都处于待配对状态
        for (TaskClaim c : claims) {
            if (ids.contains(c.getClaimerId()) && !"pending_pairing".equals(c.getStatus())) {
                throw new BusinessException("存在不可配对的认领者");
            }
        }

        // 名额：single 恒为 1 人；multiple 由 max_claimers 约束（不填 = 不限）
        Integer cap = claimCapOf(task);
        long members = taskService.memberCount(taskId);
        if (cap != null && members + ids.size() > cap) {
            throw new BusinessException("名额只剩 " + (cap - members) + " 人，本次选了 " + ids.size() + " 人");
        }

        // 先扣钱再改状态：余额不足时整体回滚，不会留下"已入选但没出钱"的记录
        if (isHelp) {
            freezeHelpQuota(task, members, ids.size());
        }
        if (isTeam) {
            for (Long claimerId : ids) {
                if (pointService.getBalance(claimerId) < TaskService.TEAM_DEPOSIT) {
                    throw new BusinessException("认领者余额不足，无法完成组队");
                }
                pointService.changeBalance(claimerId, -TaskService.TEAM_DEPOSIT, "freeze",
                        "组队任务出资：" + task.getTitle(), taskId);
            }
        }

        // 入选：进入进行中；未选中的留在候选池（发布者可下次继续选）
        for (TaskClaim c : claims) {
            if (!ids.contains(c.getClaimerId())) {
                continue;
            }
            c.setStatus("in_progress");
            c.setSelected(1);
            c.setPairedAt(LocalDateTime.now());
            taskClaimMapper.updateById(c);
            /* 配对成功 → 拉进任务群（只有教学/组队任务有群）。
               joinIfAbsent 幂等：任务群是公开群，认领者可能已先在群聊广场自己加过，重复加群不能把整笔配对打回滚。 */
            if (task.getConversationId() != null) {
                chatGroupService.joinIfAbsent(c.getClaimerId(), task.getConversationId());
            }
            notificationService.notify(c.getClaimerId(), pairNotice(task, isTeam), "pair");
        }

        // 满员（single 的 1 人也算满员）才结束认领；未满员时任务保持 approved 继续接报名
        long total = members + ids.size();
        if (cap != null && total >= cap) {
            finishRecruit(task, members, "本次未能入选",
                    "「" + task.getTitle() + "」已" + (isTeam ? "招" : "选") + "满 " + total + " 人，报名已关闭");
        }
    }

    /** 认领名额上限：single 恒为 1；multiple 用 max_claimers（为空 = 不限） */
    private static Integer claimCapOf(Task task) {
        if ("single".equals(task.getClaimMode())) {
            return 1;
        }
        return task.getMaxClaimers();
    }

    /** 入选通知文案：组队是"搭子/入队"，教学与求助是"入选/认领" */
    private static String pairNotice(Task task, boolean isTeam) {
        if (isTeam) {
            return "你已被选入「" + task.getTitle() + "」的队伍，双方联系方式已互相解锁";
        }
        return "你已被选中参与「" + task.getTitle() + "」，双方联系方式已互相解锁";
    }

    /**
     * 求助型悬赏按「入选人数」冻结：发布时已冻第 1 份，第 2 位起每人补冻一份；
     * 余额不足时抛异常整体回滚（不会出现"选了人却没冻够钱"）。
     */
    private void freezeHelpQuota(Task task, long members, long newCount) {
        int reward = task.getReward() == null ? 0 : task.getReward();
        if (reward <= 0) {
            return;
        }
        long before = Math.max(1, members);              // 发布时那份 = 第 1 份
        long after = Math.max(1, members + newCount);
        for (long unit = before; unit < after; unit++) {
            if (pointService.getBalance(task.getPublisherId()) < reward) {
                throw new BusinessException("蛋蛋币余额不足，无法再选更多完成者（第 " + (unit + 1) + " 份悬赏）");
            }
            pointService.changeBalance(task.getPublisherId(), -reward, "freeze",
                    "求助悬赏冻结（第 " + (unit + 1) + " 位完成者）：" + task.getTitle(), task.getId());
        }
    }

    /**
     * 发布者结束招募 / 结束认领：不等满员也开工。
     * 停止报名（任务转 full，广场置灰展示 7 天），已入选的人照常各自提交/确认；候选池里的人明确落选。
     * 组队叫「结束招募」，教学与求助叫「结束认领」（后端同一接口，前端按类型显示不同文案）。
     */
    @Transactional
    public void closeRecruit(Long publisherId, Long taskId) {
        Task task = getTaskOrThrow(taskId);
        if (!task.getPublisherId().equals(publisherId)) {
            throw new BusinessException(403, "仅发布者可结束招募");
        }
        if ("reward".equals(task.getTaskType())) {
            throw new BusinessException("官方奖励任务无需结束招募");
        }
        if (!"approved".equals(task.getStatus())) {
            throw new BusinessException("任务当前不在招募中");
        }
        long members = taskService.memberCount(taskId);
        if (members < 1) {
            throw new BusinessException("还没有人入选，无需结束招募；如需终止请取消任务");
        }
        finishRecruit(task, members, "发布者已结束招募，本次未能入选", startNotice(task, members));
    }

    /**
     * 招募收尾（满员 / 发布者结束招募共用）：
     * 条件更新抢占置 full → 候选池里的人落选并通知 → 通知发布者 → 通知已入选的人
     */
    private void finishRecruit(Task task, long members, String poolMessage, String publisherMessage) {
        if (taskMapper.closeRecruitIfApproved(task.getId()) == 0) {
            throw new BusinessException("任务状态已变化，请刷新后重试");
        }
        taskService.closeCandidatePool(task.getId(), task.getTitle(), "rejected", poolMessage);
        notificationService.notify(task.getPublisherId(), publisherMessage, "pair");
        for (TaskClaim c : taskMembers(task.getId())) {
            notificationService.notify(c.getClaimerId(), startNotice(task, members), "pair");
        }
    }

    /** 开工通知：组队是"队伍成行"，教学/求助是"已入选、报名已关闭" */
    private static String startNotice(Task task, long members) {
        if ("team".equals(task.getTaskType())) {
            return "「" + task.getTitle() + "」招募已结束，队伍成行，完成后请点「提交完成」";
        }
        return "「" + task.getTitle() + "」已结束认领（共 " + members + " 人参与），报名已关闭，完成后请点「提交完成」";
    }

    /**
     * 认领者提交完成（文档 6.2: in_progress → submitted）
     * 教学型：此时认领者支付蛋蛋币给发布者（文档 6.1）
     * 组队型：团队整体提交，所有被选中认领者一并进入 submitted
     */
    @Transactional
    public void submit(Long claimerId, Long taskId) {
        Task task = getTaskOrThrow(taskId);
        TaskClaim claim = getClaimOrThrow(taskId, claimerId);

        if (!"in_progress".equals(claim.getStatus())) {
            throw new BusinessException("任务不在进行中，无法提交");
        }

        if ("team".equals(task.getTaskType())) {
            // 组队：团队整体提交，所有被选中且进行中的认领者一并 submitted
            List<TaskClaim> teamClaims = taskClaimMapper.selectList(
                    new LambdaQueryWrapper<TaskClaim>()
                            .eq(TaskClaim::getTaskId, taskId)
                            .eq(TaskClaim::getSelected, 1)
                            .eq(TaskClaim::getStatus, "in_progress"));
            for (TaskClaim tc : teamClaims) {
                tc.setStatus("submitted");
                tc.setSubmittedAt(LocalDateTime.now());
                taskClaimMapper.updateById(tc);
            }
            /* 团队开工了就把报名关掉（与「满员 / 发布者结束招募」同一收尾口径：转 full + 候选池落选）。
               否则「提交」之后仍可能有人认领进来：团队提交只把当时 in_progress 的人置为 submitted，
               后加入者会永远停在 in_progress（没有人再提交，也就没人把他带进 submitted）。
               ⚠️ 副作用见迁移文档第七节第 18 条：转 full 后该任务不再受「90 天兜底下架」保护。 */
            if (taskMapper.closeRecruitIfApproved(taskId) == 1) {
                taskService.closeCandidatePool(taskId, task.getTitle(), "rejected", "任务已提交完成，本次未能入选");
            }
            notificationService.notify(task.getPublisherId(),
                    "团队已提交「" + task.getTitle() + "」完成，请确认", "submit");
            return;
        }

        claim.setStatus("submitted");
        claim.setSubmittedAt(LocalDateTime.now());
        taskClaimMapper.updateById(claim);

        // 教学型：认领者支付 → 发布者收取（提交时结算）
        if ("teach".equals(task.getTaskType())) {
            pointService.changeBalance(claimerId, -task.getReward(), "spend",
                    "教学任务支付：" + task.getTitle(), taskId);
            pointService.changeBalance(task.getPublisherId(), task.getReward(), "earn",
                    "教学任务收入：" + task.getTitle(), taskId);
        }

        notificationService.notify(task.getPublisherId(),
                "认领者已提交「" + task.getTitle() + "」完成，请确认", "submit");
    }

    /**
     * 发布者整体确认完成（文档 6.2: submitted → completed）
     * - 组队型：团队整体确认（一人提交=全队提交，一次确认全队），进入 3 天互评期
     * - 奖励型（官方任务）：所有提交并被确认的认领者各得一份奖励（平台发币）
     * ⚠️ 教学 / 求助（可多人）请改用 {@link #confirmMember} 逐个确认、各自结算
     */
    @Transactional
    public void confirm(Long publisherId, Long taskId) {
        Task task = getTaskOrThrow(taskId);
        if (!task.getPublisherId().equals(publisherId)) {
            throw new BusinessException(403, "仅发布者可确认完成");
        }
        boolean isTeam = "team".equals(task.getTaskType());
        if (!isTeam && !"reward".equals(task.getTaskType())) {
            throw new BusinessException("教学/求助任务请逐个确认完成（每个完成者单独结算）");
        }
        // 组队：招募中(approved，发布者还没点结束招募)/已满员(full)/进行中(in_progress) 都可确认；
        //       不能要求必须 full，否则发布者没结束招募时搭子交完就卡住了
        if (isTeam ? !List.of("approved", "full", "in_progress").contains(task.getStatus())
                : !"in_progress".equals(task.getStatus())) {
            throw new BusinessException("任务不在进行中，无法确认");
        }

        // 被选中且已提交的认领者（组队可能多人）
        List<TaskClaim> selectedClaims = taskClaimMapper.selectList(
                new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getTaskId, taskId)
                        .eq(TaskClaim::getSelected, 1)
                        .eq(TaskClaim::getStatus, "submitted"));
        if (selectedClaims.isEmpty()) {
            throw new BusinessException("认领者尚未提交完成");
        }

        // 蛋蛋币结算（文档 6.1）
        if ("reward".equals(task.getTaskType())) {
            // 奖励型（官方任务）：所有提交并被确认的认领者各得奖励（平台发币）
            for (TaskClaim c : selectedClaims) {
                pointService.changeBalance(c.getClaimerId(), task.getReward(), "earn",
                        "完成官方任务奖励：" + task.getTitle(), taskId);
            }
        } else if (isTeam) {
            // 组队：资金在发布/配对时已各自冻结（每人 10 币），不再结算；
            // 进入 3 天互评期，到期按互评均分结算：≥4 退 80%（8 币），否则平台回收
            task.setRateDeadline(LocalDateTime.now().plusDays(TaskService.TEAM_RATE_DAYS));
            task.setSettled(0);
        }

        // 所有被选中认领者完成
        for (TaskClaim c : selectedClaims) {
            c.setStatus("completed");
            c.setCompletedAt(LocalDateTime.now());
            taskClaimMapper.updateById(c);
        }

        task.setStatus("completed");
        // 刷新完成时间：作为非组队任务"完成后 7 天评价窗口"的计时起点
        task.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        archiveTaskGroup(task);     // 任务完成 → 绑定的任务群（教学/组队）转为只读归档

        // 组队：任务已结束，候选池里没入选的人不会再被选中，明确告知
        if (isTeam) {
            taskService.closeCandidatePool(taskId, task.getTitle(), "rejected", "任务已完成，本次未能入选");
        }

        // 通知所有参与认领者：任务完成（组队提示进入互评期）
        String doneMsg = "team".equals(task.getTaskType())
                ? "「" + task.getTitle() + "」任务已完成，请在 " + TaskService.TEAM_RATE_DAYS + " 天内完成互评，80% 出资将在互评期满后退还"
                : "「" + task.getTitle() + "」任务已完成，蛋蛋币已结算";
        for (TaskClaim c : selectedClaims) {
            notificationService.notify(c.getClaimerId(), doneMsg, "confirm");
        }
        if ("team".equals(task.getTaskType())) {
            notificationService.notify(task.getPublisherId(),
                    "「" + task.getTitle() + "」任务已完成，请在 " + TaskService.TEAM_RATE_DAYS + " 天内完成互评，80% 出资将在互评期满后退还", "confirm");
        }

        // 经验奖励：发布者与所有参与认领者各 +10（任务同分类角色已解锁则 ×1.2 → +12）
        addExp(task.getPublisherId(), task.getSkillCategory());
        incrementCharCount(task.getPublisherId(), task.getSkillCategory());
        addStats(task.getPublisherId(), task.getSkillCategory());
        for (TaskClaim c : selectedClaims) {
            addExp(c.getClaimerId(), task.getSkillCategory());
            incrementCharCount(c.getClaimerId(), task.getSkillCategory());
            addStats(c.getClaimerId(), task.getSkillCategory());
        }
    }

    /**
     * 发布者逐个确认完成（教学/求助可多人）：每个入选者各自提交、各自结算
     * - 教学：认领者「提交完成」时已各付一份（一人一份），这里只置完成并给经验
     * - 求助：此处把这一份悬赏发给该完成者（钱来自发布时/配对时冻结的对应份额）
     * - 收尾：没有待确认的入选者时，仍「进行中」的人置未完成，任务转 completed（进评价期）
     */
    @Transactional
    public void confirmMember(Long publisherId, Long taskId, Long claimerId) {
        Task task = getTaskOrThrow(taskId);
        if (!task.getPublisherId().equals(publisherId)) {
            throw new BusinessException(403, "仅发布者可确认完成");
        }
        if (!"teach".equals(task.getTaskType()) && !"help".equals(task.getTaskType())) {
            throw new BusinessException("组队/官方任务请使用整体确认");
        }
        if (!List.of("approved", "full", "in_progress").contains(task.getStatus())) {
            throw new BusinessException("任务当前状态不可确认");
        }
        TaskClaim claim = getClaimOrThrow(taskId, claimerId);
        if (!Integer.valueOf(1).equals(claim.getSelected())) {
            throw new BusinessException("该认领者不在参与名单里");
        }
        if (!"submitted".equals(claim.getStatus())) {
            throw new BusinessException("该认领者尚未提交完成");
        }

        // 求助：这一份悬赏发给该完成者（教学的钱在提交时已各付各收）
        if ("help".equals(task.getTaskType())) {
            pointService.changeBalance(claimerId, task.getReward(), "earn",
                    "完成任务获得报酬：" + task.getTitle(), taskId);
        }

        claim.setStatus("completed");
        claim.setCompletedAt(LocalDateTime.now());
        taskClaimMapper.updateById(claim);
        notificationService.notify(claimerId,
                "「" + task.getTitle() + "」发布者已确认你的完成，蛋蛋币已结算", "confirm");

        // 完成者经验（发布者的那份统一在收尾时给，避免按人头重复 +10）
        addExp(claimerId, task.getSkillCategory());
        incrementCharCount(claimerId, task.getSkillCategory());
        addStats(claimerId, task.getSkillCategory());

        settleIfAllConfirmed(task);
    }

    /**
     * 教学/求助收尾：已提交的都确认完（名单里没有 submitted）时——
     * 仍「进行中」的入选者置未完成并通知，任务转 completed；发布者经验在此只加一次。
     */
    private void settleIfAllConfirmed(Task task) {
        List<TaskClaim> members = taskMembers(task.getId());
        if (members.stream().anyMatch(c -> "submitted".equals(c.getStatus()))) {
            return;     // 还有完成者在等确认，任务继续进行
        }
        for (TaskClaim c : members) {
            if ("in_progress".equals(c.getStatus())) {
                c.setStatus("rejected");        // 一直不提交 → 未完成
                taskClaimMapper.updateById(c);
                notificationService.notify(c.getClaimerId(),
                        "「" + task.getTitle() + "」已结束，你未在期限内提交完成", "confirm");
            }
        }
        task.setStatus("completed");
        // 刷新完成时间：作为"完成后 7 天评价窗口"的计时起点
        task.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        archiveTaskGroup(task);     // 教学/求助任务收尾 → 绑定的任务群转为只读归档

        addExp(task.getPublisherId(), task.getSkillCategory());
        incrementCharCount(task.getPublisherId(), task.getSkillCategory());
        addStats(task.getPublisherId(), task.getSkillCategory());

        // 候选池里没入选的人明确告知
        taskService.closeCandidatePool(task.getId(), task.getTitle(), "rejected", "任务已完成，本次未能入选");
        for (TaskClaim c : taskMembers(task.getId())) {     // 收尾后名单里剩下的即已完成者
            notificationService.notify(c.getClaimerId(),
                    "「" + task.getTitle() + "」任务已完成，蛋蛋币已结算", "confirm");
        }
    }

    /**
     * 取消任务（教学型发布后 48 小时内可取消，超时需客服，文档 6.3）
     * 取消后退回发布时冻结的蛋蛋币
     */
    @Transactional
    public void cancel(Long publisherId, Long taskId) {
        Task task = getTaskOrThrow(taskId);
        if (!task.getPublisherId().equals(publisherId)) {
            throw new BusinessException(403, "仅发布者可取消任务");
        }

        // 教学型 48 小时限制
        if ("teach".equals(task.getTaskType())
                && task.getCreatedAt() != null) {
            long hours = Duration.between(task.getCreatedAt(), LocalDateTime.now()).toHours();
            if (hours > TaskService.CANCEL_TIME_LIMIT_HOURS) {
                throw new BusinessException("已超过 48 小时取消时限，如需取消请联系客服");
            }
        }

        // 已完成/已取消/已超时/已驳回的任务不可再取消（组队已满员/结束招募的 full 仍可取消）
        String status = task.getStatus();
        if (!List.of("pending", "approved", "in_progress", "full").contains(status)) {
            throw new BusinessException("任务当前状态不可取消");
        }

        // 相关认领记录一并取消（进行中的取消后双方无损失），并通知认领者
        List<TaskClaim> claims = taskClaimMapper.selectList(
                new LambdaQueryWrapper<TaskClaim>().eq(TaskClaim::getTaskId, taskId));

        // 先算清退款口径：下面会把未完成的记录置 cancelled，改完就再也认不出"曾入选"的人
        int helpUnits = "help".equals(task.getTaskType()) ? helpPendingUnits(claims) : 0;
        List<Long> teamDepositRefunds = new java.util.ArrayList<>();
        if ("team".equals(task.getTaskType())) {
            for (TaskClaim c : claims) {
                if (Integer.valueOf(1).equals(c.getSelected()) && !"completed".equals(c.getStatus())) {
                    teamDepositRefunds.add(c.getClaimerId());
                }
            }
        }

        for (TaskClaim c : claims) {
            if (!"completed".equals(c.getStatus())) {
                notificationService.notify(c.getClaimerId(),
                        "你参与的「" + task.getTitle() + "」任务已被发布者取消", "cancel");
                c.setStatus("cancelled");
                taskClaimMapper.updateById(c);
            }
        }

        task.setStatus("cancelled");
        taskMapper.updateById(task);

        // 退回发布者尚未花掉的冻结资金：
        // · 求助：发布时冻了第 1 份，之后每入选一人补冻一份；已确认完成的份数已付给完成者，不再退
        // · 组队：发布者与每个入选搭子各冻 10，逐个退回
        // · 教学：发布者未冻结，认领者的付款在"提交完成"时才发生，取消无损失
        if ("help".equals(task.getTaskType())) {
            if (helpUnits > 0) {
                pointService.changeBalance(publisherId, helpUnits * task.getReward(), "refund",
                        "任务取消退回：" + task.getTitle(), taskId);
            }
        } else if ("team".equals(task.getTaskType())) {
            pointService.changeBalance(publisherId, TaskService.TEAM_DEPOSIT, "refund",
                    "组队任务取消退回出资：" + task.getTitle(), taskId);
            for (Long claimerId : teamDepositRefunds) {
                pointService.changeBalance(claimerId, TaskService.TEAM_DEPOSIT, "refund",
                        "组队任务取消退回出资：" + task.getTitle(), taskId);
            }
        }
    }

    /**
     * 求助型「取消 / 下架」应退给发布者的冻结份数：
     * 冻结份数 = max(1, 已入选人数)（发布时第 1 份 + 每补选一人一份）；已确认完成的份数已支付，不再退。
     */
    static int helpPendingUnits(List<TaskClaim> claims) {
        long members = claims.stream()
                .filter(c -> Integer.valueOf(1).equals(c.getSelected()))
                .filter(c -> TaskService.SELECTED_STATUSES.contains(c.getStatus()))
                .count();
        long completed = claims.stream()
                .filter(c -> Integer.valueOf(1).equals(c.getSelected()))
                .filter(c -> "completed".equals(c.getStatus()))
                .count();
        return (int) Math.max(0, Math.max(1, members) - completed);
    }

    // ==================== 内部方法 ====================

    private Task getTaskOrThrow(Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        return task;
    }

    private TaskClaim getClaimOrThrow(Long taskId, Long userId) {
        TaskClaim claim = taskClaimMapper.selectOne(
                new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getTaskId, taskId)
                        .eq(TaskClaim::getClaimerId, userId));
        if (claim == null) {
            throw new BusinessException("你尚未认领该任务");
        }
        return claim;
    }

    /** 完成任务经验奖励：基础 +TASK_EXP_REWARD；若该用户已解锁任务同分类角色，则 ×CATEGORY_EXP_BONUS（10→12） */
    private void addExp(Long userId, String category) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return;
        }
        int exp = TASK_EXP_REWARD;
        if (category != null) {
            Long unlocked = userCharacterMapper.selectCount(new LambdaQueryWrapper<UserCharacter>()
                    .eq(UserCharacter::getUserId, userId)
                    .eq(UserCharacter::getCategory, category)
                    .eq(UserCharacter::getUnlocked, 1));
            if (unlocked != null && unlocked > 0) {
                exp = (int) Math.round(TASK_EXP_REWARD * CATEGORY_EXP_BONUS);
            }
        }
        user.setExp((user.getExp() == null ? 0 : user.getExp()) + exp);
        userMapper.updateById(user);
    }

    /** 角色分类完成任务数 +1 */
    private void incrementCharCount(Long userId, String category) {
        if (category == null) {
            return;
        }
        UserCharacter uc = userCharacterMapper.selectOne(
                new LambdaQueryWrapper<UserCharacter>()
                        .eq(UserCharacter::getUserId, userId)
                        .eq(UserCharacter::getCategory, category));
        if (uc != null) {
            uc.setCount(uc.getCount() + 1);
            /* PRD 7.1：完成 1 个该分类任务即解锁对应角色 */
            if (uc.getUnlocked() != 1) {
                uc.setUnlocked(1);
            }
            userCharacterMapper.updateById(uc);
        }
    }

    /** 完成任务：按技能分类提升对应五维 +1（上限 10，只增不减，文档 6.5） */
    private void addStats(Long userId, String category) {
        String dim = CATEGORY_STAT_MAP.get(category);
        if (dim == null) {
            return;
        }
        UserStats stats = userStatsMapper.selectById(userId);
        if (stats == null) {
            return;
        }
        switch (dim) {
            case "knowledge" -> bump(stats.getKnowledge(), stats::setKnowledge);
            case "skills" -> bump(stats.getSkills(), stats::setSkills);
            case "charm" -> bump(stats.getCharm(), stats::setCharm);
            case "money" -> bump(stats.getMoney(), stats::setMoney);
            default -> { return; }
        }
        userStatsMapper.updateById(stats);
    }

    /** 数值 +1 并封顶 10 */
    private void bump(BigDecimal val, Consumer<BigDecimal> setter) {
        BigDecimal nv = val == null ? BigDecimal.ONE : val.add(BigDecimal.ONE);
        if (nv.compareTo(BigDecimal.TEN) > 0) {
            nv = BigDecimal.TEN;
        }
        setter.accept(nv);
    }
}
