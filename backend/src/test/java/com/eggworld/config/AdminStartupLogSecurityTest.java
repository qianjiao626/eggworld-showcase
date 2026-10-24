package com.eggworld.config;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminStartupLogSecurityTest {
    @Test void adminCreationLogsIdentityButNotPasswordOrHash() {
        DataInitializer initializer = new DataInitializer(mock(UserMapper.class),
                mock(UserStatsMapper.class), mock(UserCharacterMapper.class));
        Logger logger = (Logger) LoggerFactory.getLogger(DataInitializer.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            ReflectionTestUtils.invokeMethod(initializer, "createAdmin", "test-secret-hash", "admin@example.test");
            assertEquals(1, appender.list.size());
            ILoggingEvent event = appender.list.get(0);
            assertEquals(1, event.getArgumentArray().length);
            assertEquals("admin@example.test", event.getArgumentArray()[0]);
            assertFalse(event.getFormattedMessage().contains("test-secret-hash"));
            assertTrue(event.getFormattedMessage().contains("修改初始密码"));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }
}
