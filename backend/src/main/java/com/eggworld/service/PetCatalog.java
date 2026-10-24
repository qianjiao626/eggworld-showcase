package com.eggworld.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 宠物系统静态配置（v2.1 简化版）：8 属性、商店商品、孵化/进化形态。
 * 纯配置数据，不放逻辑。数值取自设计稿（《蛋蛋世界 · 宠物系统 v2.1 简化版》）。
 */
public final class PetCatalog {

    public static final String[] ATTRS = {"grass", "fire", "water", "electric", "rock", "ghost", "light", "mystic"};
    public static final Map<String, String> ATTR_NAMES = new LinkedHashMap<>();
    static {
        ATTR_NAMES.put("grass", "草木");
        ATTR_NAMES.put("fire", "火焰");
        ATTR_NAMES.put("water", "水系");
        ATTR_NAMES.put("electric", "电气");
        ATTR_NAMES.put("rock", "岩石");
        ATTR_NAMES.put("ghost", "幽灵");
        ATTR_NAMES.put("light", "光明");
        ATTR_NAMES.put("mystic", "神秘");
    }

    /** 食物：8 系 × 3 档（普通/精致/豪华），价格与属性按设计稿比例。 */
    public static final List<Map<String, Object>> FOODS = new ArrayList<>();
    static {
        String[][] icons = {
                {"🥦", "🥗", "🌱"}, {"🍖", "🥩", "🍗"}, {"🐟", "🦐", "🦑"},
                {"🍬", "🍭", "⚡"}, {"🍞", "🍙", "🥘"}, {"🍰", "🍮", "🍫"},
                {"🍎", "🍊", "🍇"}, {"🍜", "🍣", "🌟"}
        };
        int[] prices = {5, 12, 25};
        int[] attrVals = {8, 18, 30};
        int[] satiety = {20, 35, 50};
        for (int a = 0; a < ATTRS.length; a++) {
            for (int tier = 0; tier < 3; tier++) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", "food_" + ATTRS[a] + "_" + (tier + 1));
                item.put("name", ATTR_NAMES.get(ATTRS[a]) + foodTierName(tier));
                item.put("icon", icons[a][tier]);
                item.put("category", "food");
                item.put("attr", ATTRS[a]);
                item.put("attrValue", attrVals[tier]);
                item.put("satiety", satiety[tier]);
                item.put("price", prices[tier]);
                FOODS.add(item);
            }
        }
    }

    private static String foodTierName(int tier) {
        return switch (tier) { case 0 -> "普通食物"; case 1 -> "精致料理"; default -> "豪华大餐"; };
    }

    /** 玩具（加心情 + 亲密度）。 */
    public static final List<Map<String, Object>> TOYS = new ArrayList<>();
    static {
        TOYS.add(toy("toy_ball", "小球", "🎾", 20, 5, 8));
        TOYS.add(toy("toy_plush", "毛绒玩具", "🧸", 35, 10, 18));
        TOYS.add(toy("toy_music", "音乐盒", "🎵", 50, 20, 35));
        TOYS.add(toy("toy_console", "游戏机", "🎮", 60, 30, 55));
        TOYS.add(toy("toy_bath", "泡泡浴", "🛁", 25, 15, 20));
    }

    private static Map<String, Object> toy(String id, String name, String icon, int mood, int intimacy, int price) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id); item.put("name", name); item.put("icon", icon);
        item.put("category", "toy"); item.put("mood", mood); item.put("intimacy", intimacy); item.put("price", price);
        return item;
    }

    /** 道具。 */
    public static final List<Map<String, Object>> ITEMS = new ArrayList<>();
    static {
        ITEMS.add(item("egg_normal", "普通蛋", "🥚", 50, "孵化一只新宠物（随机基础形态）"));
        ITEMS.add(item("egg_rare", "稀有蛋", "✨", 200, "高概率出稀有以上（稀有60%/史诗30%/传说10%）"));
        ITEMS.add(item("stone_evolve", "进化石", "💎", 300, "二阶→三阶进化必需"));
        ITEMS.add(item("potion_energy", "活力药水", "⚡", 15, "恢复 50 点活力"));
        ITEMS.add(item("candy_intimacy", "亲密度糖果", "❤️", 25, "亲密度 +50"));
        ITEMS.add(item("gacha_ticket", "扭蛋券", "🎰", 10, "抽一次随机食物/道具"));
        ITEMS.add(item("slot_expand", "宠物栏位", "🏠", 100, "增加一个宠物位（初始3，最多10）"));
        ITEMS.add(item("rename_card", "改名卡", "🎨", 10, "给宠物改名字"));
    }

    private static Map<String, Object> item(String id, String name, String icon, int price, String desc) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id); item.put("name", name); item.put("icon", icon);
        item.put("category", "item"); item.put("price", price); item.put("desc", desc);
        return item;
    }

    /** 基础形态（蛋蛋期孵化结果，8 系各一 + 新手初始蛋蛋兽）。 */
    public static final Map<String, Map<String, Object>> SPECIES = new LinkedHashMap<>();
    static {
        species("eggmon", "蛋蛋兽", "🥚", "mystic", 1, 0);
        species("sprout", "草芽兽", "🌱", "grass", 1, 0);
        species("ember", "火炎兽", "🔥", "fire", 1, 0);
        species("aqua", "水灵兽", "💧", "water", 1, 0);
        species("volt", "电光兽", "⚡", "electric", 1, 0);
        species("pebble", "磐石兽", "🗿", "rock", 1, 0);
        species("wisp", "幽影兽", "👻", "ghost", 1, 0);
        species("lumen", "辉光兽", "✨", "light", 1, 0);
        // 一阶/二阶/三阶示例形态（MVP 每系 3 段）
        line("sprout", "vine", "藤蔓兽", "🌿", "grass", 2, 2);
        line("vine", "worldtree", "世界树兽", "🌳", "grass", 3, 4);
        line("ember", "blaze", "烈焰兽", "🔥", "fire", 2, 2);
        line("blaze", "inferno", "炎狱兽", "🌋", "fire", 3, 4);
        line("aqua", "tide", "潮汐兽", "🌊", "water", 2, 2);
        line("tide", "abyss", "深渊兽", "🐳", "water", 3, 4);
        line("volt", "storm", "雷storm兽", "🌩️", "electric", 2, 2);
        line("storm", "thunder", "雷霆兽", "⚡", "electric", 3, 4);
        line("pebble", "boulder", "巨岩兽", "⛰️", "rock", 2, 2);
        line("boulder", "mountain", "山岳兽", "🏔️", "rock", 3, 4);
        line("wisp", "shade", "暗影兽", "🌑", "ghost", 2, 2);
        line("shade", "phantom", "幻冥兽", "💀", "ghost", 3, 4);
        line("lumen", "radiant", "耀光兽", "🌟", "light", 2, 2);
        line("radiant", "seraph", "炽天兽", "👼", "light", 3, 4);
    }

    private static void species(String id, String name, String emoji, String attr, int rarity, int stage) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("id", id); s.put("name", name); s.put("emoji", emoji); s.put("attr", attr);
        s.put("rarity", rarity); s.put("stage", stage); s.put("next", null);
        SPECIES.put(id, s);
    }

    private static void line(String fromId, String id, String name, String emoji, String attr, int rarity, int stage) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("id", id); s.put("name", name); s.put("emoji", emoji); s.put("attr", attr);
        s.put("rarity", rarity); s.put("stage", stage); s.put("next", null);
        SPECIES.put(id, s);
        SPECIES.get(fromId).put("next", id);
    }

    /** 全部商品（食物+玩具+道具）。 */
    public static List<Map<String, Object>> allShopItems() {
        List<Map<String, Object>> all = new ArrayList<>();
        all.addAll(FOODS);
        all.addAll(TOYS);
        all.addAll(ITEMS);
        return all;
    }

    public static Map<String, Object> findShopItem(String id) {
        for (Map<String, Object> it : allShopItems()) if (id.equals(it.get("id"))) return it;
        return null;
    }

    private PetCatalog() {}
}
