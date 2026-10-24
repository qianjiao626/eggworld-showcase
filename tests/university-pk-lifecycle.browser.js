async (page) => {
 await page.unroute('**/api/complaints/school?**'); await page.evaluate(()=>{closeBlSchoolDetail();openBlPkModal();});
 await page.evaluate(async()=>{await selectBlPkSchool('A','北京大学');await selectBlPkSchool('B','清华大学');});
 const result={};
 result.styles=await page.evaluate(()=>({mask:getComputedStyle(document.querySelector('.bl-pk-comments-scroll')).maskImage,stripes:getComputedStyle(document.querySelector('.bl-pk-metric-bar-left'),'::after').backgroundImage,entry:getComputedStyle(document.querySelector('.bl-pk-modal')).animationName}));
 await page.locator('#blPkCommentsScrollA').scrollIntoViewIfNeeded();await page.mouse.move(0,0);
 result.frames=await page.evaluate(()=>new Promise(resolve=>{let t=[],start;function f(now){if(start!==undefined)t.push(now-start);start=now;if(t.length<120)requestAnimationFrame(f);else resolve({averageMs:t.reduce((a,b)=>a+b,0)/t.length,maxMs:Math.max(...t),samples:t.length});}requestAnimationFrame(f);}));
 let reads=0;const listener=req=>{if(req.url().includes('/api/complaints/school?'))reads++;};page.on('request',listener);
 await page.waitForTimeout(16000);if(reads<2)throw Error('polling not active');result.refreshReads=reads;
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>startPkCommentsScroll());
 if(!await page.evaluate(()=>BL_PK_SCROLL_TIMER===null))throw Error('reduced motion');result.reducedMotion=true;
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>closeBlPkModal());reads=0;await page.waitForTimeout(16000);if(reads)throw Error('polling after close');result.closedRequests=reads;page.off('request',listener);
 await page.route('**/api/complaints/school?**',async route=>{await page.waitForTimeout(350);await route.fulfill({json:{code:500,data:null}});});
 await page.evaluate(()=>{openBlPkModal();selectBlPkSchool('A','北京大学');selectBlPkSchool('B','清华大学');});
 await page.locator('.bl-pk-loading').waitFor();await page.getByRole('button',{name:'重新加载 / 重试'}).waitFor();result.loadingAndError=true;
 await page.unroute('**/api/complaints/school?**');await page.getByRole('button',{name:'重新加载 / 重试'}).click();await page.locator('.bl-pk-metric-row').first().waitFor();result.retry=true;
 await page.setViewportSize({width:390,height:844});await page.locator('#blPkCompare').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'output/playwright/pk/mobile-top.png'});
 await page.evaluate(()=>closeBlPkModal());return result;
}

