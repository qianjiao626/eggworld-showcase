package com.eggworld.service;

import com.eggworld.dto.ChatMessageVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

/** 将聊天事件广播到会话订阅者。 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ChatRealtimePublisher {

    private final SimpMessagingTemplate messagingTemplate;

    public void publishMessage(Long conversationId, ChatMessageVO message) {
        publish(conversationId, new Event("message", message));
    }

    public void publishRecall(Long conversationId, Long messageId, Long userId) {
        publish(conversationId, new Event("recall", new RecallPayload(messageId, userId)));
    }

    public void publishRead(Long conversationId, Long userId, Long lastReadMessageId) {
        publish(conversationId, new Event("read", new ReadPayload(userId, lastReadMessageId)));
    }

    /** A rolled-back write must never become a visible realtime event. */
    private void publish(Long conversationId, Event event) {
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() {
                    try {
                        messagingTemplate.convertAndSend("/topic/chat." + conversationId, event);
                    } catch (RuntimeException failure) {
                        // The database has committed; do not report this as a failed business write.
                        // Do not log payloads, tokens or exception messages that might contain them.
                        log.warn("Chat delivery failed after commit: conversationId={}, eventType={}",
                                conversationId, event.type());
                    }
                }
            });
        } else {
            messagingTemplate.convertAndSend("/topic/chat." + conversationId, event);
        }
    }

    public record Event(String type, Object payload) {}
    public record RecallPayload(Long messageId, Long userId) {}
    public record ReadPayload(Long userId, Long lastReadMessageId) {}
}
