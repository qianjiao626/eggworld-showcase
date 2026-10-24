package com.eggworld.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.GossipAnswerDTO;
import com.eggworld.dto.GossipPostVO;
import com.eggworld.dto.GossipRankVO;
import com.eggworld.dto.PublishGossipDTO;
import com.eggworld.service.GossipService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 八卦吃瓜接口（打听/问答）
 * - 列表/详情/排行：匿名可浏览（拦截器按 GET 放行）
 * - 发布/点赞/回答/采纳：需登录
 */
@RestController
@RequestMapping("/api/gossip")
@RequiredArgsConstructor
public class GossipController {

    private final GossipService gossipService;

    /** 打听列表（按标签筛选 + 分页） */
    @GetMapping("/posts")
    public Result<Page<GossipPostVO>> list(@RequestParam(required = false) String tag,
                                           @RequestParam(defaultValue = "1") long page,
                                           @RequestParam(defaultValue = "20") long size) {
        return Result.ok(gossipService.listPosts(tag, page, size, UserContext.userId()));
    }

    /** 我发布的打听列表（含回答，用于管理采纳） */
    @GetMapping("/my-posts")
    public Result<List<GossipPostVO>> myPosts() {
        return Result.ok(gossipService.myPosts(UserContext.userId()));
    }

    /** 打听详情（含回答列表） */
    @GetMapping("/posts/{id}")
    public Result<GossipPostVO> detail(@PathVariable Long id) {
        return Result.ok(gossipService.detail(id, UserContext.userId()));
    }

    /** 发布打听（冻结悬赏） */
    @PostMapping("/posts")
    public Result<Long> publish(@Valid @RequestBody PublishGossipDTO dto) {
        return Result.ok(gossipService.publish(UserContext.userId(), dto));
    }

    /** 帖子点赞（一人一次） */
    @PostMapping("/posts/{id}/like")
    public Result<Void> likePost(@PathVariable Long id) {
        gossipService.likePost(UserContext.userId(), id);
        return Result.ok();
    }

    /** 回答打听 */
    @PostMapping("/posts/{id}/answers")
    public Result<Void> answer(@PathVariable Long id, @Valid @RequestBody GossipAnswerDTO dto) {
        gossipService.answer(UserContext.userId(), id, dto);
        return Result.ok();
    }

    /** 回答点赞（一人一次） */
    @PostMapping("/posts/{id}/answers/{aid}/like")
    public Result<Void> likeAnswer(@PathVariable Long id, @PathVariable Long aid) {
        gossipService.likeAnswer(UserContext.userId(), aid);
        return Result.ok();
    }

    /** 采纳回答（发布者发放悬赏给回答者） */
    @PostMapping("/posts/{id}/adopt")
    public Result<Void> adopt(@PathVariable Long id, @RequestParam Long answerId) {
        gossipService.adopt(UserContext.userId(), id, answerId);
        return Result.ok();
    }

    /** 八卦榜：按回答获赞总数排行 */
    @GetMapping("/rankings")
    public Result<List<GossipRankVO>> rankings() {
        return Result.ok(gossipService.rankings());
    }
}
