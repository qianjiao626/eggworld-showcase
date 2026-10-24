package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.eggworld.common.BusinessException;
import com.eggworld.entity.ChatSensitiveWord;
import com.eggworld.mapper.ChatSensitiveWordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

/**
 * 敏感词校验（公告 / 爆料 / 评论共用同一套规则）。
 *
 * <p>抽成独立组件的原因：公告最初漏了敏感词校验，而爆料有 —— 模块之间各写一份就会再次跑偏。
 * 词表来自 chat_sensitive_words（enabled=1），大小写不敏感，命中即拒绝。
 */
@Service
@RequiredArgsConstructor
public class SensitiveWords {

    /** 单次校验允许的最大长度（与 DTO 的上限一致，超出直接拒绝，避免对超长文本做无效匹配）。 */
    public static final int MAX_LENGTH = 3000;

    private final ChatSensitiveWordMapper words;

    public void assertClean(String text) {
        assertClean(text, MAX_LENGTH);
    }

    public void assertClean(String text, int maxLength) {
        if (text == null || text.length() > maxLength) throw new BusinessException("文字内容过长");
        List<ChatSensitiveWord> active = words.selectList(new LambdaQueryWrapper<ChatSensitiveWord>()
                .eq(ChatSensitiveWord::getEnabled, 1));
        String lower = text.toLowerCase(Locale.ROOT);
        for (ChatSensitiveWord word : active) {
            if (word.getWord() != null && !word.getWord().isBlank()
                    && lower.contains(word.getWord().toLowerCase(Locale.ROOT))) {
                throw new BusinessException("内容包含敏感词，请修改后再提交");
            }
        }
    }
}
