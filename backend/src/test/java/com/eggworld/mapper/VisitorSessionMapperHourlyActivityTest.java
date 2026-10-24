package com.eggworld.mapper;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 时段热力结果类的可实例化回归测试。
 *
 * <p>回归背景：{@code GET /api/admin/user-activity} 返回 500，报
 * {@code Error instantiating interface ...VisitorSessionMapper$HourlyActivity}。
 * MyBatis 通过**无参构造反射**创建结果对象，若 {@code HourlyActivity} 声明为 interface
 * 就无法 new，必然抛 {@code NoSuchMethodException}。
 * 本测试把「必须是具体类 + 有无参构造」钉住，避免再次漂移。
 */
class VisitorSessionMapperHourlyActivityTest {

    @Test
    void hourlyActivityIsInstantiableClassNotInterface() throws Exception {
        Class<?> type = VisitorSessionMapper.HourlyActivity.class;

        assertFalse(type.isInterface(),
                "HourlyActivity 不能是 interface：MyBatis 无法反射实例化，会导致接口 500");
        assertFalse(Modifier.isAbstract(type.getModifiers()),
                "HourlyActivity 不能是抽象类：MyBatis 无法反射实例化");

        // 无参构造必须存在且可访问（MyBatis DefaultObjectFactory 依赖它）
        assertNotNull(type.getDeclaredConstructor(),
                "HourlyActivity 必须有无参构造，否则 MyBatis 实例化失败");

        // 实际 new 一次，确保运行时可用
        assertNotNull(type.getDeclaredConstructor().newInstance());
    }

    /** 三个字段的 getter 必须存在（MyBatis 按列名 h/users/sessions 回填） */
    @Test
    void hourlyActivityExposesGettersForAllColumns() throws Exception {
        Class<?> type = VisitorSessionMapper.HourlyActivity.class;

        assertNotNull(type.getMethod("getH"));
        assertNotNull(type.getMethod("getUsers"));
        assertNotNull(type.getMethod("getSessions"));
        assertTrue(type.getMethod("getH").getReturnType() == int.class);
        assertTrue(type.getMethod("getUsers").getReturnType() == int.class);
        assertTrue(type.getMethod("getSessions").getReturnType() == int.class);
    }
}
