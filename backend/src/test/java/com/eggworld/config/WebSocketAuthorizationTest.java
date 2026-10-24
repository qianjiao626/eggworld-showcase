package com.eggworld.config;

import com.eggworld.common.*;
import com.eggworld.entity.User;
import com.eggworld.mapper.UserMapper;
import com.eggworld.service.ChatPermissionService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebSocketAuthorizationTest {
    @Mock JwtUtil jwt; @Mock UserMapper users; @Mock ChatPermissionService permissions;
    @Spy AppProperties props = new AppProperties();
    @InjectMocks WebSocketConfig config;
    private ChannelInterceptor inbound;
    @BeforeEach void setup() {
        ChannelRegistration registration = new ChannelRegistration();
        config.configureClientInboundChannel(registration);
        List<ChannelInterceptor> interceptors = ReflectionTestUtils.invokeMethod(registration, "getInterceptors");
        inbound = interceptors.get(0);
    }
    private Message<byte[]> frame(StompCommand command, String dest, boolean loggedIn) {
        StompHeaderAccessor h = StompHeaderAccessor.create(command);
        h.setSessionId("local-session"); h.setSubscriptionId("sub-1");
        if (dest != null) h.setDestination(dest);
        if (loggedIn) h.setUser(() -> "7");
        h.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], h.getMessageHeaders());
    }
    private void connect() {
        User user = new User(); user.setId(7L);
        when(users.selectById(7L)).thenReturn(user);
        when(jwt.parseToken("local-test-token")).thenReturn(new LoginUser(7L,"student","fixture"));
        Message<byte[]> m = frame(StompCommand.CONNECT,null,false);
        MessageHeaderAccessor.getAccessor(m,StompHeaderAccessor.class).setNativeHeader("Authorization","Bearer local-test-token");
        assertSame(m,inbound.preSend(m,null));
    }
    @Test void validMemberCanConnectSubscribeReceiveAndReconnect() {
        connect();
        Message<byte[]> subscription = frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true);
        assertSame(subscription,inbound.preSend(subscription,null));
        ChannelRegistration registration = new ChannelRegistration(); config.configureClientOutboundChannel(registration);
        List<ChannelInterceptor> out = ReflectionTestUtils.invokeMethod(registration,"getInterceptors");
        Message<byte[]> message = frame(StompCommand.MESSAGE,"/topic/chat.1",false);
        assertSame(message,out.get(0).preSend(message,null));
        verify(permissions,times(2)).requireReadableConversation(1L,7L);
        inbound.preSend(frame(StompCommand.DISCONNECT,null,true),null);
        connect();
        assertSame(subscription,inbound.preSend(subscription,null));
    }
    @Test void subscriptionAndConnectionBudgetsDoNotBlockOtherUsers() {
        props.getWebsocket().setMaxSubscriptionsPerConnection(1); connect();
        inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null);
        Message<byte[]> other = frame(StompCommand.SUBSCRIBE,"/topic/chat.2",true);
        MessageHeaderAccessor.getAccessor(other,StompHeaderAccessor.class).setSubscriptionId("sub-2");
        assertThrows(RuntimeException.class,()->inbound.preSend(other,null));
        verify(permissions,never()).requireReadableConversation(2L,7L);
        inbound.preSend(frame(StompCommand.UNSUBSCRIBE,null,true),null);
        assertSame(other,inbound.preSend(other,null));
    }
    @Test void duplicateSubscriptionIsRejectedBeforeDatabaseAuthorization() {
        connect();
        inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null);
        clearInvocations(permissions);
        assertThrows(RuntimeException.class,()->inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null));
        verifyNoInteractions(permissions);
    }
    @Test void invalidSubscriptionIdentifierIsRejectedBeforeDatabaseAuthorization() {
        connect();
        for (String id : new String[]{null," ","a".repeat(129)}) {
            Message<byte[]> message=frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true);
            MessageHeaderAccessor.getAccessor(message,StompHeaderAccessor.class).setSubscriptionId(id);
            assertThrows(RuntimeException.class,()->inbound.preSend(message,null));
        }
        verifyNoInteractions(permissions);
    }
    @Test void logicallyDeletedAccountCannotOpenConnection() {
        User user=new User();user.setId(7L);user.setDeleted(1);
        when(users.selectById(7L)).thenReturn(user);
        when(jwt.parseToken("local-test-token")).thenReturn(new LoginUser(7L,"student","fixture"));
        Message<byte[]> message=frame(StompCommand.CONNECT,null,false);
        MessageHeaderAccessor.getAccessor(message,StompHeaderAccessor.class).setNativeHeader("Authorization","Bearer local-test-token");
        assertThrows(RuntimeException.class,()->inbound.preSend(message,null));
        verifyNoInteractions(permissions);
    }
    @Test void expiredTokenCannotOpenConnection() {
        Message<byte[]> m = frame(StompCommand.CONNECT,null,false);
        MessageHeaderAccessor.getAccessor(m,StompHeaderAccessor.class).setNativeHeader("Authorization","Bearer expired");
        assertThrows(RuntimeException.class,()->inbound.preSend(m,null));
        verifyNoInteractions(users,permissions);
    }
    @Test void unauthenticatedSubscriptionIsRejected() {
        assertThrows(RuntimeException.class, () -> inbound.preSend(frame(StompCommand.SUBSCRIBE, "/topic/chat.1", false), null));
    }
    @Test void broadcastSendIsRejectedEvenForAuthenticatedUser() {
        assertThrows(RuntimeException.class, () -> inbound.preSend(frame(StompCommand.SEND, "/topic/chat.1", true), null));
    }
    @Test void arbitrarySubscriptionIsRejected() {
        assertThrows(RuntimeException.class, () -> inbound.preSend(frame(StompCommand.SUBSCRIBE, "/topic/**", true), null));
    }
    @Test void nonMemberCannotSubscribe() {
        connect();
        User u = new User(); u.setId(7L); lenient().when(users.selectById(7L)).thenReturn(u);
        lenient().doThrow(new BusinessException(403,"非成员")).when(permissions).requireReadableConversation(1L,7L);
        assertThrows(RuntimeException.class, () -> inbound.preSend(frame(StompCommand.SUBSCRIBE, "/topic/chat.1", true), null));
    }
    @Test void bannedAccountCannotSubscribeOnExistingConnection() {
        connect();
        lenient().doThrow(new BusinessException(403,"账号已封禁"))
                .when(permissions).requireReadableConversation(1L,7L);
        assertThrows(RuntimeException.class, () -> inbound.preSend(frame(StompCommand.SUBSCRIBE, "/topic/chat.1", true), null));
    }
    @Test void outboundRechecksMembershipSoOldSubscriptionsDoNotLeak() {
        connect();
        inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null);
        ChannelRegistration registration = new ChannelRegistration();
        config.configureClientOutboundChannel(registration);
        List<ChannelInterceptor> out = ReflectionTestUtils.invokeMethod(registration, "getInterceptors");
        assertFalse(out.isEmpty(), "必须在实际投递前重新授权，不能仅校验订阅");
        User u = new User(); u.setId(7L); lenient().when(users.selectById(7L)).thenReturn(u);
        lenient().doThrow(new BusinessException(403,"已退群")).when(permissions).requireReadableConversation(1L,7L);
        assertNull(out.get(0).preSend(frame(StompCommand.MESSAGE, "/topic/chat.1", true), null));
    }

    @Test void unsubscribeDoesNotRefundSubscriptionAttemptBudget() {
        connect();
        for (int i = 0; i < 256; i++) {
            inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null);
            inbound.preSend(frame(StompCommand.UNSUBSCRIBE,null,true),null);
        }
        assertThrows(RuntimeException.class,
                () -> inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null),
                "Repeated SUBSCRIBE/UNSUBSCRIBE must be bounded before querying permissions");
        verify(permissions,times(256)).requireReadableConversation(1L,7L);
    }

    @Test void subscriptionAttemptBudgetRefillsOnlyAfterItsMonotonicWindow() {
        props.getWebsocket().setMaxSubscriptionAttemptsPerMinute(1);
        connect();
        inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null);
        inbound.preSend(frame(StompCommand.UNSUBSCRIBE,null,true),null);
        assertThrows(RuntimeException.class, () -> inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null));
        var sessions = (java.util.Map<?, ?>) ReflectionTestUtils.getField(config,"sessions");
        ReflectionTestUtils.setField(sessions.get("local-session"),"subscriptionWindowStartedNanos",
                System.nanoTime() - java.util.concurrent.TimeUnit.SECONDS.toNanos(61));
        assertDoesNotThrow(() -> inbound.preSend(frame(StompCommand.SUBSCRIBE,"/topic/chat.1",true),null));
        verify(permissions,times(2)).requireReadableConversation(1L,7L);
        assertDoesNotThrow(() -> inbound.preSend(frame(StompCommand.DISCONNECT,null,true),null));
    }
}
