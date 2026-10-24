package com.eggworld.service;

import java.util.*;
import java.util.concurrent.atomic.LongAdder;
import java.util.concurrent.atomic.AtomicLong;

/** Monotonic-clock measurements for the isolated load driver (never production telemetry). */
final class PerformanceSecurityLoadMetrics {
    private final long begin;
    private final long duration;
    private final LongAdder successful = new LongAdder();
    private final LongAdder completed = new LongAdder(), inWindowCompleted = new LongAdder();
    private final LongAdder inWindowSuccessful = new LongAdder(), submitted = new LongAdder();
    private final LongAdder inWindowSubmitted = new LongAdder(), started = new LongAdder();
    private final LongAdder rejected = new LongAdder(), lateSubmissions = new LongAdder();
    private final AtomicLong lastSubmittedOffset = new AtomicLong();
    private final List<Long> scheduleDelay = Collections.synchronizedList(new ArrayList<>());
    private final List<Long> queueDelay = Collections.synchronizedList(new ArrayList<>());
    private final List<Long> scheduledToCompletion = Collections.synchronizedList(new ArrayList<>());

    PerformanceSecurityLoadMetrics(long begin, long duration) {
        if (duration <= 0) throw new IllegalArgumentException("Positive measurement window required");
        this.begin = begin;
        this.duration = duration;
    }

    // A submission is an attempt; rejection is separately counted, never useful throughput.
    void submitted(long due, long submittedAt) {
        submitted.increment();
        scheduleDelay.add(Math.max(0, submittedAt - due));
        lastSubmittedOffset.accumulateAndGet(submittedAt - begin, Math::max);
        if (withinWindow(submittedAt)) inWindowSubmitted.increment();
        else lateSubmissions.increment();
    }
    void started(long due, long submittedAt, long startedAt) {
        started.increment();
        queueDelay.add(Math.max(0, startedAt - submittedAt));
    }
    void completed(boolean success, long due, long completedAt) {
        completed.increment();
        if (success) successful.increment();
        if (withinWindow(completedAt)) {
            inWindowCompleted.increment();
            if (success) inWindowSuccessful.increment();
        }
        scheduledToCompletion.add(Math.max(0, completedAt - due));
    }
    void rejected() { rejected.increment(); }

    private boolean withinWindow(long time) {
        long offset = time - begin;
        return offset >= 0 && offset < duration;
    }

    Map<String, Object> snapshot(long observedAt) {
        double seconds = duration / 1e9;
        double observedSeconds = Math.max(1, observedAt - begin) / 1e9;
        var result = new LinkedHashMap<String, Object>();
        result.put("measurementWindowSeconds", seconds);
        result.put("observedSecondsIncludingDrain", observedSeconds);
        result.put("drainSeconds", Math.max(0, observedAt - begin - duration) / 1e9);
        result.put("submittedRequests", submitted.sum());
        result.put("admittedRequests", submitted.sum() - rejected.sum());
        result.put("startedRequests", started.sum());
        result.put("completedRequests", completed.sum());
        result.put("successfulRequests", successful.sum());
        result.put("windowCompletedRequests", inWindowCompleted.sum());
        result.put("windowSuccessfulRequests", inWindowSuccessful.sum());
        result.put("windowSubmittedRps", inWindowSubmitted.sum() / seconds);
        result.put("windowSuccessRps", inWindowSuccessful.sum() / seconds);
        result.put("overallSuccessRpsIncludingDrain", successful.sum() / observedSeconds);
        result.put("driverRejectedRequests", rejected.sum());
        result.put("submittedAfterWindow", lateSubmissions.sum());
        result.put("unfinishedRequests", Math.max(0, submitted.sum() - rejected.sum() - completed.sum()));
        result.put("submissionOverrunSeconds", Math.max(0, lastSubmittedOffset.get() - duration) / 1e9);
        result.put("scheduleDelay", PerformanceSecurityLoadIT.distribution(scheduleDelay));
        result.put("workerQueueDelay", PerformanceSecurityLoadIT.distribution(queueDelay));
        result.put("scheduledToCompletion", PerformanceSecurityLoadIT.distribution(scheduledToCompletion));
        return result;
    }
}
