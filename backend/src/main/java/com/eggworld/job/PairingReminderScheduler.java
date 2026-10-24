package com.eggworld.job;

import com.eggworld.service.PairingRemindService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 配对提醒定时任务：每天早上 10:00 给「有报名、还没确认配对」的发布者发一封汇总提醒邮件。
 *
 * - 口径与去重都在 {@link PairingRemindService}：同一发布者每天最多一封，直到配对完成或任务关闭才停
 * - 只发提醒、不动任何状态与资金；发信失败由 MailNotifyService 兜底，不影响任务流程
 * - 与其它定时任务一致，cron 按服务器本地时间（线上为北京时间）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PairingReminderScheduler {

    private final PairingRemindService pairingRemindService;

    /** 每天早上 10:00 汇总提醒 */
    @Scheduled(cron = "0 0 10 * * *")
    public void remindUnpairedPublishers() {
        PairingRemindService.RemindSummary summary = pairingRemindService.remindAll();
        if (summary.sent() > 0) {
            log.info("配对提醒定时任务：已提醒 {} 位发布者（今日已提醒跳过 {} 位）",
                    summary.sent(), summary.skippedToday());
        }
    }
}
