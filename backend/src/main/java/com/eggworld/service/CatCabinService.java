package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 猫咪小屋（移动端「任务广场」第 4 个 tab）：存档读写 + 蛋蛋币合并（P2）。
 *
 * <p>金币合并（负责人 2026-10-10 确认「完全合并」）：
 * <ul>
 *   <li>state.coins 是真实蛋蛋币余额的镜像：GET /state 返回时服务端一律把
 *       save.coins 覆盖为 PointService 余额；POST /state 落库前同样覆盖，
 *       客户端伪造余额无效。</li>
 *   <li>余额变动只走 /earn /spend：扣入账全部由后端执行（PointService 行锁），
 *       金额由 reason 白名单 + 服务端规则决定，前端不报数额。</li>
 *   <li>增发护栏：每日 /earn 合计上限 200 币（earn_date 跨天重置）；
 *       单笔 spend 上限 10000（对齐引擎家园最高定价）。</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class CatCabinService {

    /** 存档 JSON 上限：引擎整份 state（猫列表/背包/繁育史）实测几十 KB，256KB 留足余量。 */
    private static final int MAX_SAVE_BYTES = 256 * 1024;
    /** 每日赚币上限（增发护栏，负责人确认 200/天）。 */
    static final int MAX_DAILY_EARN = 200;
    /** 单笔扣币上限（对齐引擎 HOME_CONFIG.maxPrice=10000）。 */
    static final int MAX_SPEND = 10000;

    /** 扣币白名单 reason → 流水文案。 */
    private static final Map<String, String> SPEND_REASONS = Map.of(
            "adopt", "领养猫咪",
            "buy_food", "购买猫粮",
            "buy_toy", "购买玩具",
            "buy_item", "购买道具",
            "home_listing_fee", "猫咪上架手续费",
            "home_buy", "购买家园猫咪",
            "adopt_stray", "领养流浪猫",
            "breeding", "猫咪繁育");
    /** 赚币白名单 reason。 */
    private static final Set<String> EARN_REASONS = Set.of("checkin", "donate");

    /** 连续签到第 1..7 天的币奖励（与 js/pet-data.js DAILY_CHECKIN.rewards 一致；第3/5天不发币）。 */
    private static final int[] CHECKIN_COINS = {30, 50, 0, 80, 0, 120, 200};
    /** 第3天名额满时折算的币（与引擎 doCheckin 一致）。 */
    private static final int CHECKIN_SLOT_FULL_COINS = 100;
    /** 捐赠猫咪奖励（与引擎 PEN_CONFIG.donateReward 一致）。 */
    private static final int DONATE_COINS = 20;
    /** 「看看猫咪在想什么」冷却小时数（服务端权威，防刷好感度；与前端 pet-ui.js 一致）。 */
    static final int THOUGHT_COOLDOWN_HOURS = 6;

    private final JdbcTemplate jdbc;
    private final PointService pointService;
    private final CatParkService catParkService;
    private final ObjectMapper mapper = new ObjectMapper();

    /* ---------------- 存档 ---------------- */

    /**
     * 读取存档（coins 覆盖为真实余额）。
     *
     * <p>占位空行（`/earn`、`/thought` 在无档时建的 `save_json='{}'`）保持返回空 Map，
     * 前端据此走「首次上传」把本地档写回来；**不能回填 coins**，否则前端会把空档
     * 当成真实存档整档覆盖本地，导致刚领养的猫/公园批次静默丢档。
     *
     * @return exists=false 表示还没有服务端存档（前端把本地档作为首次上传内容）。
     */
    public Map<String, Object> getState(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT save_json, version, updated_at FROM cat_cabin_saves WHERE user_id = ?", userId);
        int balance = pointService.getBalance(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            out.put("exists", false);
            out.put("version", 0);
            out.put("save", null);
            out.put("coins", balance);
            return out;
        }
        Map<String, Object> row = rows.get(0);
        Map<String, Object> save = asMap(parse(row.get("save_json")));
        if (!save.isEmpty()) {
            save.put("coins", balance);   // 余额权威：忽略落库 JSON 里的 coins
        }
        /* 空 Map 即占位空行：保持「空档」语义（余额只走顶层 coins），
           让前端按「首次上传」把本地档写回来 —— 见方法注释。 */
        out.put("exists", true);
        out.put("version", toInt(row.get("version")));
        out.put("updatedAt", row.get("updated_at"));
        out.put("save", save);
        out.put("coins", balance);
        return out;
    }

    /**
     * 保存存档（乐观锁；coins 字段落库前覆盖为真实余额）。
     *
     * @throws BusinessException code=409：其它端已写过，前端需重拉合并。
     */
    @Transactional
    public Map<String, Object> saveState(Long userId, Map<String, Object> save, int baseVersion) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        if (save == null || save.isEmpty()) throw new BusinessException("存档内容为空");
        save.put("coins", pointService.getBalance(userId));   // 防伪造余额进存档
        String json = toJson(save);
        if (json.length() > MAX_SAVE_BYTES) throw new BusinessException("存档过大，请清理后重试");

        SaveRow current = lockRow(userId);
        if (current == null) {
            try {
                jdbc.update("INSERT INTO cat_cabin_saves (user_id, save_json, version) VALUES (?, ?, 1)", userId, json);
            } catch (DuplicateKeyException ex) {
                throw new BusinessException(409, "存档已在其它端更新，请刷新后重试");
            }
            catParkService.reconcileFromSave(userId, save);   // 同事务投影公园名录（用户猫上公园）
            return versionResult(1);
        }
        if (baseVersion != current.version) {
            throw new BusinessException(409, "存档已在其它端更新，请刷新后重试");
        }
        int next = current.version + 1;
        int updated = jdbc.update("UPDATE cat_cabin_saves SET save_json = ?, version = ? WHERE user_id = ? AND version = ?",
                json, next, userId, current.version);
        if (updated == 0) {
            throw new BusinessException(409, "存档已在其它端更新，请刷新后重试");
        }
        catParkService.reconcileFromSave(userId, save);       // 同上：成功落库才同步公园
        return versionResult(next);
    }

    /* ---------------- 金币合并：扣 / 赚 ---------------- */

    /**
     * 扣币（领养/商店/家园等）。只认 reason 与限额，金额由前端操作对象决定但封顶；
     * 存档 version 不递增（余额权威在 users 表，存档写回走 /state）。
     *
     * @return coins=实际扣减，balance=扣后余额。
     * @throws BusinessException code=402：余额不足（前端据此回滚乐观更新）。
     */
    @Transactional
    public Map<String, Object> spend(Long userId, String reason, String refId, int amount) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        String label = SPEND_REASONS.get(reason);
        if (label == null) throw new BusinessException("未知的消费类型");
        if (amount < 0 || amount > MAX_SPEND) throw new BusinessException("金额超出允许范围");
        if (amount == 0) return coinResult(0, pointService.getBalance(userId));

        if (pointService.getBalance(userId) < amount) {
            throw new BusinessException(402, "蛋蛋币余额不足");
        }
        try {
            // home_buy 的 refId 是内部挂牌 id（mock_listing_...），对用户是无意义噪音 → 不拼进流水描述
            String desc = "猫咪小屋·" + label;
            if (!"home_buy".equals(reason)) desc += refSuffix(refId);
            pointService.changeBalance(userId, -amount, "spend", desc, null);
        } catch (BusinessException ex) {
            // 并发下 changeBalance 行锁校验兜底：统一成 402 供前端回滚
            throw new BusinessException(402, "蛋蛋币余额不足");
        }
        return coinResult(amount, pointService.getBalance(userId));
    }

    /**
     * 赚币（签到/捐赠）。资格与金额全部服务端权威（防脚本刷币）：
     * 签到每天一次（last_checkin_date），档位由服务端 streak 推算（断一天归零）；
     * 捐赠每天一次（last_donate_date）；每日合计封顶 {@link #MAX_DAILY_EARN}，超出截断。
     * 服务端没有存档行时会先建一行占位（save_json='{}'），前端拉到时按「空档」处理。
     *
     * @return coins=实际入账（可能因日上限/已领过截断为 0），balance=入账后余额
     */
    @Transactional
    public Map<String, Object> earn(Long userId, String reason, boolean slotFull) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        if (!EARN_REASONS.contains(reason)) throw new BusinessException("未知的奖励类型");

        SaveRow row = lockRow(userId);
        LocalDate today = LocalDate.now();

        // ---- 服务端定奖励（不信任客户端数额与天数） ----
        int raw = 0;
        LocalDate lastCheckin = row == null ? null : row.lastCheckinDate;
        int newStreak = row == null ? 0 : row.checkinStreak;
        boolean markCheckin = false, markDonate = false;
        if ("checkin".equals(reason)) {
            if (today.equals(lastCheckin)) {
                // 今天服务端已记过签到：不再发币（跨设备防重复领）
            } else {
                boolean yesterday = LocalDate.now().minusDays(1).equals(lastCheckin);
                newStreak = yesterday ? newStreak + 1 : 1;
                int day = ((newStreak - 1) % 7) + 1;
                raw = CHECKIN_COINS[day - 1];
                if (day == 3 && slotFull) raw = CHECKIN_SLOT_FULL_COINS;
                markCheckin = true;
            }
        } else { // donate：每天限一次
            if (!today.equals(row == null ? null : row.lastDonateDate)) {
                raw = DONATE_COINS;
                markDonate = true;
            }
        }

        int earnedToday = (row != null && today.equals(row.earnDate)) ? row.earnedToday : 0;
        int grant = Math.max(0, Math.min(raw, MAX_DAILY_EARN - earnedToday));

        if (row == null) {
            // 占位行：存档内容留空，等前端 /state 首次上传覆盖（coins 余额权威不受影响）
            jdbc.update("INSERT INTO cat_cabin_saves (user_id, save_json, version, earn_date, earned_today, "
                    + "last_checkin_date, checkin_streak, last_donate_date) VALUES (?, '{}', 1, ?, ?, ?, ?, ?)",
                    userId, today, earnedToday + grant,
                    markCheckin ? today : null, newStreak, markDonate ? today : null);
        } else {
            jdbc.update("UPDATE cat_cabin_saves SET earn_date = ?, earned_today = ?, "
                    + "last_checkin_date = COALESCE(?, last_checkin_date), checkin_streak = ?, "
                    + "last_donate_date = COALESCE(?, last_donate_date) WHERE user_id = ?",
                    today, earnedToday + grant,
                    markCheckin ? today : null, newStreak,
                    markDonate ? today : null, userId);
        }
        if (grant > 0) {
            pointService.changeBalance(userId, grant, "earn",
                    "猫咪小屋·" + ("checkin".equals(reason) ? "每日签到奖励" : "捐赠猫咪奖励"), null);
        }
        Map<String, Object> out = coinResult(grant, pointService.getBalance(userId));
        out.put("dailyCap", MAX_DAILY_EARN);
        out.put("earnedToday", earnedToday + grant);
        out.put("streakDays", markCheckin ? newStreak : (row == null ? 0 : row.checkinStreak));
        return out;
    }

    /* ---------------- 「看看猫咪在想什么」冷却 ---------------- */

    /**
     * 领取一次「看看猫咪在想什么」交互（服务端权威 6 小时冷却，防改本地时间刷好感度）。
     * 冷却时间存 {@code cat_cabin_saves.last_thought_at}（DATETIME(3) 毫秒精度），
     * 事务内 {@code FOR UPDATE} 锁行 + 条件 UPDATE 双保险，并发下只有一个请求能占位。
     *
     * @return allowed=true 本次放行（已占位）；否则 allowed=false 并给出剩余毫秒与下次可点时刻
     */
    @Transactional
    public Map<String, Object> claimThought(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cooldownFrom = now.minusHours(THOUGHT_COOLDOWN_HOURS);

        lockRow(userId);   // 锁行（无行也安全：下面 INSERT 撞唯一键即说明并发已占位）
        int updated = jdbc.update("UPDATE cat_cabin_saves SET last_thought_at = ? "
                        + "WHERE user_id = ? AND (last_thought_at IS NULL OR last_thought_at <= ?)",
                now, userId, cooldownFrom);
        if (updated == 0 && jdbc.queryForList(
                "SELECT last_thought_at FROM cat_cabin_saves WHERE user_id = ?", userId).isEmpty()) {
            // 首次交互且还没有存档行：建占位行（save_json='{}'，前端拉到时按「空档」处理）
            try {
                jdbc.update("INSERT INTO cat_cabin_saves (user_id, save_json, version, last_thought_at) "
                        + "VALUES (?, '{}', 1, ?)", userId, now);
                updated = 1;
            } catch (DuplicateKeyException ignored) {
                // 并发：其它请求刚建行，重查冷却
            }
        }
        if (updated == 0) {
            // 冷却中：返回剩余毫秒与下次可点时刻（FOR UPDATE 锁内重查，无并发干扰）
            LocalDateTime last = toLdt(firstThoughtAt(userId));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("allowed", false);
            out.put("cooldownMs", last == null ? 0
                    : Math.max(0, Duration.between(now, last.plusHours(THOUGHT_COOLDOWN_HOURS)).toMillis()));
            out.put("nextAllowedAt", last == null ? null : last.plusHours(THOUGHT_COOLDOWN_HOURS).withNano(0).toString());
            return out;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("allowed", true);
        out.put("cooldownMs", 0);
        out.put("nextAllowedAt", now.plusHours(THOUGHT_COOLDOWN_HOURS).withNano(0).toString());
        return out;
    }

    private Object firstThoughtAt(Long userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT last_thought_at FROM cat_cabin_saves WHERE user_id = ?", userId);
        return rows.isEmpty() ? null : rows.get(0).get("last_thought_at");
    }

    private static LocalDateTime toLdt(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        return LocalDateTime.parse(String.valueOf(v));
    }

    /* ---------------- 内部 ---------------- */

    /** 锁存档行（含乐观锁版本、当日赚币计数与签到/捐赠权威日期）；不存在返回 null。 */
    private SaveRow lockRow(Long userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT version, earn_date, earned_today, last_checkin_date, checkin_streak, last_donate_date "
                        + "FROM cat_cabin_saves WHERE user_id = ? FOR UPDATE", userId);
        if (rows.isEmpty()) return null;
        Map<String, Object> r = rows.get(0);
        return new SaveRow(toInt(r.get("version")), toLocalDate(r.get("earn_date")), toInt(r.get("earned_today")),
                toLocalDate(r.get("last_checkin_date")), toInt(r.get("checkin_streak")), toLocalDate(r.get("last_donate_date")));
    }

    private static LocalDate toLocalDate(Object d) {
        if (d == null) return null;
        if (d instanceof LocalDate ld) return ld;
        if (d instanceof java.sql.Date sd) return sd.toLocalDate();
        return LocalDate.parse(String.valueOf(d));
    }

    private record SaveRow(int version, LocalDate earnDate, int earnedToday,
                           LocalDate lastCheckinDate, int checkinStreak, LocalDate lastDonateDate) {}

    private static String refSuffix(String refId) {
        if (refId == null || refId.isBlank()) return "";
        String clean = refId.strip().replaceAll("[^A-Za-z0-9_\\-\\u4e00-\\u9fa5]", "");
        return clean.isEmpty() ? "" : "：" + (clean.length() > 20 ? clean.substring(0, 20) : clean);
    }

    private Map<String, Object> coinResult(int coins, int balance) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("coins", coins);
        out.put("balance", balance);
        return out;
    }

    private Map<String, Object> versionResult(int version) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", version);
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object parsed) {
        return parsed instanceof Map ? (Map<String, Object>) parsed : new LinkedHashMap<>();
    }

    private Object parse(Object raw) {
        if (raw == null) return null;
        try {
            JsonNode node = mapper.readTree(String.valueOf(raw));
            return mapper.convertValue(node, Map.class);
        } catch (Exception e) {
            throw new BusinessException("存档数据损坏，请联系管理员");
        }
    }

    private String toJson(Map<String, Object> save) {
        try {
            return mapper.writeValueAsString(save);
        } catch (Exception e) {
            throw new BusinessException("存档格式不正确");
        }
    }

    private static int toInt(Object v) {
        return v instanceof Number ? ((Number) v).intValue() : Integer.parseInt(String.valueOf(v));
    }
}
