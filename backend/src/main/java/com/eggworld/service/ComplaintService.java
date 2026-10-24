package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.ComplaintVO;
import com.eggworld.dto.SubmitComplaintDTO;
import com.eggworld.dto.UpdateComplaintDTO;
import com.eggworld.entity.SchoolComplaint;
import com.eggworld.entity.User;
import com.eggworld.mapper.SchoolComplaintMapper;
import com.eggworld.mapper.UserMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 大学吐槽榜服务
 * - 学校排名：总榜按平均分 / 维度榜按 JSON 中指定维度均分
 * - 提交吐槽：每人限 2 次，每次 +10 蛋蛋币 +10 经验
 * - 展示昵称脱敏（首字**末字）
 */
@Service
@RequiredArgsConstructor
public class ComplaintService {

    /** 16 个评价维度 key（与前端 BL_METRICS 一致，SQL 白名单校验用） */
    public static final Set<String> METRIC_KEYS = Set.of(
            "canteen", "manage", "internship", "employ", "watercourse", "failrate",
            "outdated", "teacher", "counselor", "life", "baoyan", "fees",
            "dorm", "mornings", "forcelabor", "headcount");

    /** 每人吐槽次数上限 */
    private static final int MAX_PER_USER = 2;

    private final SchoolComplaintMapper complaintMapper;
    private final UserMapper userMapper;
    private final PointService pointService;
    private final ObjectMapper objectMapper;

    /* ============ 查询 ============ */

    /** 学校排名（总榜 / 维度榜），metric 非白名单抛错 */
    public List<ComplaintVO.RankItem> rankings(String metric) {
        List<Map<String, Object>> rows;
        if (metric == null || metric.isBlank() || "all".equals(metric)) {
            rows = complaintMapper.rankAll();
        } else {
            if (!METRIC_KEYS.contains(metric)) {
                throw new BusinessException(400, "未知的评价维度");
            }
            rows = complaintMapper.rankByMetric(metric);
        }
        List<ComplaintVO.RankItem> list = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            ComplaintVO.RankItem item = new ComplaintVO.RankItem();
            item.setSchoolName((String) row.get("schoolName"));
            item.setCount(((Number) row.get("cnt")).intValue());
            item.setAvgScore(toDecimal(row.get("avgScore")));
            item.setMetricScore(row.get("metricScore") == null ? null : toDecimal(row.get("metricScore")));
            list.add(item);
        }
        return list;
    }

    /** 页面统计：收录高校数 / 吐槽总数 / 平均分 / 我的已吐槽次数 */
    public ComplaintVO.Stats stats(Long currentUserId) {
        ComplaintVO.Stats stats = new ComplaintVO.Stats();
        stats.setSchoolCount(complaintMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<SchoolComplaint>()
                        .select("DISTINCT school_name")).intValue());
        stats.setTotalCount(complaintMapper.selectCount(null));
        // 全表平均吐槽分（AVG(score)，无数据时为 0）
        // ⚠️ 空表时 AVG(score) 返回 NULL，MyBatis 会把整行映射成 null（不是 {avgVal=null}），
        //    故必须同时判空行与空值，否则空表下 .get() 会抛 NPE 导致接口 500。
        List<Map<String, Object>> avgRows = complaintMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<SchoolComplaint>()
                        .select("AVG(score) AS avgVal"));
        Map<String, Object> avgRow = avgRows.isEmpty() ? null : avgRows.get(0);
        Object avgVal = avgRow == null ? null : avgRow.get("avgVal");
        stats.setAvgAll(avgVal == null ? BigDecimal.ZERO : new BigDecimal(avgVal.toString()));
        stats.setMyCount(currentUserId == null ? 0
                : complaintMapper.selectCount(new LambdaQueryWrapper<SchoolComplaint>()
                        .eq(SchoolComplaint::getUserId, currentUserId)).intValue());
        return stats;
    }

    /** 学校详情：聚合 + 16 维均分 + 最近 5 条留言 */
    public ComplaintVO.SchoolDetail schoolDetail(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(400, "请指定学校");
        }
        List<SchoolComplaint> records = complaintMapper.selectList(new LambdaQueryWrapper<SchoolComplaint>()
                .eq(SchoolComplaint::getSchoolName, name)
                .orderByDesc(SchoolComplaint::getCreatedAt));
        ComplaintVO.SchoolDetail detail = new ComplaintVO.SchoolDetail();
        detail.setSchoolName(name);
        detail.setCount(records.size());
        detail.setRank(0);
        detail.setMetrics(new LinkedHashMap<>());
        detail.setComments(new ArrayList<>());

        if (records.isEmpty()) {
            detail.setAvgScore(BigDecimal.ZERO);
            return detail;
        }

        // 平均分
        double sum = 0;
        for (SchoolComplaint r : records) {
            sum += r.getScore().doubleValue();
        }
        detail.setAvgScore(BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(records.size()), 1, RoundingMode.HALF_UP));

        // 16 维均分（内存聚合，避免逐维查库）
        Map<String, Integer> metricSum = new HashMap<>();
        for (SchoolComplaint r : records) {
            Map<String, Integer> m = parseMetrics(r.getMetrics());
            for (String key : m.keySet()) {
                metricSum.merge(key, m.get(key), Integer::sum);
            }
        }
        for (String key : METRIC_KEYS) {
            Integer s = metricSum.get(key);
            detail.getMetrics().put(key, s == null ? BigDecimal.ZERO
                    : BigDecimal.valueOf(s).divide(BigDecimal.valueOf(records.size()), 1, RoundingMode.HALF_UP));
        }

        // 总榜名次
        List<ComplaintVO.RankItem> all = rankings("all");
        for (int i = 0; i < all.size(); i++) {
            if (all.get(i).getSchoolName().equals(name)) {
                detail.setRank(i + 1);
                break;
            }
        }

        // 最近 5 条留言（脱敏）
        records.stream().limit(5).forEach(r -> detail.getComments().add(toItem(r)));
        return detail;
    }

    /** 吐槽墙：最近 N 条 */
    public List<ComplaintVO.Item> wall(long limit) {
        long size = Math.min(Math.max(limit, 1), 100);
        List<SchoolComplaint> records = complaintMapper.selectList(new LambdaQueryWrapper<SchoolComplaint>()
                .orderByDesc(SchoolComplaint::getCreatedAt)
                .last("LIMIT " + size));
        return records.stream().map(this::toItem).toList();
    }

    /* ============ 写操作 ============ */

    /**
     * 提交吐槽：校验次数上限与维度评分 → 存库 → 奖励（+10 币 +10 经验）
     */
    @Transactional
    public void submit(Long userId, SubmitComplaintDTO dto) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        // 每人限吐槽 2 次
        long count = complaintMapper.selectCount(new LambdaQueryWrapper<SchoolComplaint>()
                .eq(SchoolComplaint::getUserId, userId));
        if (count >= MAX_PER_USER) {
            throw new BusinessException("每个用户最多吐槽 " + MAX_PER_USER + " 次");
        }
        Map<String, Integer> metrics = validateMetrics(dto.getMetrics());

        SchoolComplaint c = new SchoolComplaint();
        c.setSchoolName(dto.getSchoolName().trim());
        c.setUserId(userId);
        c.setContent(dto.getContent());
        c.setMetrics(writeMetrics(metrics));
        c.setScore(avgScore(metrics));
        complaintMapper.insert(c);

        // 奖励：+10 蛋蛋币 +10 经验值
        pointService.changeBalance(userId, 10, "earn", "参与大学吐槽（+10 蛋蛋币）", null);
        User user = userMapper.selectById(userId);
        if (user != null) {
            user.setExp((user.getExp() == null ? 0 : user.getExp()) + 10);
            userMapper.updateById(user);
        }
    }

    /** 我的吐槽列表（供「修改评分」入口使用），按时间倒序 */
    public List<ComplaintVO.Item> myComplaints(Long userId) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        return complaintMapper.selectList(new LambdaQueryWrapper<SchoolComplaint>()
                        .eq(SchoolComplaint::getUserId, userId)
                        .orderByDesc(SchoolComplaint::getCreatedAt))
                .stream().map(this::toItem).toList();
    }

    /**
     * 修改自己的吐槽评分：只更新 16 维评分与留言，并重算平均分。
     * 不再发放奖励，也不占用「每人 2 次」的奖励次数（那是奖励上限，不是编辑次数）。
     */
    @Transactional
    public void updateMetrics(Long userId, Long id, UpdateComplaintDTO dto) {
        if (userId == null) {
            throw new BusinessException(401, "请先登录");
        }
        SchoolComplaint c = complaintMapper.selectById(id);
        if (c == null) {
            throw new BusinessException(404, "吐槽记录不存在");
        }
        if (!userId.equals(c.getUserId())) {
            throw new BusinessException(403, "只能修改自己的吐槽");
        }
        Map<String, Integer> metrics = validateMetrics(dto.getMetrics());
        c.setMetrics(writeMetrics(metrics));
        c.setScore(avgScore(metrics));
        if (dto.getContent() != null) {
            c.setContent(dto.getContent());
        }
        complaintMapper.updateById(c);
    }

    /** 维度评分校验：key 白名单 + 分值 0-10；返回校验通过的评分表 */
    private Map<String, Integer> validateMetrics(Map<String, Integer> metrics) {
        if (metrics == null || metrics.isEmpty()) {
            throw new BusinessException("请完成评分");
        }
        Map<String, Integer> clean = new HashMap<>();
        for (Map.Entry<String, Integer> e : metrics.entrySet()) {
            if (!METRIC_KEYS.contains(e.getKey())) {
                throw new BusinessException(400, "未知的评价维度");
            }
            int v = e.getValue() == null ? 0 : e.getValue();
            if (v < 0 || v > 10) {
                throw new BusinessException(400, "评分需在 0-10 之间");
            }
            clean.put(e.getKey(), v);
        }
        return clean;
    }

    /** 平均分（1 位小数） */
    private BigDecimal avgScore(Map<String, Integer> metrics) {
        int sum = 0;
        for (int v : metrics.values()) {
            sum += v;
        }
        return BigDecimal.valueOf(sum)
                .divide(BigDecimal.valueOf(metrics.size()), 1, RoundingMode.HALF_UP);
    }

    /* ============ 私有工具 ============ */

    /** 单条吐槽 → VO（昵称脱敏） */
    private ComplaintVO.Item toItem(SchoolComplaint r) {
        ComplaintVO.Item item = new ComplaintVO.Item();
        item.setId(r.getId());
        item.setSchoolName(r.getSchoolName());
        User u = r.getUserId() == null ? null : userMapper.selectById(r.getUserId());
        item.setUserName(maskName(u == null ? null : u.getNickname()));
        item.setContent(r.getContent());
        item.setScore(r.getScore());
        item.setMetrics(parseMetrics(r.getMetrics()));
        item.setCreatedAt(r.getCreatedAt());
        return item;
    }

    /** 昵称脱敏：首字 + ** + 末字，保护隐私 */
    private String maskName(String name) {
        if (name == null || name.isBlank()) {
            return "匿名蛋";
        }
        if (name.length() <= 1) {
            return name + "*";
        }
        if (name.length() == 2) {
            return name.charAt(0) + "*";
        }
        return name.charAt(0) + "**" + name.charAt(name.length() - 1);
    }

    /** metrics JSON 字符串 → Map */
    @SuppressWarnings("unchecked")
    private Map<String, Integer> parseMetrics(String json) {
        if (json == null || json.isBlank()) {
            return new HashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Integer>>() {});
        } catch (Exception e) {
            return new HashMap<>();
        }
    }

    /** Map → metrics JSON 字符串 */
    private String writeMetrics(Map<String, Integer> metrics) {
        try {
            return objectMapper.writeValueAsString(metrics);
        } catch (Exception e) {
            throw new BusinessException("评分数据序列化失败");
        }
    }

    private BigDecimal toDecimal(Object v) {
        return v == null ? BigDecimal.ZERO : new BigDecimal(v.toString()).setScale(1, RoundingMode.HALF_UP);
    }
}
