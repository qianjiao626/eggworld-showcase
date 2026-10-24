package com.eggworld.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证管理员重置密码请求体的校验规则（与注册一致）：
 * 非空、6~20 位、同时包含字母和数字。
 *
 * <p>不启动 Spring 上下文，直接使用 Bean Validation 校验 DTO。
 */
class ResetPasswordDTOTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    /** 校验密码字段，返回全部违规提示信息 */
    private Set<String> messages(String password) {
        ResetPasswordDTO dto = new ResetPasswordDTO();
        dto.setPassword(password);
        return validator.validate(dto).stream()
                .map(ConstraintViolation::getMessage)
                .collect(Collectors.toSet());
    }

    @Test
    void acceptsValidPassword() {
        assertTrue(messages("abc123").isEmpty(), "6 位且含字母和数字应通过");
        assertTrue(messages("Test2026pass").isEmpty(), "20 位以内的合法密码应通过");
    }

    @Test
    void rejectsBlank() {
        assertTrue(messages("").contains("密码不能为空"));
    }

    @Test
    void rejectsTooShort() {
        assertTrue(messages("ab12").contains("密码长度需在6-20位之间"));
    }

    @Test
    void rejectsTooLong() {
        assertTrue(messages("abc123abc123abc123abc").contains("密码长度需在6-20位之间"));
    }

    @Test
    void rejectsDigitsOnly() {
        assertTrue(messages("123456").contains("密码需同时包含字母和数字"));
    }

    @Test
    void rejectsLettersOnly() {
        assertTrue(messages("abcdef").contains("密码需同时包含字母和数字"));
    }
}
