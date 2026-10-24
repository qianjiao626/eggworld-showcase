const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('growth-schoolv3.html', 'utf8');
const file = 'js/gossip-reports.js';
function page(handler) {
  const nodes = Object.fromEntries(['reportTitle','reportContent','reportAnonymous','reportSubmit','reportStatus','reportCommentText','reportCommentSubmit','reportCommentStatus','reportCards','reportDetails','reportAdminList','reportComments','reportCommentsPage','reportAdminHistory','reportAdminComments','reportPageLabel','gossipAskPane','gossipReportPane','reportTabAsk','reportTabReports','reportForm'].map(id => [id,{value:'',checked:false,disabled:false,innerHTML:'',textContent:''}]));
  const calls = [];
  const listeners = {};
  const context = {
    USER:{role:'student',registered:true}, sessionStorage:{getItem:()=> 'token'},
    apiGet:async()=>({code:200,data:{records:[]}}),
    apiPost:(url,body)=>{calls.push([url,body]); return handler(url,body);},
    toast:()=>{}, document:{getElementById:id=>nodes[id]||null,addEventListener:(name,fn)=>{listeners[name]=fn;}}
  };
  context.window=context; vm.runInNewContext(fs.readFileSync(file,'utf8'), context);
  return {context,nodes,calls,listeners};
}
test('gossip tabs preserve original ask pane and reports are pure text', () => {
  assert.match(html, /id="gossipAskPane"/);
  assert.match(html, /id="gossipReportPane"/);
  assert.match(html, /id="reportAnonymous"/);
  assert.doesNotMatch(html.slice(html.indexOf('id="gossipReportPane"'),html.indexOf('id="page-dormitories"')), /type="file"/);
});
test('report rendering escapes unsafe user content and hides anonymous identity', () => {
  const {context}=page(async()=>({code:200}));
  const card=context.GossipReports.renderCard({id:1,title:'<img src=x onerror=alert(1)>',content:'正文',anonymous:1,publisherNickname:'不该显示',likes:0});
  assert.doesNotMatch(card, /<img/);
  assert.doesNotMatch(card, /不该显示/);
  assert.match(card, /匿名爆料/);
});
test('submit locks concurrent clicks and retains draft on sensitive-word failure', async () => {
  let resolve;
  const {context,nodes,calls}=page(()=>new Promise(r=>resolve=r));
  nodes.reportTitle.value='标题'; nodes.reportContent.value='一段文字'; nodes.reportAnonymous.checked=true;
  const first=context.GossipReports.submit(); const second=context.GossipReports.submit();
  assert.equal(calls.length,1); assert.equal(nodes.reportSubmit.disabled,true);
  resolve({code:400,msg:'内容包含敏感词'}); await Promise.all([first, second]);
  assert.equal(calls.length,1); assert.equal(nodes.reportSubmit.disabled,false);
  assert.equal(nodes.reportContent.value,'一段文字');
  assert.match(nodes.reportStatus.textContent,/敏感词/);
});
test('comment checks sensitive words before posting and keeps draft on failure',async()=>{
  const {context,nodes,calls}=page(async()=>({code:400,msg:'包含敏感词'}));
  nodes.reportCommentText.value='敏感词评论';
  await context.GossipReports.comment(3);
  assert.equal(calls.length,1);
  assert.match(calls[0][0],/check-text/);
  assert.equal(nodes.reportCommentText.value,'敏感词评论');
});

test('clicking comment in opened report submits using the current report id',async()=>{
  const {context,nodes,calls,listeners}=page(async()=>({code:200}));
  nodes.reportForm.addEventListener=()=>{};
  context.apiGet=async url=>({code:200,data:url.endsWith('/3')
    ? {id:3,title:'标题',content:'正文',likes:0,commentCount:0}
    : {records:[],pages:1}});
  listeners.DOMContentLoaded();
  const click=(action,id)=>listeners.click({target:{closest:selector=>selector==='[data-report-action]'
    ? {getAttribute:key=>key==='data-report-action'?action:id??null,closest:()=>null}
    : null}});
  await click('detail','3');
  nodes.reportCommentText.value='可发布的评论';
  await click('comment',null);
  assert.deepEqual(calls.map(call=>call[0]), ['/api/gossip/reports/check-text','/api/gossip/reports/3/comments']);
});
test('opening review center via navigation loads moderation data',async()=>{
  const {context,nodes,listeners}=page(async()=>({code:200}));
  nodes.reportForm.addEventListener=()=>{};
  const calls=[]; context.USER.role='admin';
  context.apiGet=async url=>{calls.push(url);return {code:200,data:[]};};
  listeners.DOMContentLoaded();
  await listeners.click({target:{closest:selector=>selector==='[data-page="reviewcenter"]'?{}:null}});
  assert.ok(calls.includes('/api/admin/gossip-reports/pending'));
});
