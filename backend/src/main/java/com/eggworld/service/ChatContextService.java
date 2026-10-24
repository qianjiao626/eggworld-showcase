package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.dto.ChatConversationContextVO;
import com.eggworld.entity.ChatConversation;
import com.eggworld.entity.ChatConversationMember;
import com.eggworld.entity.Task;
import com.eggworld.entity.TaskClaim;
import com.eggworld.entity.User;
import com.eggworld.mapper.ChatConversationMapper;
import com.eggworld.mapper.ChatConversationMemberMapper;
import com.eggworld.mapper.TaskClaimMapper;
import com.eggworld.mapper.TaskMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 任务群会话语境聚合服务。
 *
 * 「教学 / 组队任务与聊天室打通」后，群不再只是聊天的地方：群里同时要展示关联任务、
 * 区分「谁发布 / 谁认领」、并在合适的状态下给出「提交完成 / 确认完成」入口。
 * 这些信息分散在三张表，统一在这里聚合，前端一次请求即可渲染整个右侧面板。
 */
@Service
@RequiredArgsConstructor
public class ChatContextService {

    private final ChatConversationMapper conversationMapper;
    private final ChatConversationMemberMapper memberMapper;
    private final TaskMapper taskMapper;
    private final TaskClaimMapper taskClaimMapper;
    private final UserMapper userMapper;
    private final ChatPermissionService permissionService;

    /**
     * 查询会话上下文。
     *
     * @param userId         当前登录用户
     * @param conversationId 会话 ID
     */
    public ChatConversationContextVO context(Long userId, Long conversationId) {
        // ① 会话内部信息（成员名单、任务绑定关系）只对会话成员开放
        permissionService.requireMember(conversationId, userId);
        ChatConversation conversation = conversationMapper.selectById(conversationId);

        ChatConversationContextVO vo = new ChatConversationContextVO();
        vo.setConversationId(conversationId);
        vo.setType(conversation == null ? null : conversation.getType());
        vo.setTitle(conversation == null ? null : conversation.getTitle());
        vo.setReadOnly(conversation == null ? 0 : conversation.getReadOnly());

        // ② 反查关联任务：tasks.conversation_id 指向本会话；没有就是 null（频道 / 自建群 / 私聊）
        Task task = taskMapper.selectOne(new LambdaQueryWrapper<Task>()
                .eq(Task::getConversationId, conversationId)
                .orderByDesc(Task::getId)
                .last("LIMIT 1"));

        Map<Long, TaskClaim> claimByUser = new HashMap<>();
        if (task != null) {
            for (TaskClaim claim : taskClaimMapper.selectList(new LambdaQueryWrapper<TaskClaim>()
                    .eq(TaskClaim::getTaskId, task.getId()))) {
                // 同一用户在同一任务只会有一条认领记录；putIfAbsent 只是防御脏数据
                claimByUser.putIfAbsent(claim.getClaimerId(), claim);
            }
            vo.setTask(taskBrief(task, userId, claimByUser.get(userId)));
        }

        vo.setMembers(members(conversationId, userId, task, claimByUser));
        return vo;
    }

    /** 活跃成员 + 任务角色标记（按入群先后排序） */
    private List<ChatConversationContextVO.MemberVO> members(Long conversationId, Long userId,
                                                            Task task, Map<Long, TaskClaim> claimByUser) {
        List<ChatConversationMember> rows = memberMapper.selectList(
                new LambdaQueryWrapper<ChatConversationMember>()
                        .eq(ChatConversationMember::getConversationId, conversationId)
                        .eq(ChatConversationMember::getStatus, "active")
                        .orderByAsc(ChatConversationMember::getId));
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Long> userIds = rows.stream().map(ChatConversationMember::getUserId).distinct().toList();
        Map<Long, User> users = userMapper.selectBatchIds(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));

        List<ChatConversationContextVO.MemberVO> list = new ArrayList<>(rows.size());
        for (ChatConversationMember row : rows) {
            ChatConversationContextVO.MemberVO member = new ChatConversationContextVO.MemberVO();
            member.setUserId(row.getUserId());
            User user = users.get(row.getUserId());
            member.setNickname(user == null ? "已注销用户" : user.getNickname());
            member.setRole(row.getRole());
            member.setMe(row.getUserId().equals(userId));
            if (task != null) {
                if (task.getPublisherId() != null && task.getPublisherId().equals(row.getUserId())) {
                    member.setTaskRole("publisher");
                } else {
                    TaskClaim claim = claimByUser.get(row.getUserId());
                    if (claim != null) {
                        member.setTaskRole("claimer");
                        member.setClaimStatus(claim.getStatus());
                    }
                }
            }
            list.add(member);
        }
        return list;
    }

    private ChatConversationContextVO.TaskBrief taskBrief(Task task, Long userId, TaskClaim myClaim) {
        ChatConversationContextVO.TaskBrief brief = new ChatConversationContextVO.TaskBrief();
        brief.setId(task.getId());
        brief.setTitle(task.getTitle());
        brief.setTaskType(task.getTaskType());
        brief.setStatus(task.getStatus());
        brief.setReward(task.getReward());
        brief.setSignupDeadline(task.getSignupDeadline());
        brief.setCompleteDeadline(task.getCompleteDeadline());
        brief.setPublisherId(task.getPublisherId());
        if (task.getPublisherId() != null && task.getPublisherId().equals(userId)) {
            brief.setMyTaskRole("publisher");
        } else if (myClaim != null) {
            brief.setMyTaskRole("claimer");
            brief.setMyClaimStatus(myClaim.getStatus());
        }
        return brief;
    }
}
