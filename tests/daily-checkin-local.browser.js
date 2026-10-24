// Real local API + MySQL UI smoke. Requires the isolated fixture proxy on 127.0.0.1:4174.
// The proxy injects a synthetic test-user credential; no production credentials are used.
async page => {
 await page.unrouteAll({behavior:'wait'});
 await page.route('http://localhost:8080/**',async route=>{
  const response=await route.fetch({url:route.request().url().replace('http://localhost:8080','http://127.0.0.1:4174')});
  await route.fulfill({response});
 });
 await page.goto('http://127.0.0.1:4173/growth-schoolv3.html');
 await page.evaluate(()=>sessionStorage.setItem('token','local-fixture-proxy'));
 await page.reload();
 await page.waitForFunction(()=>USER.registered&&document.querySelector('#checkinBtn').style.display==='flex');
 await page.waitForFunction(()=>document.querySelector('#checkinBtn .checkin-text').textContent==='每日签到');
 const before=await page.evaluate(()=>({exp:USER.exp,points:USER.points}));
 // 移动端唯一签到位是任务广场横幅动作条里的按钮（侧栏那个在 ≤768px 隐藏）
 await page.setViewportSize({width:390,height:844});
 await page.locator('#checkinBtnPlaza').click();
 await page.waitForFunction(b=>USER.exp===b.exp+5&&USER.points===b.points+5,before);
 await page.waitForFunction(()=>document.getElementById('plazaPoints').textContent===String(USER.points)&&document.getElementById('plazaExp').textContent===String(USER.exp));
 await page.screenshot({path:'output/checkin/real-local-success.png'});
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#checkinBtn').classList.contains('checked'));
 const repeated=await page.evaluate(()=>apiPost('/api/users/me/checkin',{}));
 if(repeated.code!==400)throw Error('Repeated checkin not rejected');
 return {realLocalBackend:true,realMySQL:true,before,after:await page.evaluate(()=>({exp:USER.exp,points:USER.points})),reloadPersists:true,repeatedCode:repeated.code};
}
