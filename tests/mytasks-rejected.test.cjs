const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('growth-schoolv3.html','utf8');

/* 只加载 taskStageOf + myPrimaryAction 两个纯函数，避免拉起整页依赖。 */
function load(){
 const ctx={myRateEntry:()=>({hot:false}),MY_STATUS_LABEL:{},console};
 vm.createContext(ctx);
 for(const name of ['taskStageOf','myPrimaryAction']){
  const start=html.indexOf('  function '+name+'(');
  if(start<0) throw new Error('未找到函数: '+name);
  const end=html.indexOf('\n  }',start)+4;
  vm.runInContext(html.slice(start,end),ctx);
 }
 return ctx;
}

/* ---------- 认领者视角：被驳回后不应再进入「待我处理」 ---------- */

test('rejected claimer is not put into todo (the red-dot bug)',()=>{
 const ctx=load();
 // 发布者选了别人，任务进行中，我是被驳回的报名者
 const stage=ctx.taskStageOf({id:1,status:'in_progress',taskType:'help'},{myClaimStatus:'rejected'},false);
 assert.equal(stage,'done','被驳回的报名应归入已完成组，而不是待我处理');
});

test('rejected claimer sees no action button',()=>{
 const ctx=load();
 const btn=ctx.myPrimaryAction({id:1,status:'in_progress',taskType:'help'},{myClaimStatus:'rejected'},false,'rejected');
 assert.equal(btn,'','被驳回的报名者不应看到「提交完成」按钮');
});

/* ---------- 回归：正常的认领者行为不能被改坏 ---------- */

test('selected claimer still must submit (stays in todo)',()=>{
 const ctx=load();
 const stage=ctx.taskStageOf({id:1,status:'in_progress',taskType:'help'},{myClaimStatus:'in_progress'},false);
 assert.equal(stage,'todo','已入选但未提交，仍应留在待我处理');
});

test('selected claimer still sees submit button',()=>{
 const ctx=load();
 const btn=ctx.myPrimaryAction({id:1,status:'in_progress',taskType:'help'},{myClaimStatus:'in_progress'},false,'in_progress');
 assert.match(btn,/提交完成/,'已入选者仍应看到提交完成按钮');
});

test('submitted claimer waits for publisher (active, no button)',()=>{
 const ctx=load();
 const stage=ctx.taskStageOf({id:1,status:'in_progress',taskType:'help'},{myClaimStatus:'submitted'},false);
 assert.equal(stage,'active','已提交后应进入进行中，等发布者确认');
 assert.equal(ctx.myPrimaryAction({id:1,status:'in_progress',taskType:'help'},{myClaimStatus:'submitted'},false,'submitted'),'');
});

test('pending_pairing claimer stays active (waiting for publisher pick)',()=>{
 const ctx=load();
 const stage=ctx.taskStageOf({id:1,status:'approved',taskType:'help'},{myClaimStatus:'pending_pairing'},false);
 assert.equal(stage,'active','报名待配对期间属于进行中，不需要我动作');
});

/* ---------- 发布者视角不受影响 ---------- */

test('publisher branches are unchanged',()=>{
 const ctx=load();
 assert.equal(ctx.taskStageOf({id:1,status:'approved'},{claimCount:2},true),'todo','有报名待选，发布者要处理');
 assert.equal(ctx.taskStageOf({id:1,status:'approved'},{claimCount:0},true),'active');
 assert.equal(ctx.taskStageOf({id:1,status:'in_progress'},{selectedClaimStatus:'submitted'},true),'todo');
 assert.equal(ctx.taskStageOf({id:1,status:'in_progress'},{selectedClaimStatus:'in_progress'},true),'active');
 assert.match(ctx.myPrimaryAction({id:1,status:'in_progress',taskType:'team'},{selectedClaimStatus:'submitted'},true,'in_progress'),/确认完成/);
});
