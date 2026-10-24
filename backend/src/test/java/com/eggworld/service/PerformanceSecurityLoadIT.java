package com.eggworld.service;

import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.eggworld.common.*;
import com.eggworld.config.*;
import com.eggworld.controller.*;
import com.eggworld.interceptor.*;
import com.fasterxml.jackson.databind.*;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.session.RowBounds;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import org.springframework.web.socket.sockjs.client.*;
import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.lang.reflect.Type;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.LockSupport;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Guarded localhost-only mixed HTTP + real STOMP + MySQL experiment, not production capacity. */
@SpringBootTest(classes=PerformanceSecurityLoadIT.Config.class,
 webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
 properties={"server.address=127.0.0.1","logging.level.root=WARN",
 "spring.config.location=classpath:/application.yml","server.tomcat.threads.max=64"})
@EnabledIfEnvironmentVariable(named="PERF_SEC_LOAD_IT",matches="true")
class PerformanceSecurityLoadIT {
 @Configuration(proxyBeanMethods=false)
 @EnableAutoConfiguration(exclude=DataSourceAutoConfiguration.class)
 @EnableTransactionManagement(proxyTargetClass=true)
 @MapperScan("com.eggworld.mapper")
 @Import({ChatController.class,TaskController.class,UserController.class,
  ChatMessageService.class,ChatPermissionService.class,ChatGroupService.class,ChatRealtimePublisher.class,
  TaskService.class,ClaimService.class,PointService.class,RatingService.class,NotificationService.class,
  WebMvcConfig.class,WebSocketConfig.class,JwtUtil.class,JwtInterceptor.class,ApiTrafficInterceptor.class,
  com.eggworld.interceptor.ModuleAvailabilityInterceptor.class,
  GlobalExceptionHandler.class,TextSanitizeConfig.class,MybatisPlusConfig.class})
 static class Config {
  @Bean(destroyMethod="close") HikariDataSource dataSource() throws Exception {
   // Reuse the already-reviewed URL/port/datadir guards and DDL-only random-schema fixture.
   var raw=(DriverManagerDataSource)new TeamFundsMysqlIT.Config().dataSource();
   var p=new HikariDataSource();p.setJdbcUrl(raw.getUrl());p.setUsername(raw.getUsername());p.setPassword(raw.getPassword());
   p.setMaximumPoolSize(10);p.setMinimumIdle(2);p.setConnectionTimeout(2000);p.setPoolName("perf-security-isolated");return p;
  }
  @Bean AppProperties props(){var p=new AppProperties();p.getJwt().setSecret(UUID.randomUUID()+"-"+UUID.randomUUID());p.getJwt().setExpireDays(1);p.getMail().setNotifyEnabled(false);return p;}
  @Bean PlatformTransactionManager txm(DataSource ds){return new DataSourceTransactionManager(ds);}
  @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
  @Bean SqlMeter meter(){return new SqlMeter();}
  @Bean SqlSessionFactory sqlSessionFactory(DataSource ds,SqlMeter meter,com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor pagination)throws Exception{
   var f=new MybatisSqlSessionFactoryBean();f.setDataSource(ds);f.setPlugins(meter,pagination);
   var c=new com.baomidou.mybatisplus.core.MybatisConfiguration();c.setMapUnderscoreToCamelCase(true);c.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);f.setConfiguration(c);return f.getObject();
  }
  // No external mail/reward/background jobs run. These unrelated routes are NOT load-tested.
  @Bean InviteService invite(){return mock(InviteService.class);}
  @Bean CheckinService checkin(){return mock(CheckinService.class);}
  @Bean UserService users(){return mock(UserService.class);}
  @Bean ChatSocialService social(){return mock(ChatSocialService.class);}
  @Bean ChatModerationService moderation(){return mock(ChatModerationService.class);}
  @Bean ChatOnlineRewardService reward(){return mock(ChatOnlineRewardService.class);}
  @Bean ChatContextService context(){return mock(ChatContextService.class);}
 }
 @Intercepts({@Signature(type=Executor.class,method="query",args={MappedStatement.class,Object.class,RowBounds.class,ResultHandler.class}),
              @Signature(type=Executor.class,method="update",args={MappedStatement.class,Object.class})})
 public static class SqlMeter implements Interceptor {
  final LongAdder calls=new LongAdder(),nanos=new LongAdder(),slow=new LongAdder();
  public Object intercept(Invocation i)throws Throwable{long t=System.nanoTime();try{return i.proceed();}finally{long dt=System.nanoTime()-t;calls.increment();nanos.add(dt);if(dt>100_000_000)slow.increment();}}
 }
 @Autowired JdbcTemplate jdbc; @Autowired JwtUtil jwt; @Autowired ObjectMapper json;
 @Autowired HikariDataSource pool; @Autowired SqlMeter sql; @Autowired SimpMessagingTemplate broker;
 @Autowired ApplicationContext context; @LocalServerPort int port;
 final String run=UUID.randomUUID().toString(); final List<String> tokens=new ArrayList<>();
 final List<StompSession> sessions=new ArrayList<>(); final Set<Integer> ready=ConcurrentHashMap.newKeySet();
 final ConcurrentMap<String,Pending> pending=new ConcurrentHashMap<>(); final AtomicInteger wsErrors=new AtomicInteger();
 final AtomicLong sequence=new AtomicLong(); final List<Map<String,Object>> resources=new ArrayList<>(),stages=new ArrayList<>();
 final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
 final Path report=Path.of("D:/CodexData/local/eggworld/perf-sec-load-"+run+".json");
 WebSocketStompClient stomp; long conversation; int currentReceivers; long started; boolean completed;
 static class Pending {final long start=System.nanoTime();final BitSet seen=new BitSet();final int expected;final Stats stats;
  Pending(int expected,Stats stats){this.expected=expected;this.stats=stats;}
  synchronized boolean receive(int receiver){if(seen.get(receiver))return false;seen.set(receiver);stats.delivery.add(System.nanoTime()-start);return seen.cardinality()==expected;}}
 static class Stats {
  final PerformanceSecurityLoadMetrics timing;
  Stats(long begin,long duration){timing=new PerformanceSecurityLoadMetrics(begin,duration);}
  final ConcurrentMap<String,List<Long>> latency=new ConcurrentHashMap<>();final List<Long> delivery=Collections.synchronizedList(new ArrayList<>());
  final ConcurrentMap<Integer,LongAdder> status=new ConcurrentHashMap<>();final AtomicInteger failures=new AtomicInteger(),inflight=new AtomicInteger(),peak=new AtomicInteger();
  final LongAdder requests=new LongAdder(),success=new LongAdder();
  void record(String route,int code,long ns){requests.increment();status.computeIfAbsent(code,k->new LongAdder()).increment();latency.computeIfAbsent(route,k->Collections.synchronizedList(new ArrayList<>())).add(ns);if(code==200)success.increment();else failures.incrementAndGet();}
 }
 void seed(){
  for(int i=0;i<128;i++){long id=100000L+i;jdbc.update("INSERT INTO users(id,nickname,email,password_hash,role,points) VALUES(?,?,?,?,?,?)",id,"load-user-"+i,"load-"+i+"@example.invalid","not-a-real-password","student",1000);tokens.add(jwt.createToken(new LoginUser(id,"student","load-user-"+i)));}
  jdbc.update("INSERT INTO chat_conversations(type,title,channel_key,visibility,status,member_count) VALUES('channel','load-fixture','load-fixture','official','active',128)");
  conversation=jdbc.queryForObject("SELECT id FROM chat_conversations WHERE channel_key='load-fixture'",Long.class);
  for(int i=0;i<128;i++){jdbc.update("INSERT INTO chat_conversation_members(conversation_id,user_id,role,status,unread_count,mention_unread,notification_mode,pinned,last_read_message_id) VALUES(?,?,'member','active',0,0,'all',0,0)",conversation,100000L+i);for(int j=0;j<20;j++)jdbc.update("INSERT INTO notifications(user_id,text,type,is_read) VALUES(?,'synthetic notice','info',0)",100000L+i);}
  for(int i=0;i<1000;i++){long id=100000L+i;long owner=100000L+i%128;jdbc.update("INSERT INTO tasks(id,title,description,task_type,skill_category,reward,claim_mode,max_claimers,publisher_id,status,featured,deleted) VALUES(?,?,'synthetic','help','study',10,'multiple',5,?,'approved',0,0)",id,"load-task-"+i,owner);for(int j=1;j<=2;j++)jdbc.update("INSERT INTO task_claims(task_id,claimer_id,status,selected,claimer_contact) VALUES(?,?,'pending_pairing',0,'synthetic')",id,100000L+(i+j)%128);}
  for(int i=0;i<500;i++)jdbc.update("INSERT INTO chat_messages(conversation_id,sender_id,message_type,content,status,client_msg_id) VALUES(?,?,'text','synthetic history','normal',?)",conversation,100000L+i%128,"seed-"+i);
 }
 void addReceivers(int target)throws Exception{
  if(stomp==null){stomp=new WebSocketStompClient(new SockJsClient(List.of(new WebSocketTransport(new StandardWebSocketClient()))));stomp.setInboundMessageSizeLimit(65536);}
  for(int i=sessions.size();i<target;i++){final int receiver=i;var headers=new StompHeaders();headers.add("Authorization","Bearer "+tokens.get(i));var session=stomp.connectAsync("http://127.0.0.1:"+port+"/ws/chat",new org.springframework.web.socket.WebSocketHttpHeaders(),headers,new StompSessionHandlerAdapter(){@Override public void handleTransportError(StompSession s,Throwable e){wsErrors.incrementAndGet();}}).get(10,TimeUnit.SECONDS);
   session.subscribe("/topic/chat."+conversation,new StompFrameHandler(){public Type getPayloadType(StompHeaders h){return byte[].class;}public void handleFrame(StompHeaders h,Object data){try{var event=json.readTree((byte[])data);if("probe".equals(event.path("type").asText()))ready.add(receiver);if("message".equals(event.path("type").asText())){String id=event.path("payload").path("clientMsgId").asText();Pending p=pending.get(id);if(p!=null&&p.receive(receiver))pending.remove(id,p);}}catch(Exception e){wsErrors.incrementAndGet();}}});sessions.add(session);}
  for(int i=0;i<50&&ready.size()<target;i++){broker.convertAndSend("/topic/chat."+conversation,Map.of("type","probe"));Thread.sleep(100);}
  assertEquals(target,ready.size(),"Every real subscription must become ready before load");currentReceivers=target;
 }
 void request(Stats s,long due,long submittedAt){s.timing.started(due,submittedAt,System.nanoTime());int n=(int)sequence.getAndIncrement();int user=(n/10)%128;int operation=n%10;String route;String body=null;String id=null;
  if(operation<3)route="/api/tasks?status=approved&size="+(operation==0?20:operation==1?50:100)+"&keyword=load";
  else if(operation<5)route="/api/chat/conversations/"+conversation+"/messages?size=50";
  else if(operation<7)route="/api/users/me/notifications/unread-count";
  else if(operation==7)route="/api/chat/conversations";
  else if(operation==8)route="/api/chat/conversations/"+conversation+"/read";
  else{route="/api/chat/conversations/"+conversation+"/messages";id=run+"-"+n;body="{\"content\":\"isolated-load\",\"clientMsgId\":\""+id+"\"}";pending.put(id,new Pending(currentReceivers,s));}
  long start=System.nanoTime();int active=s.inflight.incrementAndGet();s.peak.accumulateAndGet(active,Math::max);
  boolean success=false;
  try{var req=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+route)).timeout(Duration.ofSeconds(5)).header("Authorization","Bearer "+tokens.get(user));if(operation>=8)req.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body==null?"{}":body));else req.GET();var response=http.send(req.build(),HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));int code=response.statusCode();if(code==200)code=json.readTree(response.body()).path("code").asInt(-1);success=code==200;s.record(route,code,System.nanoTime()-start);if(code!=200&&id!=null)pending.remove(id);
  }catch(Exception e){s.record(route,-1,System.nanoTime()-start);if(id!=null)pending.remove(id);}finally{s.timing.completed(success,due,System.nanoTime());s.inflight.decrementAndGet();}
 }
 static Map<String,Object> distribution(List<Long> values){long[] a; synchronized(values){a=values.stream().mapToLong(Long::longValue).sorted().toArray();}if(a.length==0)return Map.of("count",0);return Map.of("count",a.length,"p50Ms",a[(int)Math.ceil(a.length*.50)-1]/1e6,"p95Ms",a[(int)Math.ceil(a.length*.95)-1]/1e6,"p99Ms",a[(int)Math.ceil(a.length*.99)-1]/1e6,"maxMs",a[a.length-1]/1e6);}
 void sample(String phase){var m=new LinkedHashMap<String,Object>();m.put("phase",phase);m.put("elapsedSec",(System.nanoTime()-started)/1e9);var os=(com.sun.management.OperatingSystemMXBean)ManagementFactory.getOperatingSystemMXBean();m.put("combinedJvmCpu",os.getProcessCpuLoad());m.put("hostCpu",os.getCpuLoad());m.put("heapUsed",ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed());m.put("threads",ManagementFactory.getThreadMXBean().getThreadCount());m.put("gcCount",ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(b->Math.max(0,b.getCollectionCount())).sum());m.put("gcMs",ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(b->Math.max(0,b.getCollectionTime())).sum());var p=pool.getHikariPoolMXBean();m.put("poolActive",p.getActiveConnections());m.put("poolIdle",p.getIdleConnections());m.put("poolWaiting",p.getThreadsAwaitingConnection());Object executor=context.getBean("clientOutboundChannelExecutor");if(executor instanceof ThreadPoolTaskExecutor e){m.put("outboundQueue",e.getThreadPoolExecutor().getQueue().size());m.put("outboundActive",e.getActiveCount());}m.put("pendingBroadcasts",pending.size());m.put("sqlMapperCalls",sql.calls.sum());m.put("sqlMapperMs",sql.nanos.sum()/1e6);m.put("sqlMapperOver100ms",sql.slow.sum());m.put("mysqlGlobalStatus",jdbc.queryForList("SHOW GLOBAL STATUS WHERE Variable_name IN ('Innodb_row_lock_waits','Innodb_row_lock_time','Slow_queries','Threads_running','Threads_connected')"));resources.add(m);}
 void save()throws Exception{var m=new LinkedHashMap<String,Object>();m.put("run",run);m.put("completed",completed);m.put("scope","isolated core HTTP/STOMP/MySQL; app and driver share JVM; external mail/reward/jobs are mocks/disabled; NOT whole-site or production capacity");m.put("schema",TeamFundsMysqlIT.database);m.put("fixture",Map.of("users",128,"tasks",1000,"claims",2000,"notifications",2560,"initialMessages",500,"poolMax",10));m.put("stages",stages);m.put("resources",resources);m.put("pendingBroadcasts",pending.size());m.put("webSocketErrors",wsErrors.get());json.writerWithDefaultPrettyPrinter().writeValue(report.toFile(),m);}
 void stage(String name,int seconds,int rps,int receivers)throws Exception{
  addReceivers(receivers);
  var workers=new ThreadPoolExecutor(16,16,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(64));
  workers.prestartAllCoreThreads();
  long begin=System.nanoTime(),duration=TimeUnit.SECONDS.toNanos(seconds),sqlStart=sql.calls.sum();
  Stats stats=new Stats(begin,duration);int peakQueue=0;String failure=null;boolean terminated=false;
  try{
   for(int i=0;i<seconds*rps;i++){
    if(stats.failures.get()>0||wsErrors.get()>0){failure="Unexpected HTTP/WS failure";break;}
    long due=begin+(long)i*1_000_000_000L/rps;
    while(System.nanoTime()-due<0)LockSupport.parkNanos(Math.min(20_000_000,due-System.nanoTime()));
    long submittedAt=System.nanoTime();stats.timing.submitted(due,submittedAt);
    try{workers.execute(()->request(stats,due,submittedAt));}
    catch(RejectedExecutionException e){stats.timing.rejected();failure="Driver worker queue rejected a request";break;}
    peakQueue=Math.max(peakQueue,workers.getQueue().size());
    if(i%(rps*5)==0){sample(name);save();}
   }
   // Observe the entire intended window; do not divide by the last dispatch time.
   if(failure==null)while(System.nanoTime()-begin<duration)LockSupport.parkNanos(Math.min(20_000_000,duration-(System.nanoTime()-begin)));
  }catch(Exception e){failure=e.getClass().getSimpleName()+": "+e.getMessage();}
  finally{
   workers.shutdown();terminated=workers.awaitTermination(15,TimeUnit.SECONDS);
   if(!terminated){workers.shutdownNow();terminated=workers.awaitTermination(5,TimeUnit.SECONDS);failure="Driver exceeded drain deadline";}
  }
  long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while(!pending.isEmpty()&&System.nanoTime()<deadline)Thread.sleep(50);
  var result=new LinkedHashMap<String,Object>();result.put("name",name);result.put("seconds",seconds);result.put("offeredRps",rps);result.put("receivers",receivers);result.put("plannedRequests",seconds*rps);result.put("requests",stats.requests.sum());result.putAll(stats.timing.snapshot(System.nanoTime()));result.put("status",stats.status);result.put("peakInflight",stats.peak.get());result.put("observedPeakDriverQueue",peakQueue);result.put("driverWorkersTerminated",terminated);result.put("failure",failure);result.put("sqlMapperCalls",sql.calls.sum()-sqlStart);result.put("broadcastDelivery",distribution(stats.delivery));var routes=new TreeMap<String,Object>();stats.latency.forEach((route,values)->routes.put(route,distribution(values)));result.put("routes",routes);stages.add(result);sample(name+"-recovery");save();
  assertNull(failure,"Incomplete load stage; inspect its persisted report");assertTrue(terminated);assertEquals((long)seconds*rps,stats.requests.sum());
  assertEquals(0L,result.get("driverRejectedRequests"));assertEquals(0L,result.get("submittedAfterWindow"),"Driver could not sustain the configured offered load");assertEquals(0L,result.get("unfinishedRequests"));
  assertEquals(0,stats.failures.get(),"Normal-workload HTTP failures, including 429, must not be counted as capacity");assertTrue(pending.isEmpty(),"All acknowledged messages must reach each subscribed receiver");assertEquals(0,wsErrors.get());
  System.out.println("PERF_SEC_LOAD_STAGE "+name+" requests="+stats.requests.sum()+" receivers="+receivers+" windowSuccessRps="+result.get("windowSuccessRps")+" overallSuccessRpsIncludingDrain="+result.get("overallSuccessRpsIncludingDrain"));
 }
 @Test @Timeout(value=2400,unit=TimeUnit.SECONDS)
 void mixedTrafficAndBroadcastStayBounded()throws Exception{
  String duration=System.getenv().getOrDefault("PERF_SEC_SOAK_SECONDS","30");assertTrue(Set.of("30","1800").contains(duration),"Only bounded smoke or 30-minute soak permitted");started=System.nanoTime();
  try{seed();sample("seeded");stage("warmup",10,10,8);stage("step-10",15,10,16);stage("step-30",15,30,32);stage("step-60",15,60,64);stage("soak",Integer.parseInt(duration),8,64);Thread.sleep(3000);sample("idle-recovery");assertTrue(pending.isEmpty());completed=true;
  }finally{save();for(var s:sessions)if(s.isConnected())s.disconnect();if(stomp!=null)stomp.stop();System.out.println("PERF_SEC_LOAD_REPORT "+report);}
 }
}
