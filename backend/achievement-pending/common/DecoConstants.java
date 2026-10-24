package com.eggworld.common;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 装扮特效常量（唯一权威来源）
 *
 * 三方必须一致：本类白名单 ←→ 前端 js/deco.js 的 DECO_KEY_RE ←→ 前端 js/deco.css 的类名。
 * 任何一方不一致都会导致「解锁了却没有视觉效果」。
 *
 * 特效是纯代码定义的静态资源（CSS 类），因此白名单写在代码里；
 * 称号同样使用固定白名单，数据库配置不能绕过槽位与 key 校验。
 */
public final class DecoConstants {

    private DecoConstants() {}

    /** 7 个槽位（顺序即前端展示顺序） */
    public static final String[] SLOTS = {"aura", "cloak", "outfit", "frame", "charm", "title", "skin"};

    /** 6 个「特效」槽位（称号单独处理） */
    public static final String[] EFFECT_SLOTS = {"aura", "cloak", "outfit", "frame", "charm", "skin"};

    /** 特效 key → 中文名（28 个，顺序即前端图鉴顺序） */
    public static final Map<String, String> EFFECT_NAMES;

    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("a-moon", "月华");
        m.put("a-thunder", "雷霆");
        m.put("a-ember", "烈焰");
        m.put("a-cosmos", "星海");
        m.put("cl-cloth", "旅人斗篷");
        m.put("cl-feather", "羽翼");
        m.put("cl-dragon", "龙翼");
        m.put("cl-flame", "烈焰之翼");
        m.put("cl-galaxy", "星河之翼");
        m.put("of-uniform", "学生制服");
        m.put("of-scarf", "暖绒围巾");
        m.put("of-lab", "科研白袍");
        m.put("of-armor", "金鳞胸甲");
        m.put("of-rune", "星辉圣袍");
        m.put("f-cloud", "云纹边框");
        m.put("f-flow", "流光边框");
        m.put("f-rainbow", "彩虹边框");
        m.put("f-star", "星辉边框");
        m.put("f-dragon", "龙焰边框");
        m.put("ch-cap", "学士帽");
        m.put("ch-cat", "猫耳");
        m.put("ch-bolt", "雷霆挂件");
        m.put("ch-wing", "羽翼挂件");
        m.put("ch-crown", "皇冠");
        m.put("sk-flame", "火焰蛋");
        m.put("sk-ice", "冰霜蛋");
        m.put("sk-night", "暗夜蛋");
        m.put("sk-gold", "黄金蛋");
        EFFECT_NAMES = Collections.unmodifiableMap(m);
    }

    /** 全部特效 key 白名单（28 个） */
    public static final Set<String> EFFECT_WHITELIST = EFFECT_NAMES.keySet();

    public static final Set<String> TITLE_WHITELIST = Set.of(
        "t-newbie","t-tasker","t-buddy","t-sharp","t-guide","t-frank",
        "t-diligent","t-lord","t-worker","t-goldsign","t-steady","t-mentor",
        "t-core","t-partner","t-brain","t-model","t-allround","t-hexa",
        "t-star","t-legend","t-acclaim","t-genius","t-network","t-veteran");

    /** 特效 key 前缀 → 槽位 */
    public static String slotOfEffect(String key) {
        if (key == null || key.length() < 3) return null;
        int idx = key.indexOf('-');
        if (idx <= 0) return null;
        switch (key.substring(0, idx)) {
            case "a":  return "aura";
            case "cl": return "cloak";
            case "of": return "outfit";
            case "f":  return "frame";
            case "ch": return "charm";
            case "sk": return "skin";
            default:   return null;
        }
    }

    public static boolean isValidEffect(String key) {
        return key != null && EFFECT_WHITELIST.contains(key);
    }

    public static boolean isValidSlot(String slot) {
        if (slot == null) return false;
        for (String s : SLOTS) {
            if (s.equals(slot)) return true;
        }
        return false;
    }

    /** 特效中文名；未知返回 key 本身 */
    public static String effectName(String key) {
        String n = EFFECT_NAMES.get(key);
        return n != null ? n : key;
    }
}
