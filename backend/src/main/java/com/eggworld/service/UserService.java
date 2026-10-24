package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.RankingVO;
import com.eggworld.dto.UpdateProfileDTO;
import com.eggworld.dto.UserProfileVO;
import com.eggworld.dto.UserPublicVO;
import com.eggworld.entity.User;
import com.eggworld.entity.UserCharacter;
import com.eggworld.entity.UserSkill;
import com.eggworld.entity.UserStats;
import com.eggworld.entity.UserLike;
import com.eggworld.entity.UserPermission;
import com.eggworld.mapper.UserCharacterMapper;
import com.eggworld.mapper.UserLikeMapper;
import com.eggworld.mapper.UserPermissionMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.RatingMapper;
import com.eggworld.mapper.UserSkillMapper;
import com.eggworld.mapper.UserStatsMapper;
import com.eggworld.service.mail.MailNotifyService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 用户信息服务（Task 6）：查询与更新个人信息
 */
@Service
@RequiredArgsConstructor
public class UserService {

    /** 同一邀请的邮件通知在此时长内不重复发送（小时），避免被反复点击刷掉发信配额 */
    private static final int INVITE_MAIL_DEDUP_HOURS = 24;

    private final UserMapper userMapper;
    private final UserStatsMapper userStatsMapper;
    private final UserCharacterMapper userCharacterMapper;
    private final UserSkillMapper userSkillMapper;
    private final UserLikeMapper userLikeMapper;
    private final RatingMapper ratingMapper;
    private final NotificationService notificationService;
    private final MailNotifyService mailNotifyService;
    private final UserPermissionMapper userPermissionMapper;

    /** BCrypt 密码加密器（与 AuthService 同一实现，保证两处哈希可互认） */
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    /**
     * 自助修改密码（「我的信息」页）
     *
     * <p>只校验当前密码，不要求邮箱验证码；改完当场生效（旧密码立即失效），
     * 已签发的 JWT 仍有效（JWT 无版本号，无法回收，见迁移文档备注）。
     */
    @Transactional
    public void changePassword(Long userId, String oldPassword, String newPassword) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(404, "用户不存在");
        }
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BusinessException("当前密码不正确");
        }
        // 只更新 password_hash 一列，避免把并发改动过的其它字段一起写回
        User update = new User();
        update.setId(userId);
        update.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(update);
    }

//    /** MBTI 四字母类型 → 分组映射 */
//    private static final Map<String, String> MBTI_GROUPS = Map.of(
//            "INTJ", "NT", "INTP", "NT", "ENTJ", "NT", "ENTP", "NT",
//            "INFJ", "NF", "INFP", "NF", "ENFJ", "NF", "ENFP", "NF",
//            "ISTJ", "SJ", "ISFJ", "SJ", "ESTJ", "SJ", "ESFJ", "SJ",
//            "ISTP", "SP", "ISFP", "SP", "ESTP", "SP", "ESFP", "SP"
//    );
private static final Map<String, String> MBTI_GROUPS = Map.ofEntries(
        Map.entry("INTJ", "NT"),
        Map.entry("INTP", "NT"),
        Map.entry("ENTJ", "NT"),
        Map.entry("ENTP", "NT"),
        Map.entry("INFJ", "NF"),
        Map.entry("INFP", "NF"),
        Map.entry("ENFJ", "NF"),
        Map.entry("ENFP", "NF"),
        Map.entry("ISTJ", "SJ"),
        Map.entry("ISFJ", "SJ"),
        Map.entry("ESTJ", "SJ"),
        Map.entry("ESFJ", "SJ"),
        Map.entry("ISTP", "SP"),
        Map.entry("ISFP", "SP"),
        Map.entry("ESTP", "SP"),
        Map.entry("ESFP", "SP")
);

    /** 6 大角色分类 */
    private static final List<String> CATEGORIES = List.of("study", "job", "side", "hobby", "game", "life");

    /**
     * 组装用户完整信息（用户 + 五维 + 角色解锁状态），不含密码
     */
    public UserProfileVO buildProfile(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(404, "用户不存在");
        }

        UserProfileVO vo = new UserProfileVO();
        // 密码哈希字段不在 VO 中，BeanUtils 只复制同名属性，天然脱敏
        BeanUtils.copyProperties(user, vo);
        // 副管理员以独立角色返回给前端（仅见官方任务/审核中心的后台视图），主管理员保持 admin
        if (user.getSubAdmin() != null && user.getSubAdmin() == 1
                && !"admin".equals(user.getRole())) {
            vo.setRole("subadmin");
        }

        // 五维属性
        UserStats stats = userStatsMapper.selectById(userId);
        if (stats != null) {
            UserProfileVO.StatsVO s = new UserProfileVO.StatsVO();
            BeanUtils.copyProperties(stats, s);
            vo.setStats(s);
        }

        // 角色解锁状态
        List<UserCharacter> chars = userCharacterMapper.selectList(
                new LambdaQueryWrapper<UserCharacter>().eq(UserCharacter::getUserId, userId));
        vo.setCharacters(chars.stream().map(uc -> {
            UserProfileVO.CharacterVO c = new UserProfileVO.CharacterVO();
            c.setCategory(uc.getCategory());
            c.setUnlocked(uc.getUnlocked() == 1);
            c.setCount(uc.getCount());
            c.setCurrent(uc.getIsCurrent() == 1);
            return c;
        }).toList());

        // 排名数据：rank 为经验值高于我的人数 + 1，total 为全站用户数
        Long total = userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getDeleted, 0));
        Long higher = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getDeleted, 0)
                .gt(User::getExp, user.getExp()));
        vo.setTotal(total.intValue());
        vo.setRank(higher.intValue() + 1);
        // 口碑样本数（收到的评价条数），供前端展示 "均分 · N人评"
        vo.setRatingCount(ratingMapper.countByRatee(userId).intValue());

        // 学生协管员持有的权限点（驱动前端「协管」入口显隐；主 / 副管理员隐式通过、不落表）
        vo.setPermissions(userPermissionMapper.selectList(
                        new LambdaQueryWrapper<UserPermission>().eq(UserPermission::getUserId, userId))
                .stream()
                .map(UserPermission::getPermCode)
                .collect(Collectors.toSet()));

        return vo;
    }

    /**
     * 更新个人信息（仅更新非空字段）
     */
    @Transactional
    public UserProfileVO updateProfile(Long userId, UpdateProfileDTO dto) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(404, "用户不存在");
        }

        // 昵称唯一性校验
        if (StringUtils.hasText(dto.getNickname()) && !dto.getNickname().equals(user.getNickname())) {
            User byNickname = userMapper.selectOne(new LambdaQueryWrapper<User>()
                    .eq(User::getNickname, dto.getNickname()));
            if (byNickname != null) {
                throw new BusinessException(409, "该昵称已被使用");
            }
            user.setNickname(dto.getNickname());
        }

        if (StringUtils.hasText(dto.getSchool())) user.setSchool(dto.getSchool());
        if (StringUtils.hasText(dto.getMajor())) user.setMajor(dto.getMajor());
        if (StringUtils.hasText(dto.getCity())) user.setCity(dto.getCity());
        if (StringUtils.hasText(dto.getGrade())) user.setGrade(dto.getGrade());
        if (dto.getAge() != null) user.setAge(dto.getAge());
        if (StringUtils.hasText(dto.getBio())) user.setBio(dto.getBio());

        // MBTI：设置类型时自动推导分组
        if (StringUtils.hasText(dto.getMbtiType())) {
            String mbti = dto.getMbtiType().toUpperCase();
            user.setMbtiType(mbti);
            user.setMbtiGroup(MBTI_GROUPS.getOrDefault(mbti, null));
        }

        // 当前使用角色（只能切换到已解锁的角色；switchCharacter 内部已同步 egg_category）
        if (StringUtils.hasText(dto.getCurrentCategory())) {
            switchCharacter(userId, dto.getCurrentCategory());
        }

        userMapper.updateById(user);
        return buildProfile(userId);
    }

    /**
     * 切换当前使用角色（保证 6 个分类中最多一个 is_current=1）
     * 同时同步 users.egg_category，使排行榜/跨用户主页名片与当前角色一致
     */
    @Transactional
    public UserProfileVO switchCharacter(Long userId, String category) {
        if (!CATEGORIES.contains(category)) {
            throw new BusinessException("无效的角色分类: " + category);
        }
        List<UserCharacter> chars = userCharacterMapper.selectList(
                new LambdaQueryWrapper<UserCharacter>().eq(UserCharacter::getUserId, userId));
        boolean exists = false;
        for (UserCharacter uc : chars) {
            if (uc.getCategory().equals(category)) {
                exists = true;
                if (uc.getUnlocked() != 1) {
                    throw new BusinessException("该角色尚未解锁");
                }
                uc.setIsCurrent(1);
            } else {
                uc.setIsCurrent(0);
            }
            userCharacterMapper.updateById(uc);
        }
        if (!exists) {
            throw new BusinessException("角色数据不存在");
        }
        /* 同步 users.egg_category，保证各处展示一致（注册初始分类 → 当前角色） */
        User user = userMapper.selectById(userId);
        if (user != null && !category.equals(user.getEggCategory())) {
            user.setEggCategory(category);
            userMapper.updateById(user);
        }
        return buildProfile(userId);
    }

    /**
     * 查询用户技能标签（按 sort_order 排序返回，保证"用户排序"显式持久化）
     */
    public List<String> listSkills(Long userId) {
        return userSkillMapper.selectList(new LambdaQueryWrapper<UserSkill>()
                        .eq(UserSkill::getUserId, userId)
                        .orderByAsc(UserSkill::getSortOrder)
                        .orderByAsc(UserSkill::getId))
                .stream().map(UserSkill::getSkill).toList();
    }

    /**
     * 全量替换用户技能标签（先删后插，按列表顺序写入 sort_order）
     */
    @Transactional
    public void replaceSkills(Long userId, List<String> skills) {
        userSkillMapper.delete(new LambdaQueryWrapper<UserSkill>().eq(UserSkill::getUserId, userId));
        for (int i = 0; i < skills.size(); i++) {
            UserSkill us = new UserSkill();
            us.setUserId(userId);
            us.setSkill(skills.get(i));
            us.setSortOrder(i);
            userSkillMapper.insert(us);
        }
    }

    /**
     * 按昵称查询用户公开信息（跨用户主页）
     */
    public UserPublicVO buildPublicProfileByNickname(String nickname) {
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getNickname, nickname));
        if (user == null) {
            throw new BusinessException(404, "用户不存在");
        }
        return buildPublicProfile(user.getId());
    }

    /**
     * 组装用户公开信息：仅公开字段 + 五维 + 角色 + 技能（脱敏：不含 email/inviteCode）
     */
    public UserPublicVO buildPublicProfile(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(404, "用户不存在");
        }

        UserPublicVO vo = new UserPublicVO();
        // BeanUtils 只复制 VO 中声明的字段，天然脱敏（email/inviteCode/passwordHash 不复制）
        BeanUtils.copyProperties(user, vo);

        UserStats stats = userStatsMapper.selectById(userId);
        if (stats != null) {
            UserProfileVO.StatsVO s = new UserProfileVO.StatsVO();
            BeanUtils.copyProperties(stats, s);
            vo.setStats(s);
        }

        vo.setCharacters(userCharacterMapper.selectList(
                        new LambdaQueryWrapper<UserCharacter>().eq(UserCharacter::getUserId, userId))
                .stream().map(uc -> {
                    UserProfileVO.CharacterVO c = new UserProfileVO.CharacterVO();
                    c.setCategory(uc.getCategory());
                    c.setUnlocked(uc.getUnlocked() == 1);
                    c.setCount(uc.getCount());
                    c.setCurrent(uc.getIsCurrent() == 1);
                    return c;
                }).toList());

        vo.setSkills(listSkills(userId));

        // 当前用户是否已点赞（未登录为 false）
        Long viewerId = com.eggworld.common.UserContext.userId();
        vo.setLikedByMe(viewerId != null && userLikeMapper.selectCount(
                new LambdaQueryWrapper<UserLike>()
                        .eq(UserLike::getLikerId, viewerId)
                        .eq(UserLike::getLikeeId, userId)) > 0);
        // 口碑样本数（收到的评价条数），供前端展示 "均分 · N人评"
        vo.setRatingCount(ratingMapper.countByRatee(userId).intValue());
        return vo;
    }

    /** 认可点赞（一人一次，防重复） */
    @Transactional
    public void likeUser(Long likerId, Long likeeId) {
        if (likerId == null) {
            throw new BusinessException(401, "请先登录");
        }
        if (likerId.equals(likeeId)) {
            throw new BusinessException("不能给自己点赞");
        }
        User likee = userMapper.selectById(likeeId);
        if (likee == null) {
            throw new BusinessException(404, "用户不存在");
        }
        Long exists = userLikeMapper.selectCount(new LambdaQueryWrapper<UserLike>()
                .eq(UserLike::getLikerId, likerId)
                .eq(UserLike::getLikeeId, likeeId));
        if (exists > 0) {
            throw new BusinessException("你已经点过赞了");
        }
        UserLike like = new UserLike();
        like.setLikerId(likerId);
        like.setLikeeId(likeeId);
        userLikeMapper.insert(like);
        likee.setLikes((likee.getLikes() == null ? 0 : likee.getLikes()) + 1);
        userMapper.updateById(likee);
    }

    /** 邀请对方发布教学任务（给对方发送邀请通知） */
    public void inviteTask(Long fromId, Long toId, List<String> skills) {
        if (fromId == null) {
            throw new BusinessException(401, "请先登录");
        }
        if (fromId.equals(toId)) {
            throw new BusinessException("不能邀请自己发布任务");
        }
        if (skills == null || skills.isEmpty()) {
            throw new BusinessException("请至少选择一个技能");
        }
        User from = userMapper.selectById(fromId);
        User to = userMapper.selectById(toId);
        if (from == null || to == null) {
            throw new BusinessException(404, "用户不存在");
        }
        String message = "🎯 " + from.getNickname() + " 邀请你发布教学任务（技能：" + String.join("、", skills) + "）";
        message = message.length() > 500 ? message.substring(0, 500) : message;
        // 同一邀请 24 小时内已通知过就不再发邮件：避免被反复点击刷掉 SES 配额、拉高投诉率
        boolean mailFirstTime = !notificationService.hasSameWithin(toId, message, INVITE_MAIL_DEDUP_HOURS);
        notificationService.notify(toId, message, "invite");
        if (mailFirstTime) {
            // 异步发送、失败只记日志，不影响邀请本身
            mailNotifyService.sendInviteTaskNotice(to.getEmail(), from.getNickname(), skills);
        }
    }

    /**
     * 排行榜（神蛋榜单）：all 按经验 / rich 按蛋蛋币 / 角色类按对应五维
     */
    public RankingVO listRanking(String cat, Long viewerId) {
        // 口碑榜：贝叶斯平均排序（削弱小样本干扰），单独处理
        if ("rep".equals(cat)) {
            return buildRepRanking(viewerId);
        }
        // 角色分类 → 五维字段映射（与前端 STAT_MAP 一致）
        String dim = switch (cat) {
            case "study" -> "knowledge";
            case "job" -> "skills";
            case "side" -> "money";
            case "hobby", "game", "life" -> "charm";
            default -> null;
        };
        if (dim == null && !"rich".equals(cat)) {
            cat = "all";
        }

        RankingVO vo = new RankingVO();
        vo.setCat(cat);
        List<RankingVO.Item> items = new ArrayList<>();

        if (dim == null) {
            // 总榜 / 富豪榜：按经验值或蛋蛋币降序（仅学生角色）；同值按 id 升序（先注册者靠前）保证次序稳定
            LambdaQueryWrapper<User> w = new LambdaQueryWrapper<User>()
                    .eq(User::getRole, "student");
            if ("rich".equals(cat)) {
                w.orderByDesc(User::getPoints).orderByAsc(User::getId);
            } else {
                w.orderByDesc(User::getExp).orderByAsc(User::getId);
            }
            w.last("limit 50");
            for (User u : userMapper.selectList(w)) {
                items.add(buildRankingItem(u, userStatsMapper.selectById(u.getId())));
            }
        } else {
            // 角色榜：按对应五维降序（仅学生角色，管理员不上榜）；同值按 user_id 升序保持稳定
            List<Long> studentIds = userMapper.selectList(new LambdaQueryWrapper<User>()
                            .eq(User::getRole, "student")
                            .select(User::getId))
                    .stream().map(User::getId).toList();
            if (!studentIds.isEmpty()) {
                QueryWrapper<UserStats> qw = new QueryWrapper<>();
                qw.in("user_id", studentIds).orderByDesc(dim).orderByAsc("user_id").last("limit 50");
                List<UserStats> statsList = userStatsMapper.selectList(qw);
                Map<Long, User> userMap = userMapper.selectBatchIds(
                                statsList.stream().map(UserStats::getUserId).toList())
                        .stream().collect(Collectors.toMap(User::getId, u -> u));
                for (UserStats s : statsList) {
                    User u = userMap.get(s.getUserId());
                    if (u != null) {
                        items.add(buildRankingItem(u, s));
                    }
                }
            }
        }
        vo.setRecords(items);

        // 我的名次（当前用户在该榜单的排名）
        vo.setMyRank(calcMyRank(cat, dim, viewerId));
        return vo;
    }

    /**
     * 口碑榜：仅收录收到过评价的学生，按贝叶斯平均 (C×全站均分 + n×个人均分)/(C+n) 降序。
     * C 为固定先验样本数（5）：评价不足 5 条时向全站均值收缩，避免"1 条 5 星"压过大量真实高分。
     * 榜单数值列展示的仍是真实均分（user_stats.reputation），排序值仅用于名次。
     */
    private RankingVO buildRepRanking(Long viewerId) {
        // 聚合 ratings：rateeId -> {评价数 cnt, 均分 avg}
        Map<Long, Long> cntMap = new HashMap<>();
        Map<Long, BigDecimal> avgMap = new HashMap<>();
        ratingMapper.groupByRatee().forEach(m -> {
            long rid = ((Number) m.get("rateeId")).longValue();
            cntMap.put(rid, ((Number) m.get("cnt")).longValue());
            avgMap.put(rid, new BigDecimal(m.get("avgScore").toString()));
        });

        BigDecimal globalAvg = ratingMapper.avgGlobal();
        if (globalAvg == null) {
            globalAvg = BigDecimal.valueOf(4);
        }
        BigDecimal c = BigDecimal.valueOf(5);

        // 每位收到过评价的学生 → 贝叶斯均值
        List<User> students = userMapper.selectList(new LambdaQueryWrapper<User>()
                .eq(User::getRole, "student")
                .eq(User::getDeleted, 0));
        List<Map.Entry<Long, BigDecimal>> sorted = new ArrayList<>();
        for (User u : students) {
            Long cnt = cntMap.get(u.getId());
            if (cnt == null || cnt == 0) {
                continue; // 未收到评价，不上口碑榜
            }
            BigDecimal avg = avgMap.get(u.getId());
            BigDecimal bayes = c.multiply(globalAvg).add(avg.multiply(BigDecimal.valueOf(cnt)))
                    .divide(c.add(BigDecimal.valueOf(cnt)), 2, java.math.RoundingMode.HALF_UP);
            sorted.add(new java.util.AbstractMap.SimpleEntry<>(u.getId(), bayes));
        }
        sorted.sort((a, b) -> {
            int cmp = b.getValue().compareTo(a.getValue());
            if (cmp != 0) return cmp;
            // 贝叶斯同分时，评价数多者优先
            return Long.compare(cntMap.getOrDefault(b.getKey(), 0L), cntMap.getOrDefault(a.getKey(), 0L));
        });

        RankingVO vo = new RankingVO();
        vo.setCat("rep");
        List<RankingVO.Item> items = new ArrayList<>();
        List<Long> topIds = sorted.stream().limit(50).map(Map.Entry::getKey).toList();
        // 批量取用户与五维，避免逐条 N+1
        Map<Long, UserStats> statsMap = topIds.isEmpty() ? Map.of()
                : userStatsMapper.selectBatchIds(topIds).stream()
                        .collect(Collectors.toMap(UserStats::getUserId, s -> s, (a, b) -> a));
        Map<Long, User> userMap = topIds.isEmpty() ? Map.of()
                : userMapper.selectBatchIds(topIds).stream()
                        .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));
        for (Long id : topIds) {
            User u = userMap.get(id);
            if (u == null) {
                continue;
            }
            RankingVO.Item item = buildRankingItem(u, statsMap.get(id));
            item.setRatingCount(cntMap.get(id).intValue());
            items.add(item);
        }
        vo.setRecords(items);

        // 我的名次：仅当我有评价记录时计算（高于我贝叶斯值的人数 + 1），否则 0（未上榜）
        vo.setMyRank(0);
        if (viewerId != null) {
            Long myCnt = cntMap.get(viewerId);
            if (myCnt != null && myCnt > 0) {
                BigDecimal myBayes = c.multiply(globalAvg)
                        .add(avgMap.get(viewerId).multiply(BigDecimal.valueOf(myCnt)))
                        .divide(c.add(BigDecimal.valueOf(myCnt)), 2, java.math.RoundingMode.HALF_UP);
                long higher = sorted.stream().filter(e -> e.getValue().compareTo(myBayes) > 0).count();
                vo.setMyRank((int) higher + 1);
            }
        }
        return vo;
    }

    /** 组装榜单条目 */
    private RankingVO.Item buildRankingItem(User u, UserStats stats) {
        RankingVO.Item item = new RankingVO.Item();
        item.setUserId(u.getId());
        item.setNickname(u.getNickname());
        item.setSchool(u.getSchool());
        item.setEggCategory(u.getEggCategory());
        item.setEggRarity(u.getEggRarity());
        item.setExp(u.getExp());
        item.setPoints(u.getPoints());
        item.setMbtiType(u.getMbtiType());
        item.setStats(stats);
        return item;
    }

    /** 计算当前用户排名（高于我的人数 + 1；未登录返回 0） */
    private int calcMyRank(String cat, String dim, Long viewerId) {
        if (viewerId == null) {
            return 0;
        }
        try {
            if (dim == null) {
                if ("rich".equals(cat)) {
                    User me = userMapper.selectById(viewerId);
                    if (me == null) return 0;
                    return userMapper.selectCount(new LambdaQueryWrapper<User>()
                            .eq(User::getRole, "student").gt(User::getPoints, me.getPoints())).intValue() + 1;
                }
                User me = userMapper.selectById(viewerId);
                if (me == null) return 0;
                return userMapper.selectCount(new LambdaQueryWrapper<User>()
                        .eq(User::getRole, "student").gt(User::getExp, me.getExp())).intValue() + 1;
            }
            UserStats me = userStatsMapper.selectById(viewerId);
            if (me == null) return 0;
            BigDecimal myVal = switch (dim) {
                case "knowledge" -> me.getKnowledge();
                case "skills" -> me.getSkills();
                case "money" -> me.getMoney();
                default -> me.getCharm();
            };
            List<Long> studentIds = userMapper.selectList(new LambdaQueryWrapper<User>()
                            .eq(User::getRole, "student")
                            .select(User::getId))
                    .stream().map(User::getId).toList();
            if (studentIds.isEmpty()) return 1;
            return userStatsMapper.selectCount(new QueryWrapper<UserStats>()
                    .in("user_id", studentIds).gt(dim, myVal)).intValue() + 1;
        } catch (Exception e) {
            return 0;
        }
    }
}
