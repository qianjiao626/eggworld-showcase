/* 蛋蛋世界 · 协作工作台（原聊天室）：独立前端模块。所有用户内容只通过 textContent 写入。
   ------------------------------------------------------------
   三栏：左「会话流」（双态收纳 活跃会话 / 归档库）、中「协同终端」、右「任务协作合约」。
   四条硬约束（改动前先读）：
     ① 切分类只换列表视图，绝不自动打开或选中第一个会话；
     ② 列表顺序按消息时间倒序，且排序键冻结在客户端（orderAt，只增不减）：
        纯点击/已读不变更排序键 → 顺序与滚动位置原地不动；只有新消息才让会话自然升顶；
     ③ 界面零 Emoji：只用中文状态词、字标与几何状态点；
     ④ 任务动作一律「先二次确认、再落接口」，确认归档时明确预告资金即时结算与群转只读。
   后端字段仍是 lastMessageAt，这里归一化成 lastMessageTime（不改接口）。 */
(function(){
'use strict';
var state={conversations:[],active:null,messages:[],context:null,pendingConfirm:null,client:null,connected:false,subs:{},
  reward:{timer:null,todayCoins:0,cap:0,capped:false}};
var scope='active';   /* active=活跃会话 / vault=归档库：双态收纳，只有这两档 */
var ctxCache={};      /* 会话 ID -> context：列表分类小标与右栏共用，一个会话只拉一次 */
var ctxPending={};    /* 正在拉取的会话 ID，避免同一会话并发重复请求 */
var $=function(id){return document.getElementById(id)};
function chatToken(){return (window.sessionStorage&&sessionStorage.getItem('token'))||'';}
function api(path,method,body){
  var token=(window.sessionStorage&&sessionStorage.getItem('token'))||'';
  var base=(typeof API_BASE==='string')?API_BASE:'';
  return fetch(base+path,{method:method||'GET',headers:Object.assign({'Content-Type':'application/json'},token?{'Authorization':'Bearer '+token}:{}),body:body===undefined?undefined:JSON.stringify(body)})
    .then(function(r){return r.json().catch(function(){return {code:r.status,msg:'请求失败'}})})
    .then(function(x){if(token!==chatToken())throw new Error('登录状态已切换');if(x.code!==200)throw new Error(x.msg||'请求失败');return x.data});
}
/* ---------- 时间 ---------- */
function timeText(s){if(!s)return "";var d=new Date(s);if(isNaN(d))return s;return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")}
function shortTime(s){if(!s)return "";var d=new Date(s);if(isNaN(d))return "";var now=new Date();var sameDay=d.toDateString()===now.toDateString();if(sameDay)return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");var y=new Date(now.getTime()-86400000);if(d.toDateString()===y.toDateString())return "昨天";return (d.getMonth()+1)+"/"+d.getDate()}
/* 日期分隔文案：今天 / 昨天 / 8月29日 星期六 */
/* 注意：必须显式挡掉 null/undefined/空串 —— new Date(null) 是合法日期（1970-01-01），
   isNaN 检查拦不住，会显示成「1970年1月1日 星期四」。后端 createdAt 为 null 时就会踩到。 */
function dayLabel(s){if(!s)return "";var d=new Date(s);if(isNaN(d))return "";var now=new Date();var t0=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();var d0=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();var diff=Math.round((t0-d0)/86400000);if(diff===0)return "今天";if(diff===1)return "昨天";var wd=["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][d.getDay()];return (d.getMonth()+1)+"月"+d.getDate()+"日 "+wd}
function dayKey(s){if(!s)return "";var d=new Date(s);if(isNaN(d))return "";return d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate()}
function dateText(s){if(!s)return "";var d=new Date(s);if(isNaN(d))return "";return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate()}
function tsOf(s){if(!s)return 0;var t=new Date(s).getTime();return isNaN(t)?0:t}
function initialOf(name){var s=String(name==null?"":name).trim();return s?s.slice(0,1):"\u86CB"}
/* ---------- 会话：归一化 / 分类 / 排序 ---------- */
/* 后端只回 lastMessageAt；统一补成 lastMessageTime 后再排序与展示 */
function normalizeConversation(c){
  if(!c)return c;
  c.lastMessageTime=c.lastMessageTime||c.lastMessageAt||null;
  c.readOnly=Number(c.readOnly||0);
  c.unreadCount=Number(c.unreadCount||0);
  c.mentionUnread=Number(c.mentionUnread||0);
  return c;
}
/* 归档库判据：任务已结案结算、群聊只读封存（read_only=1 且是任务群）。
   只读公告频道不是「已结案」，留在活跃会话里。 */
function isVault(c){return !!c&&c.type==='group'&&c.readOnly===1;}
function inScope(c){return scope==='vault'?isVault(c):!isVault(c);}
/* ---------- 列表顺序：排序键冻结在客户端 ----------
   不能每次渲染都直接拿 lastMessageTime 现算：任务群在没有消息时 lastMessageAt 是 null，
   服务端把这类并列项按 pinned / 成员 updatedAt 排；只要点开过一次（触发已读回写），
   同一批并列项的相对次序就可能变 —— 表现就是「一选中就往上跳」。
   所以排序键只在两种情况下写入，别的一律不动：
     ① 首次见到该会话（取服务端时间；并列时按首次见到的先后，稳定不换位）
     ② 服务端给的时间**变大**了，或本地真收到 / 发出了新消息（只增不减）
   点击、已读、切分类都不会改键 —— 列表顺序固定不动，不会因为「我只是选中」而跳。 */
var orderAt={},orderSeq={},orderCounter=0;
function orderTouch(key,t){
  if(!(key in orderAt)){orderAt[key]=t;orderSeq[key]=(++orderCounter);}
  else if(t>orderAt[key]){orderAt[key]=t;}
}
function orderKeyOf(c){
  var key=String(c.id);
  orderTouch(key,tsOf(c.lastMessageTime));
  return key;
}
/* 新消息到达（自己发的 / 推送来的）：把该会话的排序键推到消息时间 */
function raiseOrder(conversationId,at){
  orderTouch(String(conversationId),tsOf(at)||Date.now());
}
function sortByTimeDesc(a,b){
  var ka=orderKeyOf(a),kb=orderKeyOf(b);
  var d=orderAt[kb]-orderAt[ka];
  return d?d:(orderSeq[ka]-orderSeq[kb]);
}
function visibleConversations(){return state.conversations.filter(inScope).slice().sort(sortByTimeDesc);}
function findConversation(id){for(var i=0;i<state.conversations.length;i++){if(String(state.conversations[i].id)===String(id))return state.conversations[i];}return null;}
/* 列表小标：教学 / 组队 / 悬赏 / 求助 / 频道 / 私聊 / 归档。
   任务类型不在会话列表接口里，按需拉一次 context 并缓存；没拿到前只写中性的「群聊」。 */
function convTag(c){
  if(c.type==='channel')return {text:c.readOnly?'只读公告':'频道',cls:'channel'};
  if(c.type==='direct')return {text:'私聊',cls:'dm'};
  if(isVault(c))return {text:'归档',cls:'archived'};
  var ctx=ctxCache[String(c.id)];
  var type=ctx&&ctx.task?ctx.task.taskType:'';
  if(type==='teach')return {text:'教学',cls:'teach'};
  if(type==='team')return {text:'组队',cls:'team'};
  if(type==='reward')return {text:'悬赏',cls:'reward'};
  if(type==='help')return {text:'求助',cls:'help'};
  return {text:'群聊',cls:''};
}
function taskTypeText(t){return {teach:'教学',team:'组队',reward:'悬赏',help:'求助'}[t]||'';}
function isTeamType(t){return t==='team'||t==='reward';}
/* ============================================================
   一、左栏：会话流
   ============================================================ */
function renderList(){
  var box=$('chatroomConversations');if(!box)return;
  /* 重建列表前记住滚动位置：replaceChildren() 会把 scrollTop 归零，
     不还原的话「点一下会话 → 列表弹回顶部」——这就是会话列表乱跳的根因。 */
  var keepTop=box.scrollTop;
  box.replaceChildren();
  updateScopeUI();
  var rows=visibleConversations();
  if(!rows.length){
    var e=document.createElement('div');e.className='chatroom-empty';
    var s=document.createElement('strong');s.textContent=scope==='vault'?'归档库还是空的':'还没有协作会话';e.appendChild(s);
    var p=document.createElement('span');
    p.textContent=scope==='vault'?'任务结案结算后，专属群聊会自动封存到这里':'加入官方频道，或发布 / 认领任务后进入专属群聊';
    e.appendChild(p);
    box.appendChild(e);
    box.scrollTop=0;
    return;
  }
  rows.forEach(function(c){
    var row=document.createElement('div');row.className='chat-conv'+(state.active&&String(state.active.id)===String(c.id)?" active":"");row.dataset.id=c.id;row.tabIndex=0;row.setAttribute("role","button");
    var av=document.createElement('div');av.className='chat-conv-avatar';av.textContent=avatarText(c);
    var peer=c.peerNickname||"";
    if(peer){
      av.setAttribute("role","button");av.tabIndex=0;av.title="查看 "+peer+" 的个人简介";
      av.addEventListener("click",function(ev){ev.stopPropagation();openSenderProfile(peer);});
      av.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();ev.stopPropagation();openSenderProfile(peer);}});
    }
    row.appendChild(av);
    var body=document.createElement('div');body.className='chat-conv-body';
    var title=document.createElement('div');title.className='chat-conv-title';
    var n=document.createElement('span');n.textContent=c.title||c.peerNickname||"会话";title.appendChild(n);
    var tm=document.createElement('span');tm.className="chat-conv-time";tm.textContent=shortTime(c.lastMessageTime);title.appendChild(tm);
    body.appendChild(title);
    var tail=document.createElement('div');tail.className='chat-conv-tail';
    var tag=convTag(c);
    var tg=document.createElement('span');tg.className='chat-conv-tag'+(tag.cls?' '+tag.cls:'');tg.textContent=tag.text;
    var p=document.createElement('div');p.className='chat-conv-preview';p.textContent=c.lastMessagePreview||(c.type==="channel"?"公共频道":(c.type==="group"?"群聊":"开始聊天"));
    var left=document.createElement('div');left.className='chat-conv-lead';left.appendChild(tg);left.appendChild(p);
    tail.appendChild(left);
    if(c.unreadCount>0){var b=document.createElement('span');b.className='chat-conv-badge';b.textContent=c.unreadCount>99?"99+":c.unreadCount;tail.appendChild(b);}
    body.appendChild(tail);row.appendChild(body);
    var open=function(){openConversation(c)};
    row.addEventListener("click",open);
    row.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();open();}});
    box.appendChild(row);
    if(!isVault(c))ensureTaskContext(c);
  });
  box.scrollTop=keepTop;
}
/* 纯点击只切高亮：不重建 DOM、不重排、不动滚动位置。
   这是「点击零跳动」的关键 —— 列表顺序只在 lastMessageTime 真的变了时才重排。 */
function updateSelection(){
  var box=$('chatroomConversations');if(!box)return;
  var id=state.active?String(state.active.id):'';
  Array.prototype.forEach.call(box.querySelectorAll('.chat-conv'),function(row){
    var on=String(row.dataset.id)===id;
    row.classList.toggle('active',on);
    if(on){var b=row.querySelector('.chat-conv-badge');if(b)b.remove();}
  });
}
function avatarText(c){
  var s=String(c.title||c.peerNickname||'会话').trim();
  return s?s.slice(0,2):'会话';
}
/* 就地更新某一行的分类小标：不重排、不重建 DOM，避免异步回调把列表顶乱 */
function updateConvTag(conversationId){
  var box=$('chatroomConversations');if(!box)return;
  var c=findConversation(conversationId);var row=box.querySelector('[data-id="'+conversationId+'"]');
  if(!c||!row)return;
  var el=row.querySelector('.chat-conv-tag');if(!el)return;
  var tag=convTag(c);
  el.className='chat-conv-tag'+(tag.cls?' '+tag.cls:'');
  el.textContent=tag.text;
}
/* 任务类型只在会话列表接口里缺这一项：按需拉 context 并缓存，一个会话只拉一次 */
function ensureTaskContext(c){
  if(!c||c.type!=='group')return;
  var key=String(c.id);
  if(ctxCache[key]||ctxPending[key])return;
  ctxPending[key]=true;
  api('/api/chat/conversations/'+c.id+'/context').then(function(ctx){
    ctxCache[key]=(ctx&&typeof ctx==='object')?ctx:null;
    delete ctxPending[key];
    updateConvTag(key);
  }).catch(function(){delete ctxPending[key];});
}
function updateScopeUI(){
  var n={active:0,vault:0};
  state.conversations.forEach(function(c){n[isVault(c)?'vault':'active']++;});
  var a=$('chatroomScopeActive'),v=$('chatroomScopeVault');
  if(a){a.textContent='活跃会话 ('+n.active+')';a.classList.toggle('active',scope==='active');a.setAttribute('aria-selected',String(scope==='active'));}
  if(v){v.textContent='归档库 ('+n.vault+')';v.classList.toggle('active',scope==='vault');v.setAttribute('aria-selected',String(scope==='vault'));}
}
/* 双态切换：只改列表视图。
   ⚠️ 绝不自动打开或选中第一个会话；已打开的会话若不属于新分类，收起中栏回到点阵占位板。
   手机端一律回到列表层，不做任何推入。 */
function switchScope(next){
  scope=(next==='vault')?'vault':'active';
  var cur=state.active;
  if(cur&&!inScope(cur))closeActive();
  renderList();
  var shell=$('chatroomShell');if(shell)shell.classList.remove('chat-open');
}
function closeActive(){
  state.active=null;state.messages=[];state.context=null;state.pendingConfirm=null;
  var shell=$('chatroomShell');if(shell){shell.classList.remove('chat-selected');shell.classList.remove('chat-open');}
  var box=$('chatroomMessages');if(box)box.replaceChildren();
  closeDrawer();
  scrollMessagesToEnd();
}
/* ============================================================
   二、中栏：协同终端
   ============================================================ */
function renderMessages(){
  var box=$('chatroomMessages');if(!box)return;
  var stick=box.scrollHeight-box.scrollTop-box.clientHeight<90;
  box.replaceChildren();
  if(!state.messages.length){
    var ro=!!(state.active&&state.active.readOnly);
    var e=document.createElement('div');e.className='chatroom-empty';
    var s=document.createElement('strong');s.textContent=ro?"暂无历史消息":"还没有消息";e.appendChild(s);
    var p=document.createElement('span');p.textContent=ro?"本会话已锁定，没有可查阅的记录":"发第一条消息，开始协作";e.appendChild(p);
    box.appendChild(e);return;
  }
  var uid=String(currentUserId()||""),lastDay="",lastSender=null,lastTs=0;
  state.messages.forEach(function(m){
    var dk=dayKey(m.createdAt);
    if(dk&&dk!==lastDay){lastDay=dk;lastSender=null;
      var day=document.createElement('div');day.className="chat-day";
      var ds=document.createElement('span');ds.textContent=dayLabel(m.createdAt);day.appendChild(ds);box.appendChild(day);
    }
    var mine=String(m.senderId)===uid;
    var ts=m.createdAt?new Date(m.createdAt).getTime():0;
    var grouped=!mine&&lastSender===m.senderId&&lastTs&&(ts-lastTs<180000);
    lastSender=m.senderId;lastTs=ts;
    var row=document.createElement('div');
    row.className="chat-message"+(mine?" mine":"")+(grouped?" grouped":"")+(m.status==="recalled"?" recalled":"");
    row.dataset.id=m.id;
    var av=document.createElement('div');av.className="chat-message-avatar";av.textContent=String(m.senderNickname||"\u86CB").slice(0,1);
    var senderName=m.senderNickname||"";
    if(senderName){
      av.setAttribute("role","button");av.tabIndex=0;av.title="查看 "+senderName+" 的个人简介";
      av.setAttribute("aria-label","查看 "+senderName+" 的个人简介");
      var openProfile=function(ev){if(ev){ev.stopPropagation();}openSenderProfile(senderName);};
      av.addEventListener("click",openProfile);
      av.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();openProfile(ev);}});
    }
    row.appendChild(av);
    var body=document.createElement('div');body.className="chat-message-body";
    var name=document.createElement('div');name.className="chat-message-name";name.textContent=(m.senderNickname||"未知")+" \u00B7 "+timeText(m.createdAt);body.appendChild(name);
    var content=document.createElement('div');content.className="chat-message-content";content.textContent=m.status==="recalled"?"消息已撤回":(m.content||"");body.appendChild(content);
    if(mine&&m.status!=="recalled"){
      var acts=document.createElement('div');acts.className="chat-message-actions";
      var rb=document.createElement('button');rb.type="button";rb.className="chat-act";rb.textContent="撤回";
      rb.addEventListener('click',function(){recallMessage(m.id)});acts.appendChild(rb);body.appendChild(acts);
    }
    row.appendChild(body);box.appendChild(row);
  });
  if(stick)box.scrollTop=box.scrollHeight;
  updateJump();
}
function updateJump(){
  var box=$("chatroomMessages"),btn=$("chatroomJump");if(!box||!btn)return;
  var hide=box.scrollHeight-box.scrollTop-box.clientHeight<120;
  btn.classList.toggle("show",!hide);
}
function scrollMessagesToEnd(){var box=$("chatroomMessages");if(box)box.scrollTop=box.scrollHeight;updateJump();}
/* ---------- 泡点（在线奖励） ----------
   规则由服务端裁定：前端只上报「我还在协作工作台」，时长与上限都按服务端时钟计算。
   页面不可见或长时间无操作时不上报，服务端也会按心跳间隔丢弃超时段。 */
var REWARD_TICK_MS=60000;
var REWARD_IDLE_MS=5*60*1000;
var rewardLastActivity=Date.now();
function markRewardActivity(){rewardLastActivity=Date.now();}
/* 必须在协作工作台页面内（#page-lab 激活） */
function chatroomVisible(){
  var page=document.getElementById("page-lab");
  return !!(page&&page.classList.contains("active"));
}
function rewardActive(){
  if(document.hidden)return false;
  if(typeof window.USER==="undefined"||!window.USER)return false;
  if(!chatroomVisible())return false;
  if(Date.now()-rewardLastActivity>REWARD_IDLE_MS)return false;
  return true;
}
function renderReward(v){
  if(!v)return;
  state.reward.todayCoins=v.todayCoins||0;
  state.reward.cap=v.dailyCap||0;
  state.reward.capped=!!v.capped;
  var box=$("chatroomBubble"),coins=$("chatroomBubbleCoins"),cap=$("chatroomBubbleCap");
  if(coins)coins.textContent=state.reward.todayCoins;
  if(cap)cap.textContent=state.reward.cap>0?(" / "+state.reward.cap):"";
  if(box)box.classList.toggle("capped",state.reward.capped);
}
function flashReward(earned){
  var box=$("chatroomBubble");if(!box||!earned)return;
  box.classList.remove("flash");
  void box.offsetWidth;
  box.classList.add("flash");
}
function rewardTick(){
  if(!rewardActive())return;
  api("/api/chat/online-reward/tick","POST").then(function(v){
    renderReward(v);
    if(v&&v.earned>0){
      flashReward(v.earned);
      if(typeof window.refreshPoints==="function"){window.refreshPoints();}
    }
  }).catch(function(){/* 心跳失败静默，不打扰协作 */});
}
function startRewardLoop(){
  if(state.reward.timer)return;
  state.reward.timer=setInterval(rewardTick,REWARD_TICK_MS);
  rewardTick();
}
function stopRewardLoop(){
  if(state.reward.timer){clearInterval(state.reward.timer);state.reward.timer=null;}
}
function loadRewardStatus(){
  api("/api/chat/online-reward/status").then(renderReward).catch(function(){});
}
/* ---------- 个人简介 ---------- */
/* 复用主站用户名片弹窗 showUserEggModal（按昵称查 /api/users/by-nickname）。
   主站未加载或函数缺失时给出明确提示，不静默失败、不编造资料。 */
function openSenderProfile(nickname){
  if(!nickname)return;
  if(typeof window.showUserEggModal==="function"){window.showUserEggModal(nickname);return;}
  if(typeof window.showUserProfileModal==="function"){window.showUserProfileModal(nickname);return;}
  showError(new Error("暂时无法打开该用户的个人简介"));
}
function currentUserId(){try{return (typeof USER!=='undefined'&&USER&&USER.id)||''}catch(e){return''}}
/* ============================================================
   三、右栏：任务协作合约（/api/chat/conversations/{id}/context）
   ============================================================ */
/* 任务/成员/角色都来自服务端聚合，前端不做任何推断：拿不到就显示空态，不编造。 */
function loadContext(conversationId){
  if(conversationId==null){state.context=null;renderContext();return Promise.resolve();}
  var key=String(conversationId);
  return api('/api/chat/conversations/'+conversationId+'/context').then(function(ctx){
    ctxCache[key]=(ctx&&typeof ctx==='object')?ctx:null;
    if(!state.active||String(state.active.id)!==key)return;
    state.context=(ctx&&typeof ctx==='object'&&Array.isArray(ctx.members))?ctx:null;
    renderContext();
    updateConvTag(key);
  }).catch(function(){
    if(!state.active||String(state.active.id)!==key)return;
    state.context=null;renderContext();
  });
}
function renderContext(){
  var ctx=state.context;
  renderTaskStatus(ctx);
  renderTaskCard(ctx);
  renderMembers(ctx);
}
function submittedMembers(ctx){
  var ms=(ctx&&ctx.members)||[];
  return ms.filter(function(m){return m.claimStatus==="submitted";});
}
/* 头部状态胶囊：三态（进行中 / 待确认 / 已归档） */
function taskState(ctx){
  var task=ctx&&ctx.task;if(!task)return null;
  var st=task.status||"";
  if(st==="completed"||st==="cancelled"||st==="expired")return {text:"已归档",cls:"is-archived"};
  if(submittedMembers(ctx).length>0||task.myClaimStatus==="submitted")return {text:"待确认",cls:"is-pending"};
  return {text:"进行中",cls:""};
}
function renderTaskStatus(ctx){
  var el=$("chatroomTaskStatus");if(!el)return;
  var s=taskState(ctx);
  if(!s){el.hidden=true;el.replaceChildren();return;}
  el.hidden=false;
  el.className="chatroom-task-status"+(s.cls?" "+s.cls:"");
  var dot=document.createElement("span");dot.className="dot-indicator";
  el.replaceChildren(dot,document.createTextNode(s.text));
}
/* 托管报酬一律两位小数；周期状态三态：履约中 / 验收中 / 已结束 */
function feeText(task){return (Number(task&&task.reward)||0).toFixed(2)+" 蛋蛋币";}
function taskDeadlineText(task){
  var st=task.status||"";
  if(st==="completed"||st==="cancelled"||st==="expired")return "任务已结案，群聊已归档只读";
  if(task.completeDeadline)return "完成截止 "+dateText(task.completeDeadline);
  if(task.signupDeadline)return "报名截止 "+dateText(task.signupDeadline);
  return "";
}
function cycleText(task,ctx){
  var st=task.status||"";
  if(st==="completed"||st==="cancelled"||st==="expired")return "已结束";
  if(submittedMembers(ctx).length>0||task.myClaimStatus==="submitted")return "验收中";
  return "履约中";
}
function contractCell(key,val){
  var cell=document.createElement("div");cell.className="contract-cell";
  var k=document.createElement("span");k.className="contract-key";k.textContent=key;cell.appendChild(k);
  var v=document.createElement("span");v.className="contract-val";v.textContent=val;cell.appendChild(v);
  return cell;
}
function renderTaskCard(ctx){
  var box=$("chatroomTaskCard");if(!box)return;
  box.replaceChildren();
  var task=ctx&&ctx.task;
  if(!task){
    var e=document.createElement("div");e.className="chatroom-side-empty";
    var type=ctx?ctx.type:"";
    e.textContent=type==="channel"?"官方频道没有关联任务":(type==="direct"?"私聊没有关联任务":"该会话没有关联任务");
    box.appendChild(e);return;
  }
  var head=document.createElement("div");head.className="contract-head";
  var code=document.createElement("span");code.className="contract-code";
  var tt=taskTypeText(task.taskType);
  code.textContent="任务 #"+task.id+(tt?" · "+tt:"");
  head.appendChild(code);
  var s=taskState(ctx);
  var badge=document.createElement("span");badge.className="contract-badge"+(s&&s.cls?" "+s.cls:"");
  badge.textContent=s?s.text:"";
  head.appendChild(badge);
  box.appendChild(head);
  var title=document.createElement("div");title.className="contract-title";title.textContent=task.title||"未命名任务";box.appendChild(title);
  var grid=document.createElement("div");grid.className="contract-grid";
  grid.appendChild(contractCell("托管报酬",feeText(task)));
  grid.appendChild(contractCell("周期状态",cycleText(task,ctx)));
  box.appendChild(grid);
  var note=taskDeadlineText(task);
  if(note){var n=document.createElement("div");n.className="contract-note";n.textContent=note;box.appendChild(n);}
  var ops=document.createElement("div");ops.className="contract-ops";
  taskActions(ctx).forEach(function(b){ops.appendChild(b);});
  box.appendChild(ops);
}
/* 动作按钮：认领方提交 / 发布方验收，两类都是「先二次确认、再落接口」 */
function makeTaskBtn(text,kind,onClick){
  var b=document.createElement("button");b.type="button";
  b.className="chatroom-task-btn"+(kind?" "+kind:"");
  b.textContent=text;
  if(onClick)b.addEventListener("click",onClick);else b.disabled=true;
  return b;
}
function taskActions(ctx){
  var task=ctx.task,out=[];
  var st=task.status||"";
  if(st==="completed"||st==="cancelled"||st==="expired"){out.push(makeTaskBtn("合约已履行完毕",null,null));return out;}
  if(!task.myTaskRole){out.push(makeTaskBtn("非任务参与者",null,null));return out;}
  if(task.myTaskRole==="claimer"){
    var cs=task.myClaimStatus||"";
    if(cs==="in_progress")out.push(makeTaskBtn("提交任务成果","submit",function(){openModal("chatroomSubmitModal");}));
    else if(cs==="submitted")out.push(makeTaskBtn("成果已交付，待发布方验收",null,null));
    else if(cs==="completed")out.push(makeTaskBtn("你已完成该任务",null,null));
    else out.push(makeTaskBtn("等待发布方确认配对",null,null));
    return out;
  }
  var subs=submittedMembers(ctx);
  if(!subs.length){
    var waiting=(ctx.members||[]).some(function(m){return m.claimStatus==="in_progress";});
    out.push(makeTaskBtn(waiting?"等待认领方提交交付...":"暂无可确认的提交",null,null));
    return out;
  }
  if(isTeamType(task.taskType)){
    out.push(makeTaskBtn("验收通过并划拨资金","confirm",function(){openConfirmModal(null);}));
  }else{
    /* 教学/求助是逐个确认、各自结算：每个已提交的人给一个按钮 */
    subs.forEach(function(m){
      out.push(makeTaskBtn("验收 "+m.nickname+" 并划拨资金","confirm",function(){openConfirmModal(m);}));
    });
  }
  return out;
}
/* 角色字标与文案：发布方「发」、认领方「认」；只是群成员的旁观者不冒充角色 */
function roleInfo(member,taskType){
  if(member.taskRole==="publisher")return {code:"发",cls:"owner",role:isTeamType(taskType)?"队长 / 发布方":"导师 / 发布方"};
  if(member.taskRole==="claimer")return {code:"认",cls:"claimer",role:isTeamType(taskType)?"队员 / 认领方":"学员 / 认领方"};
  return {code:initialOf(member.nickname),cls:"",role:"群成员"};
}
function renderMembers(ctx){
  var list=$("chatroomMemberList"),title=$("chatroomMemberTitle");
  var members=(ctx&&ctx.members)||[];
  if(title)title.textContent="协作成员 ("+members.length+")";
  if(!list)return;
  list.replaceChildren();
  if(!members.length){
    var e=document.createElement("div");e.className="chatroom-side-empty";e.textContent="暂无成员信息";list.appendChild(e);return;
  }
  var taskType=ctx&&ctx.task?ctx.task.taskType:"";
  members.forEach(function(m){
    var info=roleInfo(m,taskType);
    var row=document.createElement("div");row.className="chatroom-member";
    var av=document.createElement("div");av.className="chatroom-member-avatar"+(info.cls?" "+info.cls:"");
    av.textContent=info.code;
    var nickname=m.nickname||"";
    if(nickname){
      av.setAttribute("role","button");av.tabIndex=0;av.title="查看 "+nickname+" 的个人简介";
      av.addEventListener("click",function(){openSenderProfile(nickname);});
      av.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();openSenderProfile(nickname);}});
    }
    row.appendChild(av);
    var body=document.createElement("div");body.className="chatroom-member-body";
    var name=document.createElement("div");name.className="chatroom-member-name";
    name.appendChild(document.createTextNode(m.nickname||"未知"));
    if(m.me){var me=document.createElement("span");me.className="chatroom-member-me";me.textContent="(我)";name.appendChild(me);}
    body.appendChild(name);
    var role=document.createElement("div");role.className="chatroom-member-role";role.textContent=info.role;
    body.appendChild(role);
    row.appendChild(body);
    list.appendChild(row);
  });
}
/* ============================================================
   四、二次确认弹窗与任务动作
   ============================================================ */
function openModal(id){var m=$(id);if(m)m.classList.add("show");}
function closeModal(id){var m=$(id);if(m)m.classList.remove("show");}
/* 确认归档的文案要按类型区分：
   - 组队/悬赏是整体确认，确认即归档，照实预告
   - 教学/求助是逐个确认，只有最后一位确认完才归档，不能说成「立即」 */
function openConfirmModal(member){
  var ctx=state.context,task=ctx&&ctx.task;if(!task)return;
  var modal=$("chatroomConfirmModal");if(!modal)return;
  state.pendingConfirm=member?{claimerId:member.userId,nickname:member.nickname}:null;
  var title=modal.querySelector("h3");
  var warning=modal.querySelector(".chatroom-modal-warning");
  var btn=$("chatroomConfirmBtn");
  var whole=isTeamType(task.taskType)&&!member;
  if(title)title.textContent=whole?"确认验收并划拨资金？":("确认 "+(member?member.nickname:"")+" 的交付？");
  if(warning)warning.textContent=whole
    ?"注意：确认后托管报酬将立即结算划拨至对方账户，当前专属群聊随即转为「只读归档」状态并从活跃会话移入归档库；历史记录永久保留，但不能再发送新消息。"
    :"注意：确认后该参与者的份额立即结算划拨；全部完成者确认完后，本群聊将转为「只读归档」状态并移入归档库，历史记录永久保留但不能再发送新消息。";
  if(btn)btn.textContent=whole?"确认并归档":"确认完成";
  openModal("chatroomConfirmModal");
}
function setBtnBusy(btn,busy,busyText,idleText){
  if(!btn)return;
  btn.disabled=!!busy;
  if(busy&&busyText)btn.textContent=busyText;
  if(!busy&&idleText)btn.textContent=idleText;
}
function toastOk(msg){if(typeof window.toast==="function")window.toast(msg);}
/* 任务动作完成后：右栏（状态/按钮）与会话流都要刷新（归档后 readOnly 会变，群要移进归档库） */
function refreshAfterTaskAction(){
  var id=state.active?state.active.id:null;
  return Promise.all([loadContext(id),loadConversations()]).then(function(){
    var c=state.active;
    /* 只有「这个群真的被封存了」才自动翻到归档库；教学/求助未确认完时不上跳 */
    if(c&&isVault(c)&&scope!=='vault')switchScope('vault');
  });
}
function doSubmitTask(){
  var ctx=state.context;if(!ctx||!ctx.task)return;
  var btn=$("chatroomSubmitConfirmBtn");
  closeModal("chatroomSubmitModal");
  setBtnBusy(btn,true,"提交中…",null);
  api("/api/tasks/"+ctx.task.id+"/submit","POST").then(function(){
    toastOk("已提交，等待发布方验收");
    return refreshAfterTaskAction();
  }).catch(function(e){showError(e);}).then(function(){setBtnBusy(btn,false,null,"确认提交");});
}
function doConfirmTask(){
  var ctx=state.context;if(!ctx||!ctx.task)return;
  var pending=state.pendingConfirm;
  var perMember=!!(pending&&pending.claimerId);
  var url=perMember
    ? "/api/tasks/"+ctx.task.id+"/claims/"+pending.claimerId+"/confirm"
    : "/api/tasks/"+ctx.task.id+"/confirm";
  var btn=$("chatroomConfirmBtn");
  closeModal("chatroomConfirmModal");
  setBtnBusy(btn,true,"确认中…",null);
  api(url,"POST").then(function(){
    toastOk("已确认，资金已划拨");
    state.pendingConfirm=null;
    return refreshAfterTaskAction();
  }).catch(function(e){showError(e);}).then(function(){setBtnBusy(btn,false,null,perMember?"确认完成":"确认并归档");});
}
/* ---------- 右栏抽屉（移动端 / 窄屏） ---------- */
function openDrawer(){
  var p=$("chatroomSidePanel"),m=$("chatroomDrawerMask");
  if(p)p.classList.add("show");
  if(m)m.classList.add("show");
}
function closeDrawer(){
  var p=$("chatroomSidePanel"),m=$("chatroomDrawerMask");
  if(p)p.classList.remove("show");
  if(m)m.classList.remove("show");
}
/* ============================================================
   五、会话切换与消息
   ============================================================ */
function openConversation(c){
  if(!c)return;
  state.active=c;state.context=null;state.pendingConfirm=null;
  var shell=$('chatroomShell');if(shell){shell.classList.add('chat-selected');shell.classList.add('chat-open');}
  closeDrawer();
  var unread=c.unreadCount||0,mentions=c.mentionUnread||0;
  c.unreadCount=0;c.mentionUnread=0;
  /* 纯点击只切高亮与未读角标：不动 lastMessageTime、不重建列表 → 顺序与滚动位置原地不动 */
  updateSelection();updateUnreadBadge();
  var title=$('chatroomTitle'),desc=$('chatroomDesc');
  if(title)title.textContent=c.title||c.peerNickname||'会话';
  if(desc)desc.textContent=c.type==='channel'?'公共频道':(c.type==='group'?'专属群聊':'私聊');
  syncArchiveState(c);
  syncComposer();
  renderContext();      /* 先清掉上一个会话的合约卡，避免串台 */
  loadContext(c.id);    /* 右栏与消息并行拉取，互不阻塞 */
  api('/api/chat/conversations/'+c.id+'/messages?size=50').then(function(d){state.messages=(d&&d.records)||[];renderMessages();scrollMessagesToEnd();return api('/api/chat/conversations/'+c.id+'/read','POST')})
    .then(function(){return loadConversations()})
    .catch(function(e){c.unreadCount=unread;c.mentionUnread=mentions;renderList();updateUnreadBadge();showError(e)});
}
/* 按会话 ID 打开（「我的任务」的任务群「进入群聊」用）：
   列表里没有就刷新一次会话列表再找——刚被拉进群时本地列表可能还没同步到。 */
function openById(conversationId){
  if(!conversationId)return;
  var hit=findConversation(conversationId);
  if(hit){
    /* 目标会话可能在归档库里：先把左栏切到它所在的那一档，避免「打开了但列表里找不到」 */
    var want=isVault(hit)?'vault':'active';
    if(scope!==want){scope=want;renderList();}
    openConversation(hit);return;
  }
  loadConversations().then(function(){
    var c=findConversation(conversationId);
    if(c){var want=isVault(c)?'vault':'active';if(scope!==want){scope=want;renderList();}openConversation(c);}
    else showError(new Error('会话不存在或你尚未加入该群'));
  });
}
/* 只读会话（read_only=1）改成只读：隐藏输入区、换一句锁定说明。
   后端 requireCanSend 会拒发（只读公告频道对普通用户、已归档任务群对所有人），前端先挡住，别让用户敲完才报错。
   ⚠️ 用 style.display='' 恢复显示，所以 CSS 里 .chatroom-composer / .chatroom-archived 不能写 display。
   ⚠️ 文案按类型区分：只读公告频道讲的是频道规则，只有已结案的任务群才提「资金已按合约结算」。 */
function syncArchiveState(c){
  var readOnly=!!(c&&c.readOnly);
  var composer=$('chatroomComposer'),note=$('chatroomArchivedNote');
  if(composer)composer.style.display=readOnly?'none':'';
  if(note)note.style.display=readOnly?'':'none';
  if(readOnly){
    var channel=!!(c&&c.type==='channel');
    var l1=$('chatroomArchivedLine1'),l2=$('chatroomArchivedLine2');
    if(l1)l1.textContent=channel?'该频道为只读公告，历史消息仅供查阅':'协作记录已结案锁定，历史存档仅供查阅';
    if(l2)l2.textContent=channel?'只有频道管理员可以继续发布':'资金已按合约结算，本会话不再接受新消息';
  }
}
/* 未读数问询：主站「我的任务」卡片上的「进入群聊」小红点靠它拿数（会话列表没拉回来时返回 0） */
function unreadOf(conversationId){
  if(conversationId==null)return 0;
  for(var i=0;i<state.conversations.length;i++){
    var c=state.conversations[i];
    if(String(c.id)===String(conversationId))return c.unreadCount||0;
  }
  return 0;
}
/* 会话列表刷新后通知主站重算卡片红点（主站以 window.onChatroomUnreadChanged 注册） */
function notifyUnreadChanged(){
  if(typeof window.onChatroomUnreadChanged==='function')window.onChatroomUnreadChanged();
}
/* 按消息 id 去重写入：REST 回包与 STOMP 广播可能是同一条 */
function upsertMessage(m){
  if(!m||m.id==null)return;
  for(var i=0;i<state.messages.length;i++){
    if(String(state.messages[i].id)===String(m.id)){state.messages[i]=m;return;}
  }
  state.messages.push(m);
}
/* 新消息自然升顶：把该会话的排序键推到消息时间再重排。只有真收到/发出消息才动顺序。 */
function bumpConversation(conversationId,at,preview){
  var c=findConversation(conversationId);if(!c)return;
  raiseOrder(conversationId,at);
  c.lastMessageTime=at||new Date().toISOString();
  if(preview!=null)c.lastMessagePreview=preview;
  renderList();
}
/* 发送统一走 REST：敏感词/禁言/频率等错误能回显；接收走 STOMP */
function sendMessage(){
  if(!state.active)return;var input=$('chatroomInput');if(!input)return;var content=input.value.trim();if(!content)return;
  var dto={content:content,clientMsgId:'c'+Date.now()+Math.random().toString(16).slice(2)};input.value='';syncComposer();
  var conversationId=state.active.id;
  api('/api/chat/conversations/'+conversationId+'/messages','POST',dto).then(function(m){
    upsertMessage(m);renderMessages();
    bumpConversation(conversationId,(m&&m.createdAt)||null,content);
  }).catch(function(e){showError(e);input.value=content;syncComposer()});
}
function recallMessage(id){api('/api/chat/messages/'+id+'/recall','POST').then(function(){var m=state.messages.find(function(x){return x.id===id});if(m)m.status='recalled';renderMessages()}).catch(showError)}
function showError(e){var msg=e&&e.message?e.message:'操作失败';if(/未登录|登录已过期|请求失败/.test(msg)&&!(window.sessionStorage&&sessionStorage.getItem('token')))return;var el=$('chatroomError');if(el){el.textContent=msg;setTimeout(function(){el.textContent=''},3500)}}
var conversationLoadPromise=null,conversationRefreshTimer=null,conversationLoadToken=null,conversationGeneration=0;
function resetChatSession(){
  conversationGeneration++;conversationLoadPromise=null;conversationLoadToken=null;
  if(conversationRefreshTimer){clearTimeout(conversationRefreshTimer);conversationRefreshTimer=null;}
  var client=state.client;state.client=null;state.clientToken=null;state.connected=false;state.subs={};
  if(client)client.deactivate();
  state.conversations=[];state.active=null;state.messages=[];state.context=null;state.pendingConfirm=null;
  state.receivedMessageIds=[];state.eventVersion=0;ctxCache={};ctxPending={};
  stopRewardLoop();renderList();renderMessages();renderContext();syncComposer();updateUnreadBadge();notifyUnreadChanged();
}
window.chatroomReset=resetChatSession;
function scheduleConversationRefresh(){
  if(conversationRefreshTimer)return;
  conversationRefreshTimer=setTimeout(function(){conversationRefreshTimer=null;loadConversations();},250);
}
function loadConversations(){
  var token=chatToken();
  if(conversationLoadToken!==token){resetChatSession();conversationLoadToken=token;}
  if(!token)return Promise.resolve();
  if(conversationLoadPromise)return conversationLoadPromise;
  var version=state.eventVersion||0,generation=conversationGeneration;
  var request=api('/api/chat/conversations').then(function(d){
    if(token!==chatToken()||generation!==conversationGeneration)return;
    var old=state.conversations;
    state.conversations=(d||[]).map(function(c){
      c=normalizeConversation(c);
      var previous=old.find(function(x){return String(x.id)===String(c.id)});
      /* 请求期间到达的实时事件不能被较旧快照覆盖；下一次校准仍以服务端为准。 */
      if(previous&&previous.eventVersion>version){
        ['unreadCount','mentionUnread','lastMessageTime','lastMessagePreview','orderAt','eventVersion'].forEach(function(k){c[k]=previous[k]});
      }
      return c;
    });
    Object.keys(state.subs).forEach(function(id){
      if(!state.conversations.some(function(c){return String(c.id)===id})){
        if(state.subs[id]&&state.subs[id].unsubscribe)state.subs[id].unsubscribe();delete state.subs[id];
      }
    });
    renderList();updateUnreadBadge();ensureClient();
    state.conversations.forEach(function(c){subscribeConversation(c.id)});
    if(state.active){var fresh=findConversation(state.active.id);if(fresh){state.active=fresh;syncArchiveState(fresh);}}
    notifyUnreadChanged();
  }).catch(function(e){if(token===chatToken()&&generation===conversationGeneration&&!/未登录|登录/.test(e.message||''))showError(e)})
    .finally(function(){if(conversationLoadPromise===request)conversationLoadPromise=null;});
  conversationLoadPromise=request;return request;
}
function updateUnreadBadge(){var n=state.conversations.reduce(function(a,c){return a+(c.mentionUnread||0)},0);var b=document.getElementById('chatUnreadBadge');if(b){b.textContent=n>99?'99+':n;b.hidden=n===0}}
function openCreateModal(){var m=$('chatroomCreateModal');if(m)m.classList.add('show')}
function closeCreateModal(){var m=$('chatroomCreateModal');if(m)m.classList.remove('show')}
function createGroup(){var n=$('chatroomGroupName').value.trim();if(!n){showError(new Error('请输入群名称'));return}api('/api/chat/groups','POST',{name:n,description:$('chatroomGroupDescription').value.trim(),visibility:$('chatroomGroupVisibility').value}).then(function(){closeCreateModal();return loadConversations()}).catch(showError)}
function openDirect(userId){if(!userId)return;api('/api/chat/conversations/direct','POST',{targetUserId:userId}).then(function(c){state.active=c;return loadConversations().then(function(){openConversation(c)})}).catch(showError)}
function backToList(){
  var shell=$('chatroomShell');if(shell)shell.classList.remove('chat-open');
  closeDrawer();
}
/* ---------- 对外入口（供 HTML 内联 onclick 与主站调用） ---------- */
window.chatroomOpen=openConversation;window.chatroomBack=backToList;window.chatroomOpenDirect=openDirect;window.chatroomOpenCreate=openCreateModal;window.chatroomCloseCreate=closeCreateModal;window.chatroomCreateGroup=createGroup;window.chatroomSend=sendMessage;
window.chatroomRefresh=loadConversations;
window.chatroomOpenById=openById;
window.chatroomUnreadOf=unreadOf;
window.chatroomScope=switchScope;
window.chatroomEnter=function(){window.dispatchEvent(new Event("chatroom:enter"));};
window.chatroomLeave=function(){window.dispatchEvent(new Event("chatroom:leave"));};
window.chatroomOpenDrawer=openDrawer;
window.chatroomCloseDrawer=closeDrawer;
window.chatroomCloseModal=closeModal;
window.chatroomDoSubmit=doSubmitTask;
window.chatroomDoConfirm=doConfirmTask;
window.chatroomLoadContext=function(){return loadContext(state.active?state.active.id:null)};
document.addEventListener('click',function(e){
  /* 点遮罩关弹窗（建群 / 提交确认 / 确认划拨共用） */
  if(e.target&&e.target.classList&&e.target.classList.contains('chatroom-modal')){e.target.classList.remove('show');}
});
/* ============================================================
   六、实时通道（STOMP）
   ============================================================ */
function ensureClient(){
  var token=chatToken();
  if(state.client&&state.clientToken!==token){
    var oldClient=state.client;state.client=null;state.connected=false;state.subs={};oldClient.deactivate();
  }
  if(state.client||state.connected||!token)return;
  if(typeof SockJS==='undefined'||typeof StompJs==='undefined')return;
  var base=(typeof API_BASE==='string')?API_BASE:'';
  var hasConnected=false;
  var client=new StompJs.Client({webSocketFactory:function(){return new SockJS(base+'/ws/chat');},connectHeaders:{Authorization:'Bearer '+token},debug:function(){},reconnectDelay:3000});
  client.onConnect=function(){
    if(state.client!==client||token!==chatToken()){client.deactivate();return;}
    state.connected=true;state.subs={};
    state.conversations.forEach(function(c){subscribeConversation(c.id)});
    if(hasConnected)loadConversations();hasConnected=true;
    var status=document.getElementById('chatroomStatus');if(status)status.textContent='实时连接已建立';
  };
  client.onWebSocketClose=function(){if(state.client===client){state.connected=false;state.subs={};}};
  client.onStompError=function(){
    if(state.client!==client)return;
    state.connected=false;state.subs={};client.reconnectDelay=0;client.deactivate();
    var status=document.getElementById('chatroomStatus');if(status)status.textContent='实时连接受限，请重新登录或刷新后重试';
  };
  state.client=client;state.clientToken=token;
  client.activate();
}
/* 每个会话只订阅一次；断线重连时订阅表会被清空，之后重新订阅 */
function subscribeConversation(id){
  if(!state.client||!state.connected)return;
  var key=String(id);
  if(state.subs[key])return;
  var client=state.client,token=chatToken();
  state.subs[key]=client.subscribe('/topic/chat.'+key,function(frame){
    if(state.client!==client||token!==chatToken())return;
    var evt;try{evt=JSON.parse(frame.body)}catch(e){return}
    if(evt.type==='message'){
      var m=evt.payload;
      if(!m||String(m.conversationId)!==key)return;
      var c=findConversation(m.conversationId);
      if(!c){scheduleConversationRefresh();return;}
      var seen=state.receivedMessageIds||(state.receivedMessageIds=[]);
      var eventId=key+':'+String(m.id);
      if(seen.indexOf(eventId)!==-1)return;
      seen.push(eventId);if(seen.length>1000)seen.shift();
      state.eventVersion=(state.eventVersion||0)+1;c.eventVersion=state.eventVersion;
      if(String(m.senderId)!==String(currentUserId())){
        c.unreadCount=(c.unreadCount||0)+1;
        if((m.mentionUserIds||[]).some(function(id){return String(id)===String(currentUserId())}))c.mentionUnread=(c.mentionUnread||0)+1;
      }
      if(state.active&&String(state.active.id)===String(m.conversationId)){upsertMessage(m);renderMessages();}
      /* 收到新消息 → 该会话时间戳推到现在，会话流里自然升顶 */
      bumpConversation(m.conversationId,(m&&m.createdAt)||null,m&&m.content);
      updateUnreadBadge();notifyUnreadChanged();
    }else if(evt.type==='recall'&&state.active&&String(state.active.id)===key){
      var r=state.messages.find(function(x){return String(x.id)===String(evt.payload.messageId)});
      if(r)r.status='recalled';renderMessages();
    }
  });
}
/* ============================================================
   七、输入区与移动端手势
   ============================================================ */
function syncComposer(){
  var input=$('chatroomInput'),counter=$('chatroomCounter');if(!input||!counter)return;
  var len=input.value.length;counter.textContent=len?len+' / 1000':'';counter.classList.toggle('warn',len>900);
}
function bindComposer(){
  var input=$('chatroomInput'),jump=$('chatroomJump');
  if(input){
    input.addEventListener('input',syncComposer);
    input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
    syncComposer();
  }
  if(jump){
    jump.addEventListener('click',scrollMessagesToEnd);
    var box=$('chatroomMessages');
    if(box)box.addEventListener('scroll',updateJump,{passive:true});
  }
}
/* 移动端右滑返回列表：横向右滑超过阈值即退回。
   监听必须 {passive:false} 并 preventDefault —— 否则浏览器会把同一次滑动
   当成「网页后退/前进」手势吃掉，页面直接被推走。 */
function bindSwipeBack(){
  var main=$('chatroomMainPanel');
  if(!main)return;
  var startX=0,startY=0,horizontal=false,firstMove=true;
  var threshold=60;
  main.addEventListener('touchstart',function(e){
    if(window.innerWidth>768)return;
    startX=e.touches[0].clientX;startY=e.touches[0].clientY;horizontal=false;firstMove=true;
  },{passive:true});
  main.addEventListener('touchmove',function(e){
    if(window.innerWidth>768||!startX||!startY)return;
    var diffX=e.touches[0].clientX-startX,diffY=e.touches[0].clientY-startY;
    if(firstMove){
      if(Math.abs(diffX)>Math.abs(diffY)&&Math.abs(diffX)>10)horizontal=true;
      firstMove=false;
    }
    if(horizontal&&diffX>0)e.preventDefault();
  },{passive:false});
  main.addEventListener('touchend',function(e){
    if(window.innerWidth>768||!horizontal){startX=0;startY=0;horizontal=false;return;}
    if(e.changedTouches[0].clientX-startX>threshold)backToList();
    startX=0;startY=0;horizontal=false;
  });
}
document.addEventListener('DOMContentLoaded',function(){
  var send=$('chatroomSend');if(send)send.addEventListener('click',sendMessage);
  var create=$('chatroomCreateBtn');if(create)create.addEventListener('click',openCreateModal);
  bindComposer();
  bindSwipeBack();
  loadConversations();ensureClient();
  /* 泡点：进入协作工作台即开始计时；页面隐藏或长时间无操作时暂停上报 */
  ['click','keydown','scroll','mousemove','touchstart'].forEach(function(ev){
    document.addEventListener(ev,markRewardActivity,{passive:true});
  });
  document.addEventListener('visibilitychange',function(){
    if(document.hidden)stopRewardLoop();else{markRewardActivity();startRewardLoop();}
  });
  /* 离开协作工作台页即停止上报（回来时由 go('lab') 重新启动） */
  window.addEventListener('chatroom:leave',stopRewardLoop);
  window.addEventListener('chatroom:enter',function(){markRewardActivity();loadRewardStatus();startRewardLoop();});
  if(chatroomVisible()){loadRewardStatus();startRewardLoop();}
});
})();
