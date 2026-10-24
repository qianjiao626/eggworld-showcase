package com.eggworld;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 蛋蛋世界后端启动类
 *
 * - @MapperScan：扫描 mapper 接口
 * - @EnableScheduling：开启定时任务（自动退回蛋蛋币用）
 * - @EnableAsync：开启异步执行（邮件通知用，见 AsyncConfig 的 mailExecutor）
 */
@SpringBootApplication
@MapperScan("com.eggworld.mapper")
@EnableScheduling
@EnableAsync
public class EggWorldApplication {

    public static void main(String[] args) {
        SpringApplication.run(EggWorldApplication.class, args);
    }
}
