package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CatServiceTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PointService pointService = mock(PointService.class);
    private final CatReviewPermission permission = mock(CatReviewPermission.class);
    private final CatService service = new CatService(jdbc, pointService, permission);

    private Map<String, Object> room(long id, long userId, int status, int isPublic, int votes) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id);
        r.put("user_id", userId);
        r.put("name", "测试猫");
        r.put("look_json", "{\"body\":2,\"ear\":3,\"eye\":4,\"tail\":2,\"pattern\":1,\"face\":1,\"blush\":0}");
        r.put("intro", null);
        r.put("status", status);
        r.put("is_public", isPublic);
        r.put("votes", votes);
        r.put("adopts", 0);
        r.put("views", 0);
        r.put("reject_reason", null);
        r.put("created_at", "2026-09-29 12:00:00");
        return r;
    }

    /* ---------- 外观校验 ---------- */

    @Test
    void normalizeLookAcceptsValidParts() {
        Map<String, Object> look = new LinkedHashMap<>();
        look.put("body", 6); look.put("ear", 6); look.put("eye", 8);
        look.put("tail", 5); look.put("pattern", 5); look.put("face", 3); look.put("blush", 1);
        String json = service.normalizeLook(look);
        assertTrue(json.contains("\"body\":6"));
        assertTrue(json.contains("\"eye\":8"));
        assertTrue(json.contains("\"blush\":1"));
    }

    @Test
    void normalizeLookRejectsOutOfRange() {
        assertThrows(BusinessException.class, () -> service.normalizeLook(null));
        Map<String, Object> bad = new LinkedHashMap<>();
        bad.put("body", 7); // 毛色只有 6 种
        bad.put("ear", 1); bad.put("eye", 1); bad.put("tail", 1);
        bad.put("pattern", 1); bad.put("face", 1);
        assertThrows(BusinessException.class, () -> service.normalizeLook(bad));
    }

    /* ---------- 创建 ---------- */

    @Test
    void createRoomRejectsEmptyNameAndLongIntro() {
        Map<String, Object> look = new LinkedHashMap<>();
        look.put("body", 1); look.put("ear", 1); look.put("eye", 1);
        look.put("tail", 1); look.put("pattern", 1); look.put("face", 1);
        assertThrows(BusinessException.class, () -> service.createRoom(1L, "  ", look, null));
        String longIntro = "字".repeat(201);
        assertThrows(BusinessException.class, () -> service.createRoom(1L, "咪咪", look, longIntro));
        assertThrows(BusinessException.class, () -> service.createRoom(null, "咪咪", look, null));
    }

    /* ---------- 投票 ---------- */

    @Test
    void voteRejectsSelfVote() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 5L))
                .thenReturn(List.of(room(5L, 42L, 2, 1, 0)));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.vote(42L, 5L));
        assertTrue(ex.getMessage().contains("不能给自己的猫投票"));
        verify(jdbc, never()).update(startsWith("INSERT INTO cat_votes"), any(), any(), any());
    }

    @Test
    void voteRejectsDuplicate() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 5L))
                .thenReturn(List.of(room(5L, 99L, 2, 1, 3)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_votes WHERE room_id = ? AND voter_id = ?", Integer.class, 5L, 42L))
                .thenReturn(1);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.vote(42L, 5L));
        assertTrue(ex.getMessage().contains("已经给这只猫投过票"));
    }

    @Test
    void voteRejectsWhenDailyQuotaUsed() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 5L))
                .thenReturn(List.of(room(5L, 99L, 2, 1, 3)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_votes WHERE room_id = ? AND voter_id = ?", Integer.class, 5L, 42L))
                .thenReturn(0);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_votes WHERE voter_id = ? AND vote_date = ?", Integer.class, 42L, LocalDate.now()))
                .thenReturn(3);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.vote(42L, 5L));
        assertTrue(ex.getMessage().contains("已经用完"));
    }

    @Test
    void voteSucceedsAndReportsRemaining() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 5L))
                .thenReturn(List.of(room(5L, 99L, 2, 1, 3)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_votes WHERE room_id = ? AND voter_id = ?", Integer.class, 5L, 42L))
                .thenReturn(0);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_votes WHERE voter_id = ? AND vote_date = ?", Integer.class, 42L, LocalDate.now()))
                .thenReturn(1);
        Map<String, Object> res = service.vote(42L, 5L);
        assertEquals(4, res.get("votes"));
        assertEquals(1, res.get("remaining"), "每天 3 票，已用 1 票，投完应剩 1 票");
        verify(jdbc).update(startsWith("INSERT INTO cat_votes"), eq(5L), eq(42L), eq(LocalDate.now()));
        verify(jdbc).update(eq("UPDATE cat_rooms SET votes = votes + 1 WHERE id = ?"), eq(5L));
    }

    @Test
    void voteRejectsUnpublicRoom() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 5L))
                .thenReturn(List.of(room(5L, 99L, 1, 0, 0)));
        assertThrows(BusinessException.class, () -> service.vote(42L, 5L));
    }

    /* ---------- 领养 ---------- */

    @Test
    void adoptRejectsOwnRoomAndDuplicate() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 5L))
                .thenReturn(List.of(room(5L, 42L, 2, 1, 0)));
        assertThrows(BusinessException.class, () -> service.adopt(42L, 5L));

        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 6L))
                .thenReturn(List.of(room(6L, 99L, 2, 1, 0)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE room_id = ? AND adopter_id = ?", Integer.class, 6L, 42L))
                .thenReturn(1);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.adopt(42L, 6L));
        assertTrue(ex.getMessage().contains("已经领养过"));
    }

    @Test
    void adoptRejectsWhenLimitReached() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 6L))
                .thenReturn(List.of(room(6L, 99L, 2, 1, 0)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE room_id = ? AND adopter_id = ?", Integer.class, 6L, 42L))
                .thenReturn(0);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE adopter_id = ?", Long.class, 42L))
                .thenReturn(3L);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.adopt(42L, 6L));
        assertTrue(ex.getMessage().contains("最多只能领养"));
    }

    @Test
    void adoptGivesOwnerReputationAndCopies() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 6L))
                .thenReturn(List.of(room(6L, 99L, 2, 1, 0)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE room_id = ? AND adopter_id = ?", Integer.class, 6L, 42L))
                .thenReturn(0);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE adopter_id = ?", Long.class, 42L))
                .thenReturn(0L);
        when(jdbc.queryForList("SELECT nickname FROM users WHERE id = ?", 99L))
                .thenReturn(List.of(Map.of("nickname", "原主人")));
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 6L))
                .thenReturn(List.of(room(6L, 99L, 2, 1, 0)));

        service.adopt(42L, 6L);

        // 被领养 → 原主人 +10 声望
        verify(jdbc).update(startsWith("INSERT INTO cat_reputation"), eq(99L), eq(10));
        verify(jdbc, never()).update(startsWith("UPDATE users SET reputation"), any(), any());
        // 复制一份到领养人名下
        verify(jdbc).update(argThat(sql -> sql.startsWith("INSERT INTO cat_rooms") && sql.contains("VALUES (?,?,?,?,0,0)")),
                eq(42L), contains("领养"), any(), any());
        verify(jdbc).update(eq("UPDATE cat_rooms SET adopts = adopts + 1 WHERE id = ?"), eq(6L));
    }

    @Test
    void adoptedLongNameFitsDatabaseColumn() {
        Map<String, Object> source = room(6L, 99L, 2, 1, 0);
        source.put("name", "123456789012345678901234567890");
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 6L)).thenReturn(List.of(source));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE adopter_id = ?", Long.class, 42L)).thenReturn(0L);
        service.adopt(42L, 6L);
        verify(jdbc).update(startsWith("INSERT INTO cat_rooms (user_id, name"), eq(42L),
                argThat((String n) -> n.length() <= 30 && n.endsWith("\uFF08\u9886\u517B\uFF09")), any(), any());
    }

    @Test
    void voteLocksVoterBeforeCheckingQuota() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 5L))
                .thenReturn(List.of(room(5L, 99L, 2, 1, 3)));
        service.vote(42L, 5L);
        var order = inOrder(jdbc);
        order.verify(jdbc).queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, 42L);
        order.verify(jdbc).queryForObject("SELECT COUNT(*) FROM cat_votes WHERE voter_id = ? AND vote_date = ?", Integer.class, 42L, LocalDate.now());
    }

    @Test
    void adoptionLocksAdopterBeforeCheckingLimit() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 6L))
                .thenReturn(List.of(room(6L, 99L, 2, 1, 0)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE adopter_id = ?", Long.class, 42L)).thenReturn(0L);
        service.adopt(42L, 6L);
        var order = inOrder(jdbc);
        order.verify(jdbc).queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, 42L);
        order.verify(jdbc).queryForObject("SELECT COUNT(*) FROM cat_adoptions WHERE adopter_id = ?", Long.class, 42L);
    }

    @Test
    void moderationLocksRoomBeforeReadingSubmittedContent() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 1L))
                .thenReturn(List.of(room(1L, 99L, 1, 0, 0)));
        service.approve(7L, 1L);
        var order = inOrder(jdbc);
        order.verify(jdbc).queryForObject("SELECT id FROM cat_rooms WHERE id = ? FOR UPDATE", Long.class, 1L);
        order.verify(jdbc).queryForList("SELECT * FROM cat_rooms WHERE id = ?", 1L);
    }

    @Test
    void editingLocksRoomBeforeReadingStatus() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 3L))
                .thenReturn(List.of(room(3L, 42L, 1, 0, 0)));
        service.updateRoom(42L, 3L, "name", Map.of("body",1,"ear",1,"eye",1,"tail",1,"pattern",1,"face",1), null);
        var order = inOrder(jdbc);
        order.verify(jdbc).queryForObject("SELECT id FROM cat_rooms WHERE id = ? FOR UPDATE", Long.class, 3L);
        order.verify(jdbc).queryForList("SELECT * FROM cat_rooms WHERE id = ?", 3L);
    }

    @Test
    void editDraftDoesNotSubmitItWithoutOwnerAction() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 3L))
                .thenReturn(List.of(room(3L, 42L, 0, 0, 0)));
        service.updateRoom(42L, 3L, "new name", Map.of("body", 1, "ear", 1, "eye", 1,
                "tail", 1, "pattern", 1, "face", 1), "");
        verify(jdbc).update(contains("status=?"), eq("new name"), anyString(), isNull(), eq(0), eq(3L));
    }

    @Test
    void cannotDeleteCatWithAdoptionHistory() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 6L))
                .thenReturn(List.of(room(6L, 42L, 2, 1, 0)));
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM cat_adoptions WHERE room_id"),
                eq(Integer.class), eq(6L))).thenReturn(1);
        assertThrows(BusinessException.class, () -> service.deleteRoom(42L, 6L));
        verify(jdbc, never()).update(startsWith("DELETE FROM cat_adoptions"), eq(6L));
    }

    @Test
    void approveOnlyPendingRoom() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 1L))
                .thenReturn(List.of(room(1L, 99L, 0, 0, 0)));
        assertThrows(BusinessException.class, () -> service.approve(7L, 1L));
        verify(jdbc, never()).update(startsWith("UPDATE cat_rooms SET status=2"), any(), any());
    }

    @Test
    void takeDownOnlyPublishedRoom() {
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 1L))
                .thenReturn(List.of(room(1L, 99L, 1, 0, 0)));
        assertThrows(BusinessException.class, () -> service.takeDown(7L, 1L));
    }

    @Test
    void catReputationIsIndependentOfReviewAverage() {
        when(jdbc.queryForList("SELECT score FROM cat_reputation WHERE user_id = ?", Integer.class, 42L))
                .thenReturn(List.of(60));
        assertEquals(60, service.myReputation(42L));
        assertThrows(BusinessException.class, () -> service.myReputation(null));
    }

    /* ---------- 审核 ---------- */

    @Test
    void approveRequiresReviewer() {
        doThrow(new BusinessException(403, "无权限审核猫舍内容"))
                .when(permission).requireReviewer(7L);
        assertThrows(BusinessException.class, () -> service.approve(7L, 1L));
    }

    @Test
    void approvePublishesRoom() {
        doNothing().when(permission).requireReviewer(7L);
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 1L))
                .thenReturn(List.of(room(1L, 99L, 1, 0, 0)));
        service.approve(7L, 1L);
        verify(jdbc).update(startsWith("UPDATE cat_rooms SET status=2, is_public=1"), eq(7L), eq(1L));
    }

    @Test
    void rejectHidesRoomAndKeepsReason() {
        doNothing().when(permission).requireReviewer(7L);
        when(jdbc.queryForList("SELECT * FROM cat_rooms WHERE id = ?", 1L))
                .thenReturn(List.of(room(1L, 99L, 1, 0, 0)));
        service.reject(7L, 1L, "图片不清晰");
        verify(jdbc).update(startsWith("UPDATE cat_rooms SET status=3, is_public=0"), eq("图片不清晰"), eq(7L), eq(1L));
    }

    /* ---------- 榜单奖励 ---------- */

    @Test
    void grantRewardRejectsDifferentWinnerInSameSeason() {
        when(jdbc.queryForList(startsWith("SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC")))
                .thenReturn(List.of(room(10L, 55L, 2, 1, 150)));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM cat_reward_grants WHERE season = ?", Integer.class, "total"))
                .thenReturn(1);
        assertThrows(BusinessException.class, () -> service.grantRankReward(7L, "total"));
        verifyNoInteractions(pointService);
    }

    @Test
    void grantRewardHandlesConcurrentDuplicateWithoutPayingAgain() {
        when(jdbc.queryForList(startsWith("SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC")))
                .thenReturn(List.of(room(9L, 55L, 2, 1, 120)));
        doThrow(new DuplicateKeyException("season already paid")).when(jdbc)
                .update(startsWith("INSERT INTO cat_reward_grants"), any(), any(), any(), any(), any(), any(), any());
        assertThrows(BusinessException.class, () -> service.grantRankReward(7L, "total"));
        verifyNoInteractions(pointService);
    }

    @Test
    void grantRewardPaysOncePerSeason() {
        doNothing().when(permission).requireReviewer(7L);
        when(jdbc.queryForList(startsWith("SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC")))
                .thenReturn(List.of(room(9L, 55L, 2, 1, 120)));
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM cat_reward_grants"), eq(Integer.class), eq("total")))
                .thenReturn(0);
        when(jdbc.queryForList("SELECT nickname FROM users WHERE id = ?", 55L))
                .thenReturn(List.of(Map.of("nickname", "冠军猫主")));

        Map<String, Object> res = service.grantRankReward(7L, "total");

        assertEquals(100, res.get("points"));
        assertEquals(50, res.get("reputation"));
        assertEquals("冠军猫主", res.get("ownerName"));
        // 币走 PointService，不直接改余额
        verify(pointService).changeBalance(eq(55L), eq(100), eq("reward"), contains("猫舍总榜"), isNull());
        verify(jdbc).update(startsWith("INSERT INTO cat_reward_grants"), eq("total"), eq(9L), eq(55L), eq(1), eq(100), eq(50), eq(7L));
    }

    @Test
    void grantRewardRejectsSecondTime() {
        doNothing().when(permission).requireReviewer(7L);
        when(jdbc.queryForList(startsWith("SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC")))
                .thenReturn(List.of(room(9L, 55L, 2, 1, 120)));
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM cat_reward_grants"), eq(Integer.class), eq("total")))
                .thenReturn(1);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.grantRankReward(7L, "total"));
        assertTrue(ex.getMessage().contains("已经发过"));
        verifyNoInteractions(pointService);
    }

    @Test
    void grantRewardRejectsEmptyBoard() {
        doNothing().when(permission).requireReviewer(7L);
        when(jdbc.queryForList(startsWith("SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC")))
                .thenReturn(List.of());
        assertThrows(BusinessException.class, () -> service.grantRankReward(7L, "total"));
        verifyNoInteractions(pointService);
    }

    /* ---------- 榜单与投票余额 ---------- */

    @Test
    void remainingVotesNeverNegative() {
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM cat_votes WHERE voter_id"), eq(Integer.class), eq(42L), eq(LocalDate.now())))
                .thenReturn(5);
        assertEquals(0, service.remainingVotes(42L));
        assertEquals(0, service.remainingVotes(null));
    }

    @Test
    void rankingAssignsSequentialRanks() {
        when(jdbc.queryForList(startsWith("SELECT * FROM cat_rooms WHERE status=2 AND is_public=1 ORDER BY votes DESC"), eq(10)))
                .thenReturn(List.of(room(1L, 10L, 2, 1, 9), room(2L, 11L, 2, 1, 5)));
        when(jdbc.queryForList("SELECT nickname FROM users WHERE id = ?", 10L)).thenReturn(List.of(Map.of("nickname", "A")));
        when(jdbc.queryForList("SELECT nickname FROM users WHERE id = ?", 11L)).thenReturn(List.of(Map.of("nickname", "B")));
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM cat_reward_grants"), eq(Integer.class), eq("total"), eq(1L))).thenReturn(0);
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM cat_reward_grants"), eq(Integer.class), eq("total"), eq(2L))).thenReturn(0);

        List<Map<String, Object>> list = service.ranking(10);
        assertEquals(2, list.size());
        assertEquals(1, list.get(0).get("rank"));
        assertEquals(2, list.get(1).get("rank"));
    }
}
