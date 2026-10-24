package com.eggworld.interceptor;
import com.eggworld.common.*;
import com.eggworld.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class ApiTrafficBudgetTest {
    static class Time extends Clock {
        long now = 100000; public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;} public Instant instant(){return Instant.ofEpochMilli(now);}
    }
    @Test void windowsRecoverAndStorageRemainsBounded() {
        AppProperties p = new AppProperties(); p.getTraffic().setMaxKeys(10);
        Time clock = new Time(); var guard = new ApiTrafficInterceptor(p,clock);
        guard.consume(Map.of("user:1",1));
        assertEquals(60,assertThrows(RateLimitException.class,()->guard.consume(Map.of("user:1",1))).getRetryAfterSeconds());
        guard.consume(Map.of("user:2",1));
        for(int i=3;i<=10;i++) guard.consume(Map.of("user:"+i,1));
        assertThrows(RateLimitException.class,()->guard.consume(Map.of("user:11",1)));
        clock.now += 60000;
        guard.consume(Map.of("user:11",1)); guard.consume(Map.of("user:1",1));
    }
    @Test void concurrentRequestsCannotOverdrawBudget() throws Exception {
        var guard = new ApiTrafficInterceptor(new AppProperties(),new Time());
        var pool = Executors.newFixedThreadPool(8); AtomicInteger admitted = new AtomicInteger();
        try {
            List<Callable<Void>> tasks = new ArrayList<>();
            for(int i=0;i<100;i++) tasks.add(()->{try{guard.consume(Map.of("shared",7)); admitted.incrementAndGet();}catch(RateLimitException expected){} return null;});
            for(var f:pool.invokeAll(tasks)) f.get();
            assertEquals(7,admitted.get());
        } finally {pool.shutdownNow();}
    }
    @Test void campusSharedIpStillAllowsDistinctAccountBudgets() throws Exception {
        AppProperties p = new AppProperties(); p.getTraffic().getRead().setAccount(1);
        var guard = new ApiTrafficInterceptor(p,new Time());
        MockHttpServletRequest request = new MockHttpServletRequest("GET","/api/tasks"); request.setRemoteAddr("192.0.2.1");
        try {
            for(long i=1;i<=100;i++) {
                UserContext.set(new LoginUser(i,"student","fixture"));
                assertTrue(guard.preHandle(request,new MockHttpServletResponse(),null));
                assertTrue(guard.accountLimits().preHandle(request,new MockHttpServletResponse(),null));
            }
            assertThrows(RateLimitException.class,()->guard.accountLimits().preHandle(request,new MockHttpServletResponse(),null));
            UserContext.set(new LoginUser(101L,"student","fixture"));
            assertTrue(guard.accountLimits().preHandle(request,new MockHttpServletResponse(),null));
        } finally {UserContext.clear();}
    }
}
