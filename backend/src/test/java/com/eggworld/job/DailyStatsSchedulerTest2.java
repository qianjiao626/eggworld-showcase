package com.eggworld.job;

import com.eggworld.entity.DailyActiveStats;
import com.eggworld.mapper.DailyActiveStatsMapper;
import com.eggworld.mapper.VisitorSessionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DailyStatsSchedulerTest {

    VisitorSessionMapper sessionMapper;
    DailyActiveStatsMapper statsMapper;
    DailyStatsScheduler scheduler;

    @BeforeEach
    void setup() {
        sessionMapper = mock(VisitorSessionMapper.class);
        statsMapper = mock(DailyActiveStatsMapper.class);
        scheduler = new DailyStatsScheduler(sessionMapper, statsMapper);
    }

    @Test
    void aggregateYesterdayInsertsStats() {
        when(sessionMapper.countDistinctUsers(any(), any())).thenReturn(15);
        when(sessionMapper.countAnonymousSessions(any(), any())).thenReturn(8);
        when(sessionMapper.countTotalSessions(any(), any())).thenReturn(23);
        when(sessionMapper.avgDurationSec(any(), any())).thenReturn(180);
        when(sessionMapper.countNewVisitors(any(), any())).thenReturn(5);
        when(sessionMapper.countReturningVisitors(any(), any())).thenReturn(10);
        when(sessionMapper.peakHour(any(), any())).thenReturn(14);

        scheduler.aggregateYesterday();

        ArgumentCaptor<DailyActiveStats> cap = ArgumentCaptor.forClass(DailyActiveStats.class);
        verify(statsMapper).insert(cap.capture());
        DailyActiveStats stats = cap.getValue();
        assertEquals(15, stats.getDau());
        assertEquals(8, stats.getAnonymousSessions());
        assertEquals(23, stats.getTotalSessions());
        assertEquals(180, stats.getAvgDurationSec());
        assertEquals(5, stats.getNewVisitorCount());
        assertEquals(10, stats.getReturningVisitorCount());
        assertEquals(14, stats.getPeakHour());
        assertNotNull(stats.getStatDate());
    }

    @Test
    void duplicateDateDoesNotThrow() {
        when(sessionMapper.countDistinctUsers(any(), any())).thenReturn(0);
        when(sessionMapper.countAnonymousSessions(any(), any())).thenReturn(0);
        when(sessionMapper.countTotalSessions(any(), any())).thenReturn(0);
        when(sessionMapper.avgDurationSec(any(), any())).thenReturn(0);
        when(sessionMapper.countNewVisitors(any(), any())).thenReturn(0);
        when(sessionMapper.countReturningVisitors(any(), any())).thenReturn(0);
        when(sessionMapper.peakHour(any(), any())).thenReturn(null);
        when(statsMapper.insert(any(DailyActiveStats.class))).thenThrow(new org.springframework.dao.DuplicateKeyException("pk"));

        assertDoesNotThrow(() -> scheduler.aggregateYesterday());
    }
}
