package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.common.LevelPolicy;
import com.eggworld.config.AppProperties;
import com.eggworld.dto.EditTaskDTO;
import com.eggworld.dto.PublishTaskDTO;
import com.eggworld.dto.TaskQueryDTO;
import com.eggworld.dto.TaskVO;
import com.eggworld.dto.TaskClaimCounts;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.TaskRevision;
import com.eggworld.entity.User;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.TaskRevisionMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 任务服务（Task 7/8）：发布任务、广场查询、任务详情、我的任务
 */
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final TaskRevisionMapper taskRevisionMapper;
    private final UserMapper userMapper;
    private final PointService pointService;
    private final InviteService inviteService;
    private final NotificationService notificationService;
    private final ChatGroupService chatGroupService;
    private final AppProperties appProperties;

    /** 教学型任务取消时限（小时），来自文档 8.3 */
    public static final int CANCEL_TIME_LIMIT_HOURS = 48;

    /** 求助/组队无人认领自动退回天数 */
    public static final int AUTO_REFUND_DAYS = 3;

    /** 组队任务每人固定出资（发布者/认领者各 10，完成后退 80%=8） */
    public static final int TEAM_DEPOSIT = 10;

    /** 组队互评评价期（确认完成 + 3 天），到期退还完成任务的出资 */
    public static final int TEAM_RATE_DAYS = 3;

    /** 组队任务完成退还比例（80%），其余部分平台回收 */
    public static final double TEAM_REFUND_RATIO = 0.8;

    /** 未填报名截止时的默认有效期（天）——与前端 signupDeadlineOf 同一口径 */
    public static final int SIGNUP_DEFAULT_DAYS = 30;

    /** 过期任务在广场继续展示的天数（过期后 3 天内仍挂着，置灰可"催一下"，之后从广场收起） */
    public static final int PLAZA_EXPIRED_SHOW_DAYS = 3;

    /** 过期后仍允许「重新发布」的天数，超过就只能重新发一条新任务 */
    public static final int RENEW_WINDOW_DAYS = 30;

    /** 满员 / 结束认领（full）后，任务仍留在广场置灰展示的天数（之后收起，任务本身继续进行） */
    public static final int PLAZA_FULL_SHOW_DAYS = 7;

    /**
     * 判定「已入选（任务已开始）」的认领状态：被发布者选中且仍在参与中。
     * 这是「入选人数」的唯一口径，也是任务能否被报名截止解散的判据 —— 已入选就不退回、只按现有人数开工。
     */
    public static final List<String> SELECTED_STATUSES = List.of("in_progress", "submitted", "completed");

    /**
     * 组队任务「长期招募」的兜底天数（2026-09-21 新增）。
     *
     * 背景：组队任务的报名只是候选池，必须发布者「选人」才算入选。
     * 原逻辑在报名截止时以「有无入选」为判据，导致「有人报名但发布者还没选人」的任务被直接下架，
     * 用户表现为「人没满就找不到了」。
     *
     * 现规则：组队任务只要候选池里还有人报名，就继续挂在广场招募；
     * 但为避免永远凑不齐的僵尸任务永久占位，超过本天数仍无人入选则自动下架退币。
     */
    public static final int TEAM_RECRUIT_FALLBACK_DAYS = 90;

    /** 重新发布时报名截止允许的最大天数（与前端自定义输入上限一致） */
    public static final int MAX_SIGNUP_DAYS = 365;

    /**
     * 报名截止的唯一口径（前端展示与后端校验共用同一规则，避免"看得见拦不住"）：
     * ① **组队型 → 永远返回 null（长期招募）**，见下方说明；
     * ② 任务填了 signupDeadline → 用它；
     * ③ 没填：奖励型（蛋总官方悬赏）→ 长期有效（返回 null）；教学/求助 → 发布时间 +30 天，取当天 23:59:59；
     * ④ 连发布时间都没有 → 视为不限制（返回 null）。
     *
     * **组队型为什么没有报名截止（2026-09-21 起）**：
     * 组队是「长期招募」——只要还没满员就一直可以报名，凑不齐的人不该被时间卡死。
     * 它的生命周期由 {@link #TEAM_RECRUIT_FALLBACK_DAYS}（90 天兜底）与「满员转 full」共同收口，
     * 不走报名截止这条路径。此前组队沿用 30 天默认截止，到期即下架退币，
     * 用户表现为「人还没满就找不到了」，故取消。
     *
     * ⚠️ 两个必须同步的镜像实现：
     *    ① 前端 growth-schoolv3.html 的 signupDeadlineOf()；
     *    ② DeadlineScheduler 对组队型单独走兜底分支（不能只靠本函数返回 null 就完事，
     *       否则组队会被「长期有效」分支直接 continue 跳过，90 天兜底失效）。
     */
    public static LocalDateTime effectiveSignupDeadline(Task task) {
        if (task == null) return null;
        if ("team".equals(task.getTaskType())) return null;   // 组队：长期招募，无报名截止
        if (task.getSignupDeadline() != null) return task.getSignupDeadline();
        if ("reward".equals(task.getTaskType())) return null;
        if (task.getCreatedAt() == null) return null;
        return task.getCreatedAt().toLocalDate().plusDays(SIGNUP_DEFAULT_DAYS).atTime(23, 59, 59);
    }

    /** 发布时实际冻结金额的唯一口径；教学/官方奖励发布不冻结。 */
    public static int frozenAmountOf(Task task) {
        if (task == null || task.getTaskType() == null) return 0;
        if ("help".equals(task.getTaskType())) return task.getReward() == null ? 0 : task.getReward();
        if ("team".equals(task.getTaskType())) return TEAM_DEPOSIT;
        return 0;
    }

    /**
     * 认领人数上限按用户等级收敛（2026-10-07 需求），并按角色放宽官方任务：
     *   · 主管理员：发布任何类型都不设限；
     *   · 副管理员：只有发奖励型（reward）官方任务不设限，自己发教学/求助/组队仍按自己的等级；
     *   · 学生：一律新手蛋 2 人起、每升一级 +1。
     *
     * 前端已按同一口径限制输入框，这里再挡一次：前端可以绕过，人多了后面配对/结算都按人数走。
     * 角色取 UserContext（拦截器已按库中 sub_admin 归一为 subadmin），不能信任请求体。
     * 传 null 视为不限（多人模式允许先不限、配对时再定），不在这里拦。
     */
    private void assertClaimersWithinLevel(Integer publisherExp, String taskType, String claimMode, Integer maxClaimers) {
        if (maxClaimers == null || maxClaimers <= 0) return;
        com.eggworld.common.LoginUser session = com.eggworld.common.UserContext.get();
        int allowed = LevelPolicy.maxClaimersAllowedFor(publisherExp, taskType,
                session != null && session.isAdmin(),
                session != null && session.isModerator());
        if (maxClaimers > allowed) {
            throw new BusinessException("你的等级（" + LevelPolicy.levelNameOf(publisherExp) + "）最多可选 "
                    + allowed + " 名认领者；升一级可多带 1 人（当前最多 " + allowed + " 人）");
        }
    }

    /** 发布任务审核通过奖励经验（新手引导对齐：审核通过 +5 经验值） */
    public static final int TASK_APPROVE_EXP = 5;

    /**
     * 发布任务：插入任务（pending）→ 冻结蛋蛋币（行锁校验余额）
     * 事务内：余额不足则整体回滚
     */
    @Transactional
    public Long publish(Long userId, PublishTaskDTO dto) {
        User publisher = userMapper.selectById(userId);
        if (publisher == null) {
            throw new BusinessException("用户不存在");
        }
        // 管理权限以会话（拦截器已按库中 sub_admin 归一为 subadmin）为准，
        // 不能信任 publisher.role（副管理员库中 role 仍为 student）
        boolean isModerator = com.eggworld.common.UserContext.get() != null
                && com.eggworld.common.UserContext.get().isModerator();

        // 奖励型（蛋总任务）：管理员或副管理员可发布（平台发币，不冻结）
        if ("reward".equals(dto.getTaskType()) && !isModerator) {
            throw new BusinessException(403, "仅管理员或副管理员可发布奖励任务");
        }

        // 组队型必须设置最大人数
        if ("team".equals(dto.getTaskType())
                && (dto.getMaxClaimers() == null || dto.getMaxClaimers() < 1)) {
            throw new BusinessException("组队型任务必须设置最大认领人数");
        }

        // 回滚到旧流程（开关关闭）时联系方式是硬需求：旧流程没有任务群，双方只能靠它对接。
        // 只在「没填」时拦下，绝不写占位字符串——伪造的联系方式会让对方以为联系得上，比报错更糟。
        // 奖励型（蛋总官方任务）除外：平台发币任务不需要双方私下对接。
        if (!appProperties.getFeatures().isTaskAutoGroup() && !"reward".equals(dto.getTaskType())
                && !StringUtils.hasText(dto.getContact())) {
            throw new BusinessException("已切换回旧流程，请填写联系方式后再发布");
        }

        // 认领人数受发布者等级限制：新手蛋 2 人，每升一级 +1；主管理员与「副管理员发奖励型」按角色放宽。
        // 刻意排在上面的「旧流程需填联系方式」之后：那条是流程开关的硬门槛，先报它更贴近用户实际要解决的配置问题。
        assertClaimersWithinLevel(publisher.getExp(), dto.getTaskType(), dto.getClaimMode(), dto.getMaxClaimers());

        // 1. 插入任务：管理类（管理员/副管理员）发布直接上线，普通用户待审核
        Task task = new Task();
        BeanUtils.copyProperties(dto, task);
        // 组队出资固定，不能信任调用方传入的 reward。
        if ("team".equals(dto.getTaskType())) task.setReward(TEAM_DEPOSIT);
        task.setPublisherId(userId);
        task.setStatus(isModerator ? "approved" : "pending");
        if (!StringUtils.hasText(task.getClaimMode())) {
            task.setClaimMode("single");
        }
        taskMapper.insert(task);

        // 管理类（管理员/副管理员）发布时 status 直接是 approved，与审核通过同一口径：教学/组队任务立即建群
        if ("approved".equals(task.getStatus())) {
            ensureTaskGroup(task);
        }

        // 奖励型（蛋总任务）发布成功 → 全站通知触达所有用户
        if ("reward".equals(dto.getTaskType())) {
            notificationService.notifyAll("🥚 蛋总发布了官方任务「" + dto.getTitle() + "」，完成任务赢取蛋蛋币！", "info");
        }

        // 先复制 DTO 并规范化 reward，再用唯一冻结口径扣款。
        int frozen = frozenAmountOf(task);
        if (frozen > 0) {
            pointService.changeBalance(userId, -frozen, "freeze",
                    ("team".equals(dto.getTaskType()) ? "发布组队任务出资：" : "发布任务冻结：") + dto.getTitle(), task.getId());
        }

        // 3. 被邀请人发布首个任务 → 邀请人获得邀请奖励（仅首次，status 保护）
        if (taskMapper.selectCount(new LambdaQueryWrapper<Task>()
                .eq(Task::getPublisherId, userId)) == 1) {
            inviteService.rewardOnFirstPublish(userId);
        }

        return task.getId();
    }

    /**
     * 任务广场分页查询（筛选：类型/分类/状态/关键词）
     * 未登录访客仅可浏览已审核（approved）任务（广场只公开展示已审核内容）
     */
    public Page<TaskVO> listTasks(TaskQueryDTO query, Long viewerId) {
        LambdaQueryWrapper<Task> wrapper = new LambdaQueryWrapper<Task>()
                /* tasks 表没有配置 @TableLogic，逻辑删除与屏蔽都必须显式过滤，
                   否则被后台处置过的任务会继续出现在广场/搜索里 */
                .eq(Task::getDeleted, 0)
                .eq(Task::getHidden, 0)
                .eq(StringUtils.hasText(query.getType()), Task::getTaskType, query.getType())
                .eq(StringUtils.hasText(query.getCategory()), Task::getSkillCategory, query.getCategory())
                .eq(StringUtils.hasText(query.getStatus()), Task::getStatus, query.getStatus())
                .like(StringUtils.hasText(query.getKeyword()), Task::getTitle, query.getKeyword())
                .orderByDesc(Task::getFeatured)
                .orderByDesc(Task::getCreatedAt);

        // 广场展示过期任务时只给"过期 3 天内"的（置 expired 时会刷新 updated_at），避免广场堆积陈年旧卡
        if ("expired".equals(query.getStatus())) {
            wrapper.ge(Task::getUpdatedAt, LocalDateTime.now().minusDays(PLAZA_EXPIRED_SHOW_DAYS));
        }

        // 满员 / 结束认领（full）的任务仍置灰挂在广场 7 天（置 full 时会刷新 updated_at），之后收起
        if ("full".equals(query.getStatus())) {
            wrapper.ge(Task::getUpdatedAt, LocalDateTime.now().minusDays(PLAZA_FULL_SHOW_DAYS));
        }

        // 访客（未登录）强制只看 approved，防止通过筛选参数窥探审核中/已下架任务
        if (viewerId == null) {
            wrapper.eq(Task::getStatus, "approved");
        }

        Page<Task> page = taskMapper.selectPage(new Page<>(query.getPage(), query.getSize()), wrapper);
        return toTaskVOPage(page, viewerId);
    }

    /**
     * 任务详情
     * 未登录访客只能查看已审核任务（与广场浏览规则一致，避免枚举到审核中内容）；
     * 被后台屏蔽/删除的任务只有发布者本人还能打开（前台其他人一律按「不存在」处理）。
     */
    public TaskVO getDetail(Long taskId, Long viewerId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        boolean isOwner = viewerId != null && viewerId.equals(task.getPublisherId());
        boolean removed = Integer.valueOf(1).equals(task.getDeleted())
                || Integer.valueOf(1).equals(task.getHidden());
        if ((removed && !isOwner) || (viewerId == null && !"approved".equals(task.getStatus()))) {
            throw new BusinessException(404, "任务不存在");
        }
        return buildVO(task, viewerId);
    }

    /**
     * 我发布的任务
     */
    public Page<TaskVO> myPublished(Long userId, long page, long size) {
        LambdaQueryWrapper<Task> wrapper = new LambdaQueryWrapper<Task>()
                .eq(Task::getPublisherId, userId)
                .orderByDesc(Task::getCreatedAt);
        Page<Task> p = taskMapper.selectPage(new Page<>(page, size), wrapper);
        Page<TaskVO> result = toTaskVOPage(p, userId);
        attachRevisions(result, true);   /* 我的任务：带上待审修改稿 + 最近被驳回的修改（提示用） */
        return result;
    }

    /**
     * 我认领的任务（按任务创建时间新→旧排序，保证列表稳定且最新在前）
     */
    public Page<TaskVO> myClaimed(Long userId, long page, long size) {
        // 先按认领者查出任务ID
        List<TaskClaim> claims = taskClaimMapper.selectList(
                new LambdaQueryWrapper<TaskClaim>()
                        .eq(TaskClaim::getClaimerId, userId));
        List<Long> taskIds = claims.stream().map(TaskClaim::getTaskId).toList();
        if (taskIds.isEmpty()) {
            return new Page<>(page, size);
        }
        // IN 查询结果顺序不可控，必须显式按任务创建时间倒序
        LambdaQueryWrapper<Task> wrapper = new LambdaQueryWrapper<Task>()
                .in(Task::getId, taskIds)
                .orderByDesc(Task::getCreatedAt);
        Page<Task> p = taskMapper.selectPage(new Page<>(page, size), wrapper);
        return toTaskVOPage(p, userId);
    }

    /**
     * 管理员：待审核任务列表
     * 两类都要捞出来：① 任务本身 pending（首次待审）；② 任务本身不是 pending 但有一份 pending 修改稿。
     * ② 必须靠修改稿来查：approved 改稿会退回 pending，而 expired 改稿按设计保持 expired（审过才复活），
     * 只看 tasks.status 会把"过期任务的改稿"漏掉、无人能审。
     */
    public Page<TaskVO> pendingTasks(long page, long size) {
        LambdaQueryWrapper<Task> wrapper = new LambdaQueryWrapper<Task>()
                .and(w -> w.eq(Task::getStatus, "pending")
                        .or()
                        .inSql(Task::getId, "SELECT task_id FROM task_revisions WHERE status = 'pending'"))
                .orderByAsc(Task::getCreatedAt);
        Page<Task> p = taskMapper.selectPage(new Page<>(page, size), wrapper);
        Page<TaskVO> result = toTaskVOPage(p, null);
        attachRevisions(result, false);   /* 审核中心：带上待审修改稿，用于渲染"修改前 / 修改后"对比 */
        return result;
    }

    /**
     * 管理员：按状态（可多状态）分页查任务
     * 供工作台「任务完成率」下钻查看已完成/异常任务
     *
     * @param statuses 为空表示不限状态
     */
    public Page<TaskVO> tasksByStatuses(List<String> statuses, long page, long size) {
        LambdaQueryWrapper<Task> wrapper = new LambdaQueryWrapper<Task>()
                .in(statuses != null && !statuses.isEmpty(), Task::getStatus, statuses)
                .orderByDesc(Task::getCreatedAt);
        Page<Task> p = taskMapper.selectPage(new Page<>(page, size), wrapper);
        return toTaskVOPage(p, null);
    }

    /**
     * 主管理员：任务管理页的全量列表（治理视角，含已屏蔽 / 已删除）
     * <p>
     * 与广场口径的关键差异：这里必须能看到被处置过的任务，所以默认不加 hidden / deleted 过滤；
     * 只有指定了具体状态才收敛，避免「筛选待认领」时把已屏蔽的同状态任务混进来。
     *
     * @param status 空 / all = 全部（含已屏蔽、已删除）；hidden 已屏蔽；deleted 已删除；
     *               suspended 已屏蔽或已删除；featured 仅看加精；其余按 tasks.status 精确匹配
     * @param type   教学/求助/组队/奖励，空表示不限
     */
    public Page<TaskVO> manageTasks(String status, String type, String keyword, long page, long size) {
        LambdaQueryWrapper<Task> wrapper = new LambdaQueryWrapper<Task>()
                .eq(StringUtils.hasText(type), Task::getTaskType, type)
                .like(StringUtils.hasText(keyword), Task::getTitle, keyword)
                .orderByDesc(Task::getCreatedAt);
        String st = status == null ? "" : status;
        switch (st) {
            case "", "all" -> { /* 治理视角：全部，含已屏蔽与已删除 */ }
            case "hidden" -> wrapper.eq(Task::getHidden, 1).eq(Task::getDeleted, 0);
            case "deleted" -> wrapper.eq(Task::getDeleted, 1);
            case "suspended" -> wrapper.and(w -> w.eq(Task::getDeleted, 1)
                    .or(x -> x.eq(Task::getHidden, 1).eq(Task::getDeleted, 0)));
            case "featured" -> wrapper.eq(Task::getFeatured, 1)
                    .eq(Task::getDeleted, 0).eq(Task::getHidden, 0);
            default -> wrapper.eq(Task::getStatus, st)
                    .eq(Task::getDeleted, 0).eq(Task::getHidden, 0);
        }
        Page<Task> p = taskMapper.selectPage(new Page<>(page, size), wrapper);
        return toTaskVOPage(p, null);
    }

    /**
     * 教学/组队任务上线时自动建群：群名 = 任务标题，群主 = 发布者，会话 ID 回写到 tasks.conversation_id。
     * 配套：认领者配对成功时由 ClaimService 拉进群；任务完成时把群置为只读归档。
     *
     * ⚠️ 回写走 taskMapper.bindConversation 定向 SQL，不能用 updateById(task)：
     *    approve 路径上的 task 还是 pending 的旧快照（状态是 approveIfPending 在库里改的），
     *    updateById 会把 status 一起写回 pending，把刚审核通过的任务重新送回审核队列。
     *
     * @return 本次建出的会话 ID；已建过群、任务不是教学/组队、或功能开关已关闭时返回 null（跳过）。
     *         返回值供存量补群（LegacyDataMigrationService）取用，审核/发布等原调用方不关心，忽略即可。
     */
    public Long ensureTaskGroup(Task task) {
        // 应急开关（eggworld.features.task-auto-group）：关闭后不再建群，回到「配对后线下加微信」的旧流程。
        // 建群入口只此一处，approve / publish / 存量补群都会走到这里，所以开关也只需在这里判一次。
        if (!appProperties.getFeatures().isTaskAutoGroup()) return null;
        if (task.getConversationId() != null) return null;      // 已建过群（重新发布 / 二次审核）：跳过
        if (!"teach".equals(task.getTaskType()) && !"team".equals(task.getTaskType())) return null;
        Long conversationId = chatGroupService.createTaskGroup(task.getPublisherId(), task.getTitle(),
                "任务群：「" + task.getTitle() + "」——围绕该任务的沟通群，任务完成后转为只读归档");
        taskMapper.bindConversation(task.getId(), conversationId);
        return conversationId;
    }

    /**
     * 管理员：审核通过
     * - 有 pending 修改稿（第二期）→ 采纳修改：新值写回任务并上线（求助型报酬变动时补/退冻结差额）
     * - 否则走首次审核：pending → approved + 经验值 +5
     */
    @Transactional
    public void approve(Long taskId) {
        Task task = getTaskOrThrow(taskId);
        TaskRevision rev = pendingRevisionOf(taskId);
        if (rev != null) {
            applyRevision(task, rev);
            ensureTaskGroup(task);      // 采纳修改稿同样是一次「上线」，与首次审核一个口径
            return;
        }
        if (taskMapper.approveIfPending(taskId) != 1) {
            throw new BusinessException("该任务不在待审核状态");
        }
        // 发布任务审核通过奖励 +5 经验值（新手引导规则对齐）
        User publisher = userMapper.selectById(task.getPublisherId());
        if (publisher != null) {
            publisher.setExp((publisher.getExp() == null ? 0 : publisher.getExp()) + TASK_APPROVE_EXP);
            userMapper.updateById(publisher);
        }
        // 通知发布者：审核通过（含经验提示）
        notificationService.notify(task.getPublisherId(),
                "你发布的「" + task.getTitle() + "」已审核通过，经验值 +" + TASK_APPROVE_EXP + "，可开始配对", "review");
        ensureTaskGroup(task);      // 首次审核通过 → 教学/组队任务自动建群
    }

    /**
     * 管理员：审核驳回
     * - 有 pending 修改稿（第二期）→ 丢弃修改，任务按原内容恢复上线，并把原因转达发布者
     * - 否则走首次审核驳回：pending → rejected 并退回冻结币
     */
    @Transactional
    public void reject(Long taskId, String reason) {
        Task task = getTaskOrThrow(taskId);
        TaskRevision rev = pendingRevisionOf(taskId);
        if (rev != null) {
            rejectRevision(task, rev, reason);
            return;
        }
        // 与审核通过共用 pending 条件，避免重复驳回或通过/驳回并发退款。
        if (taskMapper.rejectIfPending(taskId) != 1) {
            throw new BusinessException("该任务不在待审核状态");
        }
        int refund = frozenAmountOf(task);
        if (refund > 0) {
            pointService.changeBalance(task.getPublisherId(), refund, "refund",
                    "任务审核驳回退回：" + task.getTitle(), taskId);
        }
        notificationService.notify(task.getPublisherId(),
                "你发布的「" + task.getTitle() + "」审核被驳回"
                        + (StringUtils.hasText(reason) ? "（原因：" + reason + "）" : "")
                        + (refund > 0 ? "，冻结蛋蛋币已退回" : ""), "review");
    }

    /** 管理员：切换优质标签（0↔1） */
    public void toggleFeatured(Long taskId) {
        getTaskOrThrow(taskId);
        taskMapper.toggleFeatured(taskId);
    }

    /* ==================== 第二期：任务修改稿 ==================== */

    /** 当前待审核的修改稿（同一任务同时只允许一份） */
    private TaskRevision pendingRevisionOf(Long taskId) {
        return taskRevisionMapper.selectOne(new LambdaQueryWrapper<TaskRevision>()
                .eq(TaskRevision::getTaskId, taskId)
                .eq(TaskRevision::getStatus, "pending")
                .orderByDesc(TaskRevision::getCreatedAt)
                .last("LIMIT 1"));
    }

    /**
     * 发布者提交修改：
     * - 任务还是 pending（首次未审）→ 直接改本体，不额外产生一次审核
     * - 任务已 approved 且无人认领 → 生成修改稿，任务回到 pending 等待重审（广场暂时看不到）
     * - 任务已 expired（过期下架）→ 同样生成修改稿，任务保持下架，审过直接按新内容复活
     * - 已有人认领 / 进行中 / 已结束 → 拒绝，提示先取消任务
     */
    @Transactional
    public void submitRevision(Long userId, Long taskId, EditTaskDTO dto) {
        Task task = getTaskOrThrow(taskId);
        if (!task.getPublisherId().equals(userId)) {
            throw new BusinessException(403, "只能修改自己发布的任务");
        }
        if (!List.of("pending", "approved", "expired").contains(task.getStatus())) {
            throw new BusinessException("该任务当前状态不可修改；如需调整请先取消任务后重新发布");
        }
        Long claimCount = taskClaimMapper.selectCount(
                new LambdaQueryWrapper<TaskClaim>().eq(TaskClaim::getTaskId, taskId));
        if (claimCount != null && claimCount > 0) {
            throw new BusinessException("已有人认领，不能修改；如需调整请先取消任务后重新发布");
        }
        if (pendingRevisionOf(taskId) != null) {
            throw new BusinessException("已有一份修改稿在审核中，请等待审核结果");
        }
        /* 组队型报酬固定 10，忽略传入值（与发布口径一致） */
        Integer reward = "team".equals(task.getTaskType()) ? TEAM_DEPOSIT : dto.getReward();
        String claimMode = StringUtils.hasText(dto.getClaimMode()) ? dto.getClaimMode() : task.getClaimMode();
        if ("multiple".equals(claimMode) && dto.getMaxClaimers() == null) {
            throw new BusinessException("多人认领请填写最大认领人数");
        }
        /* 认领人数上限同发布口径：按发布者当前等级收敛（新手蛋 2 人，每升一级 +1），
           主管理员与「副管理员发奖励型」按角色放宽。
           用发布者现在的经验值判定：改了内容但不能偷偷把人数改到超过自己等级的额度。 */
        User revisionPublisher = userMapper.selectById(userId);
        assertClaimersWithinLevel(revisionPublisher == null ? null : revisionPublisher.getExp(),
                task.getTaskType(), claimMode, dto.getMaxClaimers());

        /* 2026-10-07：修改表单与发布表单对齐 —— 回滚到旧流程（开关关闭）时联系方式同样是硬需求
           （旧流程没有任务群）；奖励型官方任务除外；教学/组队在新流程下不收集联系方式。 */
        if (!appProperties.getFeatures().isTaskAutoGroup() && !"reward".equals(task.getTaskType())
                && !StringUtils.hasText(dto.getContact())) {
            throw new BusinessException("已切换回旧流程，请填写联系方式后再修改");
        }

        /* 2026-10-07：改稿也能补充/替换/移除证明图。这里把三种意图解析成**最终值**再落库，
           让审核中心直接看到「通过后会用哪张图」，采纳时也只是一次普通赋值（见 TaskMapper.applyRevisionIfRevisable）：
             · clearProofImage=true            → null（移除）
             · proofImageId 有值               → 换成这张
             · 两者都没有                       → 沿用任务当前那张 */
        Long effectiveProofImageId = Boolean.TRUE.equals(dto.getClearProofImage())
                ? null
                : (dto.getProofImageId() != null ? dto.getProofImageId() : task.getProofImageId());

        if ("pending".equals(task.getStatus())) {
            /* 首次审核还没过：直接改本体，避免"改个错字要走两次审核" */
            task.setTitle(dto.getTitle());
            task.setDescription(dto.getDescription());
            task.setRequirements(dto.getRequirements());
            task.setSkillCategory(dto.getSkillCategory());
            task.setSkillSub(dto.getSkillSub());
            task.setReward(reward);
            task.setClaimMode(claimMode);
            task.setMaxClaimers("multiple".equals(claimMode) ? dto.getMaxClaimers() : null);
            task.setProofImageId(effectiveProofImageId);
            task.setContact(dto.getContact());
            task.setSignupDeadline(dto.getSignupDeadline());
            task.setCompleteDeadline(dto.getCompleteDeadline());
            taskMapper.updateById(task);
            notificationService.notifyAdmins("「" + task.getTitle() + "」在待审核期间被发布者更新了内容（尚未上线，请看审核中心的最新版本）", "review");
            return;
        }

        TaskRevision rev = new TaskRevision();
        rev.setTaskId(taskId);
        rev.setStatus("pending");
        rev.setTitle(dto.getTitle());
        rev.setDescription(dto.getDescription());
        rev.setRequirements(dto.getRequirements());
        rev.setSkillCategory(dto.getSkillCategory());
        rev.setSkillSub(dto.getSkillSub());
        rev.setReward(reward);
        rev.setClaimMode(claimMode);
        rev.setMaxClaimers("multiple".equals(claimMode) ? dto.getMaxClaimers() : null);
        rev.setProofImageId(effectiveProofImageId);
        rev.setContact(dto.getContact());
        rev.setSignupDeadline(dto.getSignupDeadline());
        rev.setCompleteDeadline(dto.getCompleteDeadline());
        taskRevisionMapper.insert(rev);

        /* approved：退回 pending 等待重审（广场暂时下架）；expired：本来就在下架状态，保持不动 */
        if ("approved".equals(task.getStatus()) && taskMapper.markPendingForRevision(taskId) != 1) {
            throw new BusinessException("任务状态已变化，请刷新后重试");
        }
        notificationService.notifyAdmins("「" + task.getTitle() + "」提交了修改稿，等待你审核（原内容已暂时从广场下架）", "review");
    }

    /** 采纳修改稿：新值写回任务；求助型报酬变动时补/退冻结差额 */
    private void applyRevision(Task task, TaskRevision rev) {
        Task probe = new Task();
        probe.setTaskType(task.getTaskType());
        probe.setReward(rev.getReward());
        int delta = frozenAmountOf(probe) - frozenAmountOf(task);
        if (taskMapper.applyRevisionIfRevisable(task.getId(), rev) != 1) {
            throw new BusinessException("该任务不在待审核状态");
        }
        if (delta > 0) {
            pointService.changeBalance(task.getPublisherId(), -delta, "freeze",
                    "任务修改后补冻结：" + rev.getTitle(), task.getId());
        } else if (delta < 0) {
            pointService.changeBalance(task.getPublisherId(), -delta, "refund",
                    "任务修改后退回冻结：" + rev.getTitle(), task.getId());
        }
        rev.setStatus("approved");
        rev.setReviewedAt(LocalDateTime.now());
        taskRevisionMapper.updateById(rev);
        notificationService.notify(task.getPublisherId(),
                "你对「" + rev.getTitle() + "」的修改已通过审核，任务已按新内容上线", "review");
    }

    /** 驳回修改稿：丢弃新值，任务按原内容恢复上线（改稿被拒 ≠ 任务被拒；过期任务保持下架） */
    private void rejectRevision(Task task, TaskRevision rev, String reason) {
        String text = StringUtils.hasText(reason) ? reason : "内容不符合发布要求";
        rev.setStatus("rejected");
        rev.setRejectReason(text);
        rev.setReviewedAt(LocalDateTime.now());
        taskRevisionMapper.updateById(rev);
        /* 首次审核未过的任务：按原内容恢复上线；已过期任务：本来就是下架状态，照旧 */
        boolean restored = "pending".equals(task.getStatus());
        if (restored && taskMapper.restoreIfPending(task.getId()) != 1) {
            throw new BusinessException("该任务不在待审核状态");
        }
        notificationService.notify(task.getPublisherId(),
                "你对「" + task.getTitle() + "」的修改未通过审核（原因：" + text + "），"
                        + (restored ? "任务已按原内容恢复上线" : "任务仍保持过期下架状态")
                        + "；可修改后重新提交", "review");
    }

    /** 批量补上"待审修改稿"与"最近被驳回的修改"（我的任务 / 审核列表用，各 1 条 SQL，避免 N+1） */
    private void attachRevisions(Page<TaskVO> page, boolean includeOwnRejected) {
        List<TaskVO> records = page.getRecords();
        if (records == null || records.isEmpty()) {
            return;
        }
        List<Long> ids = records.stream().map(vo -> vo.getTask().getId()).toList();

        Map<Long, TaskRevision> pendingByTask = taskRevisionMapper.selectList(
                        new LambdaQueryWrapper<TaskRevision>()
                                .in(TaskRevision::getTaskId, ids)
                                .eq(TaskRevision::getStatus, "pending")).stream()
                .collect(Collectors.toMap(TaskRevision::getTaskId, r -> r, (a, b) -> a));

        Map<Long, TaskRevision> rejectedByTask = new HashMap<>();
        if (includeOwnRejected) {
            /* 只认"最近一次已审的修改稿且结果是驳回"：之后重新提交并通过的话，提示要自动消失 */
            List<TaskRevision> reviewed = taskRevisionMapper.selectList(
                    new LambdaQueryWrapper<TaskRevision>()
                            .in(TaskRevision::getTaskId, ids)
                            .isNotNull(TaskRevision::getReviewedAt)
                            .orderByDesc(TaskRevision::getReviewedAt));
            Map<Long, TaskRevision> latest = new HashMap<>();
            for (TaskRevision r : reviewed) {
                latest.putIfAbsent(r.getTaskId(), r);
            }
            latest.forEach((taskId, r) -> {
                if ("rejected".equals(r.getStatus())) {
                    rejectedByTask.put(taskId, r);
                }
            });
        }
        for (TaskVO vo : records) {
            Long id = vo.getTask().getId();
            TaskRevision pending = pendingByTask.get(id);
            vo.setPendingRevision(pending);
            /* 已有新修改稿在审时不再提示上一条被驳回的，避免两行提示打架 */
            if (includeOwnRejected && pending == null) {
                vo.setLastRejectedRevision(rejectedByTask.get(id));
            }
        }
    }

    // ==================== 内部方法 ====================

    private Task getTaskOrThrow(Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        return task;
    }

    /** 分页 Task → 分页 TaskVO */
    private Page<TaskVO> toTaskVOPage(Page<Task> page, Long viewerId) {
        Page<TaskVO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        if (page.getRecords().isEmpty()) return result;
        List<Long> ids = page.getRecords().stream().map(Task::getId).toList();
        List<Long> publisherIds = page.getRecords().stream().map(Task::getPublisherId).distinct().toList();
        Map<Long, User> publishers = userMapper.selectBatchIds(publisherIds).stream().collect(Collectors.toMap(User::getId, u -> u));
        Map<Long, TaskClaimCounts> counts = taskClaimMapper.countForTasks(ids, SELECTED_STATUSES).stream()
                .collect(Collectors.toMap(TaskClaimCounts::getTaskId, c -> c));
        Map<Long, TaskClaim> mine = viewerId == null ? Map.of() : taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                .in(TaskClaim::getTaskId, ids).eq(TaskClaim::getClaimerId, viewerId)).stream()
                .collect(Collectors.toMap(TaskClaim::getTaskId, c -> c, (first, ignored) -> first));
        List<Long> ownedIds = page.getRecords().stream().filter(t -> viewerId != null && viewerId.equals(t.getPublisherId()))
                .map(Task::getId).toList();
        Map<Long, List<TaskClaim>> selected = ownedIds.isEmpty() ? Map.of() : taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                .in(TaskClaim::getTaskId, ownedIds).eq(TaskClaim::getSelected, 1).orderByAsc(TaskClaim::getId)).stream()
                .collect(Collectors.groupingBy(TaskClaim::getTaskId));
        result.setRecords(page.getRecords().stream().map(task -> {
            TaskVO vo = baseVO(task, publishers.get(task.getPublisherId()));
            TaskClaimCounts count = counts.get(task.getId());
            vo.setClaimCount(count == null ? 0 : count.getClaimCount().intValue());
            vo.setMemberCount(count == null ? 0 : count.getMemberCount().intValue());
            TaskClaim myClaim = mine.get(task.getId());
            if (myClaim != null) vo.setMyClaimStatus(myClaim.getStatus());
            List<TaskClaim> selectedList = selected.getOrDefault(task.getId(), List.of());
            if (!selectedList.isEmpty()) vo.setSelectedClaimStatus(selectedList.stream().anyMatch(c -> "submitted".equals(c.getStatus()))
                    ? "submitted" : selectedList.get(0).getStatus());
            applyContactVisibility(vo, task, viewerId);
            return vo;
        }).toList());
        return result;
    }

    private TaskVO baseVO(Task task, User publisher) {
        TaskVO vo = new TaskVO();
        vo.setTask(task);
        if (publisher != null) {
            vo.setPublisherNickname(publisher.getNickname()); vo.setPublisherRole(publisher.getRole());
            vo.setPublisherSchool(publisher.getSchool()); vo.setPublisherEggCategory(publisher.getEggCategory());
            vo.setPublisherRarity(publisher.getEggRarity()); vo.setPublisherReputation(publisher.getReputation());
        }
        return vo;
    }

    private void applyContactVisibility(TaskVO vo, Task task, Long viewerId) {
        boolean isPublisher = viewerId != null && viewerId.equals(task.getPublisherId());
        boolean isPaired = "in_progress".equals(vo.getMyClaimStatus()) || "submitted".equals(vo.getMyClaimStatus());
        vo.setContact(isPublisher || isPaired ? task.getContact() : null);
        // 不只清理外层字段：嵌套 task 也必须遵守同一可见性；复制而非污染持久化实体。
        Task safe = new Task(); BeanUtils.copyProperties(task, safe); safe.setContact(vo.getContact()); vo.setTask(safe);
    }

    /**
     * 组装任务视图：发布者信息 + 认领数 + 我的认领状态 + 联系方式可见性
     */
    public TaskVO buildVO(Task task, Long viewerId) {
        TaskVO vo = new TaskVO();
        vo.setTask(task);

        // 发布者信息
        User publisher = userMapper.selectById(task.getPublisherId());
        if (publisher != null) {
            vo.setPublisherNickname(publisher.getNickname());
            vo.setPublisherRole(publisher.getRole());
            vo.setPublisherSchool(publisher.getSchool());
            vo.setPublisherEggCategory(publisher.getEggCategory());
            vo.setPublisherRarity(publisher.getEggRarity());
            vo.setPublisherReputation(publisher.getReputation());
        }

        // 已认领人数
        Long claimCount = taskClaimMapper.selectCount(
                new LambdaQueryWrapper<TaskClaim>().eq(TaskClaim::getTaskId, task.getId()));
        vo.setClaimCount(claimCount.intValue());

        // 已入选人数（被发布者选中且仍在参与中）；广场卡与「我的任务」据此显示 已入选/已入队 Y/N
        vo.setMemberCount(memberCount(task.getId()).intValue());

        // 当前用户对该任务的认领状态（用于前端按钮展示）
        if (viewerId != null) {
            TaskClaim mine = taskClaimMapper.selectOne(
                    new LambdaQueryWrapper<TaskClaim>()
                            .eq(TaskClaim::getTaskId, task.getId())
                            .eq(TaskClaim::getClaimerId, viewerId));
            if (mine != null) {
                vo.setMyClaimStatus(mine.getStatus());
            }
            // 发布者视角：被选中认领者的状态（多人逐个确认时，只要还有人在等确认就按 submitted 展示，
            // 否则第一个人确认完按钮就会消失，剩下的人无从确认）
            if (viewerId.equals(task.getPublisherId())) {
                List<TaskClaim> selectedList = taskClaimMapper.selectList(
                        new LambdaQueryWrapper<TaskClaim>()
                                .eq(TaskClaim::getTaskId, task.getId())
                                .eq(TaskClaim::getSelected, 1));
                if (!selectedList.isEmpty()) {
                    boolean anySubmitted = selectedList.stream()
                            .anyMatch(c -> "submitted".equals(c.getStatus()));
                    vo.setSelectedClaimStatus(anySubmitted ? "submitted" : selectedList.get(0).getStatus());
                }
            }
        }

        applyContactVisibility(vo, task, viewerId);

        return vo;
    }

    /** 已入选人数（被发布者选中且仍在参与中的人）——「任务是否已开始、能否被报名截止解散」的唯一判据 */
    public Long memberCount(Long taskId) {
        return taskClaimMapper.selectCount(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getTaskId, taskId)
                .eq(TaskClaim::getSelected, 1)
                .in(TaskClaim::getStatus, SELECTED_STATUSES));
    }

    /**
     * 招募收尾：把仍留在候选池（待配对）的报名者统一改状态并通知。
     * 满员、发布者主动结束招募、报名截止后按现有人数开工 → rejected（未入选）；
     * 报名截止且无人入选（任务解散下架）→ cancelled（已取消）。
     */
    public void closeCandidatePool(Long taskId, String title, String newStatus, String message) {
        List<TaskClaim> pending = taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getTaskId, taskId)
                .eq(TaskClaim::getStatus, "pending_pairing"));
        for (TaskClaim c : pending) {
            c.setStatus(newStatus);
            taskClaimMapper.updateById(c);
            notificationService.notify(c.getClaimerId(), "「" + title + "」" + message, "pair");
        }
    }

    /**
     * 重新发布（过期任务复活）：只改报名截止，其它字段一律不改，所以免审核直接上线。
     * 只接收天数（不接受任何内容字段），从接口层面就不可能借"重新发布"偷改内容绕过审核。
     * 过期时冻结的蛋蛋币已退回，这里按发布时的同一口径重新冻结；余额不足则整体回滚。
     */
    @Transactional
    public void renewTask(Long userId, Long taskId, int signupDays) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        if (!task.getPublisherId().equals(userId)) {
            throw new BusinessException(403, "只能重新发布自己发布的任务");
        }
        if (!"expired".equals(task.getStatus())) {
            throw new BusinessException("只有已过期的任务可以重新发布");
        }
        /* 有修改稿在审时不能"重新发布"：否则旧稿再审过会拿旧内容覆盖新截止 */
        if (pendingRevisionOf(taskId) != null) {
            throw new BusinessException("该任务有一份修改稿在审核中，请等审核结果出来后再重新发布");
        }
        // 过期时间取 updated_at（置 expired 时由数据库 ON UPDATE 刷新），超过窗口就只能重新发新任务
        if (task.getUpdatedAt() != null
                && task.getUpdatedAt().isBefore(LocalDateTime.now().minusDays(RENEW_WINDOW_DAYS))) {
            throw new BusinessException("任务过期已超过 " + RENEW_WINDOW_DAYS + " 天，请重新发布一条新任务");
        }
        int days = Math.min(Math.max(signupDays, 1), MAX_SIGNUP_DAYS);
        LocalDateTime newDeadline = LocalDateTime.now().toLocalDate().plusDays(days).atTime(23, 59, 59);
        // 条件更新抢占：并发的第二次点击（或已被别的流程改动）返回 0，不能再扣款
        if (taskMapper.renewIfExpired(taskId, newDeadline) == 0) {
            throw new BusinessException("任务状态已变化，请刷新后重试");
        }
        int frozen = frozenAmountOf(task);
        if (frozen > 0) {
            pointService.changeBalance(userId, -frozen, "freeze",
                    "重新发布任务冻结：" + task.getTitle(), taskId);
        }
        // 免审核直接上线，但管理员要知情
        notificationService.notifyAdmins("「" + task.getTitle() + "」已由发布者重新发布并直接上线（原审核已通过，无需再审）", "deadline");
    }

    /**
     * 广场上有人对"已过期"的任务点「催一下发布者」：通知发布者任务已过期、可重新发布。
     * 同一任务同一截止日期 24 小时内只提醒一次，避免被反复点爆。
     */
    public void nudgePublisher(Long viewerId, Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        if (!"expired".equals(task.getStatus())) {
            throw new BusinessException("任务未过期，可直接认领");
        }
        if (viewerId != null && viewerId.equals(task.getPublisherId())) {
            return;   // 自己点自己不提醒
        }
        LocalDateTime deadline = effectiveSignupDeadline(task);
        String when = deadline == null ? "" : deadline.toLocalDate().toString();
        notificationService.notifyOnce(task.getPublisherId(),
                "有同学想认领你的任务「" + task.getTitle() + "」，但它已于 " + when + " 过期。" +
                        "点「我的任务 → 已过期」可重新发布，重新发布无需再次审核",
                "deadline", 24);
    }
}
