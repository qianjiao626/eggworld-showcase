package com.eggworld.job;

import com.eggworld.service.ChatRetentionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 每日低峰执行聊天室归档清理，异常不拖垮聊天主服务。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatRetentionScheduler {
    private final ChatRetentionService retentionService;

    @Scheduled(cron = "0 30 3 * * ?")
    public void cleanDaily() {
        try {
            int total = 0;
            for (int i = 0; i < 20; i++) {
                int n = retentionService.archiveAndDeleteOnce();
                total += n;
                if (n == 0) break;
            }
            log.info("聊天室每日清理完成：{} 条", total);
        } catch (Exception e) {
            log.error("聊天室每日清理失败，已忽略，不影响聊天主服务", e);
        }
    }
}
