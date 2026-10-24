package com.eggworld.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

/**
 * 用户删除（注销）清理 Mapper：物理删除用户本体及其关联数据。
 *
 * 保留策略：用户发布的任务（tasks）、打听内容（gossip_posts / gossip_answers）予以保留，
 * 不影响其他用户的认领与评价；这三张表指向 users 的外键已由 sql/migrate-user-delete.sql 移除，
 * 发布者信息在业务层按"已注销"（查不到用户）处理。
 *
 * 注意：users 表配置了 MyBatis-Plus 逻辑删除（deleted 字段），
 * 故此处必须用原生 SQL 才能实现物理删除。
 */
@Mapper
public interface UserPurgeMapper {

    /** 先按该用户给出的点赞扣减被点赞者的获赞数（user_likes 无外键，删行前先修正计数，避免虚高） */
    @Update("UPDATE users u JOIN (" +
            "SELECT likee_id, COUNT(*) c FROM user_likes WHERE liker_id = #{userId} GROUP BY likee_id" +
            ") x ON x.likee_id = u.id SET u.likes = GREATEST(0, u.likes - x.c)")
    int decrementLikeeLikes(@Param("userId") Long userId);

    /** 先按该用户给出的回答点赞扣减回答的点赞数（gossip_answers.likes 为冗余计数） */
    @Update("UPDATE gossip_answers a JOIN (" +
            "SELECT answer_id, COUNT(*) c FROM gossip_likes WHERE user_id = #{userId} AND answer_id IS NOT NULL GROUP BY answer_id" +
            ") x ON x.answer_id = a.id SET a.likes = GREATEST(0, a.likes - x.c)")
    int decrementAnswerLikes(@Param("userId") Long userId);

    /* ===== 私有资料 ===== */

    @Delete("DELETE FROM user_stats WHERE user_id = #{userId}")
    int deleteStats(@Param("userId") Long userId);

    @Delete("DELETE FROM user_characters WHERE user_id = #{userId}")
    int deleteCharacters(@Param("userId") Long userId);

    @Delete("DELETE FROM user_skills WHERE user_id = #{userId}")
    int deleteSkills(@Param("userId") Long userId);

    /* ===== 私有记录 ===== */

    @Delete("DELETE FROM notifications WHERE user_id = #{userId}")
    int deleteNotifications(@Param("userId") Long userId);

    @Delete("DELETE FROM point_logs WHERE user_id = #{userId}")
    int deletePointLogs(@Param("userId") Long userId);

    /** 邀请记录：该用户既可能是邀请人，也可能是被邀请人 */
    @Delete("DELETE FROM invite_records WHERE inviter_id = #{userId} OR invitee_id = #{userId}")
    int deleteInviteRecords(@Param("userId") Long userId);

    @Delete("DELETE FROM feedback_tickets WHERE user_id = #{userId}")
    int deleteFeedbackTickets(@Param("userId") Long userId);

    @Delete("DELETE FROM school_complaints WHERE user_id = #{userId}")
    int deleteSchoolComplaints(@Param("userId") Long userId);

    /** 页面浏览埋点（无外键，需显式清理，避免注销后仍留有行为记录） */
    @Delete("DELETE FROM page_views WHERE user_id = #{userId}")
    int deletePageViews(@Param("userId") Long userId);

    /** 访客会话记录（无外键，需显式清理） */
    @Delete("DELETE FROM visitor_sessions WHERE user_id = #{userId}")
    int deleteVisitorSessions(@Param("userId") Long userId);

    /** 签到记录有用户外键，必须先于用户本体清理。 */
    @Delete("DELETE FROM daily_checkins WHERE user_id = #{userId}")
    int deleteDailyCheckins(@Param("userId") Long userId);

    /* ===== 互动数据 ===== */

    /** 该用户作为认领者的认领记录（其发布任务上他人的认领记录保留） */
    @Delete("DELETE FROM task_claims WHERE claimer_id = #{userId}")
    int deleteClaims(@Param("userId") Long userId);

    /** 用户点赞关系（其给出的 / 其收到的） */
    @Delete("DELETE FROM user_likes WHERE liker_id = #{userId} OR likee_id = #{userId}")
    int deleteUserLikes(@Param("userId") Long userId);

    /** 打听/八卦点赞（其给出的） */
    @Delete("DELETE FROM gossip_likes WHERE user_id = #{userId}")
    int deleteGossipLikes(@Param("userId") Long userId);

    /**
     * 爆料区点赞（其给出的）：无外键，必须显式清理。
     * 不删的话，注销后公开爆料的点赞数会被幽灵点赞长期抬高（2026-10-06 本地实测复现）。
     */
    @Delete("DELETE FROM gossip_report_likes WHERE user_id = #{userId}")
    int deleteGossipReportLikes(@Param("userId") Long userId);

    /* ===== 2026-10-06 本批新模块的个人数据（此前漏在注销清单外，会留下孤儿行） ===== */

    @Delete("DELETE FROM pets WHERE user_id = #{userId}")
    int deletePets(@Param("userId") Long userId);

    @Delete("DELETE FROM pet_inventory WHERE user_id = #{userId}")
    int deletePetInventory(@Param("userId") Long userId);

    @Delete("DELETE FROM career_test_reports WHERE user_id = #{userId}")
    int deleteCareerTestReports(@Param("userId") Long userId);

    @Delete("DELETE FROM cat_reputation WHERE user_id = #{userId}")
    int deleteCatReputation(@Param("userId") Long userId);

    @Delete("DELETE FROM cat_votes WHERE voter_id = #{userId}")
    int deleteCatVotes(@Param("userId") Long userId);

    /** 该用户领养过的猫：随账号一起释放（投票数/领养数按 COUNT(*) 实时统计，不会残留计数）。 */
    @Delete("DELETE FROM cat_adoptions WHERE adopter_id = #{userId}")
    int deleteCatAdoptions(@Param("userId") Long userId);

    /** 该用户的猫舍审核员身份。 */
    @Delete("DELETE FROM cat_reviewers WHERE user_id = #{userId}")
    int deleteCatReviewers(@Param("userId") Long userId);

    /* 新模块中**刻意保留**、注销时不删除的内容与理由：
       · gossip_reports / gossip_report_comments —— 社区内容与审核留痕，作者按「查不到用户」显示为已注销用户；
       · gossip_report_rewards / cat_reward_grants —— 资金流水与「每赛季只发一次」的幂等凭据，删了会破坏对账与防重发；
       · cat_rooms —— 他人可见的社区内容，ownerName 由 CatService.nicknameOf 回退为「神秘蛋蛋」；
       · gossip_report_actions / announcements / announcement_actions —— 写入者只可能是管理员，而管理员账号不可注销。 */

    /** 评价（其给出的 / 其收到的） */
    @Delete("DELETE FROM ratings WHERE rater_id = #{userId} OR ratee_id = #{userId}")
    int deleteRatings(@Param("userId") Long userId);

    /* ===== 聊天室（新外键必须先清理；消息匿名化保留，不随用户删除） ===== */

    @Delete("DELETE FROM chat_blocks WHERE user_id = #{userId} OR blocked_id = #{userId}")
    int deleteChatBlocks(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_follows WHERE follower_id = #{userId} OR following_id = #{userId}")
    int deleteChatFollows(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_friends WHERE user_id = #{userId} OR friend_id = #{userId}")
    int deleteChatFriends(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_friend_requests WHERE requester_id = #{userId} OR target_id = #{userId}")
    int deleteChatFriendRequests(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_read_states WHERE user_id = #{userId}")
    int deleteChatReadStates(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_conversation_members WHERE user_id = #{userId}")
    int deleteChatConversationMembers(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_group_members WHERE user_id = #{userId}")
    int deleteChatGroupMembers(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_mutes WHERE user_id = #{userId} OR operator_id = #{userId} OR revoked_by = #{userId}")
    int deleteChatMutes(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_reports WHERE reporter_id = #{userId} OR target_user_id = #{userId} OR handled_by = #{userId}")
    int deleteChatReports(@Param("userId") Long userId);

    @Delete("DELETE FROM chat_audit_logs WHERE operator_id = #{userId}")
    int deleteChatAuditLogs(@Param("userId") Long userId);

    /** 用户注销时先把发送者匿名化，保留群聊上下文，避免外键阻断。 */
    @Update("UPDATE chat_messages SET sender_id = 0 WHERE sender_id = #{userId}")
    int anonymizeChatMessages(@Param("userId") Long userId);

    /** 自建群：用户注销前必须转让或删除；这里先解散其拥有的群。 */
    @Update("UPDATE chat_groups SET status = 'dissolved' WHERE owner_id = #{userId}")
    int dissolveOwnedChatGroups(@Param("userId") Long userId);

    @Update("UPDATE chat_conversations SET status = 'dissolved' WHERE owner_id = #{userId}")
    int dissolveOwnedChatConversations(@Param("userId") Long userId);

    @Update("UPDATE chat_groups SET owner_id = 0 WHERE owner_id = #{userId}")
    int anonymizeChatGroupOwner(@Param("userId") Long userId);
    /* ===== 用户本体（物理删除，绕过逻辑删除） ===== */

    @Delete("DELETE FROM users WHERE id = #{userId}")
    int hardDeleteUser(@Param("userId") Long userId);
}
