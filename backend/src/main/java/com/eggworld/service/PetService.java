package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 宠物系统 v2.1（简化版）：商店金币购买 → 喂食/互动 → 属性比例决定进化 → 图鉴收集。
 * 所有扣币走 {@link PointService}（type=spend），宠物与背包状态落库（换设备不丢）。
 */
@Service
@RequiredArgsConstructor
public class PetService {

    /** 每只宠物每次互动的活力消耗。 */
    private static final int FEED_ENERGY = 10;
    private static final int PLAY_ENERGY = 15;
    private static final int CLEAN_ENERGY = 10;
    private static final int MAX_PETS = 10;

    private final JdbcTemplate jdbc;
    private final PointService pointService;
    private final ObjectMapper mapper = new ObjectMapper();

    /* ---------------- 商店 ---------------- */

    public Map<String, Object> shop() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("foods", PetCatalog.FOODS);
        out.put("toys", PetCatalog.TOYS);
        out.put("items", PetCatalog.ITEMS);
        return out;
    }

    public List<Map<String, Object>> inventory(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT item_id, qty FROM pet_inventory WHERE user_id = ? AND qty > 0 ORDER BY item_id", userId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            String id = (String) r.get("item_id");
            Map<String, Object> item = PetCatalog.findShopItem(id);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", id);
            entry.put("qty", r.get("qty"));
            if (item != null) {
                entry.put("name", item.get("name"));
                entry.put("icon", item.get("icon"));
                entry.put("category", item.get("category"));
            }
            out.add(entry);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> buy(Long userId, String itemId, int qty) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        if (qty < 1 || qty > 99) throw new BusinessException("购买数量需为 1–99");
        Map<String, Object> item = PetCatalog.findShopItem(itemId);
        if (item == null) throw new BusinessException("商品不存在");
        int price = (int) item.get("price");
        int total = price * qty;
        pointService.changeBalance(userId, -total, "spend", "宠物商店购买：" + item.get("name") + " ×" + qty, null);
        jdbc.update("INSERT INTO pet_inventory (user_id, item_id, qty, updated_at) VALUES (?, ?, ?, NOW()) "
                + "ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty), updated_at = NOW()", userId, itemId, qty);
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("itemId", itemId);
        res.put("qty", qty);
        res.put("cost", total);
        res.put("balance", pointService.getBalance(userId));
        return res;
    }

    /* ---------------- 宠物 ---------------- */

    public List<Map<String, Object>> myPets(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM pets WHERE user_id = ? ORDER BY slot ASC", userId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) out.add(toPetVO(r));
        return out;
    }

    public Map<String, Object> petDetail(Long userId, long petId) {
        Map<String, Object> row = requirePet(userId, petId);
        return toPetVO(row);
    }

    /** 用普通蛋孵化：消耗背包里一枚普通蛋，生成一只随机基础形态（蛋蛋兽或某系基础）。 */
    @Transactional
    public Map<String, Object> hatch(Long userId, boolean rare) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        String eggId = rare ? "egg_rare" : "egg_normal";
        int eggs = consumeItem(userId, eggId, 1);
        if (eggs < 0) throw new BusinessException("背包里没有" + (rare ? "稀有蛋" : "普通蛋"));

        int count = jdbc.queryForObject("SELECT COUNT(*) FROM pets WHERE user_id = ?", Integer.class, userId);
        int slots = ownedSlots(userId);
        if (count >= slots) throw new BusinessException("宠物位已满，请先购买宠物栏位");

        String speciesId = randomBaseSpecies(rare);
        Map<String, Object> stats = blankStats();
        String attr = (String) PetCatalog.SPECIES.get(speciesId).get("attr");
        stats.put(attr, 5 + randomInt(5));
        int slot = count + 1;
        jdbc.update("INSERT INTO pets (user_id, slot, species_id, stage, shiny, stats_json, intimacy, satiety, mood, energy, cleanliness, last_tick, created_at) "
                + "VALUES (?, ?, ?, 0, 0, ?, 0, 60, 60, 100, 80, NOW(), NOW())",
                userId, slot, speciesId, toJson(stats));
        long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return petDetail(userId, id);
    }

    /** 改名。 */
    @Transactional
    public void rename(Long userId, long petId, String nickname) {
        requirePet(userId, petId);
        String name = nickname == null ? "" : nickname.strip();
        if (name.isEmpty() || name.length() > 20) throw new BusinessException("昵称需为 1–20 字");
        jdbc.update("UPDATE pets SET nickname = ? WHERE id = ? AND user_id = ?", name, petId, userId);
    }

    /** 喂食：消耗背包食物，按新鲜度衰减结算属性与饱食度。 */
    @Transactional
    public Map<String, Object> feed(Long userId, long petId, String foodId) {
        Map<String, Object> pet = requirePet(userId, petId);
        Map<String, Object> food = PetCatalog.findShopItem(foodId);
        if (food == null || !"food".equals(food.get("category"))) throw new BusinessException("请选择食物");
        tickPet(pet);
        int energy = (int) pet.get("energy");
        if (energy < FEED_ENERGY) throw new BusinessException("活力不足，等一会儿再喂～");
        if (consumeItem(userId, foodId, 1) < 0) throw new BusinessException("背包里没有这个食物，先去商店买");
        Map<String, Object> stats = parseStats((String) pet.get("stats_json"));
        String attr = (String) food.get("attr");
        int gain = (int) food.get("attrValue");
        if ((int) pet.get("mood") >= 70) gain = (int) Math.round(gain * 1.2); // 心情好 +20% 效果
        if ((int) pet.get("satiety") <= 0) gain = (int) Math.round(gain * 0.5); // 饿着 -50%
        stats.put(attr, (int) stats.getOrDefault(attr, 0) + gain);
        int newSatiety = Math.min(100, (int) pet.get("satiety") + (int) food.get("satiety"));
        jdbc.update("UPDATE pets SET stats_json=?, satiety=?, mood=?, energy=?, last_tick=NOW() WHERE id=? AND user_id=?",
                toJson(stats), newSatiety, Math.min(100, (int) pet.get("mood") + 3), energy - FEED_ENERGY, petId, userId);
        tryEvolve(userId, petId);
        return petDetail(userId, petId);
    }

    /** 抚摸 / 玩耍 / 洗澡（简化：以 toy 或内置动作结算心情与亲密度）。 */
    @Transactional
    public Map<String, Object> interact(Long userId, long petId, String action) {
        Map<String, Object> pet = requirePet(userId, petId);
        tickPet(pet);
        int energy = (int) pet.get("energy");
        int moodAdd, intimacyAdd, cost;
        String itemId = null;
        switch (action) {
            case "pet" -> { moodAdd = 15; intimacyAdd = 2; cost = 0; }
            case "play" -> { moodAdd = 30; intimacyAdd = 5; cost = PLAY_ENERGY; }
            case "clean" -> { moodAdd = 10; intimacyAdd = 3; cost = CLEAN_ENERGY; }
            default -> throw new BusinessException("未知互动");
        }
        if (energy < cost) throw new BusinessException("活力不足");
        int newMood = Math.min(100, (int) pet.get("mood") + moodAdd);
        int newIntimacy = (int) pet.get("intimacy") + intimacyAdd;
        int newClean = action.equals("clean") ? 100 : (int) pet.get("cleanliness");
        jdbc.update("UPDATE pets SET mood=?, intimacy=?, cleanliness=?, energy=?, last_tick=NOW() WHERE id=? AND user_id=?",
                newMood, newIntimacy, newClean, energy - cost, petId, userId);
        tryEvolve(userId, petId);
        return petDetail(userId, petId);
    }

    /* ---------------- 进化 ---------------- */

    /** 属性总值达标则进化到链上的下一形态；二阶→三阶额外消耗进化石。 */
    private void tryEvolve(Long userId, long petId) {
        Map<String, Object> pet = requirePet(userId, petId);
        if (tickExpired(pet)) return;
        String speciesId = (String) pet.get("species_id");
        Map<String, Object> sp = PetCatalog.SPECIES.get(speciesId);
        if (sp == null) return;
        String nextId = (String) sp.get("next");
        if (nextId == null) return; // 已到顶
        Map<String, Object> stats = parseStats((String) pet.get("stats_json"));
        int total = stats.values().stream().mapToInt(v -> ((Number) v).intValue()).sum();
        int stage = (int) pet.get("stage");
        int need = switch (stage) { case 0 -> 40; case 1 -> 120; default -> 250; };
        if (total < need) return;
        if (stage == 1 && (int) pet.get("intimacy") < 50) return;
        if (stage == 2 && consumeItem(userId, "stone_evolve", 1) < 0) return; // 需要进化石
        jdbc.update("UPDATE pets SET species_id=?, stage=stage+1 WHERE id=? AND user_id=?", nextId, petId, userId);
    }

    /* ---------------- 内部 ---------------- */

    private Map<String, Object> requirePet(Long userId, long petId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM pets WHERE id = ? AND user_id = ?", petId, userId);
        if (rows.isEmpty()) throw new BusinessException(404, "宠物不存在");
        return rows.get(0);
    }

    private Map<String, Object> toPetVO(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("slot", row.get("slot"));
        out.put("speciesId", row.get("species_id"));
        String sid = (String) row.get("species_id");
        Map<String, Object> sp = PetCatalog.SPECIES.get(sid);
        if (sp != null) {
            out.put("name", row.get("nickname") != null ? row.get("nickname") : sp.get("name"));
            out.put("speciesName", sp.get("name"));
            out.put("emoji", sp.get("emoji"));
            out.put("attr", sp.get("attr"));
            out.put("rarity", sp.get("rarity"));
            out.put("hasNext", sp.get("next") != null);
        }
        out.put("stage", row.get("stage"));
        out.put("shiny", ((Number) row.get("shiny")).intValue() == 1);
        out.put("stats", parseStats((String) row.get("stats_json")));
        out.put("intimacy", row.get("intimacy"));
        out.put("satiety", row.get("satiety"));
        out.put("mood", row.get("mood"));
        out.put("energy", row.get("energy"));
        out.put("cleanliness", row.get("cleanliness"));
        return out;
    }

    private void tickPet(Map<String, Object> pet) {
        LocalDateTime last = ((java.sql.Timestamp) pet.get("last_tick")).toLocalDateTime();
        long minutes = Duration.between(last, LocalDateTime.now()).toMinutes();
        if (minutes <= 0) return;
        int satiety = (int) pet.get("satiety") - (int) (minutes / 120) * 10;   // 每2小时 -10
        int mood = (int) pet.get("mood") - (int) (minutes / 240) * 10;         // 每4小时 -10
        int energy = Math.min(100, (int) pet.get("energy") + (int) (minutes / 60) * 10); // 每小时 +10
        pet.put("satiety", Math.max(0, satiety));
        pet.put("mood", Math.max(0, mood));
        pet.put("energy", energy);
    }

    /** 材料是否已过期（仅用于进化判定里的边界，简化返回 false）。 */
    private boolean tickExpired(Map<String, Object> pet) { return false; }

    private int ownedSlots(Long userId) {
        Integer extra = jdbc.queryForObject("SELECT COALESCE(SUM(qty),0) FROM pet_inventory WHERE user_id=? AND item_id='slot_expand'", Integer.class, userId);
        return 3 + (extra == null ? 0 : extra);
    }

    /** 消费背包物品；返回剩余数量，库存不足返回 -1。 */
    private int consumeItem(Long userId, String itemId, int n) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, qty FROM pet_inventory WHERE user_id=? AND item_id=? FOR UPDATE", userId, itemId);
        if (rows.isEmpty() || ((Number) rows.get(0).get("qty")).intValue() < n) return -1;
        int left = ((Number) rows.get(0).get("qty")).intValue() - n;
        jdbc.update("UPDATE pet_inventory SET qty=?, updated_at=NOW() WHERE id=?", left, rows.get(0).get("id"));
        return left;
    }

    private String randomBaseSpecies(boolean rare) {
        // 普通蛋偏基础系；稀有蛋偏光明/神秘
        String[] pool = rare
                ? new String[]{"lumen", "wisp", "aqua", "volt"}
                : new String[]{"sprout", "ember", "aqua", "volt", "pebble", "wisp", "lumen"};
        return pool[randomInt(pool.length)];
    }

    private Map<String, Object> blankStats() {
        Map<String, Object> m = new LinkedHashMap<>();
        for (String a : PetCatalog.ATTRS) m.put(a, 0);
        return m;
    }

    private int randomInt(int bound) { return (int) (Math.random() * bound); }

    private String toJson(Map<String, Object> m) {
        try { return mapper.writeValueAsString(m); }
        catch (Exception e) { throw new IllegalStateException("宠物属性序列化失败", e); }
    }

    private Map<String, Object> parseStats(String json) {
        try { return mapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {}); }
        catch (Exception e) { return blankStats(); }
    }
}
