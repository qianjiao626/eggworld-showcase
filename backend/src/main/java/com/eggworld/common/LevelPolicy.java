package com.eggworld.common;

/**
 * 用户等级口径（与前端 growth-schoolv3.html 的 LEVELS 一一对应）。
 *
 * 为什么要有这个类：等级以前只活在前端（LEVELS 数组 + getLevel(exp)），但「发布任务能选几个认领人」
 * 必须由后端把关 —— 前端算错或被绕过时，后端要能拦住。两边口径必须一起改。
 *
 * 等级经验区间（前端 LEVELS 原样搬过来，不要各写一套）：
 *   新手蛋 0-99 / 进阶蛋 100-299 / 达人蛋 300-599 / 大神蛋 600-999 / 传奇蛋 1000+
 *
 * 认领人数口径（2026-10-07 需求）：**新用户（新手蛋）最多 2 人，每升一级 +1 人**。
 */
public final class LevelPolicy {

    /** 各等级的最低经验，下标 = 等级序号 - 1（新手蛋 = 0） */
    private static final int[] LEVEL_MIN_EXP = {0, 100, 300, 600, 1000};

    private static final String[] LEVEL_NAMES = {"新手蛋", "进阶蛋", "达人蛋", "大神蛋", "传奇蛋"};

    /** 新用户（新手蛋）的认领人数上限 */
    public static final int BASE_MAX_CLAIMERS = 2;

    /** 与 PublishTaskDTO / 前端输入框一致的上限（体验上限，不随等级放开） */
    public static final int HARD_MAX_CLAIMERS = 50;

    private LevelPolicy() {}

    /** 等级序号：1 = 新手蛋，2 = 进阶蛋 …… 最高 5（传奇蛋及其以上） */
    public static int levelOf(Integer exp) {
        int value = exp == null ? 0 : Math.max(0, exp);
        int level = 1;
        for (int i = 0; i < LEVEL_MIN_EXP.length; i++) {
            if (value >= LEVEL_MIN_EXP[i]) level = i + 1;
        }
        return level;
    }

    /** 等级名（新手蛋 / 进阶蛋 …），用于错误提示与前端展示口径核对 */
    public static String levelNameOf(Integer exp) {
        return LEVEL_NAMES[levelOf(exp) - 1];
    }

    /**
     * 该等级允许的「最多可选人数」上限：新手蛋 2 人，之后每升一级 +1（进阶蛋 3、达人蛋 4、大神蛋 5、传奇蛋 6），
     * 最后仍受 HARD_MAX_CLAIMERS 收敛。
     */
    public static int maxClaimersAllowed(Integer exp) {
        return Math.min(HARD_MAX_CLAIMERS, BASE_MAX_CLAIMERS + levelOf(exp) - 1);
    }

    /**
     * 这次发布的认领人数上限（2026-10-07 需求修订，按**角色**放宽官方任务）：
     *   · 主管理员（role=admin）：发布任何类型都不设等级上限；
     *   · 副管理员（role=subadmin）：只有发布**奖励型（reward）**官方任务不设限，
     *     自己发教学/求助/组队时仍按自己的等级收敛 —— 副管理员同时也是学生，避免用管理身份绕开学生侧规则；
     *   · 学生：一律按等级。
     *
     * @param exp           发布者经验（决定等级）
     * @param taskType      teach / help / team / reward
     * @param adminRole     UserContext 里的角色是否为主管理员（role=admin）
     * @param moderatorRole UserContext 里的角色是否为主管理员或副管理员
     * @return 允许的「最多可选人数」
     */
    public static int maxClaimersAllowedFor(Integer exp, String taskType, boolean adminRole, boolean moderatorRole) {
        if (adminRole) return HARD_MAX_CLAIMERS;
        if (moderatorRole && "reward".equals(taskType)) return HARD_MAX_CLAIMERS;
        return maxClaimersAllowed(exp);
    }

    /** 下一级的经验门槛（已满级返回 null），前端提示用 */
    public static Integer nextLevelMinExp(Integer exp) {
        int level = levelOf(exp);
        return level >= LEVEL_MIN_EXP.length ? null : LEVEL_MIN_EXP[level];
    }
}
