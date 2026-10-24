package com.eggworld.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.entity.User;
import com.eggworld.entity.UserCharacter;
import com.eggworld.entity.UserStats;
import com.eggworld.mapper.UserCharacterMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserStatsMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * 启动数据初始化
 * 首次启动时按配置创建默认管理员账号（邮箱与密码通过环境变量提供，不写死在代码里）
 * 用 BCrypt 动态加密，保证密码哈希一定可验证
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserMapper userMapper;
    private final UserStatsMapper userStatsMapper;
    private final UserCharacterMapper userCharacterMapper;
    private final Environment env;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Override
    public void run(String... args) {
        initAdmin();
    }

    /**
     * 初始化主管理员（线上安全策略：绝不覆盖/迁移真实账号）
     * 1) 默认邮箱已存在 → 跳过
     * 2) 库中已有任意 role=admin 账号（线上真实管理员）→ 跳过，不迁移邮箱、不重置密码、不改角色
     * 3) 仅当全新库且完全无主管理员时才创建默认账号（便于首次初始化）
     */
    private void initAdmin() {
        String adminEmail = env.getProperty("EGGWORLD_ADMIN_EMAIL", "");
        String rawPassword = env.getProperty("EGGWORLD_ADMIN_PASSWORD", "");
        // 未配置初始化管理员时直接跳过，避免创建空账号
        if (adminEmail.isBlank() || rawPassword.isBlank()) {
            log.info("未配置 EGGWORLD_ADMIN_EMAIL / EGGWORLD_ADMIN_PASSWORD，跳过默认管理员初始化");
            return;
        }
        String encoded = passwordEncoder.encode(rawPassword);

        // 1) 默认邮箱已存在 → 已有账号，不做任何改动
        if (userMapper.selectByEmail(adminEmail) != null) {
            return;
        }
        // 2) 库中已有任意主管理员（线上真实账号）→ 不动，避免自动改邮箱/密码影响真实运营
        Long adminCount = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getRole, "admin"));
        if (adminCount != null && adminCount > 0) {
            log.info("已检测到主管理员账号，跳过默认管理员初始化（避免覆盖线上真实账号）");
            return;
        }
        // 3) 全新库且无任何主管理员 → 创建默认
        createAdmin(encoded, adminEmail);
    }

    /** 全新创建主管理员：补齐五维属性与默认角色（昵称全局唯一，被占用时追加时间戳后缀兜底） */
    private void createAdmin(String encodedPwd, String email) {
        String nickname = "管理员";
        Long dupCount = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getNickname, nickname));
        if (dupCount != null && dupCount > 0) {
            nickname = "管理员" + (System.currentTimeMillis() % 100000);
        }

        User admin = new User();
        admin.setNickname(nickname);
        admin.setEmail(email);
        admin.setPasswordHash(encodedPwd);
        admin.setRole("admin");
        admin.setPoints(0);
        admin.setExp(0);
        admin.setEggRarity("N");
        userMapper.insert(admin);

        initAdminResources(admin.getId());
        log.info("已初始化管理员账号: {}，请及时修改初始密码", email);
    }

    /** 补齐管理员五维属性（默认 5 分）与默认解锁的 game 角色 */
    private void initAdminResources(Long adminId) {
        UserStats stats = new UserStats();
        stats.setUserId(adminId);
        stats.setKnowledge(BigDecimal.valueOf(5));
        stats.setSkills(BigDecimal.valueOf(5));
        stats.setCharm(BigDecimal.valueOf(5));
        stats.setMoney(BigDecimal.valueOf(5));
        stats.setReputation(BigDecimal.valueOf(5));
        userStatsMapper.insert(stats);

        UserCharacter uc = new UserCharacter();
        uc.setUserId(adminId);
        uc.setCategory("game");
        uc.setUnlocked(1);
        uc.setCount(0);
        uc.setIsCurrent(1);
        userCharacterMapper.insert(uc);
    }
}
