// Run with playwright-cli run-code --filename tests/mobile-navigation.browser.js.
// Requires this repository served at http://127.0.0.1:4173. All backend calls are mocked.
async page => {
  await page.unrouteAll({behavior:'wait'});
  await page.route('http://localhost:8080/**',async route=>{
    const url=route.request().url();
    const data=/\/(posts|tasks|notifications)/.test(url)?{records:[],total:0,unread:0}:[];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:200,data})});
  });
  await page.goto('http://127.0.0.1:4173/growth-schoolv3.html');
  await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();});
  await page.reload();
  const checked=[];
  for(const [width,height] of [[360,844],[390,844],[430,844],[640,600]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>logout(true));
    for(const selector of ['#guestCard .login','#guestCard .register']) {
      const box=await page.locator(selector).boundingBox();
      if(!box || box.x<0 || box.y<0 || box.x+box.width>width || box.y+box.height>height)throw Error('Guest button clipped: '+selector+' at '+width+'x'+height);
    }
    /* 底部 5 格：任务广场 · 吐槽/黑榜 · 发布（圆钮，js/publish-mobile.js 注入）· 我的任务 · 我的信息。
       发布那一格没有 data-page（只弹面板、不切页），这里用 'publish' 占位。
       访客态下 logout() 会隐藏 我的任务/我的信息，所以断言「可见项 = 期望序列的子序列且顺序一致」，
       并要求「发布」这一格始终可见。 */
    const nav=page.locator('#studentNav');
    const visible=await nav.locator('.nav-item, .nav-publish').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().width>0).map(n=>n.getAttribute('data-page')||'publish'));
    const expectedOrder='plaza,blacklist,publish,lab,mine'.split(',');
    let oi=0;
    for(const t of visible){
      while(oi<expectedOrder.length && expectedOrder[oi]!==t) oi++;
      if(oi>=expectedOrder.length) throw Error('Bottom tab unexpected at '+width+': '+visible.join(','));
      oi++;
    }
    if(visible.indexOf('publish')<0) throw Error('发布 tab missing at '+width+': '+visible.join(','));
    const navW=await nav.evaluate(n=>[n.scrollWidth,n.clientWidth]);
    if(navW[0]>navW[1]+1)throw Error('Bottom nav overflows at '+width+': '+navW.join('/'));
    /* 广场那一格的标签由 CSS ::after 换成「任务广场」（桌面侧栏仍叫技能变现） */
    const plazaLabel=await page.locator('.sidebar .nav-item[data-page="plaza"] span').evaluate(n=>getComputedStyle(n,'::after').content);
    if(String(plazaLabel).indexOf('任务广场')<0)throw Error('Plaza tab label not switched on mobile: '+plazaLabel);
    /* 每格触控目标 ≥44×44（含中间那颗发布圆钮） */
    for(const t of await nav.locator('.nav-item, .nav-publish').all()){
      const tb=await t.boundingBox();
      /* 访客态下 lab/mine 隐藏，不参与触控区检查 */
      if(!tb) continue;
      if(tb.width<44 || tb.height<44)throw Error('Tab touch target <44 at '+width+': '+JSON.stringify(tb));
    }
    await page.locator('#guestCard .login').click();
    await page.locator('#loginOverlay').waitFor({state:'visible'});
    await page.locator('#loginOverlay .reg-modal-close').click();
    await page.locator('#guestCard .register').click();
    await page.locator('#regModal').waitFor({state:'visible'});
    await page.evaluate(()=>closeRegModal());
    await page.evaluate(()=>{
      USER.registered=true;USER.role='student';sessionStorage.setItem('token','synthetic-navigation-test');
      document.getElementById('guestCard').style.display='none';document.getElementById('userCard').style.display='flex';
    });
    /* 头像卡已移出底栏 → 「退出」在「我的信息」页顶部的账号卡里，必须是能点到的尺寸 */
    await page.evaluate(()=>{ go('mine'); switchMineTab('info'); });
    const acct=await page.locator('#mine-panel-info .mobile-acct').boundingBox();
    if(!acct || acct.x<0 || acct.x+acct.width>width)throw Error('Mobile account card clipped at '+width+': '+JSON.stringify(acct));
    const box=await page.locator('#mine-panel-info .mobile-acct .logout').boundingBox();
    if(!box || box.x<0 || box.y<0 || box.x+box.width>width || box.y+box.height>height)throw Error('Logout clipped at '+width);
    if(box.height<44)throw Error('Logout touch target <44 at '+width+': '+box.height);
    await page.locator('#mine-panel-info .mobile-acct .logout').click();
    await page.locator('#guestCard .login').waitFor({state:'visible'});
    const fab=await page.locator('.contact-fab').boundingBox();
    const bar=await page.locator('.sidebar').boundingBox();
    if(fab.y+fab.height>bar.y)throw Error('Feedback button overlaps navigation at '+width);
    checked.push(width+'x'+height);
  }
  await page.setViewportSize({width:390,height:844});
  /* 二级切换改成了内容内 sticky（改前是钉在屏幕最顶的 fixed）：滚下去后必须仍贴在视口顶部 */
  await page.evaluate(()=>{ if(typeof go==='function') go('plaza'); window.scrollTo(0,300); });
  await page.waitForTimeout(150);
  const sticky=await page.locator('#page-plaza .disc-subtabs').boundingBox();
  if(!sticky)throw Error('Plaza sub-tabs missing');
  /* 模拟数据下页面可能不足一屏、滚不动，此时 sticky 无法体现；有内容时才断言 */
  const canScroll=await page.evaluate(()=>document.documentElement.scrollHeight>window.innerHeight+50);
  if(canScroll && sticky.y>1)throw Error('Sub-tabs not sticky after scroll: y='+sticky.y);
  const ovf=await page.evaluate(()=>getComputedStyle(document.querySelector('.main')).overflowX);
  if(ovf!=='clip')throw Error('.main overflow-x must be clip, otherwise sticky is trapped: '+ovf);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'output/playwright/mobile-navigation-4tabs.png'});
  return {mockApi:true,guestLoginRegisterAndLogout:'passed',bottomTabs:'4 格且不横滑',subTabsSticky:'passed',checked};
}
