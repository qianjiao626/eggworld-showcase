package com.eggworld.config;

import com.eggworld.common.TextSanitizer;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.util.Set;

/**
 * 请求体文本净化（纵深防御）—— 见 {@link TextSanitizer}。
 *
 * <p>放在 Jackson 层而不是逐个 Service 处理，原因：
 * <ul>
 *   <li>发布任务等入口用了 {@code BeanUtils.copyProperties(dto, entity)}，
 *       在 Service 里逐字段净化容易漏；</li>
 *   <li>以后新增接口自动获得同样保护。</li>
 * </ul>
 *
 * <p>注意：
 * <ul>
 *   <li>只作用于 {@code @RequestBody} 的 JSON（项目里的入参都是 JSON）；</li>
 *   <li>密码类字段跳过净化，保证注册与登录对密码的处理完全一致；</li>
 *   <li>控制器里形如 {@code @RequestBody Map<String, String>} 的入参同样会被净化。</li>
 * </ul>
 */
@Configuration
public class TextSanitizeConfig {

    /** 跳过净化的字段名（密码类必须原样保留，否则含 & < ' " 等字符的密码会被改写成另一串） */
    private static final Set<String> SKIP_FIELDS = Set.of("password", "passwordHash", "oldPassword", "newPassword");

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer textSanitizeCustomizer() {
        return builder -> builder.deserializerByType(String.class, new JsonDeserializer<String>() {
            @Override
            public String deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
                String value = p.getValueAsString();
                String field = p.currentName();
                if (field != null && SKIP_FIELDS.contains(field)) {
                    return value;
                }
                return TextSanitizer.clean(value);
            }
        });
    }
}
