const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'backend/sql/migrate-chatroom.sql'),'utf8');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');
const js=fs.readFileSync(path.join(root,'js/chatroom.js'),'utf8');
const pom=fs.readFileSync(path.join(root,'backend/pom.xml'),'utf8');
const css=fs.readFileSync(path.join(root,'js/chatroom.css'),'utf8');

test('chatroom migration never switches or destroys databases',()=>{
 assert.doesNotMatch(sql,/^\s*(USE|DROP|TRUNCATE|ALTER)\b/im);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS chat_conversations/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS chat_messages_archive/);
 assert.match(sql,/uk_chat_client_msg/);
 assert.doesNotMatch(sql,/direct_key\s+VARCHAR\(80\)[^\r\n,]*\r?\n\s*owner_id/);
 assert.doesNotMatch(sql,/uk_chat_direct_key\s*\([^\)]*\)\s*\r?\n\s*UNIQUE KEY/);
 assert.match(sql,/uk_chat_member/);
});
test('chatroom frontend uses safe text rendering and local websocket deps',()=>{
 assert.match(html,/js\/chatroom\.css/);
 assert.match(html,/js\/chatroom\.js/);
 assert.match(html,/js\/vendor\/sockjs\.min\.js/);
 assert.match(html,/js\/vendor\/stomp\.umd\.min\.js/);
 assert.match(html,/id="page-lab"/);
 assert.doesNotMatch(js,/\.innerHTML\s*=\s*[^;]*content/);
 assert.match(js,/textContent/);
});
test('chatroom polish keeps date separators, keyboard access and composer feedback',()=>{
 assert.match(js,/function dayLabel\(/);
 assert.match(js,/function dayKey\(/);
 assert.match(js,/className=\"chat-day\"/);
 assert.match(js,/className=\"chat-conv-time\"/);
 assert.match(js,/row\.tabIndex=0/);
 assert.match(js,/row\.addEventListener\("keydown"/);
 assert.match(js,/function syncComposer\(/);
 assert.match(js,/input\.addEventListener\('input',syncComposer\)/);
 assert.match(html,/id="chatroomJump"/);
 assert.match(html,/id="chatroomCounter"/);
 assert.doesNotMatch(js,/function timeText\([^\n]+\nfunction timeText\(/);
});

test('jump button lives outside the replaced message container and messages scroll internally',()=>{
 // 回归：renderMessages() 用 replaceChildren() 清空 #chatroomMessages，
 // 回到底部按钮若放在其中会被一并删除（2026-09-20 真实缺陷）。
 const openTag = '<div class="chatroom-messages" id="chatroomMessages">';
 const start = html.indexOf(openTag);
 assert.ok(start > -1, 'messages container must exist');
 let i = start + openTag.length, depth = 1;
 while (i < html.length && depth > 0) {
  const nextOpen = html.indexOf('<div', i);
  const nextClose = html.indexOf('</div>', i);
  if (nextClose === -1) break;
  if (nextOpen !== -1 && nextOpen < nextClose) { depth++; i = nextOpen + 4; }
  else { depth--; i = nextClose + 6; }
 }
 const inner = html.slice(start + openTag.length, i);
 assert.doesNotMatch(inner, /chatroomJump/, 'jump button must not be inside #chatroomMessages');
 assert.match(html, /chatroom-messages-wrap/);
 assert.match(html, /id="chatroomJump"/);
 // 消息区必须在受限高度内自行滚动，否则按钮永远不会触发。
 // 2026-09-27 起外壳改为「铺满工作区」：高度 = 视口 - 主区剩余 padding（底部 24）
 assert.match(css, /\.chatroom-shell\{[^}]*height:calc\(100vh - 24px\)/);
 assert.match(css, /\.chatroom-messages\{[^}]*min-height:0/);
 assert.doesNotMatch(css, /\.chatroom-messages\{[^}]*min-height:360px/);
});

test('协作工作台顶部不再有面包屑行与留白，外壳从工作区最上沿开始',()=>{
 const s=html.indexOf('<section class="page" id="page-lab">');
 const e=html.indexOf('<section class="page" id="page-gossip">');
 assert.ok(s>0&&e>s,'未找到 #page-lab 区块');
 // 2026-10-07：职业测评 / 宠物系统 / 猫舍从工作台隐藏 —— 二级列表（.lab-shell/.lab-list/.lab-panel）、
 // 顶部面包屑行与左侧入口一并切除，聊天室外壳直接挂在 #page-lab 下（= 线上 release/2026-09-27 的样式）。
 const lab = html.slice(s,e);
 assert.doesNotMatch(lab,/class="topbar"/,'工作台不再有面包屑行');
 assert.doesNotMatch(lab,/class="lab-shell"/,'工作台不再有二级列表外壳');
 assert.doesNotMatch(lab,/data-lab-panel=/,'工作台不再有子面板挂载点');
 assert.doesNotMatch(lab,/data-lab-item=/,'工作台不再有左侧功能入口');
 assert.match(lab,/id="chatroomShell"/,'聊天室外壳直接挂在 #page-lab 内');
});

test('🔴 会话列表零跳动：纯点击不重建列表、排序键只增不减',()=>{
 // 四处一起才成立，缺一处就会「点一下列表乱跳 / 选中的群自己往上排」：
 // ① 打开会话只切高亮，不重渲染；② 重渲染必须还原 scrollTop；③ 排序键冻结在客户端、只增不减；④ 选中态不改盒模型
 assert.match(js,/function updateSelection\(/);
 assert.match(js,/updateSelection\(\);updateUnreadBadge\(\);/,'打开会话只切高亮，不得重渲染列表');
 assert.match(js,/var keepTop=box\.scrollTop;/,'重建前要记住滚动位置');
 assert.match(js,/box\.scrollTop=keepTop;/,'重建后要还原滚动位置');
 assert.match(js,/function orderTouch\(key,t\)\{/,'排序键必须由 orderTouch 统一写入');
 assert.match(js,/else if\(t>orderAt\[key\]\)\{orderAt\[key\]=t;\}/,'排序键只增不减，点击/已读不得改变顺序');
 assert.match(js,/function sortByTimeDesc\(a,b\)\{[\s\S]{0,120}orderAt\[kb\]-orderAt\[ka\]/,'仍按时间倒序');
 assert.match(css,/\.chat-conv\{[^}]*border:1px solid transparent/,'列表项描边必须常驻，选中时盒模型不变');
});

test('chatroom backend includes websocket and moderation endpoints',()=>{
 assert.match(pom,/spring-boot-starter-websocket/);
 // 协作工作台入口仍是 data-page="lab"，页面容器 id="page-lab"；
 // 2026-10-07：职业测评 / 宠物系统 / 猫舍从工作台隐藏，二级侧边栏（.lab-shell / .lab-list / .lab-panel）
 // 与子面板挂载点一并切除，聊天室外壳直接铺满工作区（脚本、接口与库表保留，便于随时放出）。
 assert.match(html,/data-page="lab"/);
 assert.match(html,/id="page-lab"/);
 assert.doesNotMatch(html,/class="lab-shell"/);
 assert.doesNotMatch(html,/class="lab-list"/);
 assert.doesNotMatch(html,/data-lab-panel=/);
 assert.doesNotMatch(html,/data-lab-item=/);
 assert.match(html,/id="chatroomShell"/);
 assert.ok(fs.existsSync(path.join(root,'backend/src/main/java/com/eggworld/config/WebSocketConfig.java')));
 assert.ok(fs.existsSync(path.join(root,'backend/src/main/java/com/eggworld/controller/ChatAdminController.java')));
});

test('public channels keep only the campus lobby', () => {
  const seed = fs.readFileSync('backend/sql/migrate-chatroom.sql', 'utf8');
  const insert = seed.slice(seed.indexOf('INSERT IGNORE INTO chat_conversations'));
  const channels = [...insert.matchAll(/\('channel','([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(channels, ['校园大厅'], '公共频道种子只应保留校园大厅');
  assert.ok(!/study-partner|second-hand|announcement/.test(insert), '不应再种子其它官方频道');

  const migration = fs.readFileSync('backend/sql/migrate-chatroom-channels.sql', 'utf8');
  assert.match(migration, /UPDATE chat_conversations/);
  assert.match(migration, /status\s*=\s*'archived'/);
  assert.match(migration, /channel_key\s*<>?\s*'campus-hall'/);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i, '归档不得物理删除历史会话');
});
