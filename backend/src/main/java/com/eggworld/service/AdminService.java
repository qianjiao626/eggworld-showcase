package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.AdminUserOverviewVO;
import com.eggworld.dto.AdminUserVO;
import com.eggworld.dto.GivenRatingVO;
import com.eggworld.dto.RatingListVO;
import com.eggworld.dto.TaskVO;
import com.eggworld.dto.UserProfileVO;
import com.eggworld.entity.InviteRecord;
import com.eggworld.entity.PointLog;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.mapper.AdminUserMapper;
import com.eggworld.mapper.InviteRecordMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserPurgeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 管理后台服务：用户管理
 * - 用户列表 / 查看单个用户详情（总览、发布/认领任务、评价、蛋蛋币流水）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminService {

    private final AdminUserMapper adminUserMapper;
    private final UserMapper userMapper;
    private final UserPurgeMapper userPurgeMapper;
    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final InviteRecordMapper inviteRecordMapper;
    private final UserService userService;
    private final TaskService taskService;
    private final RatingService ratingService;
    private final PointService pointService;

    /** BCrypt 密码加密器（与注册/登录一致） */
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    /**
     * 用户列表（分页，可按昵称/邮箱搜索 + 注册时间下限 + 状态筛选，不含密码；含邀请人数统计）
     *
     * @param createdFrom 注册时间下限（含），用于工作台「今日新增」下钻；为空则不筛
     * @param status      active（正常）/ banned（已封禁）；其他值或空视为「全部」
     * @param sort        created_desc（默认，按注册时间倒序）/ invite_desc / invite_asc；其他值回落默认
     */
    public Page<AdminUserVO> listUsers(String keyword, LocalDateTime createdFrom, String status,
                                       long page, long size, String sort) {
        // 全空白的关键词按「不筛」处理（与前端搜索框留空一致）
        String kw = StringUtils.hasText(keyword) ? keyword.trim() : null;
        return adminUserMapper.selectUserPage(new Page<>(page, size), kw, createdFrom,
                normalizeUserStatus(status), normalizeUserSort(sort));
    }

    /** 状态白名单：只允许 active / banned 进入 SQL，其余（含 null）按「全部」处理 */
    private String normalizeUserStatus(String status) {
        if ("active".equals(status) || "banned".equals(status)) {
            return status;
        }
        return null;
    }

    /** 排序白名单：只允许这三个值进入 SQL 的 ORDER BY */
    private String normalizeUserSort(String sort) {
        if ("invite_desc".equals(sort) || "invite_asc".equals(sort)) {
            return sort;
        }
        return "created_desc";
    }

    /**
     * 查看单个用户总览：资料（复用 buildProfile，内部对不存在用户抛 404）+ 行为统计
     */
    public AdminUserOverviewVO overview(Long userId) {
        UserProfileVO profile = userService.buildProfile(userId);

        AdminUserOverviewVO vo = new AdminUserOverviewVO();
        vo.setProfile(profile);

        // 发布/认领/进行中/完成统计（任务表按逻辑删除过滤）
        vo.setPublishedCount(taskMapper.selectCount(new LambdaQueryWrapper<Task>()
                .eq(Task::getPublisherId, userId)
                .eq(Task::getDeleted, 0)));
        vo.setClaimedCount(taskClaimMapper.selectCount(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getClaimerId, userId)));
        vo.setPublishedActiveCount(taskMapper.selectCount(new LambdaQueryWrapper<Task>()
                .eq(Task::getPublisherId, userId)
                .in(Task::getStatus, "in_progress", "full")   /* full = 组队已满员/结束招募，仍在推进 */
                .eq(Task::getDeleted, 0)));
        vo.setCompletedCount(taskClaimMapper.selectCount(new LambdaQueryWrapper<TaskClaim>()
                .eq(TaskClaim::getClaimerId, userId)
                .eq(TaskClaim::getStatus, "completed")));

        // 收到的评价均分与总数（复用 listMine 的统计，只取一页即可拿到）
        RatingListVO mine = ratingService.listMine(userId, 1, 1);
        vo.setReceivedRatingAvg(mine.getAvg());
        vo.setReceivedRatingCount(mine.getCount());

        // 成功邀请注册人数（已发放奖励）
        vo.setInviteCount(inviteRecordMapper.selectCount(new LambdaQueryWrapper<InviteRecord>()
                .eq(InviteRecord::getInviterId, userId)
                .eq(InviteRecord::getStatus, "rewarded")));
        return vo;
    }

    /**
     * 查看用户发布/认领的任务（viewer 传目标用户本人，能带出其认领状态/联系方式可见性）
     */
    public Page<TaskVO> userTasks(Long userId, String role, long page, long size) {
        requireUserExists(userId);
        if ("claimed".equals(role)) {
            return taskService.myClaimed(userId, page, size);
        }
        // 默认查发布的
        return taskService.myPublished(userId, page, size);
    }

    /** 查看用户收到的评价（分页，含均分） */
    public RatingListVO receivedRatings(Long userId, long page, long size) {
        requireUserExists(userId);
        return ratingService.listMine(userId, page, size);
    }

    /** 查看用户给出的评价 */
    public List<GivenRatingVO> givenRatings(Long userId) {
        requireUserExists(userId);
        return ratingService.listMineGiven(userId);
    }

    /** 查看用户蛋蛋币流水（分页，可按类型筛选） */
    public Page<PointLog> userPointLogs(Long userId, String type, long page, long size) {
        requireUserExists(userId);
        return pointService.listLogs(userId, type, page, size);
    }

    /**
     * 封禁用户：管理员账号不可封禁，也不能封禁自己；
     * 封禁后该用户登录被拒、已有 token 的所有请求被拦截器拒绝
     */
    public void ban(Long targetId, Long operatorId) {
        User target = getTargetUser(targetId);
        if ("admin".equals(target.getRole())) {
            throw new BusinessException(400, "不能封禁管理员账号");
        }
        if (targetId.equals(operatorId)) {
            throw new BusinessException(400, "不能封禁自己");
        }
        target.setBanned(1);
        userMapper.updateById(target);
    }

    /** 解封用户 */
    public void unban(Long targetId) {
        User target = getTargetUser(targetId);
        target.setBanned(0);
        userMapper.updateById(target);
    }

    /**
     * 修改用户登录密码（主管理员操作）：以 BCrypt 重设密码，重置后该用户需用新密码登录。
     * 管理员账号不可操作。
     */
    public void resetPassword(Long targetId, String newPassword) {
        User target = getTargetUser(targetId);
        if ("admin".equals(target.getRole())) {
            throw new BusinessException(400, "不能修改管理员账号的密码");
        }
        target.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(target);
    }

    /**
     * 删除用户（主管理员操作）：物理删除该用户及其关联数据，不可恢复。
     * - 管理员账号不可删除，也不能删除自己
     * - 保留该用户发布的任务与打听内容（发布者届时显示为"已注销"），不影响其他用户的认领与评价
     * - 其余关联数据（五维属性、角色、技能、蛋蛋币流水、通知、点赞、认领记录、评价、邀请、反馈、吐槽）一并删除
     */
    @Transactional
    public void deleteUser(Long targetId, Long operatorId) {
        User target = getTargetUser(targetId);
        if ("admin".equals(target.getRole())) {
            throw new BusinessException(400, "不能删除管理员账号");
        }
        if (targetId.equals(operatorId)) {
            throw new BusinessException(400, "不能删除自己");
        }

        // 1) 先修正因删除点赞而受影响的冗余计数（获赞数 / 回答点赞数）
        userPurgeMapper.decrementLikeeLikes(targetId);
        userPurgeMapper.decrementAnswerLikes(targetId);

        // 2) 删除该用户的私有资料与关联数据
        userPurgeMapper.deleteStats(targetId);
        userPurgeMapper.deleteCharacters(targetId);
        userPurgeMapper.deleteSkills(targetId);
        userPurgeMapper.deleteNotifications(targetId);
        userPurgeMapper.deletePointLogs(targetId);
        userPurgeMapper.deleteInviteRecords(targetId);
        userPurgeMapper.deleteFeedbackTickets(targetId);
        userPurgeMapper.deleteSchoolComplaints(targetId);
        userPurgeMapper.deletePageViews(targetId);
        userPurgeMapper.deleteVisitorSessions(targetId);
        userPurgeMapper.deleteDailyCheckins(targetId);
        userPurgeMapper.deleteClaims(targetId);
        userPurgeMapper.deleteUserLikes(targetId);
        userPurgeMapper.deleteGossipLikes(targetId);
        userPurgeMapper.deleteGossipReportLikes(targetId);
        userPurgeMapper.deleteRatings(targetId);

        // 2026-10-06 本批新模块的个人数据（爆料/宠物/职业测评/猫舍）；保留策略见 UserPurgeMapper 注释。
        // 2026-10-07：职业测评 / 宠物系统 / 猫舍的库表本轮**不在线上新建** → 这 7 条清理对「表不存在」容错，
        // 否则任何一次注销都会因 Table 'eggworld.pets' doesn't exist 而整体回滚（注销直接失败）。
        purgeOptional("pets", () -> userPurgeMapper.deletePets(targetId));
        purgeOptional("pet_inventory", () -> userPurgeMapper.deletePetInventory(targetId));
        purgeOptional("career_test_reports", () -> userPurgeMapper.deleteCareerTestReports(targetId));
        purgeOptional("cat_reputation", () -> userPurgeMapper.deleteCatReputation(targetId));
        purgeOptional("cat_votes", () -> userPurgeMapper.deleteCatVotes(targetId));
        purgeOptional("cat_adoptions", () -> userPurgeMapper.deleteCatAdoptions(targetId));
        purgeOptional("cat_reviewers", () -> userPurgeMapper.deleteCatReviewers(targetId));

        // 聊天室：先解除关系和成员状态，再匿名化消息；群主注销时解散其群。
        userPurgeMapper.deleteChatBlocks(targetId);
        userPurgeMapper.deleteChatFollows(targetId);
        userPurgeMapper.deleteChatFriends(targetId);
        userPurgeMapper.deleteChatFriendRequests(targetId);
        userPurgeMapper.deleteChatReadStates(targetId);
        userPurgeMapper.deleteChatConversationMembers(targetId);
        userPurgeMapper.deleteChatGroupMembers(targetId);
        userPurgeMapper.deleteChatMutes(targetId);
        userPurgeMapper.deleteChatReports(targetId);
        userPurgeMapper.deleteChatAuditLogs(targetId);
        userPurgeMapper.dissolveOwnedChatGroups(targetId);
        userPurgeMapper.dissolveOwnedChatConversations(targetId);
        userPurgeMapper.anonymizeChatGroupOwner(targetId);
        userPurgeMapper.anonymizeChatMessages(targetId);

        // 3) 物理删除用户本体
        userPurgeMapper.hardDeleteUser(targetId);
    }

    /**
     * 注销清理里的「可选模块」表：表不存在时跳过并留痕，其余错误照常抛出。
     *
     * 为什么需要它（2026-10-07）：职业测评 / 宠物系统 / 猫舍本轮不在线上建表，但清理语句随 jar 上线；
     * 缺表会让 {@code DELETE FROM pets ...} 抛 SQLSyntaxErrorException(1146)，把整个注销事务回滚 ——
     * 表现为「注销点了没反应 / 报服务器内部错误」，而这三个模块的用户其实根本没有数据可清。
     * 表一旦补上，这里自动恢复成严格语义（非 1146 的错误一律上抛，不会静默吞掉真故障）。
     */
    private void purgeOptional(String table, Runnable action) {
        try {
            action.run();
        } catch (DataAccessException error) {
            if (!missingTable(error)) {
                throw error;
            }
            log.warn("[PURGE] 表 {} 不存在，跳过该模块的注销清理（模块本轮未上线）", table);
        }
    }

    /** 递归看根因里是否 MySQL「表不存在」（错误码 1146 / 42S02）；驱动与包装层差异用消息兜底 */
    private static boolean missingTable(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sqlException) {
                if (sqlException.getErrorCode() == 1146 || "42S02".equals(sqlException.getSQLState())) {
                    return true;
                }
            }
            String message = cause.getMessage();
            if (message != null && message.contains("doesn't exist")) {
                return true;
            }
        }
        return false;
    }

    /**
     * 设置/撤销副管理员（仅主管理员调用，Controller 已 @AdminOnly）
     * 副管理员可发布官方任务、审核任务；主管理员账号不可操作
     */
    public void setSubAdmin(Long targetId, boolean enable) {
        User target = getTargetUser(targetId);
        if ("admin".equals(target.getRole())) {
            throw new BusinessException(400, "主管理员账号不支持副管理员设置");
        }
        target.setSubAdmin(enable ? 1 : 0);
        userMapper.updateById(target);
    }

    /** 目标用户必须存在，否则 404 */
    private void requireUserExists(Long userId) {
        if (userMapper.selectById(userId) == null) {
            throw new BusinessException(404, "用户不存在");
        }
    }

    /** 查询目标用户（不存在则 404） */
    private User getTargetUser(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(404, "用户不存在");
        }
        return user;
    }
}
