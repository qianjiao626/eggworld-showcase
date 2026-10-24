package com.eggworld.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 验证请求体文本净化：只删 "&lt;"、不动密码字段。
 *
 * <p>不启动 Spring 上下文，直接把 customizer 应用到 {@link Jackson2ObjectMapperBuilder}，
 * 这样能独立验证「字段名识别是否可靠」（密码字段依赖 {@code JsonParser.currentName()}）。
 */
class TextSanitizeConfigTest {

    private static ObjectMapper buildMapper() {
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        new TextSanitizeConfig().textSanitizeCustomizer().customize(builder);
        return builder.build();
    }

    @SuppressWarnings("unused")
    static class Sample {
        public String nickname;
        public String password;
        public String content;
    }

    @Test
    void stripsAngleBracketButKeepsPassword() throws Exception {
        Sample s = buildMapper().readValue(
                "{\"nickname\":\"<b>evil</b>\",\"password\":\"a<b\",\"content\":\"x<y>z\"}",
                Sample.class);

        assertEquals("b>evil/b>", s.nickname, "昵称里的 < 应被去掉");
        assertEquals("xy>z", s.content, "只删 <，保留 >");
        assertEquals("a<b", s.password, "密码字段必须原样保留");
    }

    @SuppressWarnings("unused")
    static class PwdSample {
        public String oldPassword;
        public String newPassword;
    }

    /** 自助改密 / 忘记密码的两个密码字段同样必须原样保留（含 < > & " 的密码不能被改写） */
    @Test
    void keepsOldAndNewPasswordFieldsUntouched() throws Exception {
        PwdSample s = buildMapper().readValue(
                "{\"oldPassword\":\"a<b&c\",\"newPassword\":\"d>e\\\"f\"}", PwdSample.class);

        assertEquals("a<b&c", s.oldPassword, "当前密码必须原样保留");
        assertEquals("d>e\"f", s.newPassword, "新密码必须原样保留");
    }

    @Test
    void leavesPlainTextAndNullUntouched() throws Exception {
        Sample s = buildMapper().readValue(
                "{\"nickname\":null,\"content\":\"普通中文内容，含空格与标点！\"}", Sample.class);

        assertNull(s.nickname);
        assertEquals("普通中文内容，含空格与标点！", s.content);
    }
}
