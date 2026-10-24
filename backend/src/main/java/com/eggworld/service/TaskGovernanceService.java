package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.dto.TaskVO;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskGovernanceLog;
import com.eggworld.mapper.TaskGovernanceLogMapper;
import com.eggworld.mapper.TaskMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Map;
import java.util.Set;

/**
 * 任务治理（管理后台「任务管理」页，仅主管理员可调用）。
 * <p>
 * 四类处置：
 * <ul>
 *   <li><b>屏蔽</b>：{@code hidden=1}，前台广场/搜索不再展示、不可认领，数据保留、可恢复。
 *       刻意不复用 {@code status} —— 那套是认领/评价依赖的工作流状态机。</li>
 *   <li><b>恢复</b>：{@code hidden=0} 并清空处置原因。</li>
 *   <li><b>删除</b>：{@code deleted=1} 逻辑删除，前台与发布者都不可见，数据保留可追溯。</li>
 *   <li><b>退回审核</b>：{@code status='pending'} 并解除屏蔽，回到审核中心重新审。</li>
 * </ul>
 * 每次处置都往 {@code task_governance_log} 追加一条流水（只增不改），
 * 因为同一条任务会被反复处置，「最后处置人」这类覆盖式字段留不住过程。
 */
@Service
@RequiredArgsConstructor
public class TaskGovernanceService {

    /**
     * 已有认领/结算在途的状态：这些任务**不允许**删除或退回审核，
     * 否则会打断认领者与蛋蛋币结算（退币/确认完成的链路都依赖原状态）。
     * 这类任务仍可用「屏蔽」把内容下架。
     */
    private static final Set<String> FUND_INVOLVED_STATUSES =
            Set.of("in_progress", "full", "submitted", "completed");

    /** 报错文案用的中文状态名（只覆盖会出现在提示里的那几个） */
    private static final Map<String, String> STATUS_LABELS = Map.of(
            "in_progress", "进行中",
            "full", "已满员",
            "submitted", "待确认",
            "completed", "已完成");

    private final TaskMapper taskMapper;
    private final TaskGovernanceLogMapper governanceLogMapper;
    private final TaskService taskService;

    /** 任务管理列表（含已屏蔽 / 已删除），查询逻辑复用 TaskService */
    public Page<TaskVO> manageTasks(String status, String type, String keyword, long page, long size) {
        return taskService.manageTasks(status, type, keyword, page, size);
    }

    /** 处置流水（taskId 为空表示全部任务的最新处置记录） */
    public Page<TaskGovernanceLog> logs(Long taskId, long page, long size) {
        LambdaQueryWrapper<TaskGovernanceLog> wrapper = new LambdaQueryWrapper<TaskGovernanceLog>()
                .eq(taskId != null, TaskGovernanceLog::getTaskId, taskId)
                .orderByDesc(TaskGovernanceLog::getId);
        return governanceLogMapper.selectPage(new Page<>(page, size), wrapper);
    }

    /** 屏蔽：下架但保留数据，发布者仍可见、可恢复 */
    @Transactional
    public void hide(Long taskId, String reason) {
        String clean = requireReason(reason, "屏蔽");
        Task task = mustExist(taskId);
        if (isDeleted(task)) {
            throw new BusinessException("该任务已删除，不能再屏蔽");
        }
        if (isHidden(task)) {
            throw new BusinessException("该任务已经是屏蔽状态");
        }
        taskMapper.hideTask(taskId, clean);
        writeLog(task, TaskGovernanceLog.ACTION_HIDE, clean);
    }

    /** 恢复：解除屏蔽并清空处置原因 */
    @Transactional
    public void restore(Long taskId, String reason) {
        Task task = mustExist(taskId);
        if (isDeleted(task)) {
            throw new BusinessException("该任务已删除，不能恢复");
        }
        if (!isHidden(task)) {
            throw new BusinessException("该任务当前不是屏蔽状态，无需恢复");
        }
        taskMapper.restoreTask(taskId);
        writeLog(task, TaskGovernanceLog.ACTION_RESTORE, clean(reason));
    }

    /** 删除：逻辑删除，前台与发布者都不可见 */
    @Transactional
    public void delete(Long taskId, String reason) {
        String clean = requireReason(reason, "删除");
        Task task = mustExist(taskId);
        if (isDeleted(task)) {
            throw new BusinessException("该任务已删除");
        }
        assertNoFundsInFlight(task, "删除");
        taskMapper.deleteTask(taskId, clean);
        writeLog(task, TaskGovernanceLog.ACTION_DELETE, clean);
    }

    /** 退回审核：任务回到 pending 重新进审核中心，同时解除屏蔽 */
    @Transactional
    public void returnReview(Long taskId, String reason) {
        Task task = mustExist(taskId);
        if (isDeleted(task)) {
            throw new BusinessException("该任务已删除，不能退回审核");
        }
        assertNoFundsInFlight(task, "退回审核");
        taskMapper.returnToReview(taskId);
        writeLog(task, TaskGovernanceLog.ACTION_RETURN_REVIEW, clean(reason));
    }

    // ==================== 内部工具 ====================

    private Task mustExist(Long taskId) {
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(404, "任务不存在");
        }
        return task;
    }

    private void assertNoFundsInFlight(Task task, String action) {
        String status = task.getStatus();
        if (status != null && FUND_INVOLVED_STATUSES.contains(status)) {
            throw new BusinessException("该任务已有认领/结算记录（当前状态："
                    + STATUS_LABELS.getOrDefault(status, status)
                    + "），不能" + action + "；如需下架内容请改用「屏蔽」");
        }
    }

    private void writeLog(Task task, String action, String reason) {
        LoginUser me = UserContext.get();
        TaskGovernanceLog log = new TaskGovernanceLog();
        log.setTaskId(task.getId());
        log.setTaskTitle(task.getTitle() == null ? "" : task.getTitle());
        log.setAction(action);
        log.setReason(reason == null ? "" : reason);
        log.setOperatorId(me == null ? null : me.getId());
        log.setOperatorName(me == null || me.getNickname() == null ? "" : me.getNickname());
        governanceLogMapper.insert(log);
    }

    private String requireReason(String reason, String action) {
        String clean = clean(reason);
        if (!StringUtils.hasText(clean)) {
            throw new BusinessException(action + "必须填写原因");
        }
        return clean;
    }

    private String clean(String reason) {
        return reason == null ? "" : reason.trim();
    }

    private boolean isHidden(Task task) {
        return Integer.valueOf(1).equals(task.getHidden());
    }

    private boolean isDeleted(Task task) {
        return Integer.valueOf(1).equals(task.getDeleted());
    }
}
