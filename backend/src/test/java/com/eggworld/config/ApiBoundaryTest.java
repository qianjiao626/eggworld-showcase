package com.eggworld.config;

import com.eggworld.common.*;
import com.eggworld.interceptor.JwtInterceptor;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitWebConfig(ApiBoundaryTest.Config.class)
class ApiBoundaryTest {
    @Autowired WebApplicationContext context;
    MockMvc mvc;
    @BeforeEach void setup() { mvc = MockMvcBuilders.webAppContextSetup(context).build(); }
    @Configuration @EnableWebMvc @Import(WebMvcConfig.class)
    static class Config {
        @Bean com.eggworld.interceptor.ApiTrafficInterceptor traffic() { return new com.eggworld.interceptor.ApiTrafficInterceptor(new AppProperties()); }
        @Bean JwtInterceptor jwt() { return new JwtInterceptor(mock(JwtUtil.class),mock(UserMapper.class)); }
        // 权限点加载拦截器：本测试不涉及权限点，给个空 mapper 即可
        @Bean com.eggworld.interceptor.PermissionLoadInterceptor permissionLoad() {
            return new com.eggworld.interceptor.PermissionLoadInterceptor(mock(com.eggworld.mapper.UserPermissionMapper.class));
        }
        // 模块可用性闸（职业测评/宠物/猫舍）：本测试只打 /api/tasks 与 /api/auth/**，给它一个空探测即可
        @Bean com.eggworld.interceptor.ModuleAvailabilityInterceptor moduleGate() {
            return new com.eggworld.interceptor.ModuleAvailabilityInterceptor(mock(org.springframework.jdbc.core.JdbcTemplate.class));
        }
        @Bean Probe probe() { return new Probe(); }
        @Bean GlobalExceptionHandler errors() { return new GlobalExceptionHandler(); }
    }
    @RestController static class Probe {
        @GetMapping("/api/tasks") String list() { return "ok"; }
        @PostMapping("/api/auth/send-code") String send() { return "ok"; }
    }
    @ParameterizedTest @ValueSource(strings={"0","-1","101","9223372036854775807","9223372036854775808","foo","1.5"})
    void invalidPageSizeRejectedBeforeBusiness(String value) throws Exception {
        mvc.perform(get("/api/tasks").param("size",value)).andExpect(status().isBadRequest());
    }
    @ParameterizedTest @ValueSource(strings={"0","-1","10001","9223372036854775808"})
    void invalidPageRejected(String value) throws Exception {
        mvc.perform(get("/api/tasks").param("page",value)).andExpect(status().isBadRequest());
    }
    @Test void oldDefaultAndFiftyAndHundredRemainValid() throws Exception {
        mvc.perform(get("/api/tasks")).andExpect(status().isOk());
        mvc.perform(get("/api/tasks").param("size","50")).andExpect(status().isOk());
        mvc.perform(get("/api/tasks").param("size","100")).andExpect(status().isOk());
    }
    @Test void repeatedParametersCannotDisagreeAcrossLayers() throws Exception {
        mvc.perform(get("/api/tasks").param("size","20","-1")).andExpect(status().isBadRequest());
    }
    @Test void forwardedHeaderDoesNotBypassSendBudget() throws Exception {
        for (int i=0;i<120;i++) mvc.perform(post("/api/auth/send-code").header("X-Forwarded-For","192.0.2."+i)
                .with(r->{r.setRemoteAddr("192.0.2.1");return r;})).andExpect(status().isOk());
        mvc.perform(post("/api/auth/send-code").header("X-Forwarded-For","198.51.100.1")
                .with(r->{r.setRemoteAddr("192.0.2.1");return r;}))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
    }
}
