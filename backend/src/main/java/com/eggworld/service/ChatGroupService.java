package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/** 自建群创建、加入、退出和成员管理。 */
@Service
@RequiredArgsConstructor
public class ChatGroupService {

    private final ChatGroupMapper groupMapper;
    private final ChatGroupMemberMapper groupMemberMapper;
    private final ChatConversationMapper conversationMapper;
    private final ChatConversationMemberMapper conversationMemberMapper;
    private final ChatPermissionService permissionService;

    @Transactional
    public Long create(Long ownerId, String name, String description, String visibility, List<Long> memberIds) {
        // 私密群已停用（2026-09-21）：只允许建公开群。
        // 原因：私密群"仅邀请"在无好友体系支撑下容易变成小圈子，与校园广场定位不符。
        // 注意：一对一私聊走 ChatMessageService.createDirect()，不经过这里，不受影响。
        if (!"public".equals(visibility)) {
            throw new BusinessException("当前仅支持创建公开群（私密群已停用）");
        }
        long owned = groupMapper.selectCount(new LambdaQueryWrapper<ChatGroup>()
                .eq(ChatGroup::getOwnerId, ownerId).eq(ChatGroup::getStatus, "active"));
        if (owned >= 5) throw new BusinessException("每个用户最多创建5个群");

        return createConversationAndGroup(ownerId, name, description, visibility, memberIds);
    }

    /**
     * 任务群：由任务系统在教学/组队任务上线时自动创建（群名 = 任务标题，群主 = 任务发布者）。
     * 与 {@link #create} 的唯一差别是不占用「每人最多 5 个自建群」的额度 ——
     * 否则发布满 5 个任务的用户连新任务都发不出去（create 会抛异常，把整笔发布事务一起回滚）。
     * visibility 固定传 public：私密群已停用，任务群同样是公开群。
     */
    @Transactional
    public Long createTaskGroup(Long ownerId, String name, String description) {
        return createConversationAndGroup(ownerId, name, description, "public", null);
    }

    /** create / createTaskGroup 的公共建群落库部分（会话 + 群 + 群主成员） */
    private Long createConversationAndGroup(Long ownerId, String name, String description,
                                            String visibility, List<Long> memberIds) {
        ChatConversation c = new ChatConversation();
        c.setType("group"); c.setTitle(name); c.setDescription(description);
        c.setOwnerId(ownerId); c.setVisibility(visibility); c.setStatus("active");
        c.setMaxMembers(200); c.setMemberCount(1);
        conversationMapper.insert(c);

        ChatGroup g = new ChatGroup();
        g.setConversationId(c.getId()); g.setOwnerId(ownerId); g.setName(name);
        g.setDescription(description); g.setVisibility(visibility); g.setMaxMembers(200); g.setStatus("active");
        groupMapper.insert(g);

        addGroupMember(g.getId(), ownerId, "owner");
        addConversationMember(c.getId(), ownerId, "owner");
        if (memberIds != null) {
            for (Long memberId : memberIds.stream().filter(Objects::nonNull).distinct().limit(199).toList()) {
                if (!memberId.equals(ownerId)) inviteInternal(g, ownerId, memberId);
            }
        }
        return c.getId();
    }

    @Transactional
    public void invite(Long operatorId, Long conversationId, Long targetId) {
        ChatGroup g = requireGroup(conversationId);
        if (!permissionService.isGroupOwnerOrAdmin(g.getId(), operatorId)) throw new BusinessException(403, "只有群主或管理员可以邀请成员");
        inviteInternal(g, operatorId, targetId);
    }

    @Transactional
    public void join(Long userId, Long conversationId) {
        ChatGroup g = requireGroup(conversationId);
        if (!"public".equals(g.getVisibility())) throw new BusinessException(403, "私密群需要邀请");
        if (activeMember(g.getId(), userId) != null) throw new BusinessException("你已在群中");
        doJoin(g, userId);
    }

    /**
     * 任务群拉人（幂等）：已是成员直接返回，不报错。
     * 任务群是公开群，认领者可能先在群聊广场自己搜到并加了群；
     * 若沿用 {@link #join} 的「你已在群中」异常，会把整笔配对（含冻结的蛋蛋币）一起回滚。
     */
    @Transactional
    public void joinIfAbsent(Long userId, Long conversationId) {
        ChatGroup g = requireGroup(conversationId);
        if (activeMember(g.getId(), userId) != null) return;
        doJoin(g, userId);
    }

    /** join / joinIfAbsent 的公共落库部分 */
    private void doJoin(ChatGroup g, Long userId) {
        if (g.getMaxMembers() != null && activeCount(g.getId()) >= g.getMaxMembers()) throw new BusinessException("群成员已满");
        ChatGroupMember old = groupMemberMapper.selectOne(new LambdaQueryWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, g.getId()).eq(ChatGroupMember::getUserId, userId));
        if (old != null && "blocked".equals(old.getStatus())) throw new BusinessException(403, "你已被该群拉黑");
        addGroupMember(g.getId(), userId, "member");
        addConversationMember(g.getConversationId(), userId, "member");
        conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                .eq(ChatConversation::getId, g.getConversationId()).setSql("member_count = member_count + 1"));
    }

    @Transactional
    public void leave(Long userId, Long conversationId) {
        ChatGroup g = requireGroup(conversationId);
        if (g.getOwnerId().equals(userId)) throw new BusinessException("群主不能直接退群，请先转让或解散");
        groupMemberMapper.update(null, new LambdaUpdateWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, g.getId()).eq(ChatGroupMember::getUserId, userId)
                .set(ChatGroupMember::getStatus, "left").set(ChatGroupMember::getLeftAt, LocalDateTime.now()));
        conversationMemberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, g.getConversationId())
                .eq(ChatConversationMember::getUserId, userId)
                .set(ChatConversationMember::getStatus, "left").set(ChatConversationMember::getLeftAt, LocalDateTime.now()));
        conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                .eq(ChatConversation::getId, g.getConversationId()).setSql("member_count = GREATEST(0, member_count - 1)"));
    }

    @Transactional
    public void setAdmin(Long operatorId, Long conversationId, Long targetId, boolean admin) {
        ChatGroup g = requireGroup(conversationId);
        if (!g.getOwnerId().equals(operatorId)) throw new BusinessException(403, "只有群主可以设置管理员");
        if (admin) {
            Long count = groupMemberMapper.selectCount(new LambdaQueryWrapper<ChatGroupMember>()
                    .eq(ChatGroupMember::getGroupId, g.getId()).eq(ChatGroupMember::getRole, "admin").eq(ChatGroupMember::getStatus, "active"));
            if (count >= 3) throw new BusinessException("最多设置3名群管理员");
        }
        groupMemberMapper.update(null, new LambdaUpdateWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, g.getId()).eq(ChatGroupMember::getUserId, targetId)
                .set(ChatGroupMember::getRole, admin ? "admin" : "member"));
        conversationMemberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, g.getConversationId()).eq(ChatConversationMember::getUserId, targetId)
                .set(ChatConversationMember::getRole, admin ? "admin" : "member"));
    }

    @Transactional
    public void kick(Long operatorId, Long conversationId, Long targetId) {
        ChatGroup g = requireGroup(conversationId);
        if (!permissionService.isGroupOwnerOrAdmin(g.getId(), operatorId)) throw new BusinessException(403, "无群管理权限");
        if (g.getOwnerId().equals(targetId)) throw new BusinessException("不能移除群主");
        ChatGroupMember target = activeMember(g.getId(), targetId);
        if (target == null) throw new BusinessException("成员不在群中");
        if ("admin".equals(target.getRole()) && !g.getOwnerId().equals(operatorId)) throw new BusinessException(403, "管理员不能移除其他管理员");
        groupMemberMapper.update(null, new LambdaUpdateWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getId, target.getId()).set(ChatGroupMember::getStatus, "kicked").set(ChatGroupMember::getLeftAt, LocalDateTime.now()));
        conversationMemberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, g.getConversationId()).eq(ChatConversationMember::getUserId, targetId)
                .set(ChatConversationMember::getStatus, "kicked").set(ChatConversationMember::getLeftAt, LocalDateTime.now()));
        conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                .eq(ChatConversation::getId, g.getConversationId()).setSql("member_count = GREATEST(0, member_count - 1)"));
    }

    @Transactional
    public void transferOwner(Long ownerId, Long conversationId, Long targetId) {
        ChatGroup g = requireGroup(conversationId);
        if (!g.getOwnerId().equals(ownerId)) throw new BusinessException(403, "只有群主可以转让群主");
        ChatGroupMember target = activeMember(g.getId(), targetId);
        if (target == null) throw new BusinessException("目标成员不在群中");
        groupMapper.update(null, new LambdaUpdateWrapper<ChatGroup>()
                .eq(ChatGroup::getId, g.getId()).set(ChatGroup::getOwnerId, targetId));
        conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                .eq(ChatConversation::getId, g.getConversationId()).set(ChatConversation::getOwnerId, targetId));
        groupMemberMapper.update(null, new LambdaUpdateWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, g.getId()).eq(ChatGroupMember::getUserId, ownerId)
                .set(ChatGroupMember::getRole, "member"));
        groupMemberMapper.update(null, new LambdaUpdateWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, g.getId()).eq(ChatGroupMember::getUserId, targetId)
                .set(ChatGroupMember::getRole, "owner"));
        conversationMemberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, g.getConversationId()).eq(ChatConversationMember::getUserId, ownerId)
                .set(ChatConversationMember::getRole, "member"));
        conversationMemberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, g.getConversationId()).eq(ChatConversationMember::getUserId, targetId)
                .set(ChatConversationMember::getRole, "owner"));
    }
    @Transactional
    public void dissolve(Long ownerId, Long conversationId) {
        ChatGroup g = requireGroup(conversationId);
        if (!g.getOwnerId().equals(ownerId)) throw new BusinessException(403, "只有群主可以解散群");
        groupMapper.update(null, new LambdaUpdateWrapper<ChatGroup>().eq(ChatGroup::getId, g.getId()).set(ChatGroup::getStatus, "dissolved"));
        conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                .eq(ChatConversation::getId, g.getConversationId()).set(ChatConversation::getStatus, "dissolved"));
    }

    /**
     * 任务结束归档：把会话置为只读（read_only=1），群内谁都不能再发言，历史消息照常可查。
     *
     * ⚠️ 只改 read_only，**不动 status**：listConversations 与 requireActiveConversation 都要求 status='active'，
     *    置成 'archived' 会让群从会话列表里消失、连历史都读不了。
     * ⚠️ 不走 requireGroup：群可能已被群主解散（非 active 会抛 404），
     *    而本方法是任务收尾链路的一环（与蛋蛋币结算同一个事务），不能因为聊天室的状况把结算打回滚，
     *    所以「群不存在 / 群主已转让」一律静默跳过。
     */
    @Transactional
    public void archive(Long ownerId, Long conversationId) {
        if (conversationId == null) return;
        ChatConversation c = conversationMapper.selectById(conversationId);
        if (c == null) return;
        if (c.getOwnerId() != null && !c.getOwnerId().equals(ownerId)) return;
        if (Integer.valueOf(1).equals(c.getReadOnly())) return;     // 已归档：幂等
        conversationMapper.archiveReadOnly(conversationId);
    }

    public List<ChatGroup> search(String keyword) {
        LambdaQueryWrapper<ChatGroup> q = new LambdaQueryWrapper<ChatGroup>()
                .eq(ChatGroup::getVisibility, "public").eq(ChatGroup::getStatus, "active");
        if (keyword != null && !keyword.isBlank()) q.like(ChatGroup::getName, keyword);
        return groupMapper.selectList(q.orderByDesc(ChatGroup::getCreatedAt).last("LIMIT 50"));
    }

    private void inviteInternal(ChatGroup g, Long operatorId, Long targetId) {
        if (activeMember(g.getId(), targetId) != null) throw new BusinessException("对方已在群中");
        if (g.getMaxMembers() != null && activeCount(g.getId()) >= g.getMaxMembers()) throw new BusinessException("群成员已满");
        ChatGroupMember old = groupMemberMapper.selectOne(new LambdaQueryWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, g.getId()).eq(ChatGroupMember::getUserId, targetId));
        if (old != null && "blocked".equals(old.getStatus())) throw new BusinessException(403, "对方已被该群拉黑");
        addGroupMember(g.getId(), targetId, "member");
        addConversationMember(g.getConversationId(), targetId, "member");
        conversationMapper.update(null, new LambdaUpdateWrapper<ChatConversation>()
                .eq(ChatConversation::getId, g.getConversationId()).setSql("member_count = member_count + 1"));
    }

    /** 群管理接口统一按「会话 ID」定位群（创建群时返回的就是会话 ID），避免与 chat_groups.id 混淆 */
    private ChatGroup requireGroup(Long conversationId) {
        ChatGroup g = groupMapper.selectOne(new LambdaQueryWrapper<ChatGroup>()
                .eq(ChatGroup::getConversationId, conversationId));
        if (g == null || !"active".equals(g.getStatus())) throw new BusinessException(404, "群不存在或已解散");
        return g;
    }

    private ChatGroupMember activeMember(Long groupId, Long userId) {
        return groupMemberMapper.selectOne(new LambdaQueryWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, groupId).eq(ChatGroupMember::getUserId, userId)
                .eq(ChatGroupMember::getStatus, "active"));
    }

    private long activeCount(Long groupId) {
        return groupMemberMapper.selectCount(new LambdaQueryWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, groupId).eq(ChatGroupMember::getStatus, "active"));
    }

    private void addGroupMember(Long groupId, Long userId, String role) {
        ChatGroupMember old = groupMemberMapper.selectOne(new LambdaQueryWrapper<ChatGroupMember>()
                .eq(ChatGroupMember::getGroupId, groupId).eq(ChatGroupMember::getUserId, userId));
        if (old == null) {
            ChatGroupMember m = new ChatGroupMember();
            m.setGroupId(groupId); m.setUserId(userId); m.setRole(role); m.setStatus("active");
            groupMemberMapper.insert(m);
        } else {
            groupMemberMapper.update(null, new LambdaUpdateWrapper<ChatGroupMember>()
                    .eq(ChatGroupMember::getId, old.getId()).set(ChatGroupMember::getStatus, "active")
                    .set(ChatGroupMember::getRole, role).set(ChatGroupMember::getLeftAt, null));
        }
    }

    private void addConversationMember(Long conversationId, Long userId, String role) {
        ChatConversationMember old = conversationMemberMapper.selectOne(new LambdaQueryWrapper<ChatConversationMember>()
                .eq(ChatConversationMember::getConversationId, conversationId).eq(ChatConversationMember::getUserId, userId));
        if (old == null) {
            ChatConversationMember m = new ChatConversationMember();
            m.setConversationId(conversationId); m.setUserId(userId); m.setRole(role); m.setStatus("active");
            m.setLastReadMessageId(0L); m.setUnreadCount(0); m.setMentionUnread(0);
            m.setNotificationMode("all"); m.setPinned(0);
            conversationMemberMapper.insert(m);
        } else {
            conversationMemberMapper.update(null, new LambdaUpdateWrapper<ChatConversationMember>()
                    .eq(ChatConversationMember::getId, old.getId()).set(ChatConversationMember::getStatus, "active")
                    .set(ChatConversationMember::getRole, role).set(ChatConversationMember::getLeftAt, null));
        }
    }
}
