package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 职业测评（学生工坊 · 大师兄找方向）：报告生成 + 计费 + 历史记录。
 *
 * 报告逻辑沿用原站：19 题答案 → career_map.xml 规则匹配 → career.md 里 91 段预置文案
 * → 极简 Markdown 转 HTML → 套进 career-report.html 模板。不是 AI，结果确定可复现。
 *
 * 计费与「深度对标」同款（后台系统设置实时决定）：
 *   · 免费 / 收费、单次价格、每人每天次数；
 *   · 先预扣，生成失败全额退款；requestId 幂等，重复点击不扣两次；
 *   · 成功后把报告快照写进 career_reports，供「测评报告」回看。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CareerReportService {

    private static final String BASE = "resume/career/";
    private static final Pattern CHUNK_SPLIT = Pattern.compile("<!--\\s*\\d+\\s*-->");
    private static final Pattern ORDERED = Pattern.compile("^\\d+\\.\\s+");
    private static final Pattern BOLD = Pattern.compile("\\*\\*(.+?)\\*\\*");
    private static final Pattern HEADLINE = Pattern.compile("(?m)^##\\s+(.+)$");

    private final JdbcTemplate jdbc;
    private final PointService pointService;
    private final AppSettingsService settingsService;
    private final ObjectMapper objectMapper;

    private List<Rule> rules;
    private List<String> materials;
    private String template;

    @PostConstruct
    void init() {
        this.rules = loadRules();
        this.materials = loadMaterials();
        this.template = readText("career-report.html");
    }

    /* ==================== 对外接口 ==================== */

    /** 价格 + 余额 + 今日剩余次数，供「开始测评」前展示与校验。 */
    public Map<String, Object> meta(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        AppSettingsService.ChargeSettings settings = settingsService.careerSettings();
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
     * 生成报告：幂等 → 每日次数 → 余额 → 预扣 → 匹配渲染 → 落库。
     * 失败全额退款；同一 requestId 重试返回已保存的报告。
     */
    public Map<String, Object> generate(Long userId, JsonNode answers, String requestId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        if (answers == null || !answers.isArray() || answers.isEmpty()) {
            throw new BusinessException("请先完成测评题目");
        }
        String reqId = StringUtils.hasText(requestId) ? requestId.trim() : UUID.randomUUID().toString();

        Map<String, Object> existed = findByRequest(userId, reqId);
        if (existed != null) {
            return existingResult(userId, existed);
        }

        AppSettingsService.ChargeSettings settings = settingsService.careerSettings();
        int cost = settings.effectiveCost();
        int used = countToday(userId);
        if (settings.dailyLimit() > 0 && used >= settings.dailyLimit()) {
            throw new BusinessException(429,
                    "今天的测评次数已用完（每天 " + settings.dailyLimit() + " 次），明天再来～");
        }
        if (cost > 0 && pointService.getBalance(userId) < cost) {
            throw new BusinessException(402, "蛋蛋币不足，本次需要 " + cost + " 蛋蛋币");
        }
        if (cost > 0) {
            pointService.changeBalance(userId, -cost, "spend", "职业测评报告", null);
        }

        List<Integer> ids;
        String headline;
        String html;
        String answersJson;
        try {
            ids = matchReportIds(answers);
            headline = headlineOf(ids);
            html = render(ids, userId);
            answersJson = objectMapper.writeValueAsString(answers);
        } catch (RuntimeException e) {
            refund(userId, cost, "职业测评报告失败退款");
            throw e;
        } catch (Exception e) {
            refund(userId, cost, "职业测评报告失败退款");
            throw new IllegalStateException("报告内容格式异常，请重试");
        }

        try {
            jdbc.update(
                    "INSERT INTO career_reports (user_id, answers_json, headline, report_html, cost, request_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?)",
                    userId, answersJson, headline, html, cost, reqId);
        } catch (DuplicateKeyException e) {
            /* 并发重复请求：本次预扣退回，返回已保存的那份 */
            refund(userId, cost, "职业测评重复请求退款");
            return existingResult(userId, findByRequest(userId, reqId));
        } catch (BadSqlGrammarException e) {
            refund(userId, cost, "职业测评报告保存失败退款");
            throw new BusinessException(500,
                    "职业测评记录表还没初始化：请先执行 backend/sql/migrate-career-reports.sql");
        } catch (RuntimeException e) {
            refund(userId, cost, "职业测评报告保存失败退款");
            throw new IllegalStateException("测评报告保存失败，请稍后重试");
        }

        long id = db(() -> jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("recordId", id);
        out.put("headline", headline);
        out.put("html", html);
        out.put("cost", cost);
        out.put("chargeEnabled", settings.chargeEnabled());
        out.put("balance", pointService.getBalance(userId));
        out.put("todayUsed", used + 1);
        if (settings.dailyLimit() > 0) {
            out.put("todayLeft", Math.max(0, settings.dailyLimit() - used - 1));
        }
        return out;
    }

    /** 历史报告（新的在前）。 */
    public List<Map<String, Object>> listReports(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return db(() -> jdbc.queryForList(
                "SELECT id, headline, cost, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt "
                        + "FROM career_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", userId));
    }

    /** 单份历史报告（含 HTML 快照）。 */
    public Map<String, Object> getReport(Long userId, long id) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = db(() -> jdbc.queryForList(
                "SELECT id, headline, report_html AS html, cost, "
                        + "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt "
                        + "FROM career_reports WHERE id = ? AND user_id = ?", id, userId));
        if (rows.isEmpty()) throw new BusinessException(404, "这份报告不存在");
        return rows.get(0);
    }

    /* ==================== 公开分享 ==================== */

    /** 创建（或复用）分享令牌；重复点击返回同一个链接，不会生成多份。 */
    public Map<String, Object> shareReport(Long userId, long id) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = db(() -> jdbc.queryForList(
                "SELECT share_token FROM career_reports WHERE id = ? AND user_id = ?", id, userId));
        if (rows.isEmpty()) throw new BusinessException(404, "这份报告不存在");

        String token = text(rows.get(0).get("share_token"));
        if (!StringUtils.hasText(token)) {
            String candidate = UUID.randomUUID().toString().replace("-", "");
            db(() -> jdbc.update(
                    "UPDATE career_reports SET share_token = ?, shared_at = NOW() "
                            + "WHERE id = ? AND user_id = ? AND share_token IS NULL",
                    candidate, id, userId));
            /* 并发时可能被另一个请求先写入，回读一次取实际令牌 */
            List<Map<String, Object>> again = db(() -> jdbc.queryForList(
                    "SELECT share_token FROM career_reports WHERE id = ? AND user_id = ?", id, userId));
            token = again.isEmpty() ? "" : text(again.get(0).get("share_token"));
            if (!StringUtils.hasText(token)) throw new BusinessException(500, "分享链接创建失败，请重试");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        return out;
    }

    /** 撤销分享：令牌置空后，旧链接立即失效。 */
    public void unshareReport(Long userId, long id) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        int updated = db(() -> jdbc.update(
                "UPDATE career_reports SET share_token = NULL, shared_at = NULL WHERE id = ? AND user_id = ?",
                id, userId));
        if (updated == 0) throw new BusinessException(404, "这份报告不存在");
    }

    /** 公开读取分享报告（免登录）：只给标题与 HTML 快照，不含答题明细。 */
    public Map<String, Object> sharedReport(String token) {
        if (!StringUtils.hasText(token) || token.length() > 32) {
            throw new BusinessException(404, "分享链接已失效");
        }
        List<Map<String, Object>> rows = db(() -> jdbc.queryForList(
                "SELECT headline, report_html AS html, "
                        + "DATE_FORMAT(created_at, '%Y-%m-%d') AS createdAt "
                        + "FROM career_reports WHERE share_token = ?", token));
        if (rows.isEmpty()) throw new BusinessException(404, "分享链接已失效或已被撤销");
        Map<String, Object> row = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("headline", row.get("headline"));
        out.put("html", row.get("html"));
        out.put("createdAt", row.get("createdAt"));
        return out;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    /** 纯渲染（不含计费/落库），供单元测试与内部复用。 */
    public String renderHtml(JsonNode answers) {
        if (answers == null || !answers.isArray() || answers.isEmpty()) {
            throw new BusinessException("请先完成测评题目");
        }
        return render(matchReportIds(answers), null);
    }

    /* ==================== 计费辅助 ==================== */

    private void refund(Long userId, int cost, String reason) {
        if (cost > 0) pointService.changeBalance(userId, cost, "refund", reason, null);
    }

    private int countToday(Long userId) {
        Integer count = db(() -> jdbc.queryForObject(
                "SELECT COUNT(*) FROM career_reports WHERE user_id = ? AND created_at >= CURDATE()",
                Integer.class, userId));
        return count == null ? 0 : count;
    }

    private Map<String, Object> findByRequest(Long userId, String requestId) {
        List<Map<String, Object>> rows = db(() -> jdbc.queryForList(
                "SELECT id, headline, report_html FROM career_reports WHERE user_id = ? AND request_id = ?",
                userId, requestId));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> existingResult(Long userId, Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (row == null) throw new BusinessException(500, "报告记录异常，请重试");
        out.put("recordId", row.get("id"));
        out.put("headline", row.get("headline"));
        out.put("html", row.get("report_html"));
        out.put("cost", 0);
        out.put("balance", pointService.getBalance(userId));
        return out;
    }

    /** 缺表时不要抛 SQL 原文：告诉部署方该执行哪个脚本。 */
    private <T> T db(java.util.function.Supplier<T> action) {
        try {
            return action.get();
        } catch (BadSqlGrammarException e) {
            throw new BusinessException(500,
                    "职业测评记录表还没初始化：请先执行 backend/sql/migrate-career-reports.sql");
        }
    }

    /* ==================== 报告渲染 ==================== */

    private String render(List<Integer> ids, Long userId) {
        StringBuilder html = new StringBuilder();
        for (int id : ids) {
            if (id >= 1 && id <= materials.size()) {
                html.append(markdownToHtml(materials.get(id - 1)));
            }
        }
        LocalDate today = LocalDate.now();
        String date = today.getYear() + "年" + today.getMonthValue() + "月" + today.getDayOfMonth() + "日";
        return template.replace("{{REPORTS}}", html.toString())
                .replace("{{USER}}", nicknameOf(userId))
                .replace("{{DATE}}", date);
    }

    /** 报告抬头只印名字，取不到时用「同学」兜底，不回退到头像。 */
    private String nicknameOf(Long userId) {
        if (userId != null) {
            try {
                List<String> names = jdbc.queryForList(
                        "SELECT nickname FROM users WHERE id = ?", String.class, userId);
                if (!names.isEmpty() && StringUtils.hasText(names.get(0))) {
                    return escapeText(names.get(0).trim());
                }
            } catch (RuntimeException e) {
                log.warn("读取用户昵称失败，报告抬头使用兜底文案: {}", e.getMessage());
            }
        }
        return "同学";
    }

    /** 取命中的第一条职业路径标题作为记录列表标题。 */
    private String headlineOf(List<Integer> ids) {
        for (int id : ids) {
            if (id < 1 || id > materials.size()) continue;
            Matcher m = HEADLINE.matcher(materials.get(id - 1));
            if (m.find()) {
                String title = m.group(1).trim();
                return title.length() > 118 ? title.substring(0, 118) : title;
            }
        }
        return "职业测评报告";
    }

    private List<Integer> matchReportIds(JsonNode answers) {
        List<Integer> ids = new ArrayList<>();
        for (Rule rule : rules) {
            boolean hit = true;
            for (Condition c : rule.conditions()) {
                if (c.questionId() == 0) continue; // 固定项
                String answer = c.questionId() - 1 < answers.size()
                        ? answers.get(c.questionId() - 1).asText("")
                        : "";
                if (!c.value().equals(answer)) {
                    hit = false;
                    break;
                }
            }
            if (hit) ids.add(rule.result());
        }
        /* 保底：与原站一致，什么都没匹配到时至少给基础总结 */
        if (ids.isEmpty()) ids.addAll(List.of(89, 90, 91));
        return ids;
    }

    /* ==================== 资源加载 ==================== */

    private List<Rule> loadRules() {
        List<Rule> out = new ArrayList<>();
        try (InputStream in = new ClassPathResource(BASE + "career_map.xml").getInputStream()) {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            Document doc = factory.newDocumentBuilder().parse(in);
            NodeList mappings = doc.getElementsByTagName("mapping");
            for (int i = 0; i < mappings.getLength(); i++) {
                Element mapping = (Element) mappings.item(i);
                NodeList questions = mapping.getElementsByTagName("question");
                List<Condition> conditions = new ArrayList<>();
                for (int j = 0; j < questions.getLength(); j++) {
                    Element q = (Element) questions.item(j);
                    conditions.add(new Condition(
                            Integer.parseInt(q.getAttribute("id")),
                            q.getAttribute("value")));
                }
                NodeList results = mapping.getElementsByTagName("result");
                if (results.getLength() == 0) continue;
                out.add(new Rule(List.copyOf(conditions),
                        Integer.parseInt(results.item(0).getTextContent().trim())));
            }
        } catch (Exception e) {
            log.error("职业测评规则加载失败", e);
            throw new IllegalStateException("职业测评暂不可用", e);
        }
        return List.copyOf(out);
    }

    /** career.md 按 &lt;!-- n --&gt; 切成 91 段；第 n 段对应 id=n。 */
    private List<String> loadMaterials() {
        String raw = readText("career.md");
        String[] parts = CHUNK_SPLIT.split(raw);
        List<String> out = new ArrayList<>();
        for (int i = 1; i < parts.length; i++) out.add(parts[i].trim());
        if (out.isEmpty()) throw new IllegalStateException("职业测评素材缺失");
        return List.copyOf(out);
    }

    private String readText(String name) {
        try (InputStream in = new ClassPathResource(BASE + name).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("职业测评资源读取失败: {}", name, e);
            throw new IllegalStateException("职业测评暂不可用", e);
        }
    }

    /* ==================== 极简 Markdown → HTML ==================== */

    /**
     * 素材只用到了标题（#/##/###）、无序/有序列表、段落和 **加粗**，
     * 因此自己转义 + 转换即可，不引入额外 Markdown 依赖。
     */
    static String markdownToHtml(String markdown) {
        StringBuilder html = new StringBuilder();
        boolean inUl = false;
        boolean inOl = false;
        for (String raw : markdown.split("\\r?\\n")) {
            String line = raw.trim();
            if (line.isEmpty()) {
                inUl = closeList(html, inUl, "ul");
                inOl = closeList(html, inOl, "ol");
                continue;
            }
            if (line.startsWith("### ")) {
                inUl = closeList(html, inUl, "ul");
                inOl = closeList(html, inOl, "ol");
                html.append("<h3>").append(inline(line.substring(4))).append("</h3>");
            } else if (line.startsWith("## ")) {
                inUl = closeList(html, inUl, "ul");
                inOl = closeList(html, inOl, "ol");
                html.append("<h2>").append(inline(line.substring(3))).append("</h2>");
            } else if (line.startsWith("# ")) {
                inUl = closeList(html, inUl, "ul");
                inOl = closeList(html, inOl, "ol");
                html.append("<h1>").append(inline(line.substring(2))).append("</h1>");
            } else if (line.startsWith("- ")) {
                if (!inUl) {
                    inOl = closeList(html, inOl, "ol");
                    html.append("<ul>");
                    inUl = true;
                }
                html.append("<li>").append(inline(line.substring(2))).append("</li>");
            } else if (ORDERED.matcher(line).find()) {
                if (!inOl) {
                    inUl = closeList(html, inUl, "ul");
                    html.append("<ol>");
                    inOl = true;
                }
                html.append("<li>").append(inline(line.replaceFirst("^\\d+\\.\\s+", ""))).append("</li>");
            } else {
                inUl = closeList(html, inUl, "ul");
                inOl = closeList(html, inOl, "ol");
                html.append("<p>").append(inline(line)).append("</p>");
            }
        }
        closeList(html, inUl, "ul");
        closeList(html, inOl, "ol");
        return html.toString();
    }

    private static boolean closeList(StringBuilder html, boolean open, String tag) {
        if (open) html.append("</").append(tag).append(">");
        return false;
    }

    /** 先转义 HTML，再把 **xx** 转成 &lt;strong&gt;。 */
    private static String inline(String text) {
        String escaped = escapeText(text);
        Matcher m = BOLD.matcher(escaped);
        return m.replaceAll("<strong>$1</strong>");
    }

    private static String escapeText(String text) {
        return text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private record Condition(int questionId, String value) {}

    private record Rule(List<Condition> conditions, int result) {}
}
