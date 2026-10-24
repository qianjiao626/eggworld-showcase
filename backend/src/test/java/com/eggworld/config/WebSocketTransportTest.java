package com.eggworld.config;

import com.eggworld.common.*; import com.eggworld.entity.User; import com.eggworld.mapper.UserMapper;
import com.eggworld.service.ChatPermissionService;
import org.junit.jupiter.params.ParameterizedTest; import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import org.springframework.web.socket.sockjs.client.*;
import java.lang.reflect.Type; import java.nio.charset.StandardCharsets; import java.util.*; import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*; import static org.mockito.Mockito.*;

/** 随机本机端口、模拟账号/权限、真实协议传输；不创建生产应用和数据库连接。 */
@SpringBootTest(classes=WebSocketTransportTest.Config.class,webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
 properties={"server.address=127.0.0.1","logging.level.root=WARN"})
class WebSocketTransportTest {
 @Configuration @EnableAutoConfiguration(exclude=DataSourceAutoConfiguration.class) @Import(WebSocketConfig.class)
 static class Config {
  @Bean AppProperties props(){return new AppProperties();}
  @Bean JwtUtil jwt(){var j=mock(JwtUtil.class);when(j.parseToken("local-fixture")).thenReturn(new LoginUser(7L,"student","fixture"));return j;}
  @Bean UserMapper users(){var m=mock(UserMapper.class);User u=new User();u.setId(7L);when(m.selectById(7L)).thenReturn(u);return m;}
  @Bean ChatPermissionService permissions(){return mock(ChatPermissionService.class);}
 }
 @LocalServerPort int port;
 @Autowired SimpMessagingTemplate broker; @Autowired ChatPermissionService permissions;
 @ParameterizedTest @ValueSource(booleans={false,true})
 void sockJsWebSocketAndXhrDeliverOnlyWhileAuthorized(boolean xhrOnly)throws Exception{
  reset(permissions);
  List<Transport> transports=xhrOnly?List.of(new RestTemplateXhrTransport()):List.of(new WebSocketTransport(new StandardWebSocketClient()));
  SockJsClient sock=new SockJsClient(transports);WebSocketStompClient client=new WebSocketStompClient(sock);
  BlockingQueue<String> received=new LinkedBlockingQueue<>();StompSession session=null;
  try {
   StompHeaders connect=new StompHeaders();connect.add("Authorization","Bearer local-fixture");
   session=client.connectAsync("http://127.0.0.1:"+port+"/ws/chat",new org.springframework.web.socket.WebSocketHttpHeaders(),connect,new StompSessionHandlerAdapter(){}).get(10,TimeUnit.SECONDS);
   session.subscribe("/topic/chat.1",new StompFrameHandler(){
    public Type getPayloadType(StompHeaders h){return byte[].class;}
    public void handleFrame(StompHeaders h,Object p){received.add(new String((byte[])p,StandardCharsets.UTF_8));}
   });
   String delivered=null;
   for(int i=0;i<20 && delivered==null;i++){broker.convertAndSend("/topic/chat.1","fixture");delivered=received.poll(100,TimeUnit.MILLISECONDS);}
   assertEquals("fixture",delivered,"真实协议通道应可收到消息");
   received.clear();clearInvocations(permissions);
   doThrow(new BusinessException(403,"退出会话")).when(permissions).requireReadableConversation(1L,7L);
   broker.convertAndSend("/topic/chat.1","must-not-leak");
   verify(permissions,timeout(3000)).requireReadableConversation(1L,7L);
   assertNull(received.poll(300,TimeUnit.MILLISECONDS),"撤销后既有订阅必须停止投递");
  } finally {if(session!=null && session.isConnected())session.disconnect();client.stop();}
 }
}
