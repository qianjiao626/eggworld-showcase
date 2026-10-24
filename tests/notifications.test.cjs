const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('growth-schoolv3.html', 'utf8');
function setup() {
  const badge = {textContent:'', hidden:true, classList:{toggle(name,hide){badge.hidden=hide;}}};
  const events = {}; const intervals = [];
  const ctx = { USER:{registered:true}, sessionStorage:{getItem:()=> 'account-A'},
    document:{hidden:false, querySelectorAll:selector=>selector==='.bell-badge'?[badge]:[], getElementById:()=>badge,
      addEventListener:(name,fn)=>events[name]=fn}, window:{addEventListener:(name,fn)=>events[name]=fn},
    setInterval:(fn,delay)=>intervals.push({fn,delay}), escapeHtml:s=>s, toast:()=>{},
    apiGet:async()=>({code:200,data:{unread:6,records:[{id:1,isRead:0,text:'任务新动态'}]}}),
    apiPut:async()=>({code:200}) };
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('  /* ===== Notification System ===== */'), html.indexOf('  document.addEventListener(\'click\'', html.indexOf('  /* ===== Notification System ===== */'))),ctx);
  return {ctx,badge,events,intervals};
}
test('counts full server unread total, not just first page or pending tasks',async()=>{
 const {ctx,badge}=setup(); await ctx.loadNotifs(true); assert.equal(badge.textContent,6); assert.equal(badge.hidden,false);
});
test('zero unread hides badge',async()=>{
 const {ctx,badge}=setup(); ctx.apiGet=async()=>({code:200,data:{unread:0,records:[]}}); await ctx.loadNotifs(true); assert.equal(badge.hidden,true);
});
test('mark-read failure preserves unread state',async()=>{
 const {ctx}=setup(); await ctx.loadNotifs(true); ctx.apiPut=async()=>({code:500}); await ctx.readNotif(1); assert.equal(ctx.notifications[0].unread,true);
});
test('mark-read success reloads server count',async()=>{
 const {ctx,badge}=setup(); await ctx.loadNotifs(true); ctx.apiGet=async()=>({code:200,data:{unread:5,records:[{id:1,isRead:1}]}}); await ctx.readNotif(1); assert.equal(badge.textContent,5);
});
test('response from previous account cannot overwrite new account',async()=>{
 const {ctx}=setup(); let resolve; ctx.apiGet=()=>new Promise(r=>resolve=r); const request=ctx.loadNotifs(true); ctx.sessionStorage.getItem=()=> 'account-B'; resolve({code:200,data:{unread:7,records:[{id:99}]}}); await request; assert.equal(ctx.notifications.length,0);
});
test('failed clear-all keeps count and unread state',async()=>{
 const {ctx,badge}=setup(); await ctx.loadNotifs(true); ctx.apiPut=async()=>({code:500}); await ctx.clearNotif(); assert.equal(badge.textContent,6); assert.equal(ctx.notifications[0].unread,true);
});
test('polls every 15 seconds only while signed in and visible',async()=>{
 const {ctx,intervals}=setup(); const poll=intervals.find(i=>i.delay===15000); assert.ok(poll); let requests=0; ctx.apiGet=async()=>{requests++;return {code:500}}; ctx.document.hidden=true; await poll.fn(); assert.equal(requests,0); ctx.document.hidden=false; await poll.fn(); assert.equal(requests,1);
});
test('local hint is not invented as a server unread message',async()=>{
 const {ctx}=setup(); ctx.apiGet=async()=>({code:500}); ctx.addNotif('本地提示','info'); assert.equal(ctx.notifications.length,0);
});
test('older polling response cannot overwrite a newer response',async()=>{
 const {ctx,badge}=setup(); let resolve; ctx.apiGet=()=>new Promise(r=>resolve=r); const old=ctx.loadNotifs(true); ++ctx.notifRequestVersion; ctx.apiGet=async()=>({code:200,data:{unread:2,records:[]}}); await ctx.loadNotifs(true); resolve({code:200,data:{unread:9,records:[]}}); await old; assert.equal(badge.textContent,2);
});
test('reading all refreshes persisted zero',async()=>{
 const {ctx,badge}=setup(); await ctx.loadNotifs(true); ctx.apiGet=async()=>({code:200,data:{unread:0,records:[]}}); await ctx.clearNotif(); assert.equal(badge.hidden,true);
});
test('focus and visible events refresh; hidden and logged-out pages do not',async()=>{
 const {ctx,events}=setup(); let count=0; ctx.apiGet=async()=>{count++;return {code:500}}; await events.focus(); await events.visibilitychange(); assert.equal(count,1); ctx.USER.registered=false; await events.focus(); assert.equal(count,1);
});
test('pagination requests older messages without replacing full unread count by page length',async()=>{
 const {ctx,badge}=setup(); let path; ctx.apiGet=async p=>{path=p;return {code:200,data:{unread:60,records:[]}}}; await ctx.changeNotifPage(1); assert.ok(path.includes('page=2')); assert.equal(badge.textContent,60);
});
test('expired session clears cached notifications and does not keep polling without token',async()=>{
 const {ctx,badge}=setup(); await ctx.loadNotifs(true); let requests=0;
 ctx.apiGet=async()=>{requests++;ctx.sessionStorage.getItem=()=>null;return {code:401}};
 await ctx.loadNotifs(true); assert.equal(badge.hidden,true); assert.equal(ctx.notifications.length,0);
 await ctx.refreshVisibleNotifs(); assert.equal(requests,1);
});

test('background refresh fetches only unread count, not notification bodies',async()=>{
 const {ctx}=setup(); let path; ctx.apiGet=async p=>{path=p;return {code:200,data:{unread:3}}};
 await ctx.refreshVisibleNotifs(); assert.equal(path,'/api/users/me/notifications/unread-count');
});
test('simultaneous focus and visibility refreshes coalesce',async()=>{
 const {ctx}=setup();let calls=0,release;ctx.apiGet=()=>{calls++;return new Promise(r=>release=r)};
 const a=ctx.refreshVisibleNotifs(),b=ctx.refreshVisibleNotifs();assert.equal(calls,1);
 release({code:200,data:{unread:3}});await Promise.all([a,b]);
});

test('backoff including jitter never exceeds 120 seconds',()=>{
 const {ctx}=setup();vm.runInContext('Date.now=()=>1000;Math.random=()=>1;notifRefreshFailures=4;notifRefreshOutcome(false);',ctx);
 assert.equal(ctx.notifNextRefreshAt,121000);
});
test('old account network failures cannot delay polling for the current account',async()=>{
 const {ctx}=setup();let reject;ctx.apiGet=()=>new Promise((resolve,r)=>{reject=r;});
 const pending=ctx.loadNotifCount();ctx.sessionStorage.getItem=()=> 'account-B';reject(new Error('offline'));await pending;
 assert.equal(ctx.notifRefreshFailures,0);assert.equal(ctx.notifNextRefreshAt,0);
});
test('count refresh shares an active list fetch instead of racing its unread snapshot',async()=>{
 const {ctx,badge}=setup();let calls=0,release;ctx.apiGet=()=>{calls++;return new Promise(r=>{release=r;});};
 const list=ctx.loadNotifs(true),count=ctx.loadNotifCount();assert.equal(calls,1);
 release({code:200,data:{unread:7,records:[]}});await Promise.all([list,count]);assert.equal(badge.textContent,7);
});
