const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'); const vm=require('node:vm'); const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/chatroom.js'),'utf8');
function functionSource(name,end) { const a=src.indexOf('function '+name+'('); assert.ok(a>=0); return src.slice(a,src.indexOf(end,a+1)); }
test('100 known-conversation messages cause zero full-list requests',()=>{
  let callback,loads=0; const conv={id:1,unreadCount:0,mentionUnread:0};
  const ctx={chatToken:()=> 'fixture',state:{active:null,conversations:[conv],subs:{},connected:true,client:{subscribe:(dest,fn)=>{callback=fn;return {};}}},
    findConversation:id=>String(id)==='1'?conv:null,currentUserId:()=>7,
    bumpConversation:()=>{},loadConversations:()=>{loads++;return Promise.resolve();},scheduleConversationRefresh:()=>{loads++;},
    updateUnreadBadge:()=>{},notifyUnreadChanged:()=>{},renderList:()=>{},renderMessages:()=>{},upsertMessage:()=>{}};
  vm.createContext(ctx); vm.runInContext(functionSource('subscribeConversation','/* ============================================================'),ctx);
  ctx.subscribeConversation(1);
  for(let i=1;i<=100;i++)callback({body:JSON.stringify({type:'message',payload:{id:i,conversationId:1,senderId:8,content:'fixture',mentionUserIds:[]}})});
  assert.equal(loads,0);
});
test('concurrent list refreshes share one in-flight request',async()=>{
  let loads=0,release; const ctx={chatToken:()=> 'fixture',resetChatSession:()=>{},conversationLoadToken:'fixture',conversationGeneration:0,state:{conversations:[],subs:{}},conversationLoadPromise:null,conversationRefreshTimer:null,
    api:()=>{loads++;return new Promise(r=>{release=r;});},normalizeConversation:x=>x,
    renderList:()=>{},updateUnreadBadge:()=>{},ensureClient:()=>{},subscribeConversation:()=>{},notifyUnreadChanged:()=>{},showError:()=>{}};
  vm.createContext(ctx); vm.runInContext(functionSource('loadConversations','function updateUnreadBadge'),ctx);
  const promises=Array.from({length:100},()=>ctx.loadConversations());
  assert.equal(loads,1); release([]); await Promise.all(promises);
});
test('STOMP reconnect creates a fresh SockJS transport',()=>{
  let config,created=0;
  const ctx={chatToken:()=> 'fixture',state:{conversations:[]},window:{sessionStorage:{}},sessionStorage:{getItem:()=> 'fixture'},
    SockJS:function(){created++;},StompJs:{Client:function(c){config=c;this.activate=()=>{};}},document:{getElementById:()=>null}};
  vm.createContext(ctx); vm.runInContext(functionSource('ensureClient','/* 每个会话只订阅一次'),ctx); ctx.ensureClient();
  assert.notEqual(config.webSocketFactory(),config.webSocketFactory()); assert.equal(created,2);
});

function listHarness() {
  let token='account-a',calls=[];
  const ctx={chatToken:()=> 'fixture',resetChatSession:()=>{},conversationLoadToken:'fixture',conversationGeneration:0,state:{conversations:[],subs:{}},conversationLoadPromise:null,conversationRefreshTimer:null,conversationLoadToken:null,conversationGeneration:0,
    chatToken:()=>token,resetChatSession:()=>{ctx.conversationGeneration++;ctx.conversationLoadPromise=null;ctx.state.conversations=[];},
    api:()=>new Promise(resolve=>calls.push(resolve)),normalizeConversation:x=>x,
    renderList:()=>{},updateUnreadBadge:()=>{},ensureClient:()=>{},subscribeConversation:()=>{},notifyUnreadChanged:()=>{},showError:()=>{}};
  vm.createContext(ctx); vm.runInContext(functionSource('loadConversations','function updateUnreadBadge'),ctx);
  return {ctx,calls,switchToken:value=>{token=value;}};
}
test('account switch cannot reuse or apply the previous account list request',async()=>{
  const h=listHarness();const first=h.ctx.loadConversations();h.switchToken('account-b');const second=h.ctx.loadConversations();
  assert.equal(h.calls.length,2);h.calls[0]([{id:1,title:'old-account'}]);await first;
  assert.equal(h.ctx.state.conversations.length,0);
  const joined=h.ctx.loadConversations();assert.equal(h.calls.length,2,'old finally cannot clear new in-flight request');
  h.calls[1]([{id:2,title:'current-account'}]);await Promise.all([second,joined]);
  assert.equal(h.ctx.state.conversations[0].id,2);
});
test('logout while a list request is pending discards its result',async()=>{
  const h=listHarness();const pending=h.ctx.loadConversations();h.switchToken('');h.calls[0]([{id:1}]);await pending;
  assert.equal(h.ctx.state.conversations.length,0);
});
test('in-flight list snapshot does not overwrite newer realtime unread or preview',async()=>{
  const h=listHarness();h.ctx.conversationLoadToken='account-a';h.ctx.state.conversations=[{id:1,unreadCount:0}];
  const pending=h.ctx.loadConversations();Object.assign(h.ctx.state.conversations[0],{eventVersion:1,unreadCount:1,lastMessagePreview:'new-event',orderAt:123});
  h.calls[0]([{id:1,unreadCount:0,lastMessagePreview:'old',orderAt:0}]);await pending;
  assert.equal(h.ctx.state.conversations[0].unreadCount,1);assert.equal(h.ctx.state.conversations[0].lastMessagePreview,'new-event');
  assert.equal(h.ctx.state.conversations[0].orderAt,123);
});
test('duplicate realtime messages increment unread and mentions only once',()=>{
  let callback;const conv={id:1,unreadCount:0,mentionUnread:0};
  const ctx={chatToken:()=> 'fixture',state:{conversations:[conv],subs:{},connected:true,client:{subscribe:(d,fn)=>{callback=fn;return {};}}},
    findConversation:()=>conv,currentUserId:()=>7,bumpConversation:()=>{},scheduleConversationRefresh:()=>{},
    updateUnreadBadge:()=>{},notifyUnreadChanged:()=>{},renderMessages:()=>{},upsertMessage:()=>{}};
  vm.createContext(ctx);vm.runInContext(functionSource('subscribeConversation','/* ============================================================'),ctx);ctx.subscribeConversation(1);
  const frame={body:JSON.stringify({type:'message',payload:{id:99,conversationId:1,senderId:8,mentionUserIds:[7]}})};
  callback(frame);callback(frame);assert.equal(conv.unreadCount,1);assert.equal(conv.mentionUnread,1);
});
test('unknown-conversation refresh bursts are coalesced by one timer',()=>{
  let callback,timers=0,loads=0;const ctx={conversationRefreshTimer:null,setTimeout:fn=>{callback=fn;timers++;return 1;},loadConversations:()=>{loads++;}};
  vm.createContext(ctx);vm.runInContext(functionSource('scheduleConversationRefresh','function loadConversations'),ctx);
  for(let i=0;i<100;i++)ctx.scheduleConversationRefresh();assert.equal(timers,1);callback();assert.equal(loads,1);
});

test('account switch replaces STOMP client and ignores callbacks from the old connection',()=>{
  let token='a',clients=[];const ctx={chatToken:()=>token,state:{conversations:[],subs:{}},window:{sessionStorage:{}},sessionStorage:{getItem:()=>token},
    SockJS:function(){},StompJs:{Client:function(config){this.activate=()=>{};this.deactivate=()=>Promise.resolve();clients.push(this);}},
    document:{getElementById:()=>null},loadConversations:()=>{},subscribeConversation:()=>{}};
  vm.createContext(ctx);vm.runInContext(functionSource('ensureClient','/* 每个会话只订阅一次'),ctx);
  ctx.ensureClient();clients[0].onConnect();token='b';ctx.ensureClient();assert.equal(clients.length,2);
  clients[1].onConnect();clients[0].onWebSocketClose();clients[0].onConnect();
  assert.equal(ctx.state.client,clients[1]);assert.equal(ctx.state.connected,true);
});
test('a chat API result from an old login cannot mutate current account state',async()=>{
  let token='a',release;const ctx={window:{sessionStorage:{}},sessionStorage:{getItem:()=>token},chatToken:()=>token,
    fetch:()=>new Promise(r=>{release=r;})};
  vm.createContext(ctx);vm.runInContext(functionSource('api','/* ---------- 时间'),ctx);
  const request=ctx.api('/api/chat/conversations');token='b';release({json:()=>Promise.resolve({code:200,data:[{id:1}]})});
  await assert.rejects(request,/登录状态/);
});

test('STOMP policy errors stop automatic retry instead of reconnecting forever',()=>{
  let client,stopped=0;const ctx={chatToken:()=> 'fixture',state:{conversations:[],subs:{}},SockJS:function(){},
    StompJs:{Client:function(){client=this;this.activate=()=>{};this.deactivate=()=>{stopped++;return Promise.resolve();};}},document:{getElementById:()=>null}};
  vm.createContext(ctx);vm.runInContext(functionSource('ensureClient','/* 每个会话只订阅一次'),ctx);ctx.ensureClient();client.onStompError();
  assert.equal(stopped,1);assert.equal(client.reconnectDelay,0);
});
