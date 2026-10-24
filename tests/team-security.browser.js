async (page) => {
 const checks=[], errors=[], consoleErrors=[], dialogs=[], requests=[];
 const nick='<img src=x onerror=alert(1)>';
 const attack='<img src=x onerror=alert(1)>', req=attack+'\n第二行 <script>alert(2)</script>';
 let ranks=4, rankNick=nick;
 let ratingScenario=false;
 const quotedName="\\');alert(7);//\"";
 let userName=nick;
 const task={id:71001,publisherId:999,title:attack,description:attack,requirements:req,skillCategory:'study',skillSub:'<script>alert(3)</script>',taskType:'team',reward:10,status:'approved',claimMode:'multiple',maxClaimers:3};
 const post={id:72001,title:'本地打听回归',description:'说明',tag:'游戏搭子',isMine:true,bounty:10,answers:[{id:1,authorNickname:nick,content:'本地回答',likes:2}]};
 const user=()=>({id:998,nickname:userName,mbtiType:attack,eggCategory:'study',eggRarity:'N',exp:20,skills:Array(7).fill(attack),stats:{knowledge:1,skills:1,charm:1,money:1,reputation:4}});
 const context=page.context();
 await context.unroute('**/*');
 await page.setViewportSize({width:1440,height:900});
 await context.route('**/*',async route=>{
  const raw=route.request().url(); const parts=raw.match(/^https?:\/\/([^/:]+)(?::(\d+))?([^?]*)(?:\?(.*))?$/);
  const url={hostname:parts?.[1],port:parts?.[2],pathname:parts?.[3]||'',searchParams:{get:key=>{const m=(parts?.[4]||'').match(new RegExp('(?:^|&)'+key+'=([^&]*)'));return m?decodeURIComponent(m[1]):null;}}};
  if(url.pathname.startsWith('/api/')){
   requests.push({path:url.pathname,method:route.request().method()});let data=[];
   if(url.pathname==='/api/tasks/71001/rate-targets')data=[{userId:998,nickname:'本地搭子',ratedByMe:false}];
   else if(url.pathname==='/api/tasks/my-published'&&ratingScenario)data={records:[{task,publisherNickname:'本地发布者'}],total:1};
   else if(url.pathname==='/api/users/rankings')data={records:Array.from({length:ranks},(_,i)=>({userId:998+i,nickname:rankNick,exp:50-i,eggCategory:'study'}))};
   else if(url.pathname==='/api/admin/tasks/pending')data={records:[{task,publisherNickname:'本地发布者'}]};
   else if(url.pathname==='/api/admin/users')data={records:[user()]};
   else if(url.pathname==='/api/users/me')data={...user(),id:999,nickname:'本地发布者',inviteCode:'LOCAL',role:'student'};
   else if(url.pathname==='/api/complaints/rankings')data=[{schoolName:quotedName,metricScore:5,avgScore:5,count:1}];
   else if(url.pathname==='/api/gossip/rankings')data=Array.from({length:ranks},(_,i)=>({userId:998+i,nickname:rankNick,totalLikes:50-i}));
   else if(url.pathname==='/api/gossip/my-posts')data=[post];
   else if(url.pathname==='/api/gossip/posts/72001')data=post;
   else if(url.pathname==='/api/complaints/school')data={avgScore:5,count:1,rank:1,comments:[{userName:nick,content:'本地吐槽',score:5}]};
   else if(url.pathname.includes('/api/users/by-nickname')){userName=url.searchParams.get('nickname')||nick;data=user();}
   else if(url.pathname==='/api/tasks/71001')data={task,publisherNickname:'本地发布者',claims:[]};
   else if(url.pathname==='/api/users/999')data={...user(),id:999,nickname:'本地发布者'};
   else if(url.pathname==='/api/users/me/invites')data={records:[{inviteeNickname:nick,status:'pending'}],inviteCode:'LOCAL'};
   else if(url.pathname==='/api/health')data={status:'up',version:'local-mock'};
   else if(url.pathname.includes('/notifications'))data={records:[],unread:0};
   else if(url.pathname==='/api/tasks')data={records:url.searchParams.get('type')==='team'?[{task,publisherNickname:'本地发布者',publisherSchool:'本地大学'},{task:{...task,id:71002,taskType:'teach',claimMode:'single',createdAt:'2026-01-05T10:00:00'},publisherNickname:'本地发布者',publisherSchool:'本地大学'},{task:{...task,id:71003,taskType:'teach',claimMode:'single',signupDeadline:'2020-01-01T00:00:00'},publisherNickname:'别的发布者',publisherSchool:'本地大学'}]:[],total:3};
   else if(url.pathname.includes('my-published')||url.pathname.includes('my-claimed')||url.pathname==='/api/gossip/posts')data={records:[],total:0};
   return route.fulfill({json:{code:200,data}});
  }
  if(url.hostname==='127.0.0.1'&&url.port==='4173')return route.continue();
  // No external requests, including popup destinations, can leave the browser.
  return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Local intercepted destination</title><p>Offline popup fixture</p>'});
 });
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
 await page.goto('http://127.0.0.1:4173/growth-schoolv3.html');
 await page.evaluate(()=>{sessionStorage.setItem('token','local-mock');USER.registered=true;USER.id=999;USER.nickname='本地发布者';USER.role='student';USER.inviteCode='LOCAL';openOnboardIfFirst=()=>{};login('student');closeOnboard();});
 const check=(condition,label,detail)=>{if(!condition)throw Error(label+': '+JSON.stringify(detail));checks.push({label,detail});};
 const safeText=async(selector,text,label)=>{
  await page.waitForTimeout(50);
  const result=await page.locator(selector).evaluate((el,text)=>({hasText:el.textContent.includes(text),attackNodes:el.querySelectorAll('img[src="x"],script').length}),text);
  check(result.hasText&&result.attackNodes===0,label,result);
 };
 // A-1: four ranking branches (normal/gossip x >=3/<3), production API mapping and renderer.
 for(const cat of ['all','gossip'])for(const count of [4,2]){
  ranks=count;await page.evaluate(async cat=>{hideAllPages();showPage('rankhall');await renderRanking(cat);},cat);
  await safeText('#rankContent',nick,'A-1 ranking '+cat+'/'+count);
 }
 await page.evaluate(async()=>{hideAllPages();showPage('mine');await loadMyGossip();});
 await page.locator('#mine-panel-tasks [data-tab="gossip"]').click();
 await safeText('#myGossipList',nick,'A-1 my gossip');
 await page.evaluate(()=>showBlSchoolDetail('本地学校'));
 await safeText('#blSchoolDetailBody',nick,'A-1 school comments');
 await page.evaluate(()=>closeBlSchoolDetail());
 await page.evaluate(async nick=>{inviteData={records:[{inviteeNickname:nick,status:'pending'}]};await openInviteModal();renderInviteHistory();},nick);
 await safeText('#inviteHistoryList',nick,'A-1 invitation history');
 await page.evaluate(()=>closeInviteModal());
 await page.evaluate(nick=>showUserEggModal(nick),nick);
 await safeText('#userEggModal',nick,'A-1 public user card');
 await safeText('#userEggSkillsWrap',attack,'F18 public skills');
 await page.locator('#userEggModal .user-egg-skill-more').click();
 await safeText('#userEggModal .user-egg-hidden-skills',attack,'F18 expanded public skills');
 await page.evaluate(()=>closeUserEggModal());
 // A-2/A-3: real production task card -> whole card click (buttons were removed from the card).
 await page.evaluate(async()=>{hideAllPages();showPage('teamplaza');await fetchPlazaInto('team','teamUserList','teamResultCount');});
 await safeText('[data-task-id="71001"]',task.skillSub,'A-3 task card skill');
 await safeText('[data-task-id="71001"] .pschool','本地大学','A-3 task card publisher school');
 check(await page.locator('[data-task-id="71001"] .detail-btn, [data-task-id="71001"] .claim-btn').count()===0,'A-3 card has no detail/claim button');
 check(await page.locator('[data-task-id="71001"]').evaluate(el=>el.classList.contains('card-clickable')&&el.getAttribute('tabindex')==='0'),'A-3 card is whole-card clickable');
 check(await page.locator('[data-task-id="71001"]').evaluate(el=>el.lastElementChild.classList.contains('publisher')),'A-3 publisher row sinks to the card bottom');
 check(await page.locator('[data-task-id="71001"]').evaluate(el=>{const t=el.querySelector('.type-tag'),m=el.querySelector('.mode-tag'),c=el.querySelector('.task-cat-tag');
  return !!t&&!!m&&!!c&&getComputedStyle(t).backgroundColor!==getComputedStyle(m).backgroundColor&&getComputedStyle(c).borderTopStyle==='solid';}),'A-3 type tag and claim-mode tag never share a colour');
 check(await page.locator('[data-task-id="71001"]').evaluate(el=>{const a=el.querySelector('.head-top .card-amount'),bar=el.querySelector('.foot .claim-bar');
  return !!a&&getComputedStyle(bar).flexGrow==='1';}),'A-3 amount sits in the head top-right and the claim bar stretches to fill the row');
 check((await page.locator('[data-task-id="71002"] .card-amount').textContent()).trim().startsWith('支付'),'A-3 teach card states 支付 (publisher pays), never 奖励');
 check(await page.locator('[data-task-id="71001"] .official-card').count()===0,'A-3 non-admin task is not marked official');
 check(await page.locator('[data-task-id="71001"]').evaluate(c=>{const d=c.querySelector('.publisher .pub-deadline');
  return !!d&&d.textContent.trim()==='长期有效'&&Math.round(c.getBoundingClientRect().right-d.getBoundingClientRect().right)<24;}),'A-3 deadline slot always sits flush at the card bottom-right (长期有效 when unset)');
 check((await page.locator('[data-task-id="71002"] .publisher .pub-deadline').textContent()).trim()==='截止时间 02-04','A-3 teach task without a deadline falls back to publish date + 30 days');
 // A-4: 已过报名截止的任务 —— 卡片显示真实（跨年）日期，游客在详情里看到置灰的「报名已截止」
 check((await page.locator('[data-task-id="71003"] .publisher .pub-deadline').textContent()).trim()==='截止时间 2020-01-01','A-4 expired task shows its stored cross-year deadline');
 await page.evaluate(()=>document.querySelector('[data-task-id="71003"] .nm').click());
 await page.waitForTimeout(400);
 check(await page.locator('#taskDetailCard .td-status .btn[disabled]').evaluate(el=>el.textContent.trim()==='报名已截止'),'A-4 expired task disables the claim button with 报名已截止');
 await page.evaluate(()=>closeTaskDetail());
 await page.locator('[data-task-id="71001"] .nm').click();
 await safeText('#taskDetailCard .td-title',attack,'A-2 task title');
 await safeText('#taskDetailCard .td-pub-school','本地大学','A-2 detail publisher school');
 await safeText('#taskDetailCard .td-desc',attack,'A-2 task description');
 await safeText('#taskDetailCard .td-req',attack,'A-2 task requirements');
 check(await page.locator('#taskDetailCard .td-req br').count()===1,'A-2 newline is real br');
 await page.evaluate(()=>closeTaskDetail());
 await page.evaluate(()=>showMyTaskDetail(71001));
 await safeText('#taskDetailCard',task.skillSub,'A-3 my task detail skill');
 await safeText('#taskDetailCard .td-req',attack,'A-2 my task requirements');
 check(await page.locator('#taskDetailCard .td-req br').count()===1,'F4 newline is real br');
 await page.evaluate(()=>closeTaskDetail());
 // A-4: production input state + actual label/remove/invitation clicks; values must round-trip.
 for(const skill of ["x')\"","\\')","\\');alert(9);//",attack]){
  await page.evaluate(skill=>{document.getElementById('publishDesc').value='';userSkills=[skill];openSkillModal();},skill);
  await safeText('#skillSelectedTags',skill,'A-4 selected text '+skill);
  await page.locator('#skillSelectedTags .st-name').click();
  await page.waitForFunction(skill=>document.getElementById('publishDesc').value==='分享我在'+skill+'方面的经验和技巧，帮助想学习的蛋蛋快速入门～',skill);
  check(true,'A-4 publish click round-trip '+skill);
  await page.evaluate(skill=>{userSkills=[skill];openSkillModal();},skill);
  await page.locator('#skillSelectedTags .x').click();
  check(await page.evaluate(()=>tempSkills.length)===0,'A-4 remove click '+skill);
  await page.evaluate(()=>closeSkillModal());
  await page.evaluate(skill=>openInviteTaskModal(998,'本地接收者',[skill]),skill);
  await page.locator('#inviteTaskSkillList .invite-skill-tag').click();
  check(await page.evaluate(()=>inviteTaskSelectedSkills[0])===skill,'A-4 invite click round-trip '+skill);
  await page.evaluate(()=>closeInviteTaskModal());
 }
 // F14: quote/backslash nickname -> production gossip answer invitation button.
 post.answers[0].authorNickname="\\');alert(8);//\"";
 await page.evaluate(()=>showGossipDetail(72001));
 await page.locator('#gossipDetailModal .invite-btn').click();
 await page.waitForTimeout(100);
 await safeText('#inviteTaskTargetName',post.answers[0].authorNickname,'F14 gossip invitation nickname round-trip');
 await page.evaluate(()=>{closeInviteTaskModal();closeGossipDetail();});
 // F11/F12/F18/F19/F20/F21: remaining production sinks and actual inline-handler clicks.
 await page.evaluate(async()=>{await renderUsers();});
 await safeText('#usersTableBody .c-school',attack,'F11 admin MBTI text');
 await page.evaluate(()=>loadReviewTasks());
 await safeText('#reviewList',task.skillSub,'F12 review task skill');
 await page.evaluate(attack=>{userSkills=[attack];renderSkillProfile();},attack);
 await safeText('#skillProfileDisplay',attack,'F18 profile skill text');
 rankNick=quotedName;
 await page.evaluate(async()=>{hideAllPages();showPage('gossip');await renderGossipTopList();});
 await page.locator('#gossipTopList .gossip-top-item').first().click();
 await safeText('#userEggModal',quotedName,'F19 gossip top nickname click');
 await page.evaluate(()=>closeUserEggModal());
 await page.evaluate(name=>{hideAllPages();showPage('blacklist');BL_RANK_TAB='all';BL_RANK_LIST=[{schoolName:name,avgScore:5,count:1}];renderBlRankList();},quotedName);
 await page.locator('#blRankList .bl-rank-item').click();
 await safeText('#blSchoolDetailBody',quotedName,'F20 school rank click');
 await page.evaluate(()=>closeBlSchoolDetail());
 await page.evaluate(()=>showBlMetricRank(BL_METRICS[0].key));
 await page.locator('#blMetricRankList .bl-metric-rank-item').click();
 await safeText('#blSchoolDetailBody',quotedName,'F21 school metric click');
 await page.evaluate(()=>closeBlSchoolDetail());
 // A-5: use the real bound school-autocomplete input and choose its generated item.
 await page.evaluate(()=>openTousuForm());
 await page.locator('#blSchoolSearch').fill(attack);
 await page.locator('#blSchoolDropdown .bl-add-school').waitFor({state:'visible'});
 await safeText('#blSchoolDropdown',attack,'A-5 school suggestion');
 await page.locator('#blSchoolDropdown .bl-add-school').click();
 check(await page.evaluate(()=>BL_SELECTED_SCHOOL)===attack,'A-5 selection round-trip');
 await page.evaluate(()=>closeTousuForm());
 // A-6: actual share buttons, actual popup Window objects, remote URL fulfilled offline.
 await page.evaluate(()=>openInviteModal());
 for(const type of ['qq','weibo']){
  const popupPromise=context.waitForEvent('page');
  await page.locator('#inviteModal [onclick="shareInvite(\''+type+'\')"]').click();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
  check(await popup.evaluate(()=>window.opener===null),'A-6 '+type+' actual opener null',{url:popup.url()});
  await popup.close();
 }
 await page.evaluate(()=>closeInviteModal());
 await page.waitForTimeout(3200);
 // Layout: unchanged production form and task detail at all requested widths.
 const layouts=[];
 for(const width of [1440,360,390,430]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>goPublish('team',null,'teamplaza'));
  await page.waitForTimeout(300);
  const form=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,hint:document.getElementById('publishRewardHint').textContent}));
  check(form.scrollWidth<=width,'layout publish '+width,form);
  check(form.hint.includes('3 天互评期结束后'),'refund timing hint '+width);
  await page.locator('#publishRewardHint').scrollIntoViewIfNeeded();
  await page.screenshot({path:'C:/Users/梁惠/.codex/visualizations/2026/09/13/01a09a4d-1e5a-7541-9e93-1501ab1f8e6f/team-security-publish-'+width+'.png'});
  await page.evaluate(()=>showMyTaskDetail(71001));
  await page.waitForTimeout(400);
  const detail=await page.locator('#taskDetailCard').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,client:el.clientWidth,scroll:el.scrollWidth};});
  check(detail.left>=-1&&detail.right<=width+1&&detail.scroll<=detail.client+1,'layout detail '+width,detail);
  await page.screenshot({path:'C:/Users/梁惠/.codex/visualizations/2026/09/13/01a09a4d-1e5a-7541-9e93-1501ab1f8e6f/team-security-detail-'+width+'.png'});
  await page.evaluate(()=>closeTaskDetail());layouts.push({width,form,detail});
 }
 // Main #18: real task-list and rating-entry clicks, deliberately no submission/write.
 ratingScenario=true;task.status='completed';task.settled=0;
 task.rateDeadline=new Date(Date.now()+2*86400000).toISOString();
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(async()=>{hideAllPages();showPage('mine');await loadMyTasks();});
 await page.locator('#mine-panel-tasks [data-tab="todo"]').click();
 const ratingEntry=page.locator('#group-todo [onclick="openTaskRating(71001)"]');
 check((await ratingEntry.textContent()).includes('去互评'),'#18 completed/unsettled task exposes rating entry',{rateDeadline:task.rateDeadline});
 await ratingEntry.click();
 await page.locator('#taskRatingBody [onclick^="openTeamRating("]').click();
 await page.locator('#starRowA [data-val="5"]').click();
 await page.locator('#ratingComment').fill('本地互评入口回归，不提交');
 check(await page.locator('#ratingModal [onclick="submitRating()"]').isVisible(),'#18 real entry opens visible rating form and submit control');
 check(await page.locator('#starRowA .star.on').count()===5,'#18 real star click works without submission');
 await page.screenshot({path:'C:/Users/梁惠/.codex/visualizations/2026/09/13/01a09a4d-1e5a-7541-9e93-1501ab1f8e6f/team-security-rating-1440.png'});
 await page.evaluate(()=>{closeRating();closeTaskRating();});
 // A-7: 发布表单的报名截止（1 / 7 / 15 天 + 自定义，默认 30 天；提交时换算成具体日期）
 await page.evaluate(()=>{hideAllPages();showPage('publish');});
 await page.waitForTimeout(200);
 const signupDl=await page.evaluate(()=>{
  const p=x=>String(x).padStart(2,'0');
  const expect=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
  const custom=()=>getComputedStyle(document.getElementById('signupDlCustom')).display;
  const out={days:document.getElementById('signupDlDays').value,payload:signupDeadlinePayload(),expected:expect(30),custom:custom(),hint:document.getElementById('signupDlHint').textContent};
  toggleSignupDeadline(7); out.week=signupDeadlinePayload().slice(0,10); out.weekExpected=expect(7); out.customHidden=custom();
  resetSignupDeadline(); out.afterReset=document.getElementById('signupDlDays').value;
  return out;
 });
 check(signupDl.days==='30'&&signupDl.payload.slice(0,10)===signupDl.expected&&signupDl.payload.endsWith('T23:59:59')&&signupDl.custom!=='none','A-7 signup deadline defaults to today + 30 days with the custom input visible',signupDl);
 check(signupDl.hint.includes('30')&&signupDl.hint.includes(signupDl.expected),'A-7 hint shows the day count and the resulting date',signupDl);
 check(signupDl.week===signupDl.weekExpected&&signupDl.customHidden==='none'&&signupDl.afterReset==='30','A-7 7-day preset switches to today + 7, hides the input, reset restores 30',signupDl);
 check(dialogs.length===0,'no attack dialogs',dialogs);
 check(errors.length===0,'no page JS errors',errors);
 check(consoleErrors.length===0,'no console errors',consoleErrors);
 check(requests.every(r=>r.method==='GET'||(r.method==='POST'&&r.path==='/api/track/page')),'only mocked page telemetry; no business writes',requests.filter(r=>r.method!=='GET'));
 return {checks,layouts,dialogs,errors,consoleErrors,requestCount:requests.length,network:'all APIs mocked; all non-local destinations fulfilled offline',browser:context.browser().version()};
}
