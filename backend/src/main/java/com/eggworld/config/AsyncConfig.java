package com.eggworld.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 异步执行配置
 * <p>
 * 邮件通知是外网调用（可能秒级），不能占用业务请求线程：
 * 用独立的 mailExecutor 发信，队列满时丢弃并记日志（宁可少发一封，也不能拖慢或阻塞接口）。
 */
@Slf4j
@Configuration
public class AsyncConfig {

    /** 邮件通知专用线程池名（@Async("mailExecutor")） */
    public static final String MAIL_EXECUTOR = "mailExecutor";

    @Bean(MAIL_EXECUTOR)
    public ThreadPoolTaskExecutor mailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("mail-");
        executor.setRejectedExecutionHandler((task, pool) -> log.warn("邮件任务队列已满，丢弃一封通知邮件"));
        executor.initialize();
        return executor;
    }
}
