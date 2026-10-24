package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 大师兄简历 · 计费与历史记录。
 *
 * 收费模型由后台「系统设置」实时决定（{@link AppSettingsService}）：
 *   · 关闭收费 → 每次消耗 0，仍写一条记录（历史里显示「免费」）；
 *   · 开启收费 → 按配置单价预扣，AI 失败全额退款，避免长调用期间余额被别处花掉；
 *   · 每人每天次数上限（0 = 不限）按自然日统计 <b>成功</b> 的对标记录；
 *   · requestId 幂等（唯一键），重复点击不会扣两次；
 *   · 余额变动一律走 PointService（行锁 + point_logs 流水），不另建账本。
 * 生成简历本身免费，但会把结构化草稿存下来，供「之前的记录」里恢复。
 */
@Service
@RequiredArgsConstructor
public class ResumeService {

    private final ResumeAnalysisService analysisService;
    private final PointService pointService;
    private final AppSettingsService settingsService;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    /** 价格（实际扣费，免费时为 0）+ 余额 + 每日次数，供简历站展示。 */
    public Map<String, Object> meta(Long userId) {
        AppSettingsService.ChargeSettings settings = settingsService.resumeSettings();
        int used = countToday(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("analyzeCost", settings.effectiveCost());
        out.put("listPrice", settings.analyzeCost());
        out.put("chargeEnabled", settings.chargeEnabled());
        out.put("dailyLimit", settings.dailyLimit());
        out.put("todayUsed", used);
        if (settings.dailyLimit() > 0) {
            out.put("todayLeft", Math.max(0, settings.dailyLimit() - used));
        }
        out.put("balance", pointService.getBalance(userId));
        return out;
    }

    /**
     * 深度对标：幂等检查 → 每日次数校验 → 余额校验 → 预扣（免费则跳过）→ 调 AI → 落库。
     * 失败（含 AI 异常）全额退款。
     */
    public Map<String, Object> analyze(Long userId, String resumeText, String jdText, String requestId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        String reqId = StringUtils.hasText(requestId) ? requestId.trim() : UUID.randomUUID().toString();

        Map<String, Object> existed = findAnalysisByRequest(userId, reqId);
        if (existed != null) {
            return Map.of("recordId", existed.get("id"), "analysis", existed.get("analysisJson"),
                    "balance", pointService.getBalance(userId), "cost", 0);
        }

        AppSettingsService.ChargeSettings settings = settingsService.resumeSettings();
        int cost = settings.effectiveCost();

        int used = countToday(userId);
        if (settings.dailyLimit() > 0 && used >= settings.dailyLimit()) {
            throw new BusinessException(429,
                    "今天的次数已用完（每天 " + settings.dailyLimit() + " 次），明天再来～");
        }

        if (cost > 0 && pointService.getBalance(userId) < cost) {
            throw new BusinessException(402, "蛋蛋币不足，本次需要 " + cost + " 蛋蛋币");
        }
        if (cost > 0) {
            pointService.changeBalance(userId, -cost, "spend", "简历深度对标", null);
        }

        JsonNode result;
        try {
            result = analysisService.analyze(resumeText, jdText);
        } catch (RuntimeException e) {
            refund(userId, cost, "简历对标失败退款");
            throw e;
        }

        String resultJson;
        String summary;
        Integer score;
        try {
            resultJson = objectMapper.writeValueAsString(result);
            summary = truncate(result.path("summary").asText(""), 240);
            score = result.hasNonNull("score") ? result.get("score").asInt() : null;
        } catch (Exception e) {
            refund(userId, cost, "简历对标失败退款");
            throw new IllegalStateException("报告生成格式异常，请重试");
        }

        try {
            jdbc.update("INSERT INTO resume_analyses "
                            + "(user_id, resume_text, jd_text, score, summary, result_json, cost, request_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    userId, resumeText, jdText, score, summary, resultJson, cost, reqId);
        } catch (DuplicateKeyException e) {
            /* 并发重复请求：本次预扣退回，返回已存在的那条 */
            refund(userId, cost, "简历对标重复请求退款");
            Map<String, Object> record = findAnalysisByRequest(userId, reqId);
            return Map.of("recordId", record.get("id"), "analysis", record.get("analysisJson"),
                    "balance", pointService.getBalance(userId), "cost", 0);
        } catch (RuntimeException e) {
            /* 落库失败（如建表脚本没执行）：别让用户白扣币，退款并给出可读错误 */
            refund(userId, cost, "简历对标落库失败退款");
            throw new IllegalStateException("对标结果保存失败，请稍后重试");
        }

        long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("recordId", id);
        out.put("analysis", result);
        out.put("balance", pointService.getBalance(userId));
        out.put("cost", cost);
        out.put("chargeEnabled", settings.chargeEnabled());
        out.put("todayUsed", used + 1);
        if (settings.dailyLimit() > 0) {
            out.put("todayLeft", Math.max(0, settings.dailyLimit() - used - 1));
        }
        return out;
    }

    /** 历史对标（新的在前）。 */
    public List<Map<String, Object>> listAnalyses(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return db(() -> jdbc.queryForList(
                "SELECT id, score, summary, cost, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt "
                        + "FROM resume_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", userId));
    }

    /** 单条对标详情（含原文与完整结果）。 */
    public Map<String, Object> getAnalysis(Long userId, long id) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = db(() -> jdbc.queryForList(
                "SELECT id, resume_text AS resumeText, jd_text AS jdText, score, summary, "
                        + "result_json AS resultJson, cost, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt "
                        + "FROM resume_analyses WHERE id = ? AND user_id = ?", id, userId));
        if (rows.isEmpty()) throw new BusinessException(404, "这条记录不存在");
        Map<String, Object> row = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>(row);
        out.put("analysis", readJson(asString(out.remove("resultJson"))));
        return out;
    }

    /** 保存/更新结构化草稿；id 为空则新建。 */
    public long saveDraft(Long userId, Long id, String title, String target, JsonNode data) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        if (data == null || data.isNull()) throw new BusinessException("草稿内容为空");
        String json;
        try {
            json = objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            throw new BusinessException("草稿保存失败，请重试");
        }
        String safeTitle = truncate(StringUtils.hasText(title) ? title : "未命名简历", 100);
        String safeTarget = truncate(target == null ? "" : target, 100);

        if (id != null) {
            int updated = db(() -> jdbc.update(
                    "UPDATE resume_drafts SET title = ?, target = ?, data_json = ? WHERE id = ? AND user_id = ?",
                    safeTitle, safeTarget, json, id, userId));
            if (updated == 0) throw new BusinessException(404, "草稿不存在");
            return id;
        }
        db(() -> jdbc.update("INSERT INTO resume_drafts (user_id, title, target, data_json) VALUES (?, ?, ?, ?)",
                userId, safeTitle, safeTarget, json));
        return db(() -> jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class));
    }

    /** 历史草稿列表（新的在前）。 */
    public List<Map<String, Object>> listDrafts(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return db(() -> jdbc.queryForList(
                "SELECT id, title, target, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt "
                        + "FROM resume_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30", userId));
    }

    /** 打开某份历史草稿。 */
    public Map<String, Object> getDraft(Long userId, long id) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = db(() -> jdbc.queryForList(
                "SELECT id, title, target, data_json AS dataJson, "
                        + "DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt "
                        + "FROM resume_drafts WHERE id = ? AND user_id = ?", id, userId));
        if (rows.isEmpty()) throw new BusinessException(404, "草稿不存在");
        Map<String, Object> out = new LinkedHashMap<>(rows.get(0));
        out.put("data", readJson(asString(out.remove("dataJson"))));
        return out;
    }

    /** 免费模式（cost=0）不产生任何币的变动，也就没有退款动作。 */
    private void refund(Long userId, int cost, String reason) {
        if (cost > 0) pointService.changeBalance(userId, cost, "refund", reason, null);
    }

    /** 自然日内成功生成的对标条数（失败的不写记录，因此天然不计数）。 */
    private int countToday(Long userId) {
        Integer count = db(() -> jdbc.queryForObject(
                "SELECT COUNT(*) FROM resume_analyses WHERE user_id = ? AND created_at >= CURDATE()",
                Integer.class, userId));
        return count == null ? 0 : count;
    }

    /** 幂等用：按 requestId 找已有记录；找到时附带解析好的结果。 */
    private Map<String, Object> findAnalysisByRequest(Long userId, String requestId) {
        List<Map<String, Object>> rows = db(() -> jdbc.queryForList(
                "SELECT id, result_json FROM resume_analyses WHERE user_id = ? AND request_id = ?",
                userId, requestId));
        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("analysisJson", readJson(asString(row.get("result_json"))));
        return out;
    }

    /**
     * 缺表/缺列时不要让前端看到原始 SQL：迁移脚本没执行是部署问题，
     * 直接告诉用户和管理员该做什么。
     */
    private <T> T db(java.util.function.Supplier<T> action) {
        try {
            return action.get();
        } catch (BadSqlGrammarException e) {
            throw new BusinessException(500, "简历功能还没初始化：请先执行 backend/sql/migrate-resume.sql（建表后重试）");
        }
    }

    private static String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private JsonNode readJson(String json) {
        try {
            return objectMapper.readTree(json == null ? "{}" : json);
        } catch (Exception e) {
            return objectMapper.createObjectNode();
        }
    }

    private static String truncate(String text, int max) {
        if (text == null) return "";
        return text.length() > max ? text.substring(0, max) : text;
    }
}
