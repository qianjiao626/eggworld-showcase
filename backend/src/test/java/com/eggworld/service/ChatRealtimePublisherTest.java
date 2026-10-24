package com.eggworld.service;

import com.eggworld.dto.ChatMessageVO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChatRealtimePublisherTest {
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final ChatRealtimePublisher publisher = new ChatRealtimePublisher(messaging);
    @AfterEach void cleanup() { TransactionSynchronizationManager.clear(); }
    private void begin() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }
    @Test void messageIsNotVisibleBeforeDatabaseCommit() {
        begin();
        publisher.publishMessage(1L, new ChatMessageVO());
        verifyNoInteractions(messaging);
        TransactionSynchronizationUtils.triggerAfterCommit();
        verify(messaging).convertAndSend(eq("/topic/chat.1"), any(ChatRealtimePublisher.Event.class));
    }
    @Test void rolledBackMessageRecallAndReadDoNotPublishGhostEvents() {
        begin();
        publisher.publishMessage(1L, new ChatMessageVO());
        publisher.publishRecall(1L, 2L, 3L);
        publisher.publishRead(1L, 3L, 2L);
        TransactionSynchronizationUtils.triggerAfterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        verifyNoInteractions(messaging);
    }
    @Test void committedRecallAndReadPublishExactlyOnceEach() {
        begin();
        publisher.publishRecall(1L, 2L, 3L);
        publisher.publishRead(1L, 3L, 2L);
        verifyNoInteractions(messaging);
        TransactionSynchronizationUtils.triggerAfterCommit();
        TransactionSynchronizationUtils.triggerAfterCompletion(TransactionSynchronization.STATUS_COMMITTED);
        verify(messaging, times(2)).convertAndSend(eq("/topic/chat.1"), any(ChatRealtimePublisher.Event.class));
    }
    @Test void nonTransactionalPublishStillWorks() {
        publisher.publishRead(1L, 3L, 2L);
        verify(messaging).convertAndSend(eq("/topic/chat.1"), any(ChatRealtimePublisher.Event.class));
    }
    @Test void brokerFailureCannotTurnCommittedWriteIntoHttpFailure() {
        begin();
        publisher.publishMessage(1L, new ChatMessageVO());
        doThrow(new IllegalStateException("fixture-broker-failure")).when(messaging)
                .convertAndSend(anyString(), any(ChatRealtimePublisher.Event.class));
        assertDoesNotThrow(TransactionSynchronizationUtils::triggerAfterCommit);
        verify(messaging).convertAndSend(eq("/topic/chat.1"), any(ChatRealtimePublisher.Event.class));
    }
}
