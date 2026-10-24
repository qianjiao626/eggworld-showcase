package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.InviteTaskDTO;
import com.eggworld.dto.RankingVO;
import com.eggworld.dto.UserPublicVO;
import com.eggworld.service.UserService;
import lombok.RequiredArgsConstructor;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用户公开信息接口（跨用户主页 / 排行榜）
 * 按昵称查询用户公开资料，仅暴露脱敏字段
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserPublicController {

    private final UserService userService;

    /** 按昵称查询用户公开信息 */
    @GetMapping("/by-nickname")
    public Result<UserPublicVO> byNickname(@RequestParam String nickname) {
        return Result.ok(userService.buildPublicProfileByNickname(nickname));
    }

    /** 排行榜（神蛋榜单）：all 经验榜 / rich 富豪榜 / 角色类按对应五维 */
    @GetMapping("/rankings")
    public Result<RankingVO> rankings(@RequestParam(defaultValue = "all") String cat) {
        return Result.ok(userService.listRanking(cat, UserContext.userId()));
    }

    /** 认可点赞（跨用户主页，一人一次） */
    @PostMapping("/{id}/like")
    public Result<Void> like(@PathVariable Long id) {
        userService.likeUser(UserContext.userId(), id);
        return Result.ok();
    }

    /** 邀请对方发布教学任务（给对方发送邀请通知） */
    @PostMapping("/{id}/invite-task")
    public Result<Void> inviteTask(@PathVariable Long id, @Valid @RequestBody InviteTaskDTO dto) {
        userService.inviteTask(UserContext.userId(), id, dto.getSkills());
        return Result.ok();
    }
}
