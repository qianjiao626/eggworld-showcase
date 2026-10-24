const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const IDS=['announcementDialog','announcementBodyWrap','announcementListPane','announcementReadPane',
  'announcementDetail','announcementHistory','announcementManager','announcementManageToggle','announcementBack',
  'announcementEditorTitle','announcementEditorContent','announcementStatus','announcementSave','announcementManageList',
  'announcementPageLabel','announcementCancelEdit','announcementPopup','announcementPopupBody'];

function fakeStorage(seed) {
  const data=Object.assign({},seed);
  return {
    getItem:k=>(k in data?data[k]:null),
    setItem:(k,v)=>{data[k]=String(v);},
    removeItem:k=>{delete data[k];},
    _data:data
  };
}

/* 极简 DOM 夹具：只实现 announcements.js 用到的部分
   （getElementById / querySelectorAll('.topbar .right') / createElement / insertBefore / querySelector） */
function makeDom(topbars) {
  function node(tag) {
    const e={tagName:tag||'div',children:[],parentNode:null,innerHTML:'',textContent:'',className:'',hidden:false,
      value:'',disabled:false,open:false,type:'',attrs:{},
      setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v);},
      getAttribute(k){return k in this.attrs?this.attrs[k]:null;},
      appendChild(c){this.children.push(c);c.parentNode=this;return c;},
      insertBefore(c,ref){const i=ref?this.children.indexOf(ref):-1;if(i>=0)this.children.splice(i,0,c);else this.children.push(c);c.parentNode=this;return c;},
      querySelector(sel){return match(this,sel)[0]||null;},
      querySelectorAll(sel){return match(this,sel);},
      addEventListener(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}};
    Object.defineProperty(e,'nextSibling',{get(){const p=this.parentNode;if(!p)return null;const i=p.children.indexOf(this);return i>=0?(p.children[i+1]||null):null;}});
    return e;
  }
  function match(scope,sel){
    const kids=scope.children||[];
    if(sel==='.announcement-chip') return kids.filter(c=>String(c.className).indexOf('announcement-chip')>=0);
    if(sel==='.announcement-chip--flow') return kids.filter(c=>String(c.className).indexOf('announcement-chip--flow')>=0);
    if(sel==='.bell-wrap') return kids.filter(c=>String(c.className).indexOf('bell-wrap')>=0);
    if(sel==='[onclick="openOnboard()"]') return kids.filter(c=>c.attrs.onclick==='openOnboard()');
    return [];
  }
  const ids=Object.fromEntries(IDS.map(id=>[id,node('div')]));
  const main=node('main'); main.className='main'; main.appendChild(node('div'));   // 内容区：已有子节点，验证插到最前
  const slots=(topbars||[{guide:true,bell:true}]).map(spec=>{
    const slot=node('div');
    if(spec.guide){const g=node('button');g.setAttribute('onclick','openOnboard()');slot.appendChild(g);
      const i=node('button');i.setAttribute('onclick','openInviteModal()');slot.appendChild(i);}
    if(spec.bell){const b=node('div');b.className='bell-wrap';slot.appendChild(b);}
    return slot;
  });
  const allChips=()=>slots.reduce((acc,s)=>acc.concat(match(s,'.announcement-chip')),match(main,'.announcement-chip'));
  const handlers={};
  const document={getElementById:id=>ids[id]||null,addEventListener:(t,fn)=>{handlers[t]=fn;},
    createElement:tag=>node(tag),
    querySelector:sel=>sel==='.main'?main:null,
    querySelectorAll:sel=>sel==='.topbar .right'?slots:(sel==='.announcement-chip'?allChips():[])};
  Object.defineProperty(main,'firstChild',{get(){return this.children[0]||null;}});
  return {node,ids,slots,main,handlers,document,allChips};
}

function page(opts) {
  opts=opts||{};
  const dom=makeDom(opts.topbars);
  const calls=[];
  const sandbox={USER:{role:opts.role||'guest'},document:dom.document,
    localStorage:opts.storage===null?undefined:(opts.storage||fakeStorage(opts.seed)),
    apiGet:async url=>{calls.push(url);
      if(opts.apiGet) return opts.apiGet(url);
      return {code:200,data:{records:[{id:1,title:'公告标题',content:'欢迎正文',publisherNickname:'千焦大王',publishedAt:'2026-10-05'}]}};},
    apiPost:async()=>({code:200}),apiPut:async()=>({code:200}),toast:()=>{}};
  sandbox.window=sandbox;
  vm.runInNewContext(fs.readFileSync('js/announcements.js','utf8'),sandbox);
  if(dom.handlers.DOMContentLoaded) dom.handlers.DOMContentLoaded();
  function click(action,id){
    dom.handlers.click({target:{closest:()=>({getAttribute:k=>k==='data-announcement-action'?action:(k==='data-id'?(id==null?null:String(id)):null)})}});
  }
  const tick=()=>new Promise(r=>setTimeout(r,0));
  return {sandbox,nodes:dom.ids,slots:dom.slots,main:dom.main,chips:dom.allChips(),calls,click,tick};
}

/* ===== ① topbar 行内胶囊 ===== */

test('chip is mounted into every topbar action row, between 新手指引 and 邀请赚币',async()=>{
  const p=page({topbars:[{guide:true,bell:true},{guide:false,bell:true}]});
  await p.tick();
  assert.equal(p.chips.length,2,'两个 topbar 各一份（移动端不加入口，只在登录时弹窗）');
  const [a,b]=p.slots;
  // 槽位一：新手指引 → 胶囊 → 邀请赚币 → 铃铛
  assert.equal(a.children.length,4);
  assert.ok(String(a.children[0].attrs.onclick).includes('openOnboard'));
  assert.ok(String(a.children[1].className).includes('announcement-chip'));
  assert.ok(String(a.children[2].attrs.onclick).includes('openInviteModal'));
  assert.ok(String(a.children[3].className).includes('bell-wrap'));
  // 槽位二：没有那两个按钮 → 放在铃铛之前
  assert.equal(b.children.length,2);
  assert.ok(String(b.children[0].className).includes('announcement-chip'));
  assert.ok(String(b.children[1].className).includes('bell-wrap'));
});

test('chip shows the latest title, hides for guests with nothing, surfaces load failure',async()=>{
  const withNews=page({topbars:[{guide:true,bell:true}]});
  await withNews.sandbox.EggAnnouncements.loadLatest();
  assert.equal(withNews.chips[0].hidden,false);
  assert.match(withNews.chips[0].innerHTML,/公告标题/);
  assert.match(withNews.chips[0].innerHTML,/announcement-chip-mark/);

  const empty=page({topbars:[{guide:true,bell:true}],apiGet:async()=>({code:200,data:{records:[],pages:0}})});
  await empty.sandbox.EggAnnouncements.loadLatest();
  assert.equal(empty.chips[0].hidden,true);                       // 访客无公告：不占位

  const admin=page({role:'admin',topbars:[{guide:true,bell:true}],apiGet:async url=>url.startsWith('/api/admin/')?{code:200,data:[]}:{code:200,data:{records:[],pages:0}}});
  await admin.sandbox.EggAnnouncements.loadLatest();
  assert.equal(admin.chips[0].hidden,false);
  assert.match(admin.chips[0].innerHTML,/还没有公告/);             // 管理员留发布入口（点开进对话框）

  const broken=page({topbars:[{guide:true,bell:true}],apiGet:async()=>{throw new Error('network');}});
  await broken.sandbox.EggAnnouncements.loadLatest();
  assert.equal(broken.chips[0].hidden,false);
  assert.match(broken.chips[0].innerHTML,/公告加载失败/);           // 失败也要能点进去重试
});

test('chip carries the new-announcement dot until the list is read',async()=>{
  const local=fakeStorage({'eggworld.announcement.seenId':'1'});
  const p=page({storage:local,topbars:[{guide:true,bell:true}],apiGet:async url=>({code:200,data:{records:[{id:2,title:'新公告',content:'正文',publisherNickname:'N',publishedAt:'2026-10-06'}],pages:1}})});
  await p.sandbox.EggAnnouncements.loadLatest();
  assert.match(p.chips[0].innerHTML,/announcement-dot/);          // 未读 → 圆点
  await p.sandbox.EggAnnouncements.loadHistory();                 // 打开列表即已读
  assert.doesNotMatch(p.chips[0].innerHTML,/announcement-dot/);
});

test('clicking the chip opens the announcement dialog',async()=>{
  const p=page({topbars:[{guide:true,bell:true}]});
  await p.tick();
  p.click('open');
  await p.tick();
  assert.equal(p.nodes.announcementDialog.open,true);
  assert.match(p.nodes.announcementHistory.innerHTML,/公告标题/);
});

/* ===== ② 查看公告：列表 / 详情 ===== */

test('list renders titles only and the reading pane renders the body on demand',async()=>{
  const {sandbox,nodes}=page();
  await sandbox.EggAnnouncements.loadHistory();
  assert.match(nodes.announcementHistory.innerHTML,/公告标题/);
  assert.doesNotMatch(nodes.announcementHistory.innerHTML,/欢迎正文/);   // 列表不渲染正文
  await sandbox.EggAnnouncements.select(1);
  assert.match(nodes.announcementDetail.innerHTML,/欢迎正文/);
  assert.equal(nodes.announcementBodyWrap.attrs['data-view'],'detail');
  assert.match(nodes.announcementHistory.innerHTML,/is-active/);
});

test('back button visibility follows the view state',async()=>{
  const {sandbox,nodes}=page();
  sandbox.EggAnnouncements.setView('list');
  assert.equal(nodes.announcementBack.hidden,true);
  await sandbox.EggAnnouncements.select(1);
  assert.equal(nodes.announcementBack.hidden,false);
  sandbox.EggAnnouncements.backToList();
  assert.equal(nodes.announcementBack.hidden,true);
});

test('pagination and list selection are wired through the delegated click handler',async()=>{
  const p=page({apiGet:async url=>({code:200,data:{records:[{id:1,title:'T',content:'C',publisherNickname:'N',publishedAt:'2026-10-05'}],pages:3}})});
  await p.sandbox.EggAnnouncements.loadHistory();
  p.click('next');
  await p.tick();
  assert.ok(p.calls.some(u=>/page=2/.test(u)),'点击下一页应请求 page=2');
  p.click('detail',1);
  await p.tick();
  assert.equal(p.nodes.announcementBodyWrap.attrs['data-view'],'detail');
  p.click('back');
  await p.tick();
  assert.equal(p.nodes.announcementBodyWrap.attrs['data-view'],'list');
});

test('empty and error states are rendered in the list pane',async()=>{
  const empty=page({apiGet:async()=>({code:200,data:{records:[],pages:0}})});
  await empty.sandbox.EggAnnouncements.loadHistory();
  assert.match(empty.nodes.announcementHistory.innerHTML,/暂无公告/);

  const broken=page({apiGet:async()=>({code:500,msg:'服务不可用'})});
  await broken.sandbox.EggAnnouncements.loadHistory();
  assert.match(broken.nodes.announcementHistory.innerHTML,/服务不可用/);
  assert.match(broken.nodes.announcementHistory.innerHTML,/data-announcement-action="reload"/);
});

test('manage view stays unavailable to non-admins and works for admins',async()=>{
  const guest=page();
  await guest.sandbox.EggAnnouncements.toggleManage();
  assert.equal(guest.nodes.announcementBodyWrap.attrs['data-view'],undefined);
  guest.sandbox.EggAnnouncements.setView('list');
  assert.equal(guest.nodes.announcementManageToggle.hidden,true);

  const admin=page({role:'admin',apiGet:async url=>url.startsWith('/api/admin/')
    ? {code:200,data:[{id:7,title:'旧标题',content:'旧正文',publisherNickname:'发布者',status:'published'}]}
    : {code:200,data:{records:[],pages:1}}});
  admin.sandbox.EggAnnouncements.setView('list');
  assert.equal(admin.nodes.announcementManageToggle.hidden,false);
  await admin.sandbox.EggAnnouncements.toggleManage();
  assert.equal(admin.nodes.announcementBodyWrap.attrs['data-view'],'manage');
  assert.equal(admin.nodes.announcementManager.hidden,false);
  assert.equal(admin.nodes.announcementManageToggle.textContent,'返回公告');
  assert.match(admin.nodes.announcementManageList.innerHTML,/data-announcement-action="edit"/);
  await admin.sandbox.EggAnnouncements.toggleManage();
  assert.equal(admin.nodes.announcementManageToggle.textContent,'管理');
});

/* ===== ③ 登录后弹窗 ===== */

test('popup shows once per announcement: 我知道了 suppresses it until a new one is published',async()=>{
  let latestId=5;
  const storage=fakeStorage();
  const make=()=>page({storage,apiGet:async url=>({code:200,data:url.startsWith('/api/admin/')
    ? []
    : {records:[{id:latestId,title:'最新公告',content:'正文内容',publisherNickname:'管理员',publishedAt:'2026-10-07T18:08:00'}],pages:1}})});
  const p=make();
  await p.sandbox.EggAnnouncements.showLatestPopup();
  assert.equal(p.nodes.announcementPopup.open,true);
  assert.match(p.nodes.announcementPopupBody.innerHTML,/最新公告/);
  assert.match(p.nodes.announcementPopupBody.innerHTML,/正文内容/);
  assert.match(p.nodes.announcementPopupBody.innerHTML,/管理员/);

  p.sandbox.EggAnnouncements.ackPopup();                       // 「我知道了」
  assert.equal(p.nodes.announcementPopup.open,false);

  const next=make();                                           // 模拟下次登录（同一浏览器）
  await next.sandbox.EggAnnouncements.showLatestPopup();
  assert.equal(next.nodes.announcementPopup.open,false,'同一公告不再弹');

  latestId=6;                                                  // 管理员发布新公告
  await next.sandbox.EggAnnouncements.showLatestPopup();
  assert.equal(next.nodes.announcementPopup.open,true,'新公告应重新弹');
});

test('closing the popup with ✕ also counts as acknowledged',async()=>{
  const storage=fakeStorage();
  const make=()=>page({storage,apiGet:async url=>({code:200,data:url.startsWith('/api/admin/')
    ? []
    : {records:[{id:3,title:'标题',content:'正文',publisherNickname:'N',publishedAt:'2026-10-07'}],pages:1}})});
  const p=make();
  await p.sandbox.EggAnnouncements.showLatestPopup();
  assert.equal(p.nodes.announcementPopup.open,true);
  p.click('popup-close');
  assert.equal(p.nodes.announcementPopup.open,false);

  const next=make();
  await next.sandbox.EggAnnouncements.showLatestPopup();
  assert.equal(next.nodes.announcementPopup.open,false,'关闭过的同一公告不再弹');
});

test('acknowledgement is stored per user, so another account still sees the popup',async()=>{
  const storage=fakeStorage();
  const make=uid=>{
    const p=page({storage,apiGet:async url=>({code:200,data:url.startsWith('/api/admin/')
      ? []
      : {records:[{id:5,title:'标题',content:'正文',publisherNickname:'N',publishedAt:'2026-10-07'}],pages:1}})});
    p.sandbox.USER.id=uid;
    return p;
  };
  const a=make(7);
  await a.sandbox.EggAnnouncements.showLatestPopup();
  a.sandbox.EggAnnouncements.ackPopup();

  const b=make(8);
  await b.sandbox.EggAnnouncements.showLatestPopup();
  assert.equal(b.nodes.announcementPopup.open,true,'换账号后未确认的公告仍应弹');
});

test('popup stays away when there is no announcement or the request fails',async()=>{
  const empty=page({apiGet:async()=>({code:200,data:{records:[],pages:0}})});
  await empty.sandbox.EggAnnouncements.showLatestPopup();
  assert.equal(empty.nodes.announcementPopup.open,false);
  assert.equal(empty.nodes.announcementPopupBody.innerHTML,'');

  const broken=page({apiGet:async()=>{throw new Error('network');}});
  await broken.sandbox.EggAnnouncements.showLatestPopup();      // 不抛异常
  assert.equal(broken.nodes.announcementPopup.open,false);
});

test('popup 查看全部公告 closes the popup and opens the list dialog',async()=>{
  const p=page({apiGet:async url=>({code:200,data:url.startsWith('/api/admin/')
    ? []
    : {records:[{id:5,title:'最新公告',content:'正文',publisherNickname:'管理员',publishedAt:'2026-10-07T18:08:00'}],pages:1}})});
  await p.sandbox.EggAnnouncements.showLatestPopup();
  await p.sandbox.EggAnnouncements.openAllFromPopup();
  assert.equal(p.nodes.announcementPopup.open,false);
  assert.equal(p.nodes.announcementDialog.open,true);
  assert.match(p.nodes.announcementHistory.innerHTML,/最新公告/);
});

test('login flow actually calls the popup (source wiring)',()=>{
  const html=fs.readFileSync('growth-schoolv3.html','utf8');
  const at=[...html.matchAll(/EggAnnouncements\.showLatestPopup\(\)/g)].map(m=>m.index);
  assert.equal(at.length,2,'主登录与注册自动登录各应调用一次弹窗');
  for(const index of at){
    assert.match(html.slice(Math.max(0,index-1200),index),/sessionStorage\.setItem\('token'/,
      '弹窗调用应出现在写入登录 token 之后');
  }
});

/* 需求（2026-10-07）：移动端不放任何公告入口，只在登录时弹窗；弹窗在移动端要适配。 */
test('mobile has no announcement entry and the popup is adapted (source wiring)',()=>{
  const css=fs.readFileSync('js/announcements.css','utf8');
  const mobile=css.slice(css.indexOf('@media (max-width:768px)'));
  assert.match(mobile,/\.announcement-chip\{display:none!important\}/,'窄屏必须隐藏胶囊入口');
  assert.match(mobile,/\.announcement-popup\{[\s\S]*?width:calc\(100vw - 24px\)/,'弹窗在窄屏贴边');
  assert.match(mobile,/\.announcement-popup-actions\{flex-direction:column/,'底部动作竖排整宽');
  assert.doesNotMatch(css,/announcement-chip--flow/,'不再有移动端专用胶囊');
});

/* ===== 转义 / 权限 / 草稿保留 ===== */

test('announcement text is escaped in list, detail and popup renderers',()=>{
  const {sandbox}=page();
  const item=sandbox.EggAnnouncements.renderCard({id:1,title:'<script>alert(1)</script>',publisherNickname:'<b>他人</b>'});
  const detail=sandbox.EggAnnouncements.renderDetail({id:1,title:'<script>alert(1)</script>',content:'<b>x</b>',publisherNickname:'他人'});
  assert.doesNotMatch(item,/<script>|<b>他人<\/b>/);
  assert.doesNotMatch(detail,/<script>|<b>x<\/b>/);
  assert.equal(sandbox.EggAnnouncements.canEdit(),false);
  sandbox.USER.role='subadmin'; assert.equal(sandbox.EggAnnouncements.canEdit(),false);
  sandbox.USER.role='admin'; assert.equal(sandbox.EggAnnouncements.canEdit(),true);
});

test('announcement save failure retains draft and unlocks submit',async()=>{
  const {sandbox,nodes}=page({role:'admin'});
  nodes.announcementEditorTitle.value='标题';nodes.announcementEditorContent.value='正文';
  sandbox.apiPost=async()=>({code:403,msg:'无权限'});
  await sandbox.EggAnnouncements.save();
  assert.equal(nodes.announcementEditorContent.value,'正文');
  assert.equal(nodes.announcementSave.disabled,false);
  assert.match(nodes.announcementStatus.textContent,/无权限/);
});

test('subadmin cannot publish even if save is invoked programmatically',async()=>{
  const {sandbox,nodes}=page({role:'subadmin'});
  let writes=0; sandbox.apiPost=async()=>{writes++;return {code:200};};
  nodes.announcementEditorTitle.value='测试'; nodes.announcementEditorContent.value='正文';
  await sandbox.EggAnnouncements.save();
  assert.equal(writes,0);
});

test('admin can edit and unpublish but a failed edit keeps draft',async()=>{
  const {sandbox,nodes}=page({role:'admin',apiGet:async url=>({code:200,data:url.startsWith('/api/admin/')
    ? [{id:7,title:'旧标题',content:'旧正文',publisherNickname:'发布者',status:'published'}]
    : {records:[]}})});
  await sandbox.EggAnnouncements.loadManage();
  sandbox.EggAnnouncements.edit(7);
  nodes.announcementEditorContent.value='新正文';
  let url=''; sandbox.apiPut=async path=>{url=path;return {code:403,msg:'没有权限'};};
  await sandbox.EggAnnouncements.save();
  assert.equal(url,'/api/admin/announcements/7');
  assert.equal(nodes.announcementEditorContent.value,'新正文');
  assert.equal(nodes.announcementSave.disabled,false);
  assert.match(nodes.announcementStatus.textContent,/没有权限/);
});
