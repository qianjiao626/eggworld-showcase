async (page) => {
 const out='output/playwright/pk'; await page.unroute('**/api/**');
 const results=[]; const check=(ok,name)=>{if(!ok)throw Error(name);results.push(name);};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const keys=['canteen','manage','internship','employ','watercourse','failrate','outdated','teacher','counselor','life','baoyan','fees','dorm','mornings','forcelabor','headcount'];
 const schools=['北京大学','清华大学',...Array.from({length:10},(_,i)=>'测试大学'+i)];
 let reads=0;
 await page.route('**/api/**',async route=>{
  const raw=route.request().url();const url={pathname:raw.split('?')[0],searchParams:{get:()=>decodeURIComponent((raw.split('name=')[1]||'').split('&')[0])}};let data=[];
  if(url.pathname.endsWith('/rankings'))data=schools.map((schoolName,i)=>({schoolName,count:5,avgScore:9-i*.4}));
  else if(url.pathname.endsWith('/stats'))data={schoolCount:12,totalCount:60,avgAll:6,myCount:0};
  else if(url.pathname.endsWith('/school')){reads++;const schoolName=url.searchParams.get('name');const known=schools.includes(schoolName);data={schoolName,count:known?5:0,avgScore:known?6:0,rank:1,metrics:known?Object.fromEntries(keys.map((k,i)=>[k,schoolName==='北京大学'?8:i<4?9:3])):{},comments:known?Array.from({length:5},(_,i)=>({userName:'匿***蛋',content:'测试吐槽 '+i+'：'+ '课程与校园生活的真实反馈。'.repeat(8),schoolName,score:6,createdAt:'2026-09-14T12:00:00'})):[]};}
  await route.fulfill({json:{code:200,data}});
 });
 await page.reload();await page.getByText('大学黑榜',{exact:true}).first().click();
 const button=page.getByRole('button',{name:'⚔️ 大学PK'});await button.click();
 await page.locator('#blPkDropA button').first().waitFor();check(await page.locator('#blPkDropA button').count()===10,'Top10');
 check((await page.locator('#blPkDropA button').first().textContent()).includes('北京大学'),'Top10排序');
 await page.locator('#blPkDropA button').first().click();
 await page.locator('#blPkInputB').fill('清华');await page.locator('#blPkDropB button').first().click();
 await page.locator('.bl-pk-metric-row').first().waitFor();check(await page.locator('.bl-pk-metric-row').count()===16,'16项真实详情指标');
 check((await page.locator('.bl-pk-bigscore').innerText()).includes('12'),'比分12:4');
 await page.waitForTimeout(800);check(await page.locator('.bl-pk-metric-bar-left').first().evaluate(el=>el.style.width)==='80%','进度条80%');
 await page.screenshot({path:out+'/desktop.png'});
 await page.locator('#blPkCommentsScrollA').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.waitForTimeout(300);
 const track=page.locator('#blPkCommentsScrollA .bl-pk-comments-track');const t1=await track.evaluate(el=>el.style.transform);await page.waitForTimeout(300);check(t1!==await track.evaluate(el=>el.style.transform),'弹幕滚动');
 await page.locator('#blPkCommentsScrollA').hover();const t2=await track.evaluate(el=>el.style.transform);await page.waitForTimeout(250);check(t2===await track.evaluate(el=>el.style.transform),'悬停暂停');
 await page.locator('#blPkShareTopBtn').click();check(await page.locator('#blPkShareImage').evaluate(el=>el.naturalWidth===750&&el.naturalHeight===1400),'分享图750x1400');
 const downloadPromise=page.waitForEvent('download');await page.locator('#blPkDownload').click();await(await downloadPromise).saveAs(out+'/share.png');results.push('实际PNG下载');
 await page.keyboard.press('Escape');
 for(const width of [320,375,390,768,1024,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);check(await page.locator('.bl-pk-modal').evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.scrollWidth<=el.clientWidth+1),'布局'+width);await page.screenshot({path:out+'/viewport-'+width+'.png'});}
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#blPkInputB').fill('北京');await page.locator('#blPkDropB button').first().click();await page.waitForFunction(()=>!BL_PK_BUSY&&document.querySelector('#blPkCompare').textContent.includes('势均力敌'));results.push('同校平局');
 await page.locator('#blPkInputB').fill('不存在的测试学院');await page.locator('#blPkDropB button').first().click();await page.waitForFunction(()=>!BL_PK_BUSY&&document.querySelector('#blPkCompare').textContent.includes('暂无吐槽'));results.push('手动学校无数据');
 await page.locator('.bl-pk-bigscore-name.left').click();await page.locator('#blSchoolDetailModal').waitFor({state:'visible'});check(await page.locator('#blPkModal').isHidden(),'学校详情跳转');
 check(await page.evaluate(()=>BL_PK_SCROLL_TIMER===null&&BL_PK_REFRESH_TIMER===null&&BL_PK_BAR_FRAME===null),'关闭清理');
 check(errors.length===0,'无JS运行错误');
 return {results,reads,errors};
}


