package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskRevision;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

/**
 * 任务 Mapper
 */
@Mapper
public interface TaskMapper extends BaseMapper<Task> {
    /** 在同一事务中、发钱前抢占结算权；0 表示已结算。 */
    @Update("UPDATE tasks SET settled = 1 WHERE id = #{taskId} AND settled = 0")
    int markSettled(@Param("taskId") Long taskId);

    @Update("UPDATE tasks SET status = 'approved' WHERE id = #{id} AND status = 'pending'")
    int approveIfPending(@Param("id") Long id);

    @Update("UPDATE tasks SET status = 'rejected' WHERE id = #{id} AND status = 'pending'")
    int rejectIfPending(@Param("id") Long id);

    /** 报名截止到期：仅当仍为 approved 时置 expired（返回 0 表示已被其它流程处理，不能再退币） */
    @Update("UPDATE tasks SET status = 'expired' WHERE id = #{id} AND status = 'approved'")
    int expireIfApproved(@Param("id") Long id);

    /**
     * 组队招募结束：仅当仍为 approved 时置 full（满员 / 发布者结束招募 / 截止后按现有人数开局）。
     * 返回 0 表示已被其它流程处理（如已 expire），调用方不能再做收尾动作。
     */
    @Update("UPDATE tasks SET status = 'full' WHERE id = #{id} AND status = 'approved'")
    int closeRecruitIfApproved(@Param("id") Long id);

    /** 重新发布：仅当仍为 expired 时回到 approved 并写入新的报名截止（返回 0 表示状态已变，不能再扣款） */
    @Update("UPDATE tasks SET status = 'approved', signup_deadline = #{signupDeadline} WHERE id = #{id} AND status = 'expired'")
    int renewIfExpired(@Param("id") Long id, @Param("signupDeadline") LocalDateTime signupDeadline);

    /** 提交修改稿：已审核通过的任务退回 pending 等待重审（返回 0 表示状态已变） */
    @Update("UPDATE tasks SET status = 'pending' WHERE id = #{id} AND status = 'approved'")
    int markPendingForRevision(@Param("id") Long id);

    /**
     * 采纳修改稿：把新值写回任务并上线（返回 0 表示状态已变）
     * 允许的起点：pending（首次审核未过的任务被改了内容）/ expired（过期下架的任务改了内容，审完直接复活）
     * proof_image_id：服务层在提交改稿时已把「沿用原图 / 替换 / 移除」解析成最终值写进 task_revisions，
     * 这里原样赋值即可 —— 2026-10-07 起改稿支持补充/替换/移除证明图（此前刻意不写，现已按需求开放）。
     */
    @Update("UPDATE tasks SET status = 'approved',"
            + " title = #{r.title}, description = #{r.description}, requirements = #{r.requirements},"
            + " skill_category = #{r.skillCategory}, skill_sub = #{r.skillSub}, reward = #{r.reward},"
            + " claim_mode = #{r.claimMode}, max_claimers = #{r.maxClaimers}, contact = #{r.contact},"
            + " proof_image_id = #{r.proofImageId},"
            + " signup_deadline = #{r.signupDeadline}, complete_deadline = #{r.completeDeadline}"
            + " WHERE id = #{id} AND status IN ('pending', 'expired')")
    int applyRevisionIfRevisable(@Param("id") Long id, @Param("r") TaskRevision r);

    /** 驳回修改稿：任务按原内容恢复上线（返回 0 表示状态已变） */
    @Update("UPDATE tasks SET status = 'approved' WHERE id = #{id} AND status = 'pending'")
    int restoreIfPending(@Param("id") Long id);

    /** 切换优质标签（0↔1） */
    @Update("UPDATE tasks SET featured = IF(featured=1, 0, 1) WHERE id = #{id}")
    int toggleFeatured(@Param("id") Long id);

    /**
     * 回写任务绑定的群聊会话 ID（教学/组队任务上线自动建群用）。
     * 只改这一列：审核通过时内存里的 task 还是 pending 旧快照，
     * 走 updateById 会把 status 一起写回 pending，把刚通过的任务重新送回审核队列。
     */
    @Update("UPDATE tasks SET conversation_id = #{conversationId} WHERE id = #{id}")
    int bindConversation(@Param("id") Long id, @Param("conversationId") Long conversationId);

    // ==================== 任务治理（管理后台「任务管理」页） ====================
    // 统一走定向 SQL 而不是 LambdaUpdateWrapper：与本 Mapper 其余写操作的风格一致，
    // 且只改目标列，避免把内存里的旧快照（status/featured 等）整体写回。

    /** 屏蔽：置 hidden=1 并记录最近处置原因 */
    @Update("UPDATE tasks SET hidden = 1, governance_reason = #{reason} WHERE id = #{id}")
    int hideTask(@Param("id") Long id, @Param("reason") String reason);

    /** 恢复：解除屏蔽并清空处置原因 */
    @Update("UPDATE tasks SET hidden = 0, governance_reason = NULL WHERE id = #{id}")
    int restoreTask(@Param("id") Long id);

    /** 逻辑删除：置 deleted=1 并记录最近处置原因 */
    @Update("UPDATE tasks SET deleted = 1, governance_reason = #{reason} WHERE id = #{id}")
    int deleteTask(@Param("id") Long id, @Param("reason") String reason);

    /** 退回审核：回到 pending 重新进审核中心，同时解除屏蔽、清空处置原因 */
    @Update("UPDATE tasks SET status = 'pending', hidden = 0, governance_reason = NULL WHERE id = #{id}")
    int returnToReview(@Param("id") Long id);

}
