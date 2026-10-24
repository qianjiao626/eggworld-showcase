'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','growth-schoolv3.html'),'utf8');
const playwright=process.env.PLAYWRIGHT_MODULE||'playwright';
const enabled=process.env.CHATROOM_BADGE_BROWSER_TEST==='true';
const edge=process.env.CHROMIUM_EXECUTABLE;

async function browserPage(t,width=390){
  const {chromium}=require(playwright);
  const browser=await chromium.launch({headless:true,...(edge?{executablePath:edge}:{})});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width,height:844}});
  return page;
}

for(const response of [200,500]){
  test(`opening a conversation clears both badges immediately; read ${response===200?'success persists':'failure restores them'}`,
    {skip:!enabled},async t=>{
    const page=await browserPage(t);
    const pending=[];
    let resolveIntercepted;
    const intercepted=new Promise(resolve=>{resolveIntercepted=resolve});
    let unread=3,mentions=2;
    await page.route('http://localhost:4173/api/chat/**',route=>{
      const url=route.request().url();
      if(url.endsWith('/read')){pending.push(route);resolveIntercepted();return;}
      const data=url.endsWith('/conversations')?
        [{id:12,type:'group',title:'测试会话',unreadCount:unread,mentionUnread:mentions}]:{records:[]};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:200,data})});
    });
    await page.route('http://localhost:4173/test',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="chatroomShell"><div id="chatroomConversations"></div><div id="chatroomMessages"></div><div id="chatroomTitle"></div><div id="chatroomDesc"></div></div><span id="chatUnreadBadge" hidden></span><div id="chatroomError"></div></body></html>'}));
    await page.goto('http://localhost:4173/test');
    await page.evaluate(()=>{window.API_BASE='http://localhost:4173';sessionStorage.setItem('token','isolated-browser-fixture');});
    await page.addScriptTag({path:path.join(__dirname,'..','js','chatroom.js')});
    await page.evaluate(()=>window.chatroomRefresh());
    assert.equal(await page.locator('.chat-conv-badge').textContent(),'3');
    assert.equal(await page.locator('#chatUnreadBadge').textContent(),'2');
    const readRequest=page.waitForRequest(req=>req.url().endsWith('/read'));
    await page.locator('.chat-conv').click();
    await page.waitForFunction(()=>!!document.querySelector('.chatroom-shell') || document.getElementById('chatroomShell').classList.contains('chat-open'));
    assert.equal(await page.locator('.chat-conv-badge').count(),0,'会话内未读立即清零');
    assert.equal(await page.locator('#chatUnreadBadge').evaluate(el=>el.hidden),true,'导航 @ 未读立即清零');
    await page.waitForFunction(()=>document.querySelector('#chatroomTitle').textContent==='测试会话');
    // waitForRequest confirms that the real read request has reached the mocked network boundary.
    await readRequest;
    await intercepted;
    assert.equal(pending.length,1);
    if(response===200){unread=0;mentions=0;}
    await pending[0].fulfill({status:200,contentType:'application/json',body:JSON.stringify(response===200?{code:200,data:null}:{code:500,msg:'标记失败'})});
    if(response===500){
      await page.locator('.chat-conv-badge').waitFor();
      assert.equal(await page.locator('.chat-conv-badge').textContent(),'3');
      assert.equal(await page.locator('#chatUnreadBadge').textContent(),'2');
      assert.equal(await page.locator('#chatUnreadBadge').evaluate(el=>el.hidden),false);
    }else{
      await page.waitForFunction(()=>document.querySelector('#chatUnreadBadge').hidden);
      assert.equal(await page.locator('.chat-conv-badge').count(),0);
    }
  });
}

for(const width of [360,390,430,1440]){
  test(`my-page notification panel stays above sticky tabs at ${width}px`,{skip:!enabled},async t=>{
    const page=await browserPage(t,width);
    const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>')+8);
    const start=html.indexOf('<section class="page" id="page-mine">');
    const end=html.indexOf('<div class="mine-panel active"',start);
    const fragment=html.slice(start,end);
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+css+'</head><body><nav id="studentNav" style="display:flex"></nav><main class="main">'+fragment+'<div class="mine-panel active" style="height:600px"></div></section></main></body></html>');
    await page.locator('#page-mine').evaluate(el=>el.classList.add('active'));
    await page.locator('#page-mine .notif-panel').evaluate(el=>{
      el.classList.add('open');el.innerHTML='<button type="button" style="width:100%;height:280px;background:#fff">通知内容</button>';
    });
    const geometry=await page.evaluate(()=>{
      const panel=document.querySelector('#page-mine .notif-panel');
      const tabs=document.querySelector('#page-mine .mine-tabs');
      const a=panel.getBoundingClientRect(),b=tabs.getBoundingClientRect();
      const x=Math.max(a.left,b.left)+Math.min(a.right,b.right)-Math.max(a.left,b.left)>30?Math.max(a.left,b.left)+20:a.left+20;
      const y=Math.max(a.top,b.top)+10;
      return {overlap:y<Math.min(a.bottom,b.bottom),front:document.elementFromPoint(x,y)?.closest('.notif-panel')===panel};
    });
    assert.equal(geometry.overlap,true,'测试点必须位于面板与 Tab 重叠区域');
    assert.equal(geometry.front,true,'重叠处应由通知面板接收点击');
  });
}
