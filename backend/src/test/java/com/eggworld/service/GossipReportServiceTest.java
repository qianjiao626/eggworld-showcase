package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.LoginUser;
import com.eggworld.common.UserContext;
import com.eggworld.entity.ChatSensitiveWord;
import com.eggworld.mapper.ChatSensitiveWordMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GossipReportServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ChatSensitiveWordMapper wordMapper = mock(ChatSensitiveWordMapper.class);
    private final SensitiveWords sensitiveWords = new SensitiveWords(wordMapper);
    private final PointService points = mock(PointService.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final GossipReportService service = new GossipReportService(jdbc, sensitiveWords, points, notifications);
    @AfterEach void clear() { UserContext.clear(); }

    @Test void sensitiveWordsBlockPublicationAndComments() {
        var word = new ChatSensitiveWord(); word.setWord("禁词"); word.setEnabled(1);
        when(wordMapper.selectList(any())).thenReturn(List.of(word));
        assertThrows(BusinessException.class, () -> service.publish(7L, "标题", "内容禁词", false));
        assertThrows(BusinessException.class, () -> service.checkText("含禁词的评论"));
        verifyNoInteractions(jdbc);
    }

    @Test void studentIsPendingAndModeratorPublishesDirectly() {
        when(wordMapper.selectList(any())).thenReturn(List.of());
        UserContext.set(new LoginUser(7L, "student", "同学"));
        service.publish(7L, "标题", "正文", true);
        verify(jdbc).update(contains("INSERT INTO gossip_reports"), eq("标题"), eq("正文"), eq(7L), eq(true), eq("pending"), eq("none"));
        UserContext.set(new LoginUser(8L, "subadmin", "副管"));
        service.publish(8L, "另一个标题", "正文", false);
        verify(jdbc).update(contains("INSERT INTO gossip_reports"), eq("另一个标题"), eq("正文"), eq(8L), eq(false), eq("published"), eq("pending"));
    }

    @Test void invalidAndNonIntegralRewardsAreRejected() {
        assertThrows(BusinessException.class, () -> service.parseReward(JsonNodeFactory.instance.numberNode(-1)));
        assertThrows(BusinessException.class, () -> service.parseReward(JsonNodeFactory.instance.numberNode(10001)));
        assertThrows(BusinessException.class, () -> service.parseReward(JsonNodeFactory.instance.numberNode(1.5)));
        assertThrows(BusinessException.class, () -> service.parseReward(JsonNodeFactory.instance.textNode("5")));
        assertEquals(0, service.parseReward(JsonNodeFactory.instance.numberNode(0)));
    }

    @Test void ownRewardAndSecondSettlementCannotMintCoins() {
        when(jdbc.queryForList(startsWith("SELECT publisher_id"), eq(9L))).thenReturn(List.of(java.util.Map.of("publisher_id", 7L, "status", "published", "reward_status", "pending")));
        assertThrows(BusinessException.class, () -> service.settleReward(9L, 7L, 15));
        when(jdbc.update(startsWith("UPDATE gossip_reports SET reward_status"), anyInt(), anyLong())).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.settleReward(9L, 8L, 15));
        verifyNoInteractions(points);
    }

    @Test void successfulSettlementRecordsRewardBeforeOneMint() {
        when(jdbc.queryForList(startsWith("SELECT publisher_id"), eq(9L))).thenReturn(List.of(java.util.Map.of("publisher_id", 7L, "status", "published", "reward_status", "pending")));
        when(jdbc.update(startsWith("UPDATE gossip_reports SET reward_status"), anyInt(), anyLong())).thenReturn(1);
        service.settleReward(9L, 8L, 15);
        var order = inOrder(jdbc, points);
        order.verify(jdbc).update(startsWith("INSERT INTO gossip_report_rewards"), eq(9L), eq(7L), eq(15), eq(8L));
        order.verify(points).changeBalance(eq(7L), eq(15), eq("reward"), anyString(), isNull());
    }

    /**
     * 回归（2026-10-06 本地实测缺陷）：
     * ① 审核不存在的爆料此前报 403「不能审核并结算自己发布的爆料」，与自奖混为一谈；
     * ② 隐藏/删除不存在的爆料或评论此前报 400「已被其他管理员处理」。
     * 两者都应先判存在 → 404。
     */
    @Test void missingReportOrCommentIsNotFoundInsteadOfForbiddenOrConflict() {
        when(jdbc.queryForList(startsWith("SELECT publisher_id"), eq(99L))).thenReturn(List.of());
        assertEquals(404, assertThrows(BusinessException.class, () -> service.approve(99L, 8L, 10)).getCode());

        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM gossip_reports"), eq(Integer.class), eq(99L))).thenReturn(0);
        assertEquals(404, assertThrows(BusinessException.class, () -> service.moderateReport(99L, 8L, "hide", "原因")).getCode());
        assertEquals(404, assertThrows(BusinessException.class, () -> service.moderateReport(99L, 8L, "delete", "原因")).getCode());

        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM gossip_report_comments"), eq(Integer.class), eq(99L))).thenReturn(0);
        assertEquals(404, assertThrows(BusinessException.class, () -> service.moderateComment(99L, 8L, "hide", "原因")).getCode());
        assertEquals(404, assertThrows(BusinessException.class, () -> service.moderateComment(99L, 8L, "delete", "原因")).getCode());
    }

    /** 存在但状态已被改掉时，仍按并发冲突提示，而不是 404。 */
    @Test void existingButAlreadyHandledReportKeepsConflictMessage() {
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM gossip_reports"), eq(Integer.class), eq(5L))).thenReturn(1);
        when(jdbc.update(startsWith("UPDATE gossip_reports SET status='hidden'"), anyLong(), any(), eq(5L), eq("published"))).thenReturn(0);
        var ex = assertThrows(BusinessException.class, () -> service.moderateReport(5L, 8L, "hide", "原因"));
        assertEquals(400, ex.getCode());
        assertTrue(ex.getMessage().contains("已被其他管理员处理"));
    }
}
