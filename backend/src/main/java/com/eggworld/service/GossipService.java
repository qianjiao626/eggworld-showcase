package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.GossipAnswerDTO;
import com.eggworld.dto.GossipPostVO;
import com.eggworld.dto.GossipRankVO;
import com.eggworld.dto.PublishGossipDTO;
import com.eggworld.entity.GossipAnswer;
import com.eggworld.entity.GossipLike;
import com.eggworld.entity.GossipPost;
import com.eggworld.entity.User;
import com.eggworld.mapper.GossipAnswerMapper;
import com.eggworld.mapper.GossipLikeMapper;
import com.eggworld.mapper.GossipPostMapper;
import com.eggworld.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 八卦吃瓜服务
 * - 发布打听冻结悬赏、采纳发放、30 天无人采纳自动退回（惰性处理）
 * - 帖子/回答点赞去重（gossip_likes 唯一约束）
 */
@Service
@RequiredArgsConstructor
public class GossipService {

    private final GossipPostMapper postMapper;
    private final GossipAnswerMapper answerMapper;
    private final GossipLikeMapper likeMapper;
    private final UserMapper userMapper;
    private final PointService pointService;
    private final NotificationService notificationService;

    /* ============ 查询 ============ */

    /**
     * 帖子列表（分页 + 按标签筛选），匿名可访问
     * 惰性处理过期未采纳的悬赏退回，再返回数据
     */
    public Page<GossipPostVO> listPosts(String tag, long page, long size, Long currentUserId) {
        refundExpired();
        LambdaQueryWrapper<GossipPost> wrapper = new LambdaQueryWrapper<GossipPost>()
                .eq(GossipPost::getDeleted, 0)
                .eq(tag != null && !tag.isBlank() && !"all".equals(tag), GossipPost::getTag, tag)
                .orderByDesc(GossipPost::getCreatedAt);
        Page<GossipPost> p = postMapper.selectPage(new Page<>(page, size), wrapper);
        List<GossipPost> records = p.getRecords();
        if (records.isEmpty()) {
            Page<GossipPostVO> empty = new Page<>(page, size);
            empty.setRecords(new ArrayList<>());
            return empty;
        }

        // 批量查帖子获赞数 + 当前用户点赞状态，避免 N+1
        Map<Long, Integer> likeCountMap = countPostLikes(records.stream().map(GossipPost::getId).toList());
        Set<Long> likedPostIds = currentUserId == null ? Set.of()
                : likeMapper.selectList(new LambdaQueryWrapper<GossipLike>()
                        .eq(GossipLike::getUserId, currentUserId)
                        .isNotNull(GossipLike::getPostId)
                        .in(GossipLike::getPostId, records.stream().map(GossipPost::getId).toList()))
                .stream().map(GossipLike::getPostId).collect(Collectors.toSet());

        Map<Long, User> userMap = loadUsers(records.stream().map(GossipPost::getPublisherId).toList());
        List<GossipPostVO> vos = records.stream().map(post -> {
            GossipPostVO vo = toVO(post, userMap.get(post.getPublisherId()));
            vo.setLikes(likeCountMap.getOrDefault(post.getId(), 0));
            vo.setLiked(likedPostIds.contains(post.getId()));
            vo.setAnswerCount(answerMapper.selectCount(new LambdaQueryWrapper<GossipAnswer>()
                    .eq(GossipAnswer::getPostId, post.getId())).intValue());
            vo.setIsMine(currentUserId != null && currentUserId.equals(post.getPublisherId()));
            return vo;
        }).toList();

        Page<GossipPostVO> result = new Page<>(page, size, p.getTotal());
        result.setRecords(vos);
        return result;
    }

    /**
     * 帖子详情（含按获赞排序的回答列表），匿名可访问
     */
    public GossipPostVO detail(Long postId, Long currentUserId) {
        refundExpired();
        GossipPost post = postMapper.selectById(postId);
        if (post == null || post.getDeleted() == 1) {
            throw new BusinessException(404, "打听不存在或已删除");
        }
        return buildPostDetail(post, currentUserId);
    }

    /**
     * 我发布的打听列表（含回答，用于"我的任务 → 我的打听"管理采纳）
     */
    public List<GossipPostVO> myPosts(Long userId) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        refundExpired();
        List<GossipPost> posts = postMapper.selectList(new LambdaQueryWrapper<GossipPost>()
                .eq(GossipPost::getDeleted, 0)
                .eq(GossipPost::getPublisherId, userId)
                .orderByDesc(GossipPost::getCreatedAt));
        return posts.stream().map(p -> buildPostDetail(p, userId)).toList();
    }

    /**
     * 组装单个帖子的完整展示对象（含点赞状态 + 回答列表）
     */
    private GossipPostVO buildPostDetail(GossipPost post, Long currentUserId) {
        Long postId = post.getId();
        User publisher = userMapper.selectById(post.getPublisherId());
        GossipPostVO vo = toVO(post, publisher);
        vo.setLikes(likeMapper.selectCount(new LambdaQueryWrapper<GossipLike>()
                .eq(GossipLike::getPostId, postId)).intValue());
        vo.setLiked(currentUserId != null && likeMapper.selectCount(new LambdaQueryWrapper<GossipLike>()
                .eq(GossipLike::getUserId, currentUserId)
                .eq(GossipLike::getPostId, postId)) > 0);
        vo.setIsMine(currentUserId != null && currentUserId.equals(post.getPublisherId()));

        // 回答列表按获赞数排序
        List<GossipAnswer> answers = answerMapper.selectList(new LambdaQueryWrapper<GossipAnswer>()
                .eq(GossipAnswer::getPostId, postId)
                .orderByDesc(GossipAnswer::getLikes)
                .orderByAsc(GossipAnswer::getId));
        final Set<Long> likedAnswerIds;
        if (!answers.isEmpty() && currentUserId != null) {
            likedAnswerIds = likeMapper.selectList(new LambdaQueryWrapper<GossipLike>()
                            .eq(GossipLike::getUserId, currentUserId)
                            .isNotNull(GossipLike::getAnswerId)
                            .in(GossipLike::getAnswerId, answers.stream().map(GossipAnswer::getId).toList()))
                    .stream().map(GossipLike::getAnswerId).collect(Collectors.toSet());
        } else {
            likedAnswerIds = Set.of();
        }
        Map<Long, User> userMap = loadUsers(answers.stream().map(GossipAnswer::getAuthorId).toList());

        vo.setAnswerCount(answers.size());
        vo.setAnswers(answers.stream().map(a -> {
            GossipPostVO.GossipAnswerVO avo = new GossipPostVO.GossipAnswerVO();
            User author = userMap.get(a.getAuthorId());
            avo.setId(a.getId());
            avo.setAuthorId(a.getAuthorId());
            avo.setAuthorNickname(author == null ? "已注销" : author.getNickname());
            avo.setContent(a.getContent());
            avo.setLikes(a.getLikes());
            avo.setLiked(likedAnswerIds.contains(a.getId()));
            avo.setIsAdopted(a.getIsAdopted() == 1);
            avo.setCreatedAt(a.getCreatedAt());
            return avo;
        }).toList());
        return vo;
    }

    /**
     * 八卦榜：按回答获赞总数聚合统计（仅学生用户上榜）
     */
    public List<GossipRankVO> rankings() {
        // 聚合查询：author 维度统计获赞/回答数/被采纳数
        List<Map<String, Object>> rows = answerMapper.selectMaps(new QueryWrapper<GossipAnswer>()
                .select("author_id AS authorId, SUM(likes) AS totalLikes, COUNT(*) AS answerCount, SUM(is_adopted) AS adoptedCount")
                .groupBy("author_id")
                .orderByDesc("totalLikes")
                .orderByAsc("author_id"));
        List<GossipRankVO> list = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Long authorId = ((Number) row.get("authorId")).longValue();
            User u = userMapper.selectById(authorId);
            if (u == null || !"student".equals(u.getRole())) {
                continue; // 管理员不上榜
            }
            GossipRankVO vo = new GossipRankVO();
            vo.setUserId(authorId);
            vo.setNickname(u.getNickname());
            vo.setTotalLikes(((Number) row.get("totalLikes")).intValue());
            vo.setAnswerCount(((Number) row.get("answerCount")).intValue());
            vo.setAdoptedCount(((Number) row.get("adoptedCount")).intValue());
            list.add(vo);
        }
        return list;
    }

    /* ============ 写操作 ============ */

    /**
     * 发布打听：冻结悬赏蛋蛋币（余额不足抛错回滚）
     */
    @Transactional
    public Long publish(Long userId, PublishGossipDTO dto) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        int bounty = dto.getBounty() == null || dto.getBounty() < 1 ? 1 : dto.getBounty();

        GossipPost post = new GossipPost();
        post.setTitle(dto.getTitle());
        post.setDescription(dto.getDescription());
        post.setTag(dto.getTag());
        post.setPublisherId(userId);
        post.setBounty(bounty);
        post.setCoinStatus("frozen");
        post.setAdopted(0);
        post.setIsPermanent(1);
        post.setDeleted(0);
        post.setDeadline(LocalDateTime.now().plusDays(30));
        postMapper.insert(post);

        pointService.changeBalance(userId, -bounty, "gossip_freeze", "发布打听（冻结）：" + dto.getTitle(), null);
        return post.getId();
    }

    /**
     * 帖子点赞（一人一次，重复点赞报错）
     */
    @Transactional
    public void likePost(Long userId, Long postId) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        GossipPost post = postMapper.selectById(postId);
        if (post == null || post.getDeleted() == 1) {
            throw new BusinessException(404, "打听不存在");
        }
        if (userId.equals(post.getPublisherId())) {
            throw new BusinessException("不能给自己的打听点赞");
        }
        insertLike(userId, postId, null);
    }

    /**
     * 回答打听（防自问自答 / 防重复回答 / 已采纳不可再答）
     */
    @Transactional
    public void answer(Long userId, Long postId, GossipAnswerDTO dto) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        GossipPost post = postMapper.selectById(postId);
        if (post == null || post.getDeleted() == 1) {
            throw new BusinessException(404, "打听不存在");
        }
        if (post.getPublisherId().equals(userId)) {
            throw new BusinessException("不能回答自己发布的打听哦～");
        }
        if (post.getAdopted() == 1) {
            throw new BusinessException("该打听已采纳回答，不能再回答了～");
        }
        long already = answerMapper.selectCount(new LambdaQueryWrapper<GossipAnswer>()
                .eq(GossipAnswer::getPostId, postId)
                .eq(GossipAnswer::getAuthorId, userId));
        if (already > 0) {
            throw new BusinessException("你已经回答过这个打听了～");
        }

        GossipAnswer answer = new GossipAnswer();
        answer.setPostId(postId);
        answer.setAuthorId(userId);
        answer.setContent(dto.getContent());
        answer.setLikes(0);
        answer.setIsAdopted(0);
        answerMapper.insert(answer);

        // 通知发布者有人回答了
        User author = userMapper.selectById(userId);
        notificationService.notify(post.getPublisherId(),
                "💬 " + (author == null ? "有人" : author.getNickname()) + " 回答了你的打听「" + post.getTitle() + "」", "gossip_answer");
    }

    /**
     * 回答点赞（一人一次）
     */
    @Transactional
    public void likeAnswer(Long userId, Long answerId) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        GossipAnswer answer = answerMapper.selectById(answerId);
        if (answer == null) {
            throw new BusinessException(404, "回答不存在");
        }
        if (userId.equals(answer.getAuthorId())) {
            throw new BusinessException("不能给自己的回答点赞");
        }
        insertLike(userId, null, answerId);
        // 点赞计数 +1（冗余计数，配合 gossip_likes 去重）
        answerMapper.incrLikes(answerId);
    }

    /**
     * 采纳回答：发放悬赏给回答者，并通知对方
     */
    @Transactional
    public void adopt(Long userId, Long postId, Long answerId) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        GossipPost post = postMapper.selectById(postId);
        if (post == null || post.getDeleted() == 1) {
            throw new BusinessException(404, "打听不存在");
        }
        if (!post.getPublisherId().equals(userId)) {
            throw new BusinessException("只有发布者才能采纳回答");
        }
        if (post.getAdopted() == 1) {
            throw new BusinessException("已经采纳过啦");
        }
        GossipAnswer answer = answerMapper.selectById(answerId);
        if (answer == null || !answer.getPostId().equals(postId)) {
            throw new BusinessException("回答不存在");
        }

        // 标记采纳 + 悬赏状态置为已发放
        post.setAdopted(1);
        post.setAdoptedAnswerId(answerId);
        post.setCoinStatus("awarded");
        postMapper.updateById(post);

        answer.setIsAdopted(1);
        answerMapper.updateById(answer);

        // 悬赏发放给回答者（从发布者冻结中转移）
        int bounty = post.getBounty() == null ? 1 : post.getBounty();
        pointService.changeBalance(answer.getAuthorId(), bounty, "gossip_award", "回答被采纳：" + post.getTitle(), null);

        User author = userMapper.selectById(answer.getAuthorId());
        notificationService.notify(answer.getAuthorId(),
                "🎯 你的回答在打听「" + post.getTitle() + "」中被采纳，获得 " + bounty + " 蛋蛋币",
                "gossip_adopted");
    }

    /* ============ 私有工具 ============ */

    /**
     * 惰性退款：30 天无人采纳的打听，悬赏退回发布者
     */
    private void refundExpired() {
        List<GossipPost> expired = postMapper.selectList(new LambdaQueryWrapper<GossipPost>()
                .eq(GossipPost::getDeleted, 0)
                .eq(GossipPost::getCoinStatus, "frozen")
                .isNotNull(GossipPost::getDeadline)
                .lt(GossipPost::getDeadline, LocalDateTime.now()));
        for (GossipPost p : expired) {
            p.setCoinStatus("refunded");
            postMapper.updateById(p);
            pointService.changeBalance(p.getPublisherId(), p.getBounty(),
                    "gossip_refund", "打听「" + p.getTitle() + "」无人采纳自动退回", null);
        }
    }

    /** 插入点赞记录（post 与 answer 二选一），利用唯一约束防重复 */
    private void insertLike(Long userId, Long postId, Long answerId) {
        LambdaQueryWrapper<GossipLike> wrapper = new LambdaQueryWrapper<GossipLike>()
                .eq(GossipLike::getUserId, userId)
                .eq(postId != null, GossipLike::getPostId, postId)
                .eq(answerId != null, GossipLike::getAnswerId, answerId);
        if (likeMapper.selectCount(wrapper) > 0) {
            throw new BusinessException("你已经点过赞啦");
        }
        GossipLike like = new GossipLike();
        like.setUserId(userId);
        like.setPostId(postId);
        like.setAnswerId(answerId);
        try {
            likeMapper.insert(like);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("你已经点过赞啦");
        }
    }

    /** 批量统计帖子获赞数 */
    private Map<Long, Integer> countPostLikes(List<Long> postIds) {
        if (postIds.isEmpty()) {
            return new HashMap<>();
        }
        return likeMapper.selectMaps(new QueryWrapper<GossipLike>()
                        .select("post_id AS pid, COUNT(*) AS cnt")
                        .isNotNull("post_id")
                        .in("post_id", postIds)
                        .groupBy("post_id"))
                .stream().collect(Collectors.toMap(
                        m -> ((Number) m.get("pid")).longValue(),
                        m -> ((Number) m.get("cnt")).intValue()));
    }

    /** 批量加载用户，避免 N+1 查询 */
    private Map<Long, User> loadUsers(List<Long> ids) {
        if (ids.isEmpty()) {
            return new HashMap<>();
        }
        return userMapper.selectBatchIds(ids.stream().distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));
    }

    /** 帖子 → VO（不含 likes/answers 等需联查的字段） */
    private GossipPostVO toVO(GossipPost p, User publisher) {
        GossipPostVO vo = new GossipPostVO();
        vo.setId(p.getId());
        vo.setTitle(p.getTitle());
        vo.setDescription(p.getDescription());
        vo.setTag(p.getTag());
        vo.setBounty(p.getBounty());
        vo.setCoinStatus(p.getCoinStatus());
        vo.setAdopted(p.getAdopted() == 1);
        vo.setAdoptedAnswerId(p.getAdoptedAnswerId());
        vo.setDeadline(p.getDeadline());
        vo.setCreatedAt(p.getCreatedAt());
        vo.setPublisherId(p.getPublisherId());
        vo.setPublisherNickname(publisher == null ? "已注销" : publisher.getNickname());
        return vo;
    }
}
