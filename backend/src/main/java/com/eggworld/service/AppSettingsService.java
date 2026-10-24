package com.eggworld.service;

import com.eggworld.common.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 运营配置（app_settings 表）读写。
 *
 * 目前承载两组收费配置，结构相同（收费开关 / 单次价格 / 每人每天次数）：
 *   · resume.*  大师兄简历 · 深度对标
 *   · career.*  大师兄找方向 · 职业测评
 *
 * 业务侧每次请求实时读取，后台改完立即生效，不需要重启。
 * 迁移脚本没执行时读取按默认值工作（不阻断功能），写入则给出可读提示。
 */
@Service
@RequiredArgsConstructor
public class AppSettingsService {

    public static final String RESUME_CHARGE_ENABLED = "resume.charge_enabled";
    public static final String RESUME_ANALYZE_COST = "resume.analyze_cost";
    public static final String RESUME_DAILY_LIMIT = "resume.daily_limit";

    public static final String CAREER_CHARGE_ENABLED = "career.charge_enabled";
    public static final String CAREER_ANALYZE_COST = "career.analyze_cost";
    public static final String CAREER_DAILY_LIMIT = "career.daily_limit";

    /** 学生工坊卡片顺序：逗号分隔的功能 id */
    public static final String WORKSHOP_ORDER = "workshop.order";

    private static final int DEFAULT_DAILY_LIMIT = 3;
    private static final int DEFAULT_CAREER_COST = 50;
    private static final java.util.regex.Pattern FEATURE_ID = java.util.regex.Pattern.compile("[a-z0-9_-]{1,32}");
    private static final int MAX_FEATURES = 50;

    private final JdbcTemplate jdbc;

    /** 未配置时的兜底单价，沿用 eggworld.resume.analyze-cost */
    @Value("${eggworld.resume.analyze-cost:50}")
    private int defaultAnalyzeCost;

    /** 简历深度对标的当前配置（默认免费，历史行为）。 */
    public ChargeSettings resumeSettings() {
        return read(RESUME_CHARGE_ENABLED, RESUME_ANALYZE_COST, RESUME_DAILY_LIMIT,
                false, defaultAnalyzeCost);
    }

    /** 职业测评的当前配置（默认收费 50 蛋蛋币 / 每天 3 次）。 */
    public ChargeSettings careerSettings() {
        return read(CAREER_CHARGE_ENABLED, CAREER_ANALYZE_COST, CAREER_DAILY_LIMIT,
                true, DEFAULT_CAREER_COST);
    }

    /** 保存简历对标配置并返回保存后的结果。 */
    public ChargeSettings saveResumeSettings(Boolean chargeEnabled, Integer analyzeCost,
                                             Integer dailyLimit, Long operatorId) {
        validate(chargeEnabled, analyzeCost, dailyLimit);
        save(RESUME_CHARGE_ENABLED, RESUME_ANALYZE_COST, RESUME_DAILY_LIMIT,
                chargeEnabled, analyzeCost, dailyLimit, operatorId);
        return resumeSettings();
    }

    /** 保存职业测评配置并返回保存后的结果。 */
    public ChargeSettings saveCareerSettings(Boolean chargeEnabled, Integer analyzeCost,
                                             Integer dailyLimit, Long operatorId) {
        validate(chargeEnabled, analyzeCost, dailyLimit);
        save(CAREER_CHARGE_ENABLED, CAREER_ANALYZE_COST, CAREER_DAILY_LIMIT,
                chargeEnabled, analyzeCost, dailyLimit, operatorId);
        return careerSettings();
    }

    /** 学生工坊卡片顺序（功能 id 列表）；未配置时返回空列表，前端用默认顺序。 */
    public List<String> workshopOrder() {
        String raw = loadValues(WORKSHOP_ORDER).get(WORKSHOP_ORDER);
        if (raw == null || raw.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        for (String part : raw.split(",")) {
            String id = part.trim();
            if (FEATURE_ID.matcher(id).matches() && !out.contains(id)) out.add(id);
        }
        return List.copyOf(out);
    }

    /** 保存学生工坊卡片顺序（去重 + 校验 id 格式）。 */
    public List<String> saveWorkshopOrder(List<String> ids, Long operatorId) {
        if (ids == null) throw new BusinessException("请提供排序列表");
        if (ids.size() > MAX_FEATURES) throw new BusinessException("排序项过多");
        List<String> out = new ArrayList<>();
        for (String id : ids) {
            if (id == null) continue;
            String value = id.trim();
            if (!FEATURE_ID.matcher(value).matches()) {
                throw new BusinessException("排序项不合法：" + value);
            }
            if (!out.contains(value)) out.add(value);
        }
        if (out.isEmpty()) throw new BusinessException("排序列表不能为空");
        upsert(WORKSHOP_ORDER, String.join(",", out), operatorId);
        return List.copyOf(out);
    }

    /* ---------------- 内部 ---------------- */

    private ChargeSettings read(String chargeKey, String costKey, String limitKey,
                                boolean defaultCharge, int defaultCost) {
        Map<String, String> values = loadValues(chargeKey, costKey, limitKey);
        boolean chargeEnabled = "1".equals(values.getOrDefault(chargeKey, defaultCharge ? "1" : "0"));
        int analyzeCost = clamp(parseInt(values.get(costKey), defaultCost), 0, 10000);
        int dailyLimit = clamp(parseInt(values.get(limitKey), DEFAULT_DAILY_LIMIT), 0, 100);
        return new ChargeSettings(chargeEnabled, analyzeCost, dailyLimit, values.get("__updatedAt"));
    }

    private void save(String chargeKey, String costKey, String limitKey,
                      Boolean chargeEnabled, Integer analyzeCost, Integer dailyLimit, Long operatorId) {
        upsert(chargeKey, chargeEnabled ? "1" : "0", operatorId);
        upsert(costKey, String.valueOf(analyzeCost), operatorId);
        upsert(limitKey, String.valueOf(dailyLimit), operatorId);
    }

    private static void validate(Boolean chargeEnabled, Integer analyzeCost, Integer dailyLimit) {
        if (chargeEnabled == null || analyzeCost == null || dailyLimit == null) {
            throw new BusinessException("请填写完整的设置项");
        }
        if (analyzeCost < 1 || analyzeCost > 10000) {
            throw new BusinessException("单次价格需在 1–10000 蛋蛋币之间");
        }
        if (dailyLimit < 0 || dailyLimit > 100) {
            throw new BusinessException("每人每天次数需在 0–100 之间（0 表示不限）");
        }
    }

    private Map<String, String> loadValues(String... keys) {
        Map<String, String> out = new LinkedHashMap<>();
        try {
            String placeholders = String.join(", ", Collections.nCopies(keys.length, "?"));
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT setting_key, setting_value, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt "
                            + "FROM app_settings WHERE setting_key IN (" + placeholders + ")",
                    (Object[]) keys);
            for (Map<String, Object> row : rows) {
                out.put(String.valueOf(row.get("setting_key")), String.valueOf(row.get("setting_value")));
                Object updatedAt = row.get("updatedAt");
                if (updatedAt != null) out.put("__updatedAt", String.valueOf(updatedAt));
            }
        } catch (BadSqlGrammarException e) {
            /* 迁移没执行：按默认值工作，别把业务功能一起拖垮 */
        }
        return out;
    }

    private void upsert(String key, String value, Long operatorId) {
        try {
            int updated = jdbc.update(
                    "UPDATE app_settings SET setting_value = ?, updated_by = ?, updated_at = NOW() WHERE setting_key = ?",
                    value, operatorId, key);
            if (updated == 0) {
                jdbc.update("INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)",
                        key, value, operatorId);
            }
        } catch (DuplicateKeyException e) {
            /* 并发首次写入：对方已插入，改成更新即可 */
            jdbc.update("UPDATE app_settings SET setting_value = ?, updated_by = ?, updated_at = NOW() WHERE setting_key = ?",
                    value, operatorId, key);
        } catch (BadSqlGrammarException e) {
            throw new BusinessException(500,
                    "系统设置表还没初始化：请先执行 backend/sql/migrate-app-settings.sql");
        }
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value == null ? "" : value.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    /** 一组收费配置快照。updatedAt 可能为 null（迁移未执行或从未保存）。 */
    public record ChargeSettings(boolean chargeEnabled, int analyzeCost, int dailyLimit, String updatedAt) {

        /** 实际扣费金额：免费期间为 0。 */
        public int effectiveCost() {
            return chargeEnabled ? analyzeCost : 0;
        }

        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("chargeEnabled", chargeEnabled);
            out.put("analyzeCost", analyzeCost);
            out.put("dailyLimit", dailyLimit);
            out.put("effectiveCost", effectiveCost());
            out.put("updatedAt", updatedAt == null ? "" : updatedAt);
            return out;
        }
    }
}
