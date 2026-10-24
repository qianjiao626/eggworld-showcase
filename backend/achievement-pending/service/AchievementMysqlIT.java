package com.eggworld.service;

import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.*;
import com.eggworld.entity.*;
import com.eggworld.mapper.*;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.core.io.ByteArrayResource;
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
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Opt-in: creates a NEW random database on the guarded local 3307 instance.
 * Never reads application profiles, never writes the original local/production database.
 * Retained synthetic database and file evidence support subsequent browser acceptance.
 */
@SpringJUnitConfig(AchievementMysqlIT.Config.class)
@EnabledIfEnvironmentVariable(named="ACHIEVEMENT_MYSQL_IT", matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AchievementMysqlIT {
 static final Path EXTERNAL=Path.of("D:/CodexData/local/eggworld/team-security-test");
 static final String URL="jdbc:mysql://127.0.0.1:3307/?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8&serverTimezone=Asia/Tokyo";
 static String database;
 @Configuration(proxyBeanMethods=false) @EnableTransactionManagement(proxyTargetClass=true)
 @MapperScan("com.eggworld.mapper")
 @Import({AchievementService.class,DecoService.class,CheckinService.class,PointService.class,TaskService.class,ClaimService.class,InviteService.class,RatingService.class,GossipService.class,ComplaintService.class,AdminService.class})
 static class Config {
  @Bean DataSource dataSource() throws Exception {
   Properties p=new Properties();try(var r=Files.newBufferedReader(EXTERNAL.resolve("mysql.properties"),StandardCharsets.UTF_8)){p.load(r);}
   assertEquals(URL,p.getProperty("url"));
   var ds=new DriverManagerDataSource(URL,p.getProperty("user"),p.getProperty("password"));
   try(var c=ds.getConnection();var st=c.createStatement()){
    try(var r=st.executeQuery("SELECT @@port,@@datadir")){assertTrue(r.next());assertEquals(3307,r.getInt(1));assertEquals("d:/codexdata/local/eggworld/mysql-data/",r.getString(2).replace('\\','/').toLowerCase(Locale.ROOT));}
    database="eggworld_achievement_"+UUID.randomUUID().toString().replace("-","");
    st.execute("CREATE DATABASE `"+database+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    c.setCatalog(database);
    String sql=Files.readString(Path.of("sql/init.sql"),StandardCharsets.UTF_8);
    sql=sql.replaceFirst("(?s)CREATE DATABASE IF NOT EXISTS eggworld.*?;", "").replace("USE eggworld;", "");
    assertFalse(sql.matches("(?si).*\\b(?:USE|CREATE DATABASE)\\s+eggworld.*"));
    assertEquals(database,c.getCatalog());
    ScriptUtils.executeSqlScript(c,new org.springframework.core.io.support.EncodedResource(new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8));
    ScriptUtils.executeSqlScript(c,new org.springframework.core.io.support.EncodedResource(new org.springframework.core.io.FileSystemResource("sql/migrate-task-revisions.sql"), StandardCharsets.UTF_8));
   }
   ds.setUrl(URL.replace("3307/?","3307/"+database+"?"));
   Files.writeString(EXTERNAL.resolve("achievement-database.txt"),database);
   System.out.println("ACHIEVEMENT_SAFE_DATABASE="+database);
   return ds;
  }
  @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
  @Bean PlatformTransactionManager transactionManager(DataSource ds){return new DataSourceTransactionManager(ds);}
  @Bean SqlSessionFactory sqlSessionFactory(DataSource ds)throws Exception{
   var f=new MybatisSqlSessionFactoryBean();f.setDataSource(ds);
   var c=new com.baomidou.mybatisplus.core.MybatisConfiguration();c.setMapUnderscoreToCamelCase(true);f.setConfiguration(c);return f.getObject();
  }
  @Bean UserService userService(){return mock(UserService.class);}
  @Bean com.fasterxml.jackson.databind.ObjectMapper objectMapper(){return new com.fasterxml.jackson.databind.ObjectMapper();}
  @Bean FaultNotices notificationService(NotificationMapper n,UserMapper u){return new FaultNotices(n,u);}
 }
 static class FaultNotices extends NotificationService {
  volatile boolean fail;
  public void setFail(boolean value){fail=value;}
  FaultNotices(NotificationMapper n,UserMapper u){super(n,u);}
  @Override public void notify(Long id,String text,String type){super.notify(id,text,type);if(fail && "achievement".equals(type))throw new IllegalStateException("injected-achievement-failure-after-insert");}
 }
 @Autowired JdbcTemplate jdbc;
 @Autowired DataSource ds;
 @Autowired AchievementService ach;
 @Autowired DecoService deco;
 @Autowired UserMapper users;
 @Autowired UserEquipMapper equips;
 @Autowired TaskMapper tasks;
 @Autowired TaskClaimMapper claims;
 @Autowired UserPurgeMapper purge;
 @Autowired CheckinService checkin;
 @Autowired TaskService taskService;
 @Autowired ClaimService claimService;
 @Autowired RatingService ratingService;
 @Autowired GossipService gossipService;
 @Autowired ComplaintService complaintService;
 @Autowired AdminService adminService;
 @Autowired PlatformTransactionManager txm;
 @Autowired FaultNotices notices;
 @AfterEach void resetFailure(){notices.setFail(false);}
 long user(){var u=new User();String name="ach_"+UUID.randomUUID().toString().replace("-","");u.setNickname(name);u.setEmail(name+"@example.invalid");u.setPasswordHash("synthetic-no-login");users.insert(u);jdbc.update("INSERT INTO user_stats(user_id) VALUES (?)",u.getId());return u.getId();}
 int count(String sql,Object... args){return jdbc.queryForObject(sql,Integer.class,args);}
 void unlocked(long u,String key){assertEquals(1,count("SELECT COUNT(*) FROM user_achievements ua JOIN achievements a ON a.id=ua.ach_id WHERE ua.user_id=? AND a.ach_key=?",u,key),key);}
 EquipDTO equip(String slot,String key){var d=new EquipDTO();d.setSlot(slot);d.setKey(key);return d;}
 long task(long publisher,String type,String status){Task t=new Task();t.setTitle("Synthetic achievement test");t.setTaskType(type);t.setPublisherId(publisher);t.setStatus(status);t.setReward(10);t.setSkillCategory("study");tasks.insert(t);return t.getId();}
 void claim(long task,long user,String status){var c=new TaskClaim();c.setTaskId(task);c.setClaimerId(user);c.setStatus(status);c.setSelected(1);claims.insert(c);}
 void grantAll(long user){jdbc.update("INSERT INTO user_achievements(user_id,ach_id) SELECT ?,id FROM achievements",user);}

 @Test void seedsAndRepeatableMigrationPreserveUserData()throws Exception{
  assertEquals("早起的蛋",jdbc.queryForObject("SELECT name FROM titles WHERE title_key='t-newbie'",String.class));
  assertEquals(24,count("SELECT COUNT(*) FROM titles"));assertEquals(30,count("SELECT COUNT(*) FROM achievements"));
  long u=user();grantAll(u);deco.equip(u,equip("aura","a-moon"));
  jdbc.update("UPDATE achievements SET cond_value=400,sort_order=901,enabled=0 WHERE ach_key='ach_meta_days_365'");
  String migration=Files.readString(Path.of("sql/migrate-achievement.sql"),StandardCharsets.UTF_8);
  assertFalse(java.util.regex.Pattern.compile("(?im)^\\s*(?:USE|CREATE\\s+DATABASE)\\s+").matcher(migration).find(),"incremental migration must never switch databases");
  try(var c=ds.getConnection()){
   assertEquals(database,c.getCatalog());
   ScriptUtils.executeSqlScript(c,new org.springframework.core.io.support.EncodedResource(new ByteArrayResource(migration.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8));
   try(var stmt=c.createStatement();var rs=stmt.executeQuery("SELECT DATABASE()")){assertTrue(rs.next());assertEquals(database,rs.getString(1));}
  }
  assertEquals(400,count("SELECT cond_value FROM achievements WHERE ach_key='ach_meta_days_365'"));assertEquals(901,count("SELECT sort_order FROM achievements WHERE ach_key='ach_meta_days_365'"));assertEquals(0,count("SELECT enabled FROM achievements WHERE ach_key='ach_meta_days_365'"));
  jdbc.update("UPDATE achievements SET cond_value=365,sort_order=830,enabled=1 WHERE ach_key='ach_meta_days_365'");
  assertEquals(30,count("SELECT COUNT(*) FROM user_achievements WHERE user_id=?",u));assertEquals("a-moon",deco.getEquip(u).getAura());assertEquals(100,users.selectById(u).getPoints());
 }
 @Test void firstCheckinAndStreakAndBrokenStreak(){
  long u=user();checkin.checkin(u);unlocked(u,"ach_checkin_1");
  LocalDate today=LocalDate.now(CheckinService.CHECKIN_ZONE);
  for(int i=1;i<7;i++)jdbc.update("INSERT INTO daily_checkins(user_id,check_date) VALUES (?,?)",u,today.minusDays(i));
  ach.evaluate(u,"checkin");unlocked(u,"ach_checkin_streak_7");
  long broken=user();for(int i:new int[]{0,1,3,4,5,6,7})jdbc.update("INSERT INTO daily_checkins(user_id,check_date) VALUES (?,?)",broken,today.minusDays(i));
  ach.evaluate(broken,"checkin");assertEquals(0,count("SELECT COUNT(*) FROM user_achievements ua JOIN achievements a ON a.id=ua.ach_id WHERE ua.user_id=? AND a.ach_key='ach_checkin_streak_7'",broken));
  assertEquals(2,ach.listForUser(broken).stream().filter(v->"ach_checkin_streak_7".equals(v.getAchKey())).findFirst().orElseThrow().getProgress());
 }
 @Test void thirdCumulativeCheckinGrantsCloudFrameAndTitle(){
  long u=user();LocalDate today=LocalDate.now(CheckinService.CHECKIN_ZONE);
  for(int days:new int[]{2,4})jdbc.update("INSERT INTO daily_checkins(user_id,check_date) VALUES (?,?)",u,today.minusDays(days));
  ach.evaluate(u,"checkin");assertFalse(ach.loadUnlockedKeys(u).effects.contains("f-cloud"));
  checkin.checkin(u);unlocked(u,"ach_checkin_3");
  assertTrue(ach.loadUnlockedKeys(u).effects.contains("f-cloud"));assertTrue(ach.loadUnlockedKeys(u).titles.contains("t-newbie"));
 }
 @Test void publicationAndBothCompletionParticipants(){
  long u=user(),v=user();var dto=new PublishTaskDTO();dto.setTitle("Achievement publishing");dto.setTaskType("teach");dto.setSkillCategory("study");dto.setReward(10);dto.setSignupDeadline(LocalDateTime.now().plusDays(1));dto.setCompleteDeadline(LocalDateTime.now().plusDays(3));
  long t=taskService.publish(u,dto);unlocked(u,"ach_publish_1");
  jdbc.update("UPDATE tasks SET status='in_progress' WHERE id=?",t);claim(t,v,"submitted");claimService.confirm(u,t);
  unlocked(u,"ach_complete_1");unlocked(v,"ach_complete_1");
 }
 @Test void fiveStarsQualityAdoptionInviteComplaintAndTeam(){
  long u=user(),v=user();long t=task(u,"team","completed");claim(t,v,"completed");
  ach.evaluate(u,"team");ach.evaluate(v,"team");unlocked(u,"ach_team_1");unlocked(v,"ach_team_1");
  for(int i=0;i<20;i++){long r=user();jdbc.update("INSERT INTO ratings(task_id,rater_id,ratee_id,score,rater_role,visible,is_auto) VALUES (?,?,?,5,'claimer',1,0)",t,r,u);}
  ach.evaluate(u,"rating");unlocked(u,"ach_rating_five_1");unlocked(u,"ach_rating_quality");
  jdbc.update("INSERT INTO gossip_posts(title,publisher_id) VALUES ('synthetic',?)",v);long post=jdbc.queryForObject("SELECT MAX(id) FROM gossip_posts",Long.class);
  jdbc.update("INSERT INTO gossip_answers(post_id,author_id,content,is_adopted) VALUES (?,?, 'synthetic',1)",post,u);
  jdbc.update("INSERT INTO invite_records(inviter_id,invitee_id,status) VALUES (?,?,'rewarded')",u,v);
  jdbc.update("INSERT INTO school_complaints(school_name,user_id,content,metrics,score) VALUES ('synthetic',?,'synthetic','{}',5)",u);
  ach.evaluate(u,"gossip");ach.evaluate(u,"invite");ach.evaluate(u,"complaint");unlocked(u,"ach_gossip_1");unlocked(u,"ach_invite_1");unlocked(u,"ach_complaint_1");unlocked(u,"ach_meta_cat_4");
 }
 @Test void realRatingAdoptionInviteAndComplaintTriggers(){
  long owner=user(),helper=user();long t=task(owner,"teach","completed");claim(t,helper,"completed");
  var rating=new RateTaskDTO();rating.setRateeId(owner);rating.setScore(5);ratingService.rate(helper,t,rating);unlocked(owner,"ach_rating_five_1");
  var post=new PublishGossipDTO();post.setTitle("Synthetic adoption");post.setDescription("Local fixture");post.setBounty(1);post.setTag("study");
  long postId=gossipService.publish(owner,post);var answer=new GossipAnswerDTO();answer.setContent("Synthetic answer");gossipService.answer(helper,postId,answer);
  long answerId=jdbc.queryForObject("SELECT id FROM gossip_answers WHERE post_id=?",Long.class,postId);gossipService.adopt(owner,postId,answerId);unlocked(helper,"ach_gossip_1");
  jdbc.update("INSERT INTO invite_records(inviter_id,invitee_id,status) VALUES (?,?,'pending')",owner,helper);
  var publication=new PublishTaskDTO();publication.setTitle("Invitation trigger");publication.setTaskType("teach");publication.setSkillCategory("study");publication.setReward(10);publication.setSignupDeadline(LocalDateTime.now().plusDays(1));publication.setCompleteDeadline(LocalDateTime.now().plusDays(3));
  taskService.publish(helper,publication);unlocked(owner,"ach_invite_1");
  var complaint=new SubmitComplaintDTO();complaint.setSchoolName("Synthetic university");complaint.setContent("Synthetic review");var metrics=new HashMap<String,Integer>();ComplaintService.METRIC_KEYS.forEach(k->metrics.put(k,5));complaint.setMetrics(metrics);
  complaintService.submit(helper,complaint);unlocked(helper,"ach_complaint_1");
 }
 @Test void hiddenAutoRatingsDoNotCountAndBelowQualityDoesNotUnlock(){
  long u=user(),v=user(),t=task(v,"teach","completed");
  for(int i=0;i<22;i++){long r=user();jdbc.update("INSERT INTO ratings(task_id,rater_id,ratee_id,score,rater_role,visible,is_auto) VALUES (?,?,?,?,'claimer',?,?)",t,r,u,i<20?4:5,i==20?0:1,i==21?1:0);}
  ach.evaluate(u,"rating");assertTrue(ach.listMine(u).isEmpty());
 }
 @Test void metaTwentyAndRegistrationDays(){
  long u=user();jdbc.update("INSERT INTO user_achievements(user_id,ach_id) SELECT ?,id FROM achievements WHERE category<>'meta' ORDER BY id LIMIT 20",u);
  jdbc.update("UPDATE users SET created_at=DATE_SUB(NOW(),INTERVAL 366 DAY) WHERE id=?",u);new com.eggworld.job.AchievementDailyScheduler(users,ach).scanDaily();unlocked(u,"ach_meta_ach_20");unlocked(u,"ach_meta_days_365");
 }
 @Test void parallelEvaluationIsIdempotentAndNotifiesOnce()throws Exception{
  long u=user();jdbc.update("INSERT INTO daily_checkins(user_id,check_date) VALUES (?,?)",u,LocalDate.now(CheckinService.CHECKIN_ZONE));
  ExecutorService pool=Executors.newFixedThreadPool(2);CyclicBarrier barrier=new CyclicBarrier(2);
  try{var jobs=new ArrayList<Future<?>>();for(int i=0;i<2;i++)jobs.add(pool.submit(()->{try{barrier.await(10,TimeUnit.SECONDS);ach.evaluate(u,"checkin");}catch(Exception e){throw new RuntimeException(e);}}));for(var job:jobs)job.get(30,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
  ach.evaluate(u,"checkin");assertEquals(1,count("SELECT COUNT(*) FROM user_achievements WHERE user_id=?",u));assertEquals(1,count("SELECT COUNT(*) FROM notifications WHERE user_id=? AND type='achievement'",u));
 }
 @Test void sevenSlotsAndUnloadAndUnauthorized(){
  long u=user(),other=user();grantAll(u);
  Map<String,String> keys=new LinkedHashMap<>();keys.put("aura","a-moon");keys.put("cloak","cl-cloth");keys.put("outfit","of-uniform");keys.put("frame","f-rainbow");keys.put("charm","ch-crown");keys.put("title","t-first");keys.put("skin","sk-gold");
  // Use an actual rewarded title from the authoritative seeds.
  keys.put("title",jdbc.queryForObject("SELECT reward_title_key FROM achievements WHERE reward_title_key IS NOT NULL ORDER BY id LIMIT 1",String.class));
  keys.forEach((slot,key)->deco.equip(u,equip(slot,key)));
  var value=equips.selectById(u);assertNotNull(value.getAuraKey());assertNotNull(value.getCloakKey());assertNotNull(value.getOutfitKey());assertNotNull(value.getFrameKey());assertNotNull(value.getCharmKey());assertNotNull(value.getTitleKey());assertNotNull(value.getSkinKey());
  assertThrows(BusinessException.class,()->deco.equip(other,equip("aura","a-moon")));assertThrows(BusinessException.class,()->deco.equip(other,equip("title",keys.get("title"))));
  for(var d:List.of(equip("hat","a-moon"),equip("aura","sk-gold"),equip("aura","<script>alert(1)</script>")))assertThrows(BusinessException.class,()->deco.equip(u,d));
  deco.equip(u,equip("aura",null));assertNull(equips.selectById(u).getAuraKey());assertEquals("cl-cloth",equips.selectById(u).getCloakKey());
 }
 @Test void concurrentDifferentSlotsDoNotOverwrite()throws Exception{
  long u=user();grantAll(u);var pool=Executors.newFixedThreadPool(2);
  try{var a=pool.submit(()->deco.equip(u,equip("aura","a-moon")));var b=pool.submit(()->deco.equip(u,equip("cloak","cl-cloth")));a.get(30,TimeUnit.SECONDS);b.get(30,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
  assertEquals("a-moon",equips.selectById(u).getAuraKey());assertEquals("cl-cloth",equips.selectById(u).getCloakKey());
 }
 @Test void failuresNeverRollBackCheckinPublicationOrCompletion(){
  notices.setFail(true);long u=user(),v=user();assertDoesNotThrow(()->checkin.checkin(u));assertEquals(105,users.selectById(u).getPoints());assertEquals(0,count("SELECT COUNT(*) FROM user_achievements WHERE user_id=?",u));
  var dto=new PublishTaskDTO();dto.setTitle("fail-safe publication");dto.setTaskType("teach");dto.setSkillCategory("study");dto.setReward(10);dto.setSignupDeadline(LocalDateTime.now().plusDays(1));dto.setCompleteDeadline(LocalDateTime.now().plusDays(3));
  long t=assertDoesNotThrow(()->taskService.publish(u,dto));jdbc.update("UPDATE tasks SET status='in_progress' WHERE id=?",t);claim(t,v,"submitted");assertDoesNotThrow(()->claimService.confirm(u,t));assertEquals("completed",tasks.selectById(t).getStatus());
  assertEquals(0,count("SELECT COUNT(*) FROM notifications WHERE user_id=? AND type='achievement'",u));
  notices.setFail(false);ach.evaluate(u,null);unlocked(u,"ach_checkin_1");unlocked(u,"ach_publish_1");unlocked(u,"ach_complete_1");
 }
 @Test void rollbackDoesNotUnlockAndReadCannotAffectOtherUser(){
  long u=user();new TransactionTemplate(txm).executeWithoutResult(status->{jdbc.update("INSERT INTO daily_checkins(user_id,check_date) VALUES (?,?)",u,LocalDate.now(CheckinService.CHECKIN_ZONE));ach.evaluateAfterCommit(u,"checkin");status.setRollbackOnly();});assertTrue(ach.listMine(u).isEmpty());
  checkin.checkin(u);long id=ach.listUnread(u).get(0).getId();ach.markRead(user(),id);assertEquals(1,ach.countUnread(u));ach.markRead(u,id);assertEquals(0,ach.countUnread(u));
 }
 @Test void purgeOrderAndDisabledRewardsRemainOwned(){
  long u=user();checkin.checkin(u);var reward=ach.listMine(u).get(0);jdbc.update("UPDATE achievements SET enabled=0 WHERE ach_key=?",reward.getAchKey());
  try{assertFalse(ach.listMine(u).isEmpty());assertFalse(ach.loadUnlockedKeys(u).effects.isEmpty());}finally{jdbc.update("UPDATE achievements SET enabled=1 WHERE ach_key=?",reward.getAchKey());}
  grantMissing(u);deco.equip(u,equip("aura","a-moon"));adminService.deleteUser(u,user());assertNull(users.selectById(u));assertEquals(0,count("SELECT COUNT(*) FROM user_equip WHERE user_id=?",u));assertEquals(0,count("SELECT COUNT(*) FROM user_achievements WHERE user_id=?",u));
 }
 void grantMissing(long u){jdbc.update("INSERT IGNORE INTO user_achievements(user_id,ach_id) SELECT ?,id FROM achievements",u);}
 @Test void prepareIsolatedBrowserFixtures() throws Exception {
  String hash=new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("AchievementLocalOnly!2026");
  long rich=user(),empty=user(),admin=user();
  jdbc.update("UPDATE users SET email='achievement-rich@example.invalid',nickname='成就验收蛋',password_hash=?,egg_category='life',exp=99999,school='测试大学' WHERE id=?",hash,rich);
  jdbc.update("UPDATE users SET email='achievement-empty@example.invalid',nickname='新同学',password_hash=? WHERE id=?",hash,empty);
  jdbc.update("UPDATE users SET email='achievement-admin@example.invalid',nickname='验收管理员',password_hash=?,role='admin' WHERE id=?",hash,admin);
  grantAll(rich);
  for(var pair:Map.of("aura","a-moon","cloak","cl-cloth","outfit","of-suit","frame","f-cloud","charm","ch-star","title","t-newbie","skin","sk-gold").entrySet()){
   // Use the first actual owned key for each slot; title keys follow the ticket seeds.
   String key=pair.getValue();
   if("title".equals(pair.getKey()))key=ach.loadUnlockedKeys(rich).titles.iterator().next();
   if("charm".equals(pair.getKey()))key=ach.loadUnlockedKeys(rich).effects.stream().filter(k->k.startsWith("ch-")).sorted().findFirst().orElseThrow();
   if("outfit".equals(pair.getKey()))key=ach.loadUnlockedKeys(rich).effects.stream().filter(k->k.startsWith("of-")).sorted().findFirst().orElseThrow();
   deco.equip(rich,equip(pair.getKey(),key));
  }
  for(int i=0;i<50;i++){long u=user();jdbc.update("UPDATE users SET nickname=?,exp=?,egg_category='life' WHERE id=?","榜单验收"+i,5000-i,u);grantAll(u);deco.equip(u,equip("aura","a-moon"));}
  long t=task(rich,"teach","approved");jdbc.update("UPDATE tasks SET signup_deadline=DATE_ADD(NOW(),INTERVAL 3 DAY),complete_deadline=DATE_ADD(NOW(),INTERVAL 5 DAY) WHERE id=?",t);
  long invitee=jdbc.queryForObject("SELECT id FROM users WHERE nickname='榜单验收0'",Long.class);
  deco.equip(invitee,equip("title","t-newbie"));claim(t,invitee,"pending_pairing");
  jdbc.update("INSERT INTO invite_records(inviter_id,invitee_id,status) VALUES (?,?,'rewarded')",rich,invitee);
  jdbc.update("INSERT INTO gossip_posts(title,publisher_id,description) VALUES ('Achievement browser post',?,'Local synthetic fixture')",rich);
  long post=jdbc.queryForObject("SELECT MAX(id) FROM gossip_posts",Long.class);
  jdbc.update("INSERT INTO gossip_answers(post_id,author_id,content) VALUES (?,?, 'Achievement browser answer')",post,invitee);
  jdbc.update("INSERT INTO school_complaints(school_name,user_id,content,metrics,score) VALUES ('测试大学',?,'Achievement browser complaint','{}',5)",rich);
  Files.writeString(EXTERNAL.resolve("achievement-fixtures.json"),"{\"rich\":"+rich+",\"empty\":"+empty+",\"admin\":"+admin+",\"task\":"+t+",\"post\":"+post+",\"invitee\":"+invitee+"}");
 }

}
