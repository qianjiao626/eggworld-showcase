const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('growth-schoolv3.html','utf8');
function setup(){
 const els={};const el=id=>els[id]||(els[id]={textContent:'',hidden:true,innerHTML:'',classList:{toggle(){}}});
 const bell=el('bell');const ctx={USER:{registered:true,role:'student'},document:{getElementById:el,querySelectorAll:()=>[bell]},myTaskItems:{todo:[],active:[],done:[],expired:[]},myTaskExpanded:{},STAGE_EMPTY:{todo:{},active:{},done:{},expired:{}},STAGE_LABEL:{},STAGE_COLOR:{},STAGE_FOLD_LIMIT:5,myTaskRequestVersion:0,notifUnreadCount:19,renderMyTaskRow:()=>'',myRateEntry:()=>({hot:false})};
 vm.createContext(ctx);
 for(const name of ['updateNotifBadge','updateMyTaskBadge','taskStageOf','collectMyTask','renderMyTaskGroups','resetMyTaskPanel']){
  const start=html.indexOf('  function '+name+'(');if(start<0)continue;
  const end=html.indexOf('\n  }',start)+4;vm.runInContext(html.slice(start,end),ctx);
 }
 return {ctx,els,el,bell};
}
test('task badge shows actual todo 3 while notification badge remains 19',()=>{
 const {ctx,el,bell}=setup();ctx.myTaskItems.todo=[1,2,3].map(id=>({task:{id}}));ctx.renderMyTaskGroups();ctx.updateNotifBadge();
 assert.equal(el('myTasksPending').textContent,'待处理3');assert.equal(el('stageCountTodo').textContent,3);assert.equal(bell.textContent,19);
});
test('task completion updates pending badge and zero hides it',()=>{
 const {ctx,el}=setup();ctx.myTaskItems.todo=[{task:{id:1}}];ctx.renderMyTaskGroups();assert.equal(el('myTasksPending').hidden,false);
 ctx.myTaskItems.todo=[];ctx.renderMyTaskGroups();assert.equal(el('myTasksPending').hidden,true);
});
test('task reset clears pending badge',()=>{
 const {ctx,el}=setup();ctx.myTaskItems.todo=[{task:{id:1}}];ctx.renderMyTaskGroups();ctx.resetMyTaskPanel();assert.equal(el('myTasksPending').hidden,true);
});
test('only actionable tasks count; duplicate records do not inflate count',()=>{
 const {ctx,el}=setup();const rows=[{task:{id:1,status:'approved'},claimCount:2},{task:{id:2,status:'pending'}},{task:{id:3,status:'in_progress'},selectedClaimStatus:'submitted'},{task:{id:4,status:'cancelled'}}];
 rows.forEach(r=>ctx.collectMyTask(r,true));ctx.collectMyTask(rows[0],true);ctx.collectMyTask({task:{id:5,status:'in_progress'},myClaimStatus:'selected'},false);ctx.renderMyTaskGroups();assert.equal(el('myTasksPending').textContent,'待处理3');
});
test('guest badge hidden even if prior task list remains',()=>{
 const {ctx,el}=setup();ctx.myTaskItems.todo=[{task:{id:1}}];ctx.USER.registered=false;ctx.renderMyTaskGroups();assert.equal(el('myTasksPending').hidden,true);
});
test('notification refresh does not overwrite pending task badge',()=>{
 const {ctx,el}=setup();el('myTasksPending').textContent='待处理3';ctx.updateNotifBadge();assert.equal(el('myTasksPending').textContent,'待处理3');assert.equal(el('myTasksUnread').textContent,'');
});

function loaderSetup(){
 const s=setup();const {ctx}=s;ctx.sessionStorage={getItem:()=> 'account-A'};ctx.loadGivenRatings=async()=>{};ctx.loadMyGossip=()=>{};ctx.toast=()=>{};
 const start=html.indexOf('  async function loadMyTasks(){');const end=html.indexOf('\n  /* ===== 我的打听',start);vm.runInContext(html.slice(start,end),ctx);return s;
}
test('loads all task pages then renders badge and tab from the same list',async()=>{
 const {ctx,el}=loaderSetup();const paths=[];ctx.apiGet=async path=>{paths.push(path);return {code:200,data:path.includes('my-claimed')?{records:[],total:0}:{records:[{task:{id:path.includes('page=1')?1:2,status:'approved'},claimCount:1}],total:2}};};
 await ctx.loadMyTasks();assert.equal(el('myTasksPending').textContent,'待处理2');assert.equal(el('stageCountTodo').textContent,2);assert.equal(paths.length,3);assert.ok(paths[1].includes('page=2'));
});
test('failed request keeps previous pending count and task list',async()=>{
 const {ctx,el}=loaderSetup();ctx.myTaskItems.todo=[{task:{id:1}}];ctx.renderMyTaskGroups();ctx.apiGet=async()=>({code:500});await ctx.loadMyTasks();assert.equal(el('myTasksPending').textContent,'待处理1');assert.equal(ctx.myTaskItems.todo.length,1);
});
test('old-account response cannot fill a reset badge',async()=>{
 const {ctx,el}=loaderSetup();let resolve;ctx.apiGet=()=>new Promise(r=>resolve=r);const request=ctx.loadMyTasks();await new Promise(r=>setImmediate(r));ctx.sessionStorage.getItem=()=> 'account-B';ctx.resetMyTaskPanel();resolve({code:200,data:{records:[{task:{id:9,status:'approved'},claimCount:1}],total:1}});await request;assert.equal(ctx.myTaskItems.todo.length,0);assert.equal(el('myTasksPending').hidden,true);
});
test('older refresh cannot overwrite a newer task result',async()=>{
 const {ctx,el}=loaderSetup();let resolve;ctx.apiGet=()=>new Promise(r=>resolve=r);const old=ctx.loadMyTasks();await new Promise(r=>setImmediate(r));ctx.apiGet=async path=>({code:200,data:{records:path.includes('my-published')?[{task:{id:1,status:'approved'},claimCount:1}]:[],total:path.includes('my-published')?1:0}});await ctx.loadMyTasks();resolve({code:200,data:{records:[],total:0}});await old;assert.equal(el('myTasksPending').textContent,'待处理1');
});
