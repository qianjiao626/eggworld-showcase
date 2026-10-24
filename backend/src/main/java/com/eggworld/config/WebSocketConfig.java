package com.eggworld.config;

import com.eggworld.common.JwtUtil;
import com.eggworld.common.LoginUser;
import com.eggworld.entity.User;
import com.eggworld.mapper.UserMapper;
import com.eggworld.service.ChatPermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** 默认拒绝客户端广播；REST 是唯一聊天写入口。状态仅适用于单实例。 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    private final JwtUtil jwtUtil;
    private final UserMapper userMapper;
    private final ChatPermissionService permissions;
    private final AppProperties props;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final Set<String> transports = ConcurrentHashMap.newKeySet();

    private static final class Session {
        final Long userId;
        final String token;
        final Map<String, Long> subscriptions = new HashMap<>();
        long subscriptionWindowStartedNanos = System.nanoTime();
        int subscriptionAttempts;
        Session(Long userId, String token) { this.userId = userId; this.token = token; }
    }

    @Override public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/chat").setAllowedOriginPatterns(
                "https://dsxnb.com", "https://www.dsxnb.com", "http://localhost:[*]", "http://127.0.0.1:[*]")
                .withSockJS().setHttpMessageCacheSize(100).setStreamBytesLimit(128 * 1024);
    }

    @Override public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        AppProperties.WebSocket p = props.getWebsocket();
        registry.setMessageSizeLimit(p.getMessageSizeLimit()).setSendBufferSizeLimit(p.getSendBufferSizeLimit())
                .setSendTimeLimit(p.getSendTimeLimitMs()).setTimeToFirstMessage(p.getTimeToFirstMessageMs());
        registry.addDecoratorFactory(handler -> new WebSocketHandlerDecorator(handler) {
            @Override public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                synchronized (transports) {
                    if (transports.size() >= p.getMaxConnections()) {
                        session.close(CloseStatus.POLICY_VIOLATION); return;
                    }
                    transports.add(session.getId());
                }
                try { super.afterConnectionEstablished(session); }
                catch (Exception e) { transports.remove(session.getId()); throw e; }
            }
            @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                transports.remove(session.getId()); sessions.remove(session.getId());
                super.afterConnectionClosed(session, status);
            }
        });
    }

    @EventListener public void disconnected(SessionDisconnectEvent event) {
        sessions.remove(event.getSessionId());
    }

    @Override public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor h = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (h == null || h.getSessionId() == null) throw denied();
                StompCommand command = h.getCommand();
                if (command == StompCommand.CONNECT || command == StompCommand.STOMP) {
                    String raw = h.getFirstNativeHeader("Authorization");
                    if (raw == null || raw.length() > 8192 || !raw.startsWith("Bearer ")) throw denied();
                    String token = raw.substring(7);
                    LoginUser user = jwtUtil.parseToken(token);
                    if (user == null) throw denied();
                    requireAccount(user.getId());
                    synchronized (sessions) {
                        if (sessions.containsKey(h.getSessionId()) || sessions.size() >= props.getWebsocket().getMaxConnections()
                                || sessions.values().stream().filter(s -> s.userId.equals(user.getId())).count()
                                >= props.getWebsocket().getMaxConnectionsPerUser()) throw denied();
                        sessions.put(h.getSessionId(), new Session(user.getId(), token));
                    }
                    h.setUser(() -> String.valueOf(user.getId()));
                    return message;
                }
                // DISCONNECT 可重复到达，用于清理；不把服务器控制帧当作业务 SEND。
                if (command == StompCommand.DISCONNECT) { sessions.remove(h.getSessionId()); return message; }
                Session session = requireSession(h);
                if (command == null && h.getMessageType() == org.springframework.messaging.simp.SimpMessageType.HEARTBEAT) return message;
                if (command == StompCommand.UNSUBSCRIBE) {
                    synchronized (session) { session.subscriptions.remove(h.getSubscriptionId()); }
                    return message;
                }
                if (command != StompCommand.SUBSCRIBE) throw denied(); // 包括 SEND、事务和客户端伪造 MESSAGE
                Long conversationId = conversationId(h.getDestination());
                String id = h.getSubscriptionId();
                if (id == null || id.isBlank() || id.length() > 128) throw denied();
                // Cheap rejection before SQL; recheck after authorization for concurrent frames.
                synchronized (session) {
                    if (session.subscriptions.containsKey(id)
                            || session.subscriptions.size() >= props.getWebsocket().getMaxSubscriptionsPerConnection()) throw denied();
                    long now = System.nanoTime();
                    if (now - session.subscriptionWindowStartedNanos >= java.util.concurrent.TimeUnit.MINUTES.toNanos(1)) {
                        session.subscriptionWindowStartedNanos = now;
                        session.subscriptionAttempts = 0;
                    }
                    // UNSUBSCRIBE frees a slot, never the query budget; prevent low-count churn.
                    if (session.subscriptionAttempts >= Math.max(1,
                            props.getWebsocket().getMaxSubscriptionAttemptsPerMinute())) throw denied();
                    session.subscriptionAttempts++;
                }
                requireRead(session.userId, conversationId);
                synchronized (session) {
                    if (session.subscriptions.containsKey(id)
                            || session.subscriptions.size() >= props.getWebsocket().getMaxSubscriptionsPerConnection()) throw denied();
                    session.subscriptions.put(id, conversationId);
                }
                return message;
            }
        });
    }

    @Override public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override public Message<?> preSend(Message<?> message, MessageChannel channel) {
                // SimpleBroker 的每个收件人都带 simpSessionId；不能依赖广播帧上的发送者 Principal。
                StompHeaderAccessor h = StompHeaderAccessor.wrap(message);
                if (h.getMessageType() != org.springframework.messaging.simp.SimpMessageType.MESSAGE) return message;
                try {
                    Session session = requireSession(h);
                    Long id = conversationId(h.getDestination());
                    synchronized (session) {
                        if (!id.equals(session.subscriptions.get(h.getSubscriptionId()))) return null;
                    }
                    // 不缓存权限：封禁/退群/踢出后，旧订阅的下一次投递即拒绝；DB 失败时也拒绝。
                    requireRead(session.userId, id);
                    return message;
                } catch (RuntimeException denied) { return null; }
            }
        });
    }

    private Session requireSession(StompHeaderAccessor h) {
        Session session = h.getSessionId() == null ? null : sessions.get(h.getSessionId());
        if (session == null || jwtUtil.parseToken(session.token) == null) throw denied();
        return session;
    }
    private void requireRead(Long userId, Long conversationId) {
        permissions.requireReadableConversation(conversationId, userId);
    }
    private void requireAccount(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null || Integer.valueOf(1).equals(user.getBanned())
                || Integer.valueOf(1).equals(user.getDeleted())) throw denied();
    }
    private Long conversationId(String destination) {
        if (destination == null || !destination.matches("/topic/chat\\.[1-9][0-9]{0,18}")) throw denied();
        try { return Long.valueOf(destination.substring("/topic/chat.".length())); }
        catch (NumberFormatException e) { throw denied(); }
    }
    private IllegalArgumentException denied() { return new IllegalArgumentException("聊天连接或会话权限不可用"); }
}
