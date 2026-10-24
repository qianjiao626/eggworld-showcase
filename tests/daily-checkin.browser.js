// Browser UI checks use mocked APIs; real MySQL/API checks are recorded separately.
// 签到有两个签到位：#checkinBtn（侧栏，桌面端）/ #checkinBtnPlaza（任务广场横幅动作条，移动端）。
// 移动端唯一入口是横幅那个（原先在「我的信息」页的签到卡已移除），所以移动端断言一律指向它。
async page => {
  await page.clock.install();
  await page.unrouteAll({behavior:'wait'});
  let checked=false,posts=0;
  let user={id:7,nickname:'签到测试',email:'checkin@example.invalid',role:'student',points:20,exp:10,characters:[]};
  await page.route('http://localhost:8080/**',async route=>{
    const url=route.request().url();let data=[];
    if(url.endsWith('/checkin/status'))data={checked,expReward:5,pointReward:5,totalExp:user.exp,totalPoints:user.points};
    else if(url.endsWith('/checkin')){posts++;checked=true;user.exp+=5;user.points+=5;data={checked:true,expReward:5,pointReward:5,totalExp:user.exp,totalPoints:user.points};}
    else if(url.endsWith('/api/users/me'))data=user;
    else if(/\/(posts|tasks|notifications)/.test(url))data={records:[],total:0,unread:0};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:200,data})});
  });
  await page.goto('http://127.0.0.1:4173/growth-schoolv3.html');
  await page.evaluate(()=>{sessionStorage.clear();logout(true);});
  // 游客态：两个签到位都不可见（在移动端视口下判定，否则「不可见」只是因为横幅动作条在 web 端不显示）
  await page.setViewportSize({width:390,height:844});
  await page.clock.runFor(400);
  if(await page.locator('#checkinBtn').isVisible())throw Error('guest button visible');
  if(await page.locator('#checkinBtnPlaza').isVisible())throw Error('guest banner button visible');
  await page.evaluate(()=>{sessionStorage.setItem('token','synthetic-checkin-ui');applyUserData({id:7,role:'admin',nickname:'测试管理员'});});
  await page.clock.runFor(400);
  if(await page.locator('#checkinBtn').isVisible())throw Error('admin button visible');
  if(await page.locator('#checkinBtnPlaza').isVisible())throw Error('admin banner button visible');
  await page.setViewportSize({width:1280,height:720});
  await page.reload();
  await page.locator('#checkinBtn').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#checkinBtn .checkin-text').textContent==='每日签到');
  await page.locator('#checkinBtnPlaza').waitFor({state:'attached'});
  const geometry=[];
  // web 端：侧栏签到位照旧，横幅动作条必须完全不出现（结构在 DOM 里但不显示）
  for(const [width,height] of [[1440,900],[1024,768]]){
    await page.setViewportSize({width,height});
    await page.clock.runFor(400);
    const button=await page.locator('#checkinBtn').boundingBox();
    const logout=await page.locator('#userCard .logout').boundingBox();
    if(!button||button.x<0||button.y<0||button.x+button.width>width||button.y+button.height>height)throw Error('Checkin clipped '+width);
    if(!logout||logout.x<0||logout.x+logout.width>width)throw Error('Logout clipped '+width);
    if(await page.locator('.banner-quick').isVisible())throw Error('Banner actions visible on desktop '+width);
    if(await page.locator('#checkinBtnPlaza').isVisible())throw Error('Banner checkin visible on desktop '+width);
    geometry.push({width,height,button,logout});
  }
  // 移动端：横幅动作条是唯一签到位；两个按钮都要放得下、不重叠、点得到
  for(const [width,height] of [[360,844],[390,844],[430,844],[640,600]]){
    await page.setViewportSize({width,height});
    await page.clock.runFor(400);
    if(await page.locator('#checkinBtn').isVisible())throw Error('Sidebar checkin visible on mobile '+width);
    const checkin=await page.locator('#checkinBtnPlaza').boundingBox();
    const guide=await page.locator('.banner-quick .bq-guide').boundingBox();
    if(!checkin||!guide)throw Error('Banner actions missing '+width);
    for(const [name,box] of [['checkin',checkin],['guide',guide]]){
      if(box.x<0||box.y<0||box.x+box.width>width)throw Error('Banner '+name+' clipped '+width);
      if(box.height<40)throw Error('Banner '+name+' shorter than 40px '+width);
      if(box.y+box.height>height)throw Error('Banner '+name+' below the fold '+width);
    }
    if(checkin.x+checkin.width>guide.x)throw Error('Banner actions overlap '+width);
    geometry.push({width,height,checkin,guide});
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/checkin/mobile-before.png'});
  await page.locator('#checkinBtnPlaza').click();
  await page.waitForFunction(()=>document.querySelector('#checkinBtnPlaza').classList.contains('checked')&&USER.exp===15&&USER.points===25);
  // 另一处入口（侧栏）也要同步成已签到，否则两个入口状态会各说各话
  await page.waitForFunction(()=>document.querySelector('#checkinBtn').classList.contains('checked'));
  await page.waitForFunction(()=>document.getElementById('plazaPoints').textContent==='25' && document.getElementById('plazaExp').textContent==='15');
  if((await page.locator('#checkinBtnPlaza .checkin-text').textContent())!=='已签到')throw Error('Banner checkin label not switched');
  if(!await page.getByText('🎉 签到成功！+5经验 +5蛋蛋币',{exact:true}).isVisible())throw Error('No success toast');
  await page.clock.runFor(450);
  await page.screenshot({path:'output/checkin/mobile-success.png'});
  await page.evaluate(()=>{doCheckin();doCheckin();});
  if(posts!==1)throw Error('Duplicate reward');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#checkinBtnPlaza').classList.contains('checked'));
  // Time simulation, NOT an actual overnight wait. Server status changes to next-day false.
  await page.clock.install({time:new Date('2026-09-14T15:59:59Z')});
  await page.evaluate(()=>refreshCheckinStatus());checked=false;
  await page.clock.fastForward(2100);
  await page.waitForFunction(()=>document.querySelector('#checkinBtnPlaza .checkin-text').textContent==='每日签到');
  await page.setViewportSize({width:1440,height:900});
  await page.clock.runFor(400);
  await page.screenshot({path:'output/checkin/desktop.png'});
  return {guestHidden:true,adminHidden:true,studentVisible:true,bannerVisibleOnMobile:true,bannerHiddenOnDesktop:true,geometry,successToast:true,renderedPoints:25,reloadPersists:true,midnightSimulated:true,posts};
}
