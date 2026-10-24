package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.JwtUtil;
import com.eggworld.common.LoginUser;
import com.eggworld.dto.LoginDTO;
import com.eggworld.dto.LoginVO;
import com.eggworld.dto.RegisterDTO;
import com.eggworld.entity.User;
import com.eggworld.entity.UserCharacter;
import com.eggworld.entity.UserStats;
import com.eggworld.mapper.UserCharacterMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserStatsMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 认证服务（Task 4/5）：注册 + 登录
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserMapper userMapper;
    private final UserStatsMapper userStatsMapper;
    private final UserCharacterMapper userCharacterMapper;
    private final VerifyCodeService verifyCodeService;
    private final PointService pointService;
    private final JwtUtil jwtUtil;
    private final UserService userService;
    private final InviteService inviteService;

    /** BCrypt 密码加密器 */
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    /** 6 大角色分类（前端 CHAR_CATS 对应） */
    private static final String[] CATEGORIES = {"study", "job", "side", "hobby", "game", "life"};

    /**
     * 注册：校验验证码 → 创建用户 + 五维 + 角色 → 赠送 100 蛋蛋币
     */
    @Transactional
    public void register(RegisterDTO dto) {
        // 1. 校验验证码（通过后自动作废）
        verifyCodeService.verify(dto.getEmail(), dto.getCode());

        // 2. 校验邮箱未注册
        if (userMapper.selectByEmail(dto.getEmail()) != null) {
            throw new BusinessException(409, "该邮箱已注册，请直接登录");
        }

        // 3. 校验昵称唯一
        User byNickname = userMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                .eq(User::getNickname, dto.getNickname()));
        if (byNickname != null) {
            throw new BusinessException(409, "该昵称已被使用");
        }

        // 4. 确定初始角色：系统随机抽一个蛋（注册页不再让用户选蛋）
        //    用户资料与角色解锁表必须使用同一个值
        String initial = CATEGORIES[ThreadLocalRandom.current().nextInt(CATEGORIES.length)];

        // 5. 创建用户（初始余额 0，注册奖励下面统一走流水，保证余额可追溯）
        User user = new User();
        user.setNickname(dto.getNickname());
        user.setEmail(dto.getEmail());
        user.setPasswordHash(passwordEncoder.encode(dto.getPassword()));
        user.setRole("student");
        user.setPoints(0);
        user.setExp(0);
        user.setLikes(0);
        user.setReputation(BigDecimal.ZERO);
        user.setEggRarity("N");
        user.setEggCategory(initial);
        user.setInviteCode(inviteService.generateInviteCode());
        userMapper.insert(user);

        // 6. 初始化五维属性（全 0，后续完成任务增长）
        UserStats stats = new UserStats();
        stats.setUserId(user.getId());
        stats.setKnowledge(BigDecimal.ZERO);
        stats.setSkills(BigDecimal.ZERO);
        stats.setCharm(BigDecimal.ZERO);
        stats.setMoney(BigDecimal.ZERO);
        stats.setReputation(BigDecimal.ZERO);
        userStatsMapper.insert(stats);

        // 7. 初始化 6 个角色分类：只解锁随机抽到的那个并设为当前
        //    前端注册成功后会弹「解锁新角色」弹窗，展示的就是这里解锁的蛋
        for (String cat : CATEGORIES) {
            boolean isInitial = cat.equals(initial);
            UserCharacter uc = new UserCharacter();
            uc.setUserId(user.getId());
            uc.setCategory(cat);
            uc.setUnlocked(isInitial ? 1 : 0);
            uc.setCount(0);
            uc.setIsCurrent(isInitial ? 1 : 0);
            userCharacterMapper.insert(uc);
        }

        // 8. 注册奖励 100 蛋蛋币（走统一流水，可追溯）
        pointService.changeBalance(user.getId(), 100, "reward", "新用户注册奖励", null);

        // 9. 绑定邀请关系（邀请码选填，无效会抛错使注册整体回滚）
        inviteService.bindOnRegister(user.getId(), dto.getInviteCode());
    }

    /**
     * 忘记密码（登录 / 注册页）：邮箱验证码校验通过后重设密码
     *
     * <p>校验失败与「邮箱未注册」返回同一文案，避免变成账号存在性探针。
     * 重设后旧密码立即失效；已签发的 JWT 仍有效（JWT 无版本号，无法回收）。
     */
    @Transactional
    public void resetPassword(String email, String code, String newPassword) {
        // 1. 校验验证码（通过后自动作废）
        verifyCodeService.verify(email, code);

        // 2. 定位账号：先按原样匹配（与登录一致），再退化为小写匹配（验证码缓存按小写归一）
        String raw = email == null ? null : email.trim();
        String lower = raw == null ? null : raw.toLowerCase(Locale.ROOT);
        User user = userMapper.selectByEmail(raw);
        if (user == null && lower != null && !lower.equals(raw)) {
            user = userMapper.selectByEmail(lower);
        }
        if (user == null) {
            throw new BusinessException("邮箱或验证码不正确");
        }

        // 3. 只更新 password_hash 一列，避免覆盖并发改动过的其它字段
        User update = new User();
        update.setId(user.getId());
        update.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(update);
    }

    /**
     * 登录：校验密码 → 签发 JWT → 返回 token + 用户信息
     */
    public LoginVO login(LoginDTO dto) {
        User user = userMapper.selectByEmail(dto.getEmail());
        if (user == null || !passwordEncoder.matches(dto.getPassword(), user.getPasswordHash())) {
            throw new BusinessException(401, "邮箱或密码错误");
        }

        // 已封禁账号禁止登录
        if (user.getBanned() != null && user.getBanned() == 1) {
            throw new BusinessException(403, "该账号已被封禁，请联系管理员");
        }

        // 签发 token
        String token = jwtUtil.createToken(new LoginUser(user.getId(), user.getRole(), user.getNickname()));

        LoginVO vo = new LoginVO();
        vo.setToken(token);
        vo.setUser(userService.buildProfile(user.getId()));
        return vo;
    }
}
