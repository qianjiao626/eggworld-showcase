package com.eggworld.service;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.ContextConfiguration;
import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Runs the existing task/group workflows on guarded 3307 with synthetic users only. */
@ContextConfiguration(classes=TaskChatBindingIsolatedMysqlIT.Config.class, inheritLocations=false)
@EnabledIfEnvironmentVariable(named="PERF_SEC_TASK_CHAT_IT", matches="true")
class TaskChatBindingIsolatedMysqlIT extends TaskChatBindingMysqlIT {
    @Configuration(proxyBeanMethods=false)
    static class Config extends TaskChatBindingMysqlIT.Config {
        @Override @Bean DataSource dataSource() throws Exception {
            return new TeamFundsMysqlIT.Config().dataSource();
        }
    }
    @Override @BeforeAll void seedUsers() {
        for (long id : new long[]{ADMIN,PUBLISHER,CLAIMER,CLAIMER2}) {
            jdbc.update("INSERT INTO users(id,nickname,email,password_hash,role,points) VALUES(?,?,?,?,?,?)",
                id,"task-fixture-"+id,"task-fixture-"+id+"@example.invalid","not-a-login-password",
                id==ADMIN?"admin":"student",START_POINTS);
        }
        assertEquals(4,jdbc.queryForObject("SELECT COUNT(*) FROM users",Integer.class));
    }
}
