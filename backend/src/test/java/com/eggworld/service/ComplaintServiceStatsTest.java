package com.eggworld.service;

import com.eggworld.dto.ComplaintVO;
import com.eggworld.mapper.SchoolComplaintMapper;
import com.eggworld.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 吐槽统计接口的空表回归测试。
 *
 * <p>回归背景：{@code GET /api/complaints/stats} 在 {@code school_complaints} 空表时返回 500。
 * 原因是 {@code AVG(score)} 在空表下返回 NULL，MyBatis 会把**整行**映射成 {@code null}
 * （而不是 {@code {avgVal=null}}），原代码直接 {@code avgRows.get(0).get("avgVal")} 触发 NPE。
 * 本测试把「空表 / 空行 / 空值」三种情况钉住，避免再次漂移。
 */
@ExtendWith(MockitoExtension.class)
class ComplaintServiceStatsTest {

    @Mock
    private SchoolComplaintMapper complaintMapper;
    @Mock
    private UserMapper userMapper;
    @Mock
    private PointService pointService;

    private ComplaintService service() {
        return new ComplaintService(complaintMapper, userMapper, pointService,
                new ObjectMapper());
    }

    /** 空表：selectMaps 返回一行 null（MyBatis 对全 NULL 行的实际行为）→ 不应抛 NPE，均分回落 0 */
    @Test
    void statsWithEmptyTableReturnsZeroAverage() {
        when(complaintMapper.selectCount(any())).thenReturn(0L);
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(null);   // 关键：整行是 null，不是 {avgVal=null}
        when(complaintMapper.selectMaps(any())).thenReturn(rows);

        ComplaintVO.Stats stats = service().stats(1L);

        assertEquals(0, stats.getTotalCount());
        assertEquals(BigDecimal.ZERO, stats.getAvgAll());
    }

    /** 空结果集：selectMaps 返回空列表 → 同样回落 0 */
    @Test
    void statsWithNoRowsReturnsZeroAverage() {
        when(complaintMapper.selectCount(any())).thenReturn(0L);
        when(complaintMapper.selectMaps(any())).thenReturn(Collections.emptyList());

        ComplaintVO.Stats stats = service().stats(1L);

        assertEquals(BigDecimal.ZERO, stats.getAvgAll());
    }

    /** 行存在但 avgVal 为 null（有数据但 score 全空）→ 回落 0 */
    @Test
    void statsWithNullAverageValueReturnsZero() {
        when(complaintMapper.selectCount(any())).thenReturn(0L);
        Map<String, Object> row = new HashMap<>();
        row.put("avgVal", null);
        when(complaintMapper.selectMaps(any())).thenReturn(List.of(row));

        ComplaintVO.Stats stats = service().stats(1L);

        assertEquals(BigDecimal.ZERO, stats.getAvgAll());
    }

    /** 正常有数据：均分按实际值返回 */
    @Test
    void statsWithAverageValueReturnsIt() {
        when(complaintMapper.selectCount(any())).thenReturn(0L);
        Map<String, Object> row = new HashMap<>();
        row.put("avgVal", new BigDecimal("6.5"));
        when(complaintMapper.selectMaps(any())).thenReturn(List.of(row));

        ComplaintVO.Stats stats = service().stats(1L);

        assertEquals(0, new BigDecimal("6.5").compareTo(stats.getAvgAll()));
    }
}
