package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.dto.TaskChatBackfillVO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * 存量数据洗刷：给「改版前就已在线」的教学/组队任务补建任务群，并把已入选的老成员拉进群。
 *
 * 背景：`tasks.conversation_id` 是随「任务绑定群聊」这次改动新增的列，
 * 线上历史任务该列一律为空 —— 它们没有任务群，发布者与搭子仍只能靠站外联系方式沟通。
 * 本服务由主管理员手工触发一次（POST /api/admin/tasks/backfill-chat-groups），可重复执行。
 *
 * 设计要点（与「一个 @Transactional 包住整个批次」不同，这里刻意逐任务独立事务）：
 * 1. **逐任务独立事务**：每个任务在 REQUIRES_NEW 事务里完成「建群 + 回写 conversation_id + 拉人」，
 *    任一环节失败则整个任务回滚，conversation_id 保持为空 → 重跑时会重新尝试，不会留下半成品；
 *    若把整批塞进一个事务，任务 A 失败时它已建的会话/群会跟着本批一起提交，反而制造出没有任务认领的孤儿群。
 * 2. **失败隔离**：单个任务抛异常只记进 failures，不影响后面仍在处理的其它任务（批次不整体回滚）。
 * 3. **幂等**：只处理 conversation_id 为空的任务；已建群的任务直接跳过，重复触发不会重复建群。
 */
@Service
@RequiredArgsConstructor
public class LegacyDataMigrationService {

    /** 需要补群的任务状态：仍在招募/进行中的教学、组队任务 */
    public static final List<String> ELIGIBLE_STATUSES = List.of("approved", "in_progress", "full");

    /** 需要补群的任务类型（只有这两类任务有任务群） */
    private static final List<String> ELIGIBLE_TYPES = List.of("teach", "team");

    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final TaskService taskService;
    private final ChatGroupService chatGroupService;
    private final PlatformTransactionManager transactionManager;

    /**
     * 补建任务群（可重复执行）。
     * 候选 = 教学/组队 + approved/in_progress/full + conversation_id 为空；
     * 逐个任务建群、回写会话 ID，并把该任务下「已入选且仍在参与中」的成员拉进群。
     */
    public TaskChatBackfillVO backfillTaskChatGroups() {
        List<Task> candidates = taskMapper.selectList(new LambdaQueryWrapper<Task>()
                .in(Task::getTaskType, ELIGIBLE_TYPES)
                .in(Task::getStatus, ELIGIBLE_STATUSES)
                .isNull(Task::getConversationId)
                .orderByAsc(Task::getId));

        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        TaskChatBackfillVO vo = new TaskChatBackfillVO();
        vo.setScanned(candidates.size());
        List<String> failures = new ArrayList<>();
        int created = 0;
        int joined = 0;
        for (Task candidate : candidates) {
            try {
                Integer joinedHere = tx.execute(status -> backfillOne(candidate.getId()));
                if (joinedHere != null) {       // null = 该任务已被跳过（已建群 / 状态已变）
                    created++;
                    joined += joinedHere;
                }
            } catch (Exception e) {
                // 该任务的写入已随它自己的事务回滚，conversation_id 仍为空，重跑会再试一次
                failures.add("任务 #" + candidate.getId() + "「" + candidate.getTitle() + "」：" + rootMessage(e));
            }
        }
        vo.setCreated(created);
        vo.setJoined(joined);
        vo.setFailed(failures.size());
        vo.setFailures(failures);
        return vo;
    }

    /**
     * 单个任务的补群：建群 + 回写 conversation_id + 拉已入选成员进群（同一个事务里，要么全成要么全不成）。
     * 复用 {@link TaskService#ensureTaskGroup}，保证补出来的群与「审核通过时自动建群」完全同源（同样的群名、群主、描述）。
     *
     * @return 本次拉进群的成员数；任务不存在、已建过群、或状态已不再是进行中时返回 null（跳过）
     */
    private Integer backfillOne(Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null || task.getConversationId() != null) {
            return null;        // 已被别的请求补过群（防重复点击）：跳过
        }
        if (!ELIGIBLE_STATUSES.contains(task.getStatus())) {
            return null;        // 批次扫描到执行之间任务刚好完成/取消：不再建群，免得留下永远不归档的群
        }
        Long conversationId = taskService.ensureTaskGroup(task);
        if (conversationId == null) {
            return null;
        }

        int joined = 0;
        for (TaskClaim claim : taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getTaskId, taskId)
                .eq(TaskClaim::getSelected, 1)
                .in(TaskClaim::getStatus, TaskService.SELECTED_STATUSES))) {
            if (claim.getClaimerId().equals(task.getPublisherId())) {
                continue;       // 群主在建群时已入群，不再重复拉
            }
            // joinIfAbsent：老成员可能早就自己搜到群加过了，重复加群不能把整笔补群打回滚
            chatGroupService.joinIfAbsent(claim.getClaimerId(), conversationId);
            joined++;
        }
        return joined;
    }

    /** 取最内层异常信息：建群失败的真实原因通常在 SQL 层，包装类（如 DataAccessException）的话术没有参考价值 */
    private static String rootMessage(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getMessage() == null ? root.getClass().getSimpleName() : root.getMessage();
    }
}
