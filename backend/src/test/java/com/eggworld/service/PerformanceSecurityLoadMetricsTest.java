package com.eggworld.service;

import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class PerformanceSecurityLoadMetricsTest {
    private static final long SECOND = 1_000_000_000L;

    @Test void drainMustNotChangeWindowThroughput() {
        var metrics = new PerformanceSecurityLoadMetrics(100 * SECOND, 2 * SECOND);
        metrics.completed(true, 100 * SECOND, 101 * SECOND);
        assertEquals(0.5, metrics.snapshot(102 * SECOND).get("windowSuccessRps"));
        assertEquals(0.5, metrics.snapshot(110 * SECOND).get("windowSuccessRps"));
    }

    @Test void lateOrFailedRequestsMustNotInflateUsefulWindowThroughput() {
        var metrics = new PerformanceSecurityLoadMetrics(0, 2 * SECOND);
        metrics.completed(true, 0, SECOND);
        metrics.completed(true, SECOND, 2 * SECOND); // right boundary belongs to drain
        metrics.completed(false, SECOND, SECOND);
        var result = metrics.snapshot(4 * SECOND);
        assertEquals(0.5, result.get("windowSuccessRps"));
        assertEquals(1L, result.get("windowSuccessfulRequests"));
        assertEquals(2L, result.get("windowCompletedRequests"));
        assertEquals(3L, result.get("completedRequests"));
        assertEquals(2L, result.get("successfulRequests"));
        assertEquals(0.5, result.get("overallSuccessRpsIncludingDrain"));
        assertEquals(2.0, result.get("drainSeconds"));
        assertFalse(result.containsKey("achievedRps"));
    }

    @Test void recordsSchedulerAndQueueDelaySeparatelyFromHttpLatency() {
        var metrics = new PerformanceSecurityLoadMetrics(0, SECOND);
        metrics.submitted(0, 20_000_000);
        metrics.started(0, 20_000_000, 50_000_000);
        metrics.completed(true, 0, 100_000_000);
        var result = metrics.snapshot(SECOND);
        assertEquals(20.0, distribution(result,"scheduleDelay").get("p95Ms"));
        assertEquals(30.0, distribution(result,"workerQueueDelay").get("p95Ms"));
        assertEquals(100.0, distribution(result,"scheduledToCompletion").get("p95Ms"));
        assertEquals(1L, result.get("submittedRequests"));
        assertEquals(1L, result.get("startedRequests"));
        assertEquals(1.0, result.get("windowSubmittedRps"));
    }

    @Test void rejectionAndLateSubmissionRemainVisible() {
        var metrics = new PerformanceSecurityLoadMetrics(0, SECOND);
        metrics.submitted(0, 100_000_000);
        metrics.submitted(500_000_000, 2 * SECOND);
        metrics.rejected();
        var result = metrics.snapshot(3 * SECOND);
        assertEquals(1L, result.get("driverRejectedRequests"));
        assertEquals(1L, result.get("submittedAfterWindow"));
        assertEquals(1L, result.get("unfinishedRequests"));
        assertEquals(1.0, result.get("submissionOverrunSeconds"));
        assertEquals(1.0, result.get("windowSubmittedRps"));
    }

    @Test void emptyWindowAndMonotonicNegativeClockOriginAreSupported() {
        var metrics = new PerformanceSecurityLoadMetrics(-10 * SECOND, SECOND);
        var result = metrics.snapshot(-9 * SECOND);
        assertEquals(0.0, result.get("windowSuccessRps"));
        assertEquals(0, distribution(result,"scheduleDelay").get("count"));
        assertEquals(0.0, result.get("drainSeconds"));
        assertThrows(IllegalArgumentException.class, () -> new PerformanceSecurityLoadMetrics(0, 0));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> distribution(Map<String, Object> result, String key) {
        return (Map<String, Object>) result.get(key);
    }
}
