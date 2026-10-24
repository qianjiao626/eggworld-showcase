package com.eggworld.config;

import com.eggworld.common.JwtUtil;
import com.eggworld.interceptor.JwtInterceptor;
import com.eggworld.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real MVC CORS processor and real JWT interceptor; no Boot/DB/mail/prod configuration. */
@SpringJUnitWebConfig(CorsSecurityTest.TestConfig.class)
class CorsSecurityTest {
    @Autowired private WebApplicationContext context;
    private MockMvc mvc;

    @BeforeEach void setUp() { mvc = MockMvcBuilders.webAppContextSetup(context)
            .defaultRequest(get("/").with(request -> {
                request.setServerName("api.test");
                return request;
            })).build(); }

    @Configuration
    @EnableWebMvc
    @Import(WebMvcConfig.class)
    static class TestConfig {
        @Bean com.eggworld.interceptor.ApiTrafficInterceptor traffic() { return new com.eggworld.interceptor.ApiTrafficInterceptor(new AppProperties()); }
        @Bean JwtInterceptor jwtInterceptor() {
            return new JwtInterceptor(mock(JwtUtil.class), mock(UserMapper.class));
        }
        // 权限点加载拦截器：本测试不涉及权限点，给个空 mapper 即可
        @Bean com.eggworld.interceptor.PermissionLoadInterceptor permissionLoad() {
            return new com.eggworld.interceptor.PermissionLoadInterceptor(mock(com.eggworld.mapper.UserPermissionMapper.class));
        }
        // 模块可用性闸（职业测评/宠物/猫舍）：本测试只打 /api/health 与 /api/private，给它一个空探测即可
        @Bean com.eggworld.interceptor.ModuleAvailabilityInterceptor moduleGate() {
            return new com.eggworld.interceptor.ModuleAvailabilityInterceptor(mock(org.springframework.jdbc.core.JdbcTemplate.class));
        }
        @Bean ProbeController probeController() { return new ProbeController(); }
    }

    @RestController
    static class ProbeController {
        @GetMapping({"/api/health", "/api/private", "/outside"})
        String probe() { return "ok"; }
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://dsxnb.com", "https://www.dsxnb.com", "http://localhost",
            "http://localhost:5173", "http://localhost:65535", "http://127.0.0.1", "http://127.0.0.1:3000"})
    void allowedOriginsReceiveCredentialedCorsAndUnauthenticatedPreflight(String origin) throws Exception {
        mvc.perform(get("/api/health").header("Origin", origin))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", origin))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options("/api/private").header("Origin", origin)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", origin))
                .andExpect(header().string("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Max-Age", "3600"))
                .andExpect(header().string("Access-Control-Allow-Headers", "authorization, content-type"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://evil.example", "null", "http://dsxnb.com", "https://dsxnb.com:8443",
            "https://api.dsxnb.com", "https://dsxnb.com.evil.example", "https://localhost:5173",
            "http://localhost.evil.example:5173", "http://127.0.0.1.evil.example:3000",
            "http://localhost:5173@evil.example", "http://127.0.0.1:3000@evil.example"})
    void unknownAndLookalikeOriginsAreRejected(String origin) throws Exception {
        mvc.perform(get("/api/health").header("Origin", origin))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        mvc.perform(options("/api/private").header("Origin", origin).header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test void disallowedMethodIsRejected() throws Exception {
        mvc.perform(options("/api/private").header("Origin", "https://dsxnb.com")
                        .header("Access-Control-Request-Method", "PATCH"))
                .andExpect(status().isForbidden());
    }

    @Test void corsDoesNotReplaceAuthenticationOrAffectNonApiRoutes() throws Exception {
        mvc.perform(get("/api/private").header("Origin", "https://dsxnb.com"))
                .andExpect(status().isUnauthorized()).andExpect(header().string("Access-Control-Allow-Origin", "https://dsxnb.com"));
        mvc.perform(get("/api/health")).andExpect(status().isOk())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        mvc.perform(get("/outside").header("Origin", "https://evil.example"))
                .andExpect(status().isOk()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
