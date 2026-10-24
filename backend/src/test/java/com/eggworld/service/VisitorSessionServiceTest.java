package com.eggworld.service;

import com.eggworld.entity.VisitorSession;
import com.eggworld.mapper.VisitorSessionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class VisitorSessionServiceTest {

    VisitorSessionMapper mapper;
    VisitorSessionService service;

    @BeforeEach
    void setup() {
        mapper = mock(VisitorSessionMapper.class);
        service = new VisitorSessionService(mapper);
    }

    @Test
    void startSessionInsertsRecord() {
        service.startSession("sess-1", "vis-1", 42L, "https://example.com", "mobile", true);
        ArgumentCaptor<VisitorSession> cap = ArgumentCaptor.forClass(VisitorSession.class);
        verify(mapper).insert(cap.capture());
        VisitorSession vs = cap.getValue();
        assertEquals("sess-1", vs.getSessionId());
        assertEquals("vis-1", vs.getVisitorId());
        assertEquals(42L, vs.getUserId());
        assertEquals("mobile", vs.getUaDevice());
        assertEquals(1, vs.getIsNewVisitor());
        assertEquals(1, vs.getPageCount());
        assertNotNull(vs.getStartedAt());
    }

    @Test
    void startSessionAnonymous() {
        service.startSession("sess-2", "vis-2", null, null, "desktop", false);
        ArgumentCaptor<VisitorSession> cap = ArgumentCaptor.forClass(VisitorSession.class);
        verify(mapper).insert(cap.capture());
        assertNull(cap.getValue().getUserId());
        assertEquals(0, cap.getValue().getIsNewVisitor());
    }

    @Test
    void startSessionIgnoresNullIds() {
        service.startSession(null, "vis-3", null, null, null, false);
        service.startSession("sess-4", null, null, null, null, false);
        verifyNoInteractions(mapper);
    }

    @Test
    void startSessionTruncatesLongReferrer() {
        String longRef = "https://example.com/" + "x".repeat(300);
        service.startSession("sess-5", "vis-5", null, longRef, "desktop", false);
        ArgumentCaptor<VisitorSession> cap = ArgumentCaptor.forClass(VisitorSession.class);
        verify(mapper).insert(cap.capture());
        assertEquals(256, cap.getValue().getReferrer().length());
    }

    @Test
    void duplicateSessionSilentlyIgnored() {
        when(mapper.insert(any(VisitorSession.class))).thenThrow(new org.springframework.dao.DuplicateKeyException("uk_session_id"));
        assertDoesNotThrow(() -> service.startSession("sess-dup", "vis-dup", null, null, null, false));
    }

    @Test
    void heartbeatDelegatesToMapper() {
        service.heartbeat("sess-1");
        verify(mapper).heartbeat(eq("sess-1"), any());
    }

    @Test
    void heartbeatIgnoresNull() {
        service.heartbeat(null);
        verifyNoInteractions(mapper);
    }
}
