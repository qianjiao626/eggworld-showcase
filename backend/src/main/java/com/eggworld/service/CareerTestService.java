package com.eggworld.service;

import com.eggworld.common.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 职业测评：提交答案 → 匹配报告素材 → 生成报告；生成时扣 50 蛋蛋币并保存历史记录。
 * 题库/答案映射/报告素材沿用「大师兄简历网」的 career 资源，逻辑等价移植：
 *   · 每条 mapping 的 id=0 视为常量（恒匹配），其余要求答案一一相等；
 *   · 汇总所有命中的 result 序号；一条都没命中则回退 [89,90,91]。
 */
@Service
@RequiredArgsConstructor
public class CareerTestService {

    public static final int COST = 50;

    private final JdbcTemplate jdbc;
    private final PointService pointService;
    private final CareerMarkdownRenderer renderer;

    private volatile List<int[]> mappingQuestionIds;   // 每条 mapping 的问题 id
    private volatile List<String> mappingQuestionValues;
    private volatile List<Integer> mappingResults;
    private volatile List<String> materialSections;
    private volatile int questionCount = -1;
    private volatile List<Map<String, Object>> questions;

    private synchronized void ensureLoaded() {
        if (questionCount >= 0) return;
        try {
            // 1) 题库：题目数量
            Document qDoc = parse("career/career_question.xml");
            NodeList qs = qDoc.getElementsByTagName("question");
            questionCount = qs.getLength();
            List<Map<String, Object>> qList = new ArrayList<>();
            for (int i = 0; i < qs.getLength(); i++) {
                Element q = (Element) qs.item(i);
                List<String> opts = new ArrayList<>();
                NodeList optionTags = q.getElementsByTagName("option");
                for (int j = 0; j < optionTags.getLength(); j++) opts.add(optionTags.item(j).getTextContent().strip());
                qList.add(Map.of(
                        "id", i + 1,
                        "part", q.getAttribute("partID"),
                        "partText", q.getAttribute("partText"),
                        "type", q.getAttribute("type"),
                        "stem", q.getElementsByTagName("stem").item(0).getTextContent().strip(),
                        "options", opts));
            }
            questions = qList;

            // 2) 素材分节
            materialSections = renderer.splitSections(readResource("career/career.md"));

            // 3) 答案映射
            Document mDoc = parse("career/career_map.xml");
            NodeList mappings = mDoc.getElementsByTagName("mapping");
            List<int[]> ids = new ArrayList<>();
            List<String> vals = new ArrayList<>();
            List<Integer> results = new ArrayList<>();
            StringBuilder idBuf = new StringBuilder();
            StringBuilder valBuf = new StringBuilder();
            for (int i = 0; i < mappings.getLength(); i++) {
                Element mapping = (Element) mappings.item(i);
                NodeList qTags = mapping.getElementsByTagName("question");
                idBuf.setLength(0); valBuf.setLength(0);
                for (int j = 0; j < qTags.getLength(); j++) {
                    Element q = (Element) qTags.item(j);
                    idBuf.append(q.getAttribute("id")).append(',');
                    valBuf.append(q.getAttribute("value")).append('\u0001');
                }
                NodeList rTags = mapping.getElementsByTagName("result");
                if (rTags.getLength() == 0) continue;
                ids.add(splitInts(idBuf.toString()));
                vals.add(valBuf.toString());
                results.add(Integer.parseInt(rTags.item(0).getTextContent().strip()));
            }
            mappingQuestionIds = ids;
            mappingQuestionValues = vals;
            mappingResults = results;
        } catch (Exception e) {
            throw new IllegalStateException("职业测评资源加载失败: " + e.getMessage(), e);
        }
    }

    public int questionCount() { ensureLoaded(); return questionCount; }

    public List<Map<String, Object>> questions() { ensureLoaded(); return questions; }

    /** 生成报告：扣 50 蛋蛋币 + 落库历史。返回 recordId。 */
    @Transactional
    public long generate(Long userId, List<String> answers) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        ensureLoaded();
        if (answers == null || answers.size() != questionCount)
            throw new BusinessException("请完成全部 " + questionCount + " 题后再生成报告");

        String html = buildReport(answers);
        pointService.changeBalance(userId, -COST, "spend", "职业测评报告生成", null);
        jdbc.update("INSERT INTO career_test_reports (user_id, answers, report_html, cost, created_at) VALUES (?, ?, ?, ?, NOW())",
                userId, String.join("\u0001", answers), html, COST);
        return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    public List<Map<String, Object>> history(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return jdbc.queryForList(
                "SELECT id, LEFT(report_html, 120) AS summary, cost, created_at FROM career_test_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
                userId);
    }

    public Map<String, Object> detail(Long userId, long id) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, report_html, cost, created_at FROM career_test_reports WHERE id = ? AND user_id = ?", id, userId);
        if (rows.isEmpty()) throw new BusinessException(404, "报告不存在");
        return rows.get(0);
    }

    private String buildReport(List<String> answers) {
        List<Integer> matched = new ArrayList<>();
        for (int i = 0; i < mappingResults.size(); i++) {
            int[] ids = mappingQuestionIds.get(i);
            String[] vals = mappingQuestionValues.get(i).split("\u0001", -1);
            boolean hit = true;
            for (int j = 0; j < ids.length; j++) {
                if (ids[j] == 0) continue; // 常量段
                int answerIndex = ids[j] - 1;
                String expected = vals[j];
                if (answerIndex < 0 || answerIndex >= answers.size() || !expected.equals(answers.get(answerIndex))) {
                    hit = false; break;
                }
            }
            if (hit) matched.add(mappingResults.get(i));
        }
        if (matched.isEmpty()) { matched.add(89); matched.add(90); matched.add(91); }
        StringBuilder html = new StringBuilder();
        for (int idx : matched) {
            if (idx >= 1 && idx <= materialSections.size()) html.append(renderer.render(materialSections.get(idx - 1)));
        }
        return html.toString();
    }

    private int[] splitInts(String csv) {
        String[] parts = csv.split(",");
        List<Integer> list = new ArrayList<>();
        for (String p : parts) if (!p.isBlank()) list.add(Integer.parseInt(p.strip()));
        int[] arr = new int[list.size()];
        for (int i = 0; i < arr.length; i++) arr[i] = list.get(i);
        return arr;
    }

    private Document parse(String path) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        DocumentBuilder builder = factory.newDocumentBuilder();
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return builder.parse(in);
        }
    }

    private String readResource(String path) throws Exception {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
