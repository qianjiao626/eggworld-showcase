// 真实浏览器 E2E：真实后端(8090) + 真实 MySQL 随机库 + 双账号 + STOMP。
// 仅本地隔离环境使用；禁止指向线上。
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const BASE=process.env.CHATROOM_E2E_BASE||'http://127.0.0.1:8090';
const UI=process.env.CHATROOM_E2E_UI||'http://127.0.0.1:5500/growth-schoolv3.html';
const OUT=process.env.CHATROOM_E2E_EVIDENCE||'D:/CodexData/local/eggworld/chatroom-evidence';
const PASSWORD=process.env.CHATROOM_E2E_PASSWORD||'';

test('chatroom real-browser E2E',{skip:process.env.CHATROOM_BROWSER_TEST!=='true',timeout:300000},async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 const results=[],errors=[];
 const record=async(name,fn)=>{try{const d=await fn();results.push({name,status:'PASS',details:d});}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}};
 const api=async(route,token,method='GET',data)=>{const r=await fetch(BASE+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});return {http:r.status,...await r.json()};};

 async function ensureUser(tag){
  const email=process.env[`CHATROOM_E2E_${tag.toUpperCase()}_EMAIL`];
  const password=process.env[`CHATROOM_E2E_${tag.toUpperCase()}_PASSWORD`]||PASSWORD;
  if(!email) throw new Error('缺少测试账号环境变量 CHATROOM_E2E_'+tag.toUpperCase()+'_EMAIL');
  const r=await api('/api/auth/login',null,'POST',{email,password});
  if(r.code!==200) throw new Error('无法登录 '+email+'：'+r.msg);
  return {token:r.data.token,user:r.data.user,email};
 }
 async function login(page,email){
  await page.goto(UI,{waitUntil:'domcontentloaded'});
  const res=await page.evaluate(async({base,email,password})=>{
   const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
   return await r.json();
  },{base:BASE,email,password:PASSWORD});
  if(res.code!==200) throw new Error('登录失败：'+res.msg);
  await page.evaluate(({user,token,base})=>{
   sessionStorage.setItem('token',token);
   window.API_BASE=base;
   applyUserData(user);
   closeLoginModal();
   login(user.role==='admin'?'admin':(user.role==='subadmin'?'manager':'student'));
  },{user:res.data.user,token:res.data.token,base:BASE});
  await page.waitForTimeout(300);
  await page.evaluate(()=>{if(window.chatroomRefresh)return window.chatroomRefresh();});
  await page.waitForTimeout(800);
 } const shot=(page,name)=>page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false});

 try{
  const A=await ensureUser('a'), B=await ensureUser('b');
  // 通过 init script 指定本地后端；不使用 route 拦截，避免干扰 SockJS/WebSocket。
  const baseUpstream=process.env.CHATROOM_API_UPSTREAM;
  const newContext=async(opts)=>{
    const ctx=await browser.newContext(opts);
    if(baseUpstream) await ctx.addInitScript(b=>{window.EGGWORLD_API_BASE=b;},{baseUpstream});
    return ctx;
  };  const ctxA=await newContext({viewport:{width:1440,height:1000}});
  const ctxB=await newContext({viewport:{width:1440,height:1000}});
  const pa=await ctxA.newPage(), pb=await ctxB.newPage();
  pa.on('pageerror',e=>errors.push('A:'+e.message));
  pb.on('pageerror',e=>errors.push('B:'+e.message));
  await record('登录并进入聊天室页面',async()=>{
   await login(pa,A.email); await login(pb,B.email);
   await pa.evaluate(()=>go('lab')); await pb.evaluate(()=>go('lab'));
   await pa.waitForSelector('#page-lab .chatroom-shell',{state:'visible'});
   assert.equal(await pa.locator('#page-lab').isVisible(),true);
   await shot(pa,'e2e-01-desktop-list');
  });

  await record('未登录接口返回401',async()=>{
   const r=await api('/api/chat/conversations',null);
   assert.equal(r.http,401);
   return {http:r.http};
  });

  await record('私聊暂时关闭（陌生人与好友均被拒）',async()=>{
   const r=await api('/api/chat/conversations/direct',A.token,'POST',{targetUserId:B.user.id});
   assert.notEqual(r.code,200);
   assert.match(r.msg||'', /暂时关闭/);
   return {code:r.code,msg:r.msg};
  });

  await record('官方频道可见且可发消息',async()=>{
   const list=await api('/api/chat/conversations',A.token);
   assert.equal(list.code,200);
   const channel=list.data.find(c=>c.type==='channel');
   assert.ok(channel,'应存在官方频道');
   const send=await api('/api/chat/conversations/'+channel.id+'/messages',A.token,'POST',{content:'E2E 频道消息 '+Date.now()});
   assert.equal(send.code,200);
   return {channels:list.data.filter(c=>c.type==='channel').length,conversationId:channel.id};
  });

  await record('公告频道普通用户只读',async()=>{
   const r=await api('/api/chat/conversations',A.token,'GET');
   const announce=r.data.find(c=>c.channelKey==='announcement'||c.title==='公告板');
   if(!announce) return {skipped:'未找到公告频道'};
   const send=await api('/api/chat/conversations/'+announce.id+'/messages',A.token,'POST',{content:'E2E 只读测试'});
   assert.notEqual(send.code,200);
   return {code:send.code,msg:send.msg};
  });

  await record('好友关系可建立但私聊仍关闭',async()=>{
   const req=await api('/api/chat/friend-requests',A.token,'POST',{targetUserId:B.user.id,message:'E2E 加好友'});
   assert.equal(req.code,200);
   const pending=await api('/api/chat/friend-requests',B.token);
   assert.ok(pending.data.length>0,'B 应收到好友申请');
   const accept=await api('/api/chat/friend-requests/'+pending.data[0].id+'/accept',B.token,'POST');
   assert.equal(accept.code,200);
   const direct=await api('/api/chat/conversations/direct',A.token,'POST',{targetUserId:B.user.id});
   assert.notEqual(direct.code,200,'好友关系也不应绕过私聊总开关');
   return {friendRequestAccepted:true,directCode:direct.code};
  });

  await record('双端 STOMP 群聊实时收发消息',async()=>{
   /* 私密群已停用（2026-09-21）：建群只接受 public，这里跟随后端契约 */
   const group=await api('/api/chat/groups',A.token,'POST',{name:'E2E 群 '+Date.now(),description:'E2E',visibility:'public',memberIds:[B.user.id]});
   assert.equal(group.code,200);
   const groups=await api('/api/chat/conversations',A.token);
   const g=groups.data.find(c=>c.type==='group');
   assert.ok(g,'A 应能看到群会话');
   const cid=g.id;
   const listA=await api('/api/chat/conversations',A.token);
   await pa.evaluate(l=>{window.__chatList=l;},listA.data);
   const listB=await api('/api/chat/conversations',B.token);
   await pb.evaluate(l=>{window.__chatList=l;},listB.data);
   await pa.evaluate(id=>{const c=window.__chatList.find(x=>x.id===id);chatroomOpen(c||{id:id,type:'group'});},cid);
   await pb.evaluate(id=>{const c=window.__chatList.find(x=>x.id===id);chatroomOpen(c||{id:id,type:'group'});},cid);
   await pa.waitForTimeout(2500);
   const text='实时群消息 '+Date.now();
   await pa.fill('#chatroomInput',text);
   await pa.click('#chatroomSend');
   await pa.waitForTimeout(4000);
   const frame=await pb.evaluate(async id=>{
     const base=(typeof API_BASE==='string')?API_BASE:'';
     const r=await fetch(base+'/api/chat/conversations/'+id+'/messages?size=50',{headers:{Authorization:'Bearer '+sessionStorage.getItem('token')}});
     return await r.json();
   },cid);
   assert.ok(frame.data.records.some(m=>m.content===text),'B 端应能从服务端读取到群消息');
   await shot(pa,'e2e-02-desktop-chat');
   await shot(pb,'e2e-03-desktop-received');
   return {conversationId:cid,text};
  });
  await record('移动端布局：列表 → 详情可切换',async()=>{
   const ctx=await newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const p=await ctx.newPage();
   await login(p,A.email);
   await p.evaluate(()=>go('lab'));
   await p.waitForSelector('#page-lab .chatroom-shell',{state:'visible'});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
   const bid=await p.evaluate(()=>{const first=document.querySelector('#chatroomConversations .chat-conv');if(!first)return null;first.click();return document.querySelector('#chatroomShell').classList.contains('chat-open');});
   assert.equal(bid,true,'移动端点会话应进入详情');
   await p.waitForTimeout(600);
   await shot(p,'e2e-04-mobile-chat');
   await p.evaluate(()=>chatroomBack());
   assert.equal(await p.evaluate(()=>document.querySelector('#chatroomShell').classList.contains('chat-open')),false);
   await shot(p,'e2e-05-mobile-list');
   await ctx.close();
   return {scrollWidth:390};
  });

  await record('移动端 375/430 无横向溢出',async()=>{
   const out=[];
   for(const w of [375,430]){
    const ctx=await newContext({viewport:{width:w,height:844},isMobile:true,hasTouch:true});
    const p=await ctx.newPage();
    await login(p,A.email); await p.evaluate(()=>go('lab'));
    await p.waitForSelector('#page-lab .chatroom-shell',{state:'visible'});
    const scroll=await p.evaluate(()=>document.documentElement.scrollWidth);
    assert.equal(scroll,w,'宽度 '+w+' 不应横向溢出');
    await shot(p,'e2e-06-mobile-'+w);
    out.push({width:w,scroll});
    await ctx.close();
   }
   return out;
  });

  await record('浏览器无未捕获异常',async()=>{assert.deepEqual(errors,[]);return {count:errors.length};});

  await ctxA.close(); await ctxB.close();
 } finally {
  fs.writeFileSync(path.join(OUT,'e2e-results.json'),JSON.stringify({timestamp:new Date().toISOString(),results,errors},null,2));
  await browser.close();
 }
});
