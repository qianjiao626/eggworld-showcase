// Opt-in real Chromium + real localhost API. Never target a deployed site.
// Run after AchievementMysqlIT and starting the backend against its random database.
// ACHIEVEMENT_BROWSER_TEST=true; PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE configure local tools.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('achievement real API and browser acceptance', {skip:process.env.ACHIEVEMENT_BROWSER_TEST !== 'true',timeout:240000}, async()=>{
 const root=process.env.ACHIEVEMENT_LOCAL_ROOT || 'D:/CodexData/local/eggworld';
 const evidence=path.join(root,'achievement-evidence');fs.mkdirSync(evidence,{recursive:true});
 const db=fs.readFileSync(path.join(root,'team-security-test/achievement-database.txt'),'utf8').trim();
 assert.match(db,/^eggworld_achievement_[a-f0-9]{32}$/);
 const config=fs.readFileSync(path.join(root,'achievement-application.properties'),'utf8');
 assert.ok(config.includes('127.0.0.1:3307/'+db+'?'),'backend must use the isolated IT database');
 const fixtures=JSON.parse(fs.readFileSync(path.join(root,'team-security-test/achievement-fixtures.json'),'utf8'));
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 const results=[],errors=[];
 const record=async(name,fn)=>{try{let details=await fn();results.push({name,status:'PASS',details});}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}};
 const base='http://127.0.0.1:8080';const ui='http://127.0.0.1:5500/growth-schoolv3.html';
 async function api(route,token,method='GET',data){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});return {http:r.status,...await r.json()};}
 async function login(which){const r=await api('/api/auth/login',null,'POST',{email:'achievement-'+which+'@example.invalid',password:process.env.ACHIEVEMENT_E2E_PASSWORD||''});assert.equal(r.code,200);return r.data.token;}
 async function newPage(token,width=1440,height=1000){const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});await ctx.addInitScript(t=>sessionStorage.setItem('token',t),token);const p=await ctx.newPage();p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));await p.goto(ui);await p.waitForFunction(()=>window.USER&&USER.registered);return p;}
 async function nav(p,text){await p.locator('#studentNav').getByText(text,{exact:true}).click();}
 async function clearUnlock(p){for(let i=0;i<35;i++){if(!await p.locator('#achUnlockModal').isVisible())break;let id=await p.locator('#achUnlockModal').getAttribute('data-uaid');await p.locator('#achUnlockModal').getByRole('button',{name:'收下'}).click();await p.waitForFunction(old=>{let m=document.querySelector('#achUnlockModal');return m.style.display!=='flex'||m.getAttribute('data-uaid')!==old;},id);}}
 async function shot(p,name){await p.screenshot({path:path.join(evidence,name+'.png')});}
 let p;
 try{
  const rich=await login('rich'),empty=await login('empty'),admin=await login('admin');
  await record('29: unauthenticated endpoints return HTTP401',async()=>{for(const route of ['/api/achievements','/api/achievements/mine','/api/achievements/unread','/api/deco/catalog','/api/users/me/equip'])assert.equal((await api(route)).http,401);});
  await record('14-17,26: unowned effects/title, cross-slot, malformed key denied',async()=>{for(const data of [{slot:'aura',key:'a-moon'},{slot:'title',key:'t-newbie'},{slot:'aura',key:'sk-gold'},{slot:'hat',key:'a-moon'},{slot:'aura',key:'<script>alert(1)</script>'}])assert.notEqual((await api('/api/users/me/equip',empty,'PUT',data)).code,200);});
  await record('admin permission and validated update',async()=>{
   assert.equal((await api('/api/admin/achievements',rich)).code,403);const a=(await api('/api/admin/achievements',admin)).data[0];
   try{assert.equal((await api('/api/admin/achievements/'+a.id,admin,'PUT',{enabled:0,condValue:a.condValue,sortOrder:a.sortOrder})).code,200);assert.notEqual((await api('/api/admin/achievements/'+a.id,admin,'PUT',{enabled:1,condValue:-1,sortOrder:0})).code,200);}
   finally{assert.equal((await api('/api/admin/achievements/'+a.id,admin,'PUT',{enabled:a.enabled,condValue:a.condValue,sortOrder:a.sortOrder})).code,200);}
  });
  p=await newPage(rich);await p.waitForTimeout(600);await clearUnlock(p);
  await record('24: 30 cards, nine categories plus All, light DOM',async()=>{await nav(p,'成就殿堂');await p.waitForSelector('#achList .ach-card');assert.equal(await p.locator('#achList .ach-card').count(),30);assert.equal(await p.locator('#achCatRow button').count(),10);assert.equal(await p.locator('#achList .deco-light').count(),30);assert.equal(await p.locator('#achList .fx-rays,#achList .fx-wave,#achList .r-orbit').count(),0);await shot(p,'desktop-achievements');});
  await record('13,18,19,22: seven-slot UI equip/unload/persist and layer order',async()=>{
   await p.getByRole('button',{name:'我的装扮',exact:true}).click();assert.equal(await p.locator('#decoSlots .deco-srow').count(),7);
   const choices=['星海','星河之翼','学生制服','彩虹边框','皇冠','早起的蛋','黄金蛋'];
   for(let i=0;i<choices.length;i++){await p.locator('#decoSlots .deco-srow').nth(i).getByRole('button',{name:choices[i],exact:true}).click();await p.waitForFunction(()=>!equipBusy);await p.waitForTimeout(120);}
   await p.waitForSelector('#decoPreview .a-cosmos.cl-galaxy.of-uniform.f-rainbow.ch-crown.sk-gold');
   assert.equal(await p.locator('#decoPreview .deco-title').textContent(),'早起的蛋');
   assert.deepEqual(await p.locator('#decoPreview .deco-canvas').evaluate(e=>['.fx-rays','.fx-core','.fx-wave','.fx-cloak','.r-ring','.egg-img','.fx-outfit','.fx-frame','.fx-charm'].map(s=>getComputedStyle(e.querySelector(s)).zIndex)),['0','1','2','3','4','5','6','7','8']);
   await p.locator('#decoSlots .deco-srow').first().getByRole('button',{name:'不佩戴',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#decoPreview .a-cosmos'));
   assert.equal((await api('/api/users/me/equip',rich)).data.aura,null);
   await p.reload();await nav(p,'成就殿堂');await p.getByRole('button',{name:'我的装扮',exact:true}).click();assert.equal(await p.locator('#decoPreview .a-cosmos').count(),0);
   await p.locator('#decoSlots .deco-srow').first().getByRole('button',{name:'星海',exact:true}).click();await p.waitForSelector('#decoPreview .a-cosmos');assert.equal(await p.locator('#sidebarDecoHost .title-plain').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');await shot(p,'desktop-equip');
  });
  await record('25: effects off and reduced-motion retain static decoration',async()=>{
   await p.locator('#decoFxToggle').uncheck();assert.equal(await p.locator('#decoPreview .fx-outfit').evaluate(e=>getComputedStyle(e).animationName),'none');assert.notEqual(await p.locator('#decoPreview .fx-core').evaluate(e=>getComputedStyle(e).display),'none');await shot(p,'effects-off');
   await p.locator('#decoFxToggle').check();await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('#decoPreview .fx-outfit').evaluate(e=>getComputedStyle(e).animationName),'none');await p.emulateMedia({reducedMotion:'no-preference'});
  });
  await record('26-28: live DOM injection attacks and duplicate token hydration',async()=>{
   const r=await p.evaluate(async()=>{
    window.__decoXss=0;const evil='<img src=x onerror="window.__decoXss=1"><script>window.__decoXss=2</script>';
    const host=document.createElement('div');host.id='deco-security-fixture';document.body.append(host);
    const bads=['<script>alert(1)</script>','a-moon\" onclick=alert(1)','sk-gold','a-moon x',"a-moon');alert(1)//"];
    for(const key of bads){const target=document.createElement('div');host.append(target);decoMount(target,{deco:{aura:key,titleName:evil,titleStyle:'title-gold onclick=alert(1)'},img:'javascript:window.__decoXss=3',light:true});}
    const copy=decoBuild({deco:{aura:'a-moon'},light:true});const twins=document.createElement('div');host.append(twins);twins.innerHTML=copy+copy;await new Promise(resolve=>setTimeout(resolve,150));
    const result={executed:window.__decoXss,scripts:host.querySelectorAll('script,[onerror],[onclick]').length,badKeys:bads.some(k=>Array.from(host.querySelectorAll('.egg-deco')).some(e=>e.className.includes(k))),titles:Array.from(host.querySelectorAll('.deco-title')).filter(e=>e.textContent===evil).length,unsafeImage:!!host.querySelector('[src^="javascript:"]'),twins:twins.querySelectorAll('.a-moon').length,heavy:host.querySelectorAll('.fx-rays,.fx-wave,.r-orbit').length};host.remove();return result;
   });assert.equal(r.executed,0);assert.equal(r.scripts,0);assert.equal(r.badKeys,false);assert.equal(r.unsafeImage,false);assert.equal(r.titles,5);assert.equal(r.twins,2);assert.equal(r.heavy,0);return r;
  });
  await record('23: actual 50-row leaderboard, no heavy nodes, frame sample',async()=>{
   await nav(p,'神蛋榜单');await p.waitForFunction(()=>document.querySelectorAll('#page-rankhall .egg-deco').length>=50);assert.equal(await p.locator('#page-rankhall .fx-rays,#page-rankhall .fx-wave,#page-rankhall .r-orbit').count(),0);
   const sample=await p.evaluate(()=>new Promise(resolve=>{let values=[],last=performance.now();function tick(now){values.push(now-last);last=now;if(values.length<120)requestAnimationFrame(tick);else{values.sort((a,b)=>a-b);resolve({frames:values.length,p95Ms:values[113],maxMs:values.at(-1),avatars:document.querySelectorAll('#page-rankhall .egg-deco').length});}}requestAnimationFrame(tick);}));await shot(p,'desktop-ranking');return sample;
  });
  await record('20: user modal full-effect host',async()=>{
   await nav(p,'神蛋榜单');await p.getByText('榜单验收0',{exact:true}).first().click();await p.waitForSelector('#userEggModal .egg-deco',{state:'visible'});assert.ok(await p.locator('#userEggModal .fx-field').count());await shot(p,'user-card');await p.evaluate(()=>document.querySelector('#userEggModal').style.display='none');
  });
  await record('20: real API task, gossip, anonymous complaints, invite decos',async()=>{
   const task=(await api('/api/tasks/'+fixtures.task,rich)).data;assert.ok(task.publisherDeco || task.deco);
   const post=(await api('/api/gossip/posts/'+fixtures.post,rich)).data;assert.ok(post.deco);assert.ok(post.answers.some(a=>a.deco));
   const wall=(await api('/api/complaints/wall',rich)).data;assert.ok(wall.some(i=>i.deco&&i.deco.aura));assert.equal(JSON.stringify(wall).includes('decorationUserId'),false);
   const invites=(await api('/api/users/me/invites',rich)).data;assert.ok(JSON.stringify(invites).includes('早起的蛋'));
   await nav(p,'技能变现');await p.waitForSelector('#page-plaza .egg-deco');await shot(p,'task-list');
   await nav(p,'八卦吃瓜');await p.waitForTimeout(400);assert.ok(await p.locator('#page-gossip .deco-light').count());await shot(p,'gossip');
   await p.evaluate(id=>showMyTaskDetail(id),fixtures.task);await p.waitForSelector('#taskDetailModal.show .deco-light',{state:'visible'});assert.equal(await p.locator('#taskDetailModal .deco-sm.deco-light').count(),1);assert.equal(await p.locator('#taskDetailModal .fx-rays,#taskDetailModal .fx-wave,#taskDetailModal .r-orbit').count(),0);await shot(p,'task-detail');await p.evaluate(()=>document.querySelector('#taskDetailModal').classList.remove('show'));
   const viewer=await newPage(empty);await viewer.evaluate(id=>showMyTaskDetail(id),fixtures.task);await viewer.waitForSelector('#taskDetailModal.show .td-pub .deco-sm.deco-light',{state:'visible'});assert.equal(await viewer.locator('#taskDetailModal .td-pub .deco-sm.deco-light').count(),1);await shot(viewer,'task-detail-publisher');await viewer.close();
   await p.evaluate(id=>showGossipDetail(id),fixtures.post);await p.waitForSelector('#gossipDetailModal.show .deco-light',{state:'visible'});assert.ok(await p.locator('#gossipDetailModal .deco-xs.deco-light').count()>=2);await shot(p,'gossip-detail');await p.evaluate(()=>{let m=document.querySelector('#gossipDetailModal');m.classList.remove('show');m.style.display='none';});
   await p.evaluate(()=>openInviteModal());await p.waitForSelector('#inviteHistoryList .deco-title',{state:'visible'});assert.equal(await p.locator('#inviteHistoryList .deco-title').first().textContent(),'早起的蛋');assert.equal(await p.locator('#inviteHistoryList .egg-deco').count(),0);await shot(p,'invite');await p.evaluate(()=>closeInviteModal());
   await nav(p,'大学黑榜');await p.waitForTimeout(400);assert.ok(await p.locator('#page-blacklist .deco-light').count());await shot(p,'complaints');
  });
  await record('32-36: viewport layout 375/390/430/1440',async()=>{
   const geometry=[];
   for(const width of [375,390,430,1440]){await p.setViewportSize({width,height:width===1440?1000:844});await nav(p,'成就殿堂');await p.getByRole('button',{name:'成就图鉴',exact:true}).click();await p.waitForTimeout(150);let g=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,userCard:document.querySelector('#userCard').getBoundingClientRect().toJSON()}));assert.equal(g.scroll,g.width);assert.ok(g.userCard.bottom<=(width===1440?1000:844));geometry.push(g);await shot(p,'achievements-'+width);
    await p.getByRole('button',{name:'我的装扮',exact:true}).click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);await shot(p,'equip-'+width);
   }return geometry;
  });
  await record('21,1: empty account default -> real checkin unlock popup/read',async()=>{
   const q=await newPage(empty);await q.waitForTimeout(500);await nav(q,'成就殿堂');await q.waitForSelector('#achList .ach-card');assert.equal(await q.locator('#achList .ach-card.done').count(),0);
   await q.getByRole('button',{name:'我的装扮',exact:true}).click();assert.equal(await q.locator('#decoSlots .deco-opt').count(),7);
   await q.locator('#checkinBtn').click();await q.waitForSelector('#achUnlockModal',{state:'visible'});assert.equal(await q.locator('#achUnlockName').textContent(),'初来乍到');assert.equal(await q.locator('#achUnreadBadge').textContent(),'1');assert.equal(await q.locator('#achUnreadBadge').isVisible(),true);await shot(q,'first-checkin-unlock');await clearUnlock(q);assert.equal((await api('/api/achievements/unread',empty)).data.length,0);await q.close();
  });
  await record('no uncaught browser exceptions',async()=>{assert.deepEqual(errors,[]);});
 } finally {fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({timestamp:new Date().toISOString(),database:db,results,errors},null,2));await browser.close();}
});
