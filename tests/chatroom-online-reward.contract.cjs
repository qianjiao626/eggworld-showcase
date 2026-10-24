const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'backend/sql/migrate-chat-online-reward.sql'),'utf8');
const svc=fs.readFileSync(path.join(root,'backend/src/main/java/com/eggworld/service/ChatOnlineRewardService.java'),'utf8');
const retention=fs.readFileSync(path.join(root,'backend/src/main/java/com/eggworld/service/ChatRetentionService.java'),'utf8');
const yml=fs.readFileSync(path.join(root,'backend/src/main/resources/application.yml'),'utf8');
const js=fs.readFileSync(path.join(root,'js/chatroom.js'),'utf8');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');
const msgSvc=fs.readFileSync(path.join(root,'backend/src/main/java/com/eggworld/service/ChatMessageService.java'),'utf8');
const ctrl=fs.readFileSync(path.join(root,'backend/src/main/java/com/eggworld/controller/ChatController.java'),'utf8');

test('online reward migration is additive and cannot destroy data',()=>{
 assert.doesNotMatch(sql,/^\s*(USE|DROP|TRUNCATE|ALTER|DELETE)\b/im);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS chat_online_reward/);
 assert.match(sql,/uk_chat_online_user_date/);
 assert.match(sql,/FOREIGN KEY \(user_id\) REFERENCES users\(id\)/);
});

test('online reward is server-authoritative and never trusts client duration',()=>{
 // 前端只上报「我还在」，不发送时长；服务端用自身时钟算差值
 assert.match(svc,/LocalDateTime\.now\(REWARD_ZONE\)/);
 assert.match(svc,/Duration\.between\(row\.getLastTickAt\(\), now\)/);
 assert.doesNotMatch(ctrl,/elapsedSeconds|clientSeconds|durationSeconds/);
 assert.doesNotMatch(js,/elapsedSeconds|durationSeconds/);
});

test('online reward goes through PointService and never writes balance directly',()=>{
 assert.match(svc,/pointService\.changeBalance\(/);
 // 不允许在奖励服务里直接改用户余额
 assert.doesNotMatch(svc,/user\.setPoints\(/);
 assert.doesNotMatch(svc,/userMapper\.updateById\(/);
});

test('online reward uses a flat 20-coin online cap plus separate message bonus',()=>{
 // 方案 B：在线额度固定 20 币，与稀有度无关；发言加成不占用该额度
 assert.match(svc,/online-cap-coins:20/);
 assert.match(svc,/private int onlineCapCoins/);
 assert.doesNotMatch(svc,/MINUTES_N|MINUTES_R|MINUTES_SR|MINUTES_UNLIMITED/);
 assert.match(svc,/messageBonusDailyLimit/);
 assert.match(yml,/interval-seconds: 120/);
 assert.match(yml,/max-gap-seconds: 300/);
 assert.match(yml,/online-cap-coins: 20/);
 assert.match(yml,/message-bonus-coins: 2/);
 assert.match(yml,/message-bonus-daily-limit: 20/);
 // 每日合计上限 = 20 在线 + 40 发言
 assert.match(svc,/vo\.setDailyCap\(onlineCap \+ bonusCap\)/);
});

test('message bonus runs after commit so it cannot roll back the message',()=>{
 assert.match(msgSvc,/afterCommit\(\)/);
 assert.match(msgSvc,/TransactionSynchronizationManager/);
 assert.match(msgSvc,/onlineRewardService\.rewardMessage\(userId\)/);
});

test('retention keeps only 30 days for channels and direct/group chats',()=>{
 assert.match(retention,/channel-days:30/);
 assert.match(retention,/direct-group-days:30/);
 assert.match(retention,/先归档，再分批清理|归档/);
 // 归档表仍然保留，不是彻底删除
 assert.match(retention,/archiveMapper\.insert/);
});

test('chatroom avatars open the shared user profile modal',()=>{
 assert.match(js,/openSenderProfile/);
 assert.match(js,/window\.showUserEggModal/);
 assert.match(js,/chat-message-avatar/);
 assert.match(js,/chat-conv-avatar/);
 // 不编造资料：找不到弹窗时给出明确提示
 assert.match(js,/暂时无法打开该用户的个人简介/);
});

test('reward loop only runs while the chatroom page is actually visible',()=>{
 assert.match(js,/function chatroomVisible\(\)/);
 assert.match(js,/page-lab/);
 // 2026-09-27 重构：二级侧边栏切除后，可见性按页面级 #page-lab 判断，不再绑子面板
 assert.equal(js.includes('data-lab-panel'),false,'泡点可见性不应再依赖子面板挂载点');
 assert.match(js,/document\.hidden/);
 assert.match(js,/REWARD_IDLE_MS/);
 assert.match(html,/window\.chatroomEnter/);
 assert.match(html,/window\.chatroomLeave/);
});

test('bubble coin display exists and is rendered from server state',()=>{
 assert.match(html,/id="chatroomBubble"/);
 assert.match(html,/id="chatroomBubbleCoins"/);
 assert.match(js,/function renderReward\(/);
 assert.match(js,/function flashReward\(/);
 assert.match(js,/\/api\/chat\/online-reward\/tick/);
 assert.match(js,/\/api\/chat\/online-reward\/status/);
});
