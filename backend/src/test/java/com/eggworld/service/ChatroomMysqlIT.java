package com.eggworld.service;

import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/** Opt-in real MySQL integration test on isolated 127.0.0.1:3307 only. */
@SpringJUnitConfig(ChatroomMysqlIT.Config.class)
@EnabledIfEnvironmentVariable(named="CHATROOM_MYSQL_IT",matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ChatroomMysqlIT {
 static final Path EXTERNAL=Path.of("D:/CodexData/local/eggworld/team-security-test");
 static final String URL="jdbc:mysql://127.0.0.1:3307/?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8&serverTimezone=Asia/Tokyo";
 static String database;
 @Configuration(proxyBeanMethods=false) @EnableTransactionManagement(proxyTargetClass=true)
 @MapperScan("com.eggworld.mapper")
 @Import({ChatPermissionService.class,ChatRetentionService.class,ChatMessageService.class})
 static class Config {
  @Bean DataSource dataSource() throws Exception {
   Properties p=new Properties();try(var r=Files.newBufferedReader(EXTERNAL.resolve("mysql.properties"),StandardCharsets.UTF_8)){p.load(r);}
   assertEquals(URL,p.getProperty("url"));
   var ds=new DriverManagerDataSource(URL,p.getProperty("user"),p.getProperty("password"));
   try(var c=ds.getConnection();var st=c.createStatement()){
    try(var r=st.executeQuery("SELECT @@port,@@datadir")){assertTrue(r.next());assertEquals(3307,r.getInt(1));assertEquals("d:/codexdata/local/eggworld/mysql-data/",r.getString(2).replace('\\','/').toLowerCase(Locale.ROOT));}
    database="eggworld_chatroom_"+UUID.randomUUID().toString().replace("-","");
    st.execute("CREATE DATABASE `"+database+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    c.setCatalog(database);
    String init=Files.readString(Path.of("sql/init.sql"),StandardCharsets.UTF_8)
      .replaceFirst("(?s)CREATE DATABASE IF NOT EXISTS eggworld.*?;","").replace("USE eggworld;","")
      .replaceAll("(?s)-- ={10,}\\s*\\r?\\n-- 19\\. 成就特效系统.*?(?=-- ={10,}\\s*\\r?\\n-- 初始数据说明)", "");
    ScriptUtils.executeSqlScript(c,new org.springframework.core.io.support.EncodedResource(new ByteArrayResource(init.getBytes(StandardCharsets.UTF_8)),StandardCharsets.UTF_8));
    String migration=Files.readString(Path.of("sql/migrate-chatroom.sql"),StandardCharsets.UTF_8);
    assertFalse(java.util.regex.Pattern.compile("(?im)^\\s*(?:USE|DROP|TRUNCATE|ALTER)\\s+").matcher(migration).find());
    ScriptUtils.executeSqlScript(c,new org.springframework.core.io.support.EncodedResource(new ByteArrayResource(migration.getBytes(StandardCharsets.UTF_8)),StandardCharsets.UTF_8));
    assertEquals(database,c.getCatalog());
   }
   ds.setUrl(URL.replace("3307/?","3307/"+database+"?"));
   return ds;
  }
  @Bean ChatRealtimePublisher realtimePublisher(){return org.mockito.Mockito.mock(ChatRealtimePublisher.class);}
  @Bean ChatOnlineRewardService onlineRewardService(){return org.mockito.Mockito.mock(ChatOnlineRewardService.class);}
  @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
  @Bean PlatformTransactionManager txm(DataSource ds){return new DataSourceTransactionManager(ds);}
  @Bean com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean sqlSessionFactory(DataSource ds)throws Exception{
   var f=new MybatisSqlSessionFactoryBean();f.setDataSource(ds);
   var c=new com.baomidou.mybatisplus.core.MybatisConfiguration();c.setMapUnderscoreToCamelCase(true);f.setConfiguration(c);return f;
  }
 }
 @Autowired JdbcTemplate jdbc;
 @Autowired ChatConversationMapper conversationMapper;
 @Autowired ChatConversationMemberMapper memberMapper;
 @Autowired ChatMessageMapper messageMapper;
 @Autowired TaskClaimMapper claimMapper;
 @Autowired ChatMessageArchiveMapper archiveMapper;
 @Autowired ChatPermissionService permissionService;
 @Autowired ChatRetentionService retentionService;
 @Autowired ChatMessageService chatService;
 @Autowired PlatformTransactionManager txm;

 long user(String email){jdbc.update("INSERT INTO users(nickname,email,password_hash) VALUES(?,?,?)",email,email,"x");return jdbc.queryForObject("SELECT id FROM users WHERE email=?",Long.class,email);}
 long conversation(String key,String type){jdbc.update("INSERT INTO chat_conversations(type,title,channel_key,visibility,status,member_count) VALUES(?,?,?,?,?,0)",type,key,key,"official","active");return jdbc.queryForObject("SELECT id FROM chat_conversations WHERE channel_key=?",Long.class,key);}
 void member(long c,long u){jdbc.update("INSERT INTO chat_conversation_members(conversation_id,user_id,role,status,last_read_message_id,unread_count,mention_unread,notification_mode,pinned) VALUES(?,?,'member','active',0,0,0,'all',0)",c,u);}


 @Test void readableJoinRejectsRevokedMembershipBannedUserAndClosedConversation() {
  long u=user("join-reader@example.invalid");long c=conversation("join-permission","channel");member(c,u);
  assertEquals(1,memberMapper.selectReadableConversation(c,u));
  assertDoesNotThrow(()->permissionService.requireReadableConversation(c,u));
  jdbc.update("UPDATE chat_conversation_members SET status='left' WHERE conversation_id=? AND user_id=?",c,u);
  assertNull(memberMapper.selectReadableConversation(c,u));
  assertThrows(com.eggworld.common.BusinessException.class,()->permissionService.requireReadableConversation(c,u));
  jdbc.update("UPDATE chat_conversation_members SET status='active' WHERE conversation_id=? AND user_id=?",c,u);
  jdbc.update("UPDATE users SET banned=1 WHERE id=?",u);
  assertNull(memberMapper.selectReadableConversation(c,u));
  jdbc.update("UPDATE users SET banned=0 WHERE id=?",u);
  jdbc.update("UPDATE chat_conversations SET status='archived' WHERE id=?",c);
  assertNull(memberMapper.selectReadableConversation(c,u));
  jdbc.update("UPDATE chat_conversations SET status='active' WHERE id=?",c);
  assertEquals(1,memberMapper.selectReadableConversation(c,u));
  assertNull(memberMapper.selectReadableConversation(c,Long.MAX_VALUE));
  assertNull(memberMapper.selectReadableConversation(Long.MAX_VALUE,u));
  assertThrows(com.eggworld.common.BusinessException.class,()->permissionService.requireReadableConversation(null,u));
  assertThrows(com.eggworld.common.BusinessException.class,()->permissionService.requireReadableConversation(c,null));
 }

 @Test void readableJoinRejectsLogicallyDeletedAccountImmediately() {
  long u=user("deleted-reader@example.invalid");long c=conversation("deleted-reader","channel");member(c,u);
  assertDoesNotThrow(()->permissionService.requireReadableConversation(c,u));
  jdbc.update("UPDATE users SET deleted=1 WHERE id=?",u);
  assertNull(memberMapper.selectReadableConversation(c,u),"Custom JOIN must preserve the normal mapper's logical-delete guard");
  assertThrows(com.eggworld.common.BusinessException.class,()->permissionService.requireReadableConversation(c,u));
  jdbc.update("UPDATE users SET deleted=0 WHERE id=?",u);
  assertDoesNotThrow(()->permissionService.requireReadableConversation(c,u));
 }

 @Test void migrationCreatesAllTablesAndSeeds(){
  assertEquals(15,jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=? AND table_name LIKE 'chat_%'",Integer.class,database));
  assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversations WHERE type='channel' AND channel_key='campus-hall'",Integer.class));
  assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM chat_sensitive_words",Integer.class) >= 0);
 }
 @Test void messageUnreadAndArchiveFlow(){
  long u=user("a@example.invalid"),v=user("b@example.invalid");long c=conversation("test-channel","channel");member(c,u);member(c,v);
  jdbc.update("INSERT INTO chat_messages(conversation_id,sender_id,content,status,client_msg_id) VALUES(?,?,?,'normal','c1')",c,u,"你好");
  long id=jdbc.queryForObject("SELECT id FROM chat_messages WHERE client_msg_id='c1'",Long.class);
  jdbc.update("UPDATE chat_conversation_members SET unread_count=1,mention_unread=0 WHERE conversation_id=? AND user_id=?",c,v);
  assertEquals(1,jdbc.queryForObject("SELECT unread_count FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,c,v));
  jdbc.update("UPDATE chat_messages SET created_at=NOW()-INTERVAL 200 DAY WHERE id=?",id);
  assertEquals(1,retentionService.archiveAndDeleteOnce());
  assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM chat_messages WHERE id=?",Integer.class,id));
  assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM chat_messages_archive WHERE id=?",Integer.class,id));
 }
 @Test void bulkUnreadPreservesSenderAndInactiveMemberAndMentions(){
  long sender=user("bulk-s@example.invalid"),receiver=user("bulk-r@example.invalid"),left=user("bulk-left@example.invalid");
  long c=conversation("bulk-unread","group");member(c,sender);member(c,receiver);member(c,left);
  jdbc.update("UPDATE chat_conversation_members SET status='left' WHERE conversation_id=? AND user_id=?",c,left);
  assertEquals(1,memberMapper.incrementUnread(c,sender,List.of(receiver,left)));
  assertEquals(1,memberMapper.incrementUnread(c,sender,List.of()));
  assertEquals(0,jdbc.queryForObject("SELECT unread_count FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,c,sender));
  assertEquals(0,jdbc.queryForObject("SELECT unread_count FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,c,left));
  assertEquals(2,jdbc.queryForObject("SELECT unread_count FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,c,receiver));
  assertEquals(1,jdbc.queryForObject("SELECT mention_unread FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,c,receiver));
 }
 @Test void concurrentBulkUnreadDoesNotLoseUpdates() throws Exception {
  long sender=user("race-s@example.invalid"),receiver=user("race-r@example.invalid");
  long c=conversation("race-unread","group");member(c,sender);member(c,receiver);
  var pool=java.util.concurrent.Executors.newFixedThreadPool(8);
  try {
   var tasks=new ArrayList<java.util.concurrent.Callable<Void>>();
   for(int i=0;i<40;i++)tasks.add(()->{new TransactionTemplate(txm).executeWithoutResult(st->memberMapper.incrementUnread(c,sender,List.of(receiver)));return null;});
   for(var future:pool.invokeAll(tasks))future.get(30,java.util.concurrent.TimeUnit.SECONDS);
  }finally{pool.shutdownNow();}
  assertEquals(40,jdbc.queryForObject("SELECT unread_count FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,c,receiver));
  assertEquals(40,jdbc.queryForObject("SELECT mention_unread FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,c,receiver));
 }
 @Test void taskClaimAggregationUsesSelectedActiveStatusesAndSeparatesTasks(){
  long owner=user("agg-owner@example.invalid");
  jdbc.update("INSERT INTO tasks(title,task_type,publisher_id) VALUES('agg-one','team',?),('agg-two','team',?)",owner,owner);
  var ids=jdbc.queryForList("SELECT id FROM tasks WHERE publisher_id=? ORDER BY id",Long.class,owner);
  String[] statuses={"in_progress","submitted","completed","cancelled","pending_pairing"};
  for(int i=0;i<statuses.length;i++){
   long u=user("agg-"+i+"@example.invalid");
   jdbc.update("INSERT INTO task_claims(task_id,claimer_id,status,selected) VALUES(?,?,?,?)",ids.get(0),u,statuses[i],i==4?0:1);
  }
  long u=user("agg-other@example.invalid");
  jdbc.update("INSERT INTO task_claims(task_id,claimer_id,status,selected) VALUES(?,?,'in_progress',0)",ids.get(1),u);
  var results=claimMapper.countForTasks(ids,TaskService.SELECTED_STATUSES);
  var byId=results.stream().collect(java.util.stream.Collectors.toMap(com.eggworld.dto.TaskClaimCounts::getTaskId,x->x));
  assertEquals(5,byId.get(ids.get(0)).getClaimCount());assertEquals(3,byId.get(ids.get(0)).getMemberCount());
  assertEquals(1,byId.get(ids.get(1)).getClaimCount());assertEquals(0,byId.get(ids.get(1)).getMemberCount());
 }
 @Test void duplicateClientIdIsRejectedByUniqueKey(){
  long u=user("dup@example.invalid");long c=conversation("dup-channel","channel");member(c,u);
  jdbc.update("INSERT INTO chat_messages(conversation_id,sender_id,content,status,client_msg_id) VALUES(?,?,?,'normal','same')",c,u,"一");
  assertThrows(Exception.class,()->jdbc.update("INSERT INTO chat_messages(conversation_id,sender_id,content,status,client_msg_id) VALUES(?,?,?,'normal','same')",c,u,"二"));
 }

 @Test void officialMembershipBatchPreservesStateAndIsIdempotent(){
  long u=user("official-batch@example.invalid");
  long active=conversation("official-active","channel"),left=conversation("official-left","channel"),missing=conversation("official-new","channel");
  long inactive=conversation("official-inactive","channel"),group=conversation("official-group","group");
  member(active,u);member(left,u);
  jdbc.update("UPDATE chat_conversation_members SET status='left',left_at=NOW(),unread_count=9,mention_unread=2,pinned=1,notification_mode='muted',muted_until='2099-01-01' WHERE conversation_id=? AND user_id=?",left,u);
  jdbc.update("UPDATE chat_conversations SET member_count=1 WHERE id IN (?,?)",active,left);
  jdbc.update("UPDATE chat_conversations SET status='archived' WHERE id=?",inactive);
  try {
   var first=chatService.listConversations(u);var second=chatService.listConversations(u);
   for(long c:List.of(active,left,missing)){
    assertTrue(first.stream().anyMatch(v->v.getId()==c));assertTrue(second.stream().anyMatch(v->v.getId()==c));
    assertEquals(1,jdbc.queryForObject("SELECT member_count FROM chat_conversations WHERE id=?",Integer.class,c));
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversation_members WHERE conversation_id=? AND user_id=? AND status='active'",Integer.class,c,u));
   }
   assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversation_members WHERE conversation_id IN (?,?) AND user_id=?",Integer.class,inactive,group,u));
   var m=jdbc.queryForMap("SELECT left_at,unread_count,mention_unread,pinned,notification_mode,muted_until FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",left,u);
   assertNull(m.get("left_at"));assertEquals(9,m.get("unread_count"));assertEquals(2,m.get("mention_unread"));
   assertEquals("muted",m.get("notification_mode"));assertNotNull(m.get("muted_until"));
   assertEquals(1,jdbc.queryForObject("SELECT pinned FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,left,u));
  } finally {
   jdbc.update("UPDATE chat_conversations SET status='archived' WHERE id IN (?,?,?,?,?)",active,left,missing,inactive,group);
  }
 }
 @Test @Timeout(30) void concurrentFirstOfficialVisitReturnsMembershipAndCountsOnce() throws Exception {
  long u=user("official-race@example.invalid");
  long c=conversation("official-race-one","channel"),d=conversation("official-race-two","channel");
  var pool=java.util.concurrent.Executors.newFixedThreadPool(8);
  var start=new java.util.concurrent.CountDownLatch(1);
  try{
   var jobs=new ArrayList<java.util.concurrent.Future<List<com.eggworld.dto.ChatConversationVO>>>();
   for(int i=0;i<8;i++) jobs.add(pool.submit(()->{start.await();return chatService.listConversations(u);}));
   start.countDown();
   for(var job:jobs){var result=job.get(20,java.util.concurrent.TimeUnit.SECONDS);
    assertTrue(result.stream().anyMatch(v->v.getId()==c));assertTrue(result.stream().anyMatch(v->v.getId()==d));}
   chatService.ensureOfficialChannelMembership(u);
   for(long id:List.of(c,d)){
    assertEquals(1,jdbc.queryForObject("SELECT member_count FROM chat_conversations WHERE id=?",Integer.class,id));
    assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversation_members WHERE conversation_id=? AND user_id=?",Integer.class,id,u));
   }
  }finally{pool.shutdownNow();pool.awaitTermination(5,java.util.concurrent.TimeUnit.SECONDS);
   jdbc.update("UPDATE chat_conversations SET status='archived' WHERE id IN (?,?)",c,d);}
 }
 @Test @Timeout(30) void concurrentDifferentOfficialMembersDoNotLoseCounts() throws Exception {
  long c=conversation("official-different-users","channel");
  var users=new ArrayList<Long>();for(int i=0;i<8;i++)users.add(user("official-different-"+i+"@example.invalid"));
  var pool=java.util.concurrent.Executors.newFixedThreadPool(8);var start=new java.util.concurrent.CountDownLatch(1);
  try{
   var jobs=new ArrayList<java.util.concurrent.Future<?>>();
   for(long u:users)jobs.add(pool.submit(()->{start.await();chatService.ensureOfficialChannelMembership(u);return null;}));
   start.countDown();for(var job:jobs)job.get(20,java.util.concurrent.TimeUnit.SECONDS);
   assertEquals(8,jdbc.queryForObject("SELECT member_count FROM chat_conversations WHERE id=?",Integer.class,c));
   assertEquals(8,jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversation_members WHERE conversation_id=?",Integer.class,c));
  }finally{pool.shutdownNow();pool.awaitTermination(5,java.util.concurrent.TimeUnit.SECONDS);
   jdbc.update("UPDATE chat_conversations SET status='archived' WHERE id=?",c);}
 }
 @Test void failedOfficialCountUpdateRollsBackMembershipFromListEntryPoint(){
  long u=user("official-rollback@example.invalid"),c=conversation("official-rollback","channel");
  // This trigger only exists in the guarded, randomly named local fixture schema.
  jdbc.execute("CREATE TRIGGER reject_official_count BEFORE UPDATE ON chat_conversations FOR EACH ROW BEGIN IF NEW.id="+c+" AND NEW.member_count>OLD.member_count THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture count failure'; END IF; END");
  try{
   assertThrows(org.springframework.dao.DataAccessException.class,()->chatService.listConversations(u));
   assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversation_members WHERE user_id=?",Integer.class,u));
   assertEquals(0,jdbc.queryForObject("SELECT member_count FROM chat_conversations WHERE id=?",Integer.class,c));
  }finally{jdbc.execute("DROP TRIGGER reject_official_count");jdbc.update("UPDATE chat_conversations SET status='archived' WHERE id=?",c);}
 }

 @Test @EnabledIfEnvironmentVariable(named="PERF_SEC_MICROBENCH",matches="true")
 @Timeout(180)
 void unreadUpdateMicrobenchmark() {
  // 仅测本机隔离库的未读子操作；不是 HTTP、广播、整站容量或可支持在线人数。
  for(int receivers:List.of(50,100,500)){
   long sender=user("bench-s-"+receivers+"@example.invalid");long c=conversation("bench-"+receivers,"group");member(c,sender);
   for(int i=0;i<receivers;i++)member(c,user("bench-"+receivers+"-"+i+"@example.invalid"));
   List<Double> oldMs=new ArrayList<>(),bulkMs=new ArrayList<>();
   for(int round=0;round<35;round++){
    for(boolean bulk:(round%2==0?List.of(false,true):List.of(true,false))){
     long started=System.nanoTime();
     new TransactionTemplate(txm).executeWithoutResult(st->{
      if(bulk)assertEquals(receivers,memberMapper.incrementUnread(c,sender,List.of()));
      else{
       var members=memberMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ChatConversationMember>()
        .eq(ChatConversationMember::getConversationId,c).eq(ChatConversationMember::getStatus,"active"));
       for(var m:members)if(!m.getUserId().equals(sender))memberMapper.update(null,
        new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<ChatConversationMember>()
        .eq(ChatConversationMember::getId,m.getId()).setSql("unread_count=unread_count+1").setSql("mention_unread=mention_unread+0"));
      }
     });
     double ms=(System.nanoTime()-started)/1_000_000.0;assertTrue(ms<5000,"Stop: local operation exceeded five seconds");
     if(round>=5)(bulk?bulkMs:oldMs).add(ms);
    }
   }
   assertEquals(receivers,jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversation_members WHERE conversation_id=? AND user_id<>? AND unread_count=70",Integer.class,c,sender));
   printSamples("row-by-row",receivers,receivers+1,oldMs);printSamples("bulk",receivers,1,bulkMs);
  }
 }
 void printSamples(String strategy,int receivers,int sqlPerOp,List<Double> samples){
  Collections.sort(samples);double total=samples.stream().mapToDouble(x->x).sum();
  System.out.printf(Locale.ROOT,"PERF_SEC_BENCH strategy=%s receivers=%d samples=%d sql_per_op=%d mean_ms=%.3f p95_ms=%.3f p99_ms=%.3f serial_ops_s=%.3f%n",
   strategy,receivers,samples.size(),sqlPerOp,total/samples.size(),samples.get((int)Math.ceil(samples.size()*.95)-1),samples.get((int)Math.ceil(samples.size()*.99)-1),1000*samples.size()/total);
 }
}





