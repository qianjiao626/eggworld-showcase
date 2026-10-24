async (page) => {
 let pending=3;let unread=19;const errors=[];
 await page.route('**/api/**',async route=>{
  const raw=route.request().url();let data=[];
  if(raw.includes('/notifications'))data={unread,records:[]};
  else if(raw.includes('/my-published')) data={records:Array.from({length:pending},(_,i)=>({task:{id:i+1,title:'测试待处理任务'+(i+1),status:'approved',taskType:'help',publisherId:999,createdAt:'2026-09-14T12:00:00'},claimCount:1})),total:pending};
  else if(raw.includes('/my-claimed')||raw.includes('/api/tasks?')||raw.includes('/posts?'))data={records:[],total:0};
  else if(raw.includes('/health'))data={status:'up',version:'local-test'};
  await route.fulfill({json:{code:200,data}});
 });
 await page.reload();page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{
  sessionStorage.setItem('token','local-mocked-account');USER.registered=true;USER.id=999;USER.role='student';
  openOnboardIfFirst=()=>{};login('student');go('mine');await loadMyTasks();await loadNotifs();
 });
 await page.waitForFunction(()=>document.getElementById('myTasksPending').textContent==='待处理3');
 const checks=[];
 for(const width of [1440,360,390,430]){
  await page.setViewportSize({width,height:900});await page.locator('.nav-item[data-page="mine"]').click();await page.waitForTimeout(100);
  const result=await page.evaluate(()=>{
   const b=document.getElementById('myTasksPending');const r=b.getBoundingClientRect();return {text:b.textContent,visible:r.width>0&&r.height>0,fits:r.left>=0&&r.right<=innerWidth,tab:document.getElementById('stageCountTodo').textContent,bell:document.querySelector('.sidebar .nav-item[data-page="mine"] .bell-badge')?.textContent};
  });
  if(result.text!=='待处理3'||!result.visible||!result.fits||result.tab!=='3'||result.bell!=='19')throw Error(JSON.stringify({width,result}));
  checks.push({width,...result});await page.screenshot({path:'output/playwright/pending-badge-'+width+'.png'});
 }
 pending=2;await page.evaluate(()=>loadMyTasks());if(await page.locator('#myTasksPending').innerText()!=='待处理2')throw Error('count did not change');
 unread=0;await page.evaluate(()=>loadNotifs());if(await page.locator('#myTasksPending').innerText()!=='待处理2')throw Error('read all changed tasks');
 pending=0;await page.evaluate(()=>loadMyTasks());if(!await page.locator('#myTasksPending').isHidden())throw Error('zero not hidden');
 await page.evaluate(()=>logout(true));if(!await page.locator('#myTasksPending').isHidden())throw Error('logout not hidden');
 if(errors.length)throw Error(JSON.stringify(errors));
 return {checks,updates:'3 -> 2 -> 0(hidden); notifications independently 19 -> 0',logoutHidden:true,jsErrors:errors,api:'mocked local only'};
}
