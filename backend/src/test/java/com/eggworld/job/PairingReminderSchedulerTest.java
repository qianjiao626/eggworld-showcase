package com.eggworld.job;

import com.eggworld.service.PairingRemindService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 配对提醒定时任务：触发时间（每天早上 10:00）与「交给 service 处理」的边界。
 */
@ExtendWith(MockitoExtension.class)
class PairingReminderSchedulerTest {

    @Mock PairingRemindService pairingRemindService;

    @InjectMocks PairingReminderScheduler scheduler;

    @Test
    void delegatesToService() {
        when(pairingRemindService.remindAll())
                .thenReturn(new PairingRemindService.RemindSummary(2, 1, 0));

        scheduler.remindUnpairedPublishers();

        verify(pairingRemindService).remindAll();
    }

    /** 需求是「每天早上 10 点」，改成别的时间要能在这里被发现 */
    @Test
    void runsEveryDayAtTen() throws NoSuchMethodException {
        Scheduled scheduled = PairingReminderScheduler.class
                .getMethod("remindUnpairedPublishers").getAnnotation(Scheduled.class);

        assertEquals("0 0 10 * * *", scheduled.cron());
    }
}
