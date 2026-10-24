package com.eggworld.config;

import com.eggworld.common.*;
import com.eggworld.controller.AuthController;
import com.eggworld.interceptor.ApiTrafficInterceptor;
import com.eggworld.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitWebConfig(AuthTrafficTest.Config.class)
class AuthTrafficTest {
 @Configuration @EnableWebMvc @Import(AuthController.class)
 static class Config {
  @Bean AuthService auth(){return mock(AuthService.class);}
  @Bean VerifyCodeService codes(){return mock(VerifyCodeService.class);}
  @Bean ApiTrafficInterceptor traffic(){AppProperties p=new AppProperties();p.getTraffic().getAuth().setAccount(2);return new ApiTrafficInterceptor(p);}
  @Bean GlobalExceptionHandler errors(){return new GlobalExceptionHandler();}
 }
 @Autowired WebApplicationContext context;
 @Autowired AuthService auth;
 @Test void anonymousLoginBudgetUsesNormalizedEmailAcrossIpsBeforePasswordWork()throws Exception{
  MockMvc mvc=MockMvcBuilders.webAppContextSetup(context).build();
  for(int i=0;i<2;i++) mvc.perform(post("/api/auth/login").contentType("application/json")
    .content("{\"email\":\"Alice@example.test\",\"password\":\"fixture\"}")
    .with(r->{r.setRemoteAddr("192.0.2.1");return r;})).andExpect(status().isOk());
  mvc.perform(post("/api/auth/login").contentType("application/json")
    .content("{\"email\":\"alice@EXAMPLE.test\",\"password\":\"fixture\"}")
    .with(r->{r.setRemoteAddr("192.0.2.2");return r;}))
    .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60"));
  verify(auth,times(2)).login(any());
  mvc.perform(post("/api/auth/login").contentType("application/json")
    .content("{\"email\":\"bob@example.test\",\"password\":\"fixture\"}")).andExpect(status().isOk());
 }
}
