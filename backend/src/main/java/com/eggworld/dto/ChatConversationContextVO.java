package com.eggworld.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 任务群会话上下文：会话基础信息 + 关联任务 + 群成员任务角色。
 *
 * 前端聊天室右侧面板（关联任务 / 群成员 / 提交与确认按钮）一次拉齐所需的全部数据：
 * 会话在 chat_conversations、任务在 tasks（按 tasks.conversation_id 反查）、
 * 认领状态在 task_claims —— 拆成多次请求既多轮往返，又难保证三者在同一时刻一致。
 */
@Data
public class ChatConversationContextVO {

    private Long conversationId;
    private String type;
    private String title;

    /** 1 = 任务已结束，群聊为只读归档（对应 chat_conversations.read_only） */
    private Integer readOnly;

    /** 关联任务；官方频道 / 自建群 / 私聊没有绑定任务时为 null */
    private TaskBrief task;

    /** 会话的活跃成员 */
    private List<MemberVO> members;

    /** 与本次会话绑定的任务摘要（只给渲染与按钮判定需要的字段） */
    @Data
    public static class TaskBrief {
        private Long id;
        private String title;
        /** teach 教学 / help 求助 / team 组队 / reward 悬赏 */
        private String taskType;
        /** approved / full / in_progress / completed / cancelled … */
        private String status;
        private Integer reward;
        private LocalDateTime signupDeadline;
        private LocalDateTime completeDeadline;
        private Long publisherId;

        /** 当前登录用户在任务中的角色：publisher / claimer；非参与者为 null */
        private String myTaskRole;
        /** 当前登录用户的认领状态（仅 claimer 有值）：in_progress / submitted / completed … */
        private String myClaimStatus;
    }

    /** 群成员 + 其任务角色 */
    @Data
    public static class MemberVO {
        private Long userId;
        private String nickname;
        /** 会话角色：owner / admin / member */
        private String role;
        /**
         * 任务角色：publisher（发布者）/ claimer（有认领记录的参与者）。
         * 只是加进了群、并没有认领记录的旁观者为 null —— 不能一律按「非发布者即认领者」标注，
         * 否则公开任务群里误入的路人会被显示成「学员」，也会被前端当成可确认的对象。
         */
        private String taskRole;
        /** 该成员的任务认领状态（发布者与旁观者为 null） */
        private String claimStatus;
        /** 是否当前登录用户 */
        private boolean me;
    }
}
