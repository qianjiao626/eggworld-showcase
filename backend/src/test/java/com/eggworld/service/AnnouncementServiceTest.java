package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.entity.ChatSensitiveWord;
import com.eggworld.mapper.ChatSensitiveWordMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AnnouncementServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ChatSensitiveWordMapper wordMapper = mock(ChatSensitiveWordMapper.class);
    private final AnnouncementService service = new AnnouncementService(jdbc, new SensitiveWords(wordMapper));

    @Test void publishingAndEditingRequireTitleAndContent() {
        assertThrows(BusinessException.class, () -> service.publish(1L, " ", "正文"));
        assertThrows(BusinessException.class, () -> service.publish(1L, "标题", " "));
        verifyNoInteractions(jdbc);
    }
    @Test void archivedAnnouncementCannotBeEditedOrExposed() {
        when(jdbc.update(startsWith("UPDATE announcements SET status"), anyLong(), anyLong())).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.unpublish(2L, 1L));
        verify(jdbc, never()).update(startsWith("INSERT INTO announcement_actions"), any(), any(), any());
        when(jdbc.queryForList(startsWith("SELECT a.id"), eq(2L))).thenReturn(List.of());
        assertThrows(BusinessException.class, () -> service.detail(2L));
    }
    @Test void publishRecordsServerOperatorForAuditing() {
        when(jdbc.queryForObject(startsWith("SELECT LAST_INSERT_ID"), eq(Long.class))).thenReturn(12L);
        assertEquals(12L, service.publish(1L, "标题", "正文"));
        verify(jdbc).update(startsWith("INSERT INTO announcements"), eq("标题"), eq("正文"), eq(1L), eq(1L));
        verify(jdbc).update(startsWith("INSERT INTO announcement_actions"), eq(12L), eq("publish"), eq(1L));
    }

    /** 回归（2026-10-06 本地实测缺陷）：公告此前不校验敏感词，爆料校验，模块间口径不一致。 */
    @Test void sensitiveWordsBlockPublishAndEdit() {
        var word = new ChatSensitiveWord();
        word.setWord("禁词");
        word.setEnabled(1);
        when(wordMapper.selectList(any())).thenReturn(List.of(word));

        assertThrows(BusinessException.class, () -> service.publish(1L, "标题", "内容里有禁词"));
        assertThrows(BusinessException.class, () -> service.publish(1L, "禁词标题", "正文"));
        assertThrows(BusinessException.class, () -> service.edit(2L, 1L, "标题", "内容里有禁词"));

        verify(jdbc, never()).update(startsWith("INSERT INTO announcements"), any(), any(), any(), any());
        verify(jdbc, never()).update(startsWith("UPDATE announcements SET title"), any(), any(), any(), anyLong());
    }
}
