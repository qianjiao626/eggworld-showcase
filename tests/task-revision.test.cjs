const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('growth-schoolv3.html','utf8');

/* 第二期（任务修改 + 重新审核 + 审核中心对比）的前端口径测试：
   只切片提取纯逻辑函数，避免把整页脚本塞进 vm。 */
function setup(){
  const els={};
  const el=id=>els[id]||(els[id]={textContent:'',value:'',innerHTML:'',style:{display:''},classList:{toggle(){}}});
  const ctx={
    EDITABLE_TASK_STATUS:['pending','approved','expired'],
    EDIT_SIGNUP_KEEP:-1,
    SIGNUP_DL_DEFAULT_DAYS:30,
    editSignupMode:-1,
    editTask:null,
    mine:[{id:1},{id:2}],
    reviewRecords:[],
    CAT_KEY_TO_NAME:{study:'学业技术',job:'就业技能',side:'副业技能',hobby:'兴趣爱好',game:'游戏搭子',life:'生活互助'},
    TYPE_LABEL2:{teach:'教学型',help:'求助型',team:'组队型',reward:'奖励型'},
    document:{getElementById:el,querySelectorAll:()=>[]},
    escapeHtml:s=>String(s===null||s===undefined?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    fmtShortDate:s=>s?String(s).replace('T',' ').slice(0,10):'',
    signupDeadlineOf:()=>null,
    /* 技能证明图片构件在外联 js/task-detail-modal.js（本用例只切片主文件，故打桩）；
       改稿对比弹窗会调它渲染「图片不随改稿变化」那一块 */
    taskDetailProofHtml:o=>(o&&o.imageId)?('<div class="td-proof-inline" data-stub-proof="'+o.imageId+'"></div>'):'<div class="td-proof-none">未上传证明图片</div>',
    toast:()=>{}
  };
  vm.createContext(ctx);
  const fieldsStart=html.indexOf('  var REVISION_FIELDS = [');
  assert.ok(fieldsStart>0,'REVISION_FIELDS not found');
  vm.runInContext(html.slice(fieldsStart,html.indexOf('\n  ];',fieldsStart)+5),ctx);
  for(const name of ['canEditTask','editBlockedReason','catKeyOf','revisionFieldText','reviewRecordOf',
                     'editSignupDaysValue','editSignupDeadlinePayload','toggleEditSignupDeadline',
                     'updateEditSignupChips','updateEditSignupHint','openRevisionDiff','reviewProofHtml']){
    const start=html.indexOf('  function '+name+'(');
    assert.ok(start>0,'missing '+name);
    vm.runInContext(html.slice(start,html.indexOf('\n  }',start)+4),ctx);
  }
  return {ctx,el};
}

test('only the publisher can edit, and only before anyone claims or while a revision waits',()=>{
  const {ctx}=setup();
  assert.equal(ctx.canEditTask({status:'pending'},{claimCount:0},true),true);
  assert.equal(ctx.canEditTask({status:'approved'},{claimCount:0},true),true);
  assert.equal(ctx.canEditTask({status:'expired'},{},true),true);
  assert.equal(ctx.canEditTask({status:'approved'},{},false),false);
  assert.equal(ctx.canEditTask({status:'in_progress'},{},true),false);
  assert.equal(ctx.canEditTask({status:'completed'},{},true),false);
  assert.equal(ctx.canEditTask({status:'cancelled'},{},true),false);
  assert.equal(ctx.canEditTask({status:'rejected'},{},true),false);
  assert.equal(ctx.canEditTask({status:'approved'},{claimCount:1},true),false);
  assert.equal(ctx.canEditTask({status:'approved'},{pendingRevision:{title:'新标题'}},true),false);
});

test('blocked reason names the real cause so the toast is actionable',()=>{
  const {ctx}=setup();
  assert.match(ctx.editBlockedReason({pendingRevision:{}}),/修改稿在审核中/);
  assert.match(ctx.editBlockedReason({claimCount:2}),/已有人认领/);
  assert.match(ctx.editBlockedReason({}),/不可修改/);
});

test('skill category maps to the backend keys used by publish',()=>{
  const {ctx}=setup();
  assert.equal(ctx.catKeyOf('学业技术'),'study');
  assert.equal(ctx.catKeyOf('游戏搭子'),'game');
  assert.equal(ctx.catKeyOf('生活互助'),'life');
  assert.equal(ctx.catKeyOf('未知分类'),'study');
});

test('diff shows human readable values on both sides',()=>{
  const {ctx}=setup();
  assert.equal(ctx.revisionFieldText('title','新标题'),'新标题');
  assert.equal(ctx.revisionFieldText('reward',20),'20 蛋蛋币');
  assert.equal(ctx.revisionFieldText('claimMode','multiple'),'多人认领');
  assert.equal(ctx.revisionFieldText('maxClaimers',3),'3 人');
  assert.equal(ctx.revisionFieldText('skillCategory','game'),'游戏搭子');
  assert.equal(ctx.revisionFieldText('signupDeadline','2026-10-05T23:59:59'),'2026-10-05');
  assert.equal(ctx.revisionFieldText('skillsub',''),'—');
  assert.equal(ctx.revisionFieldText('requirements',null),'—');
});

test('keeping the current deadline sends the stored value back untouched',()=>{
  const {ctx}=setup();
  ctx.editSignupMode=-1;
  ctx.editTask={taskType:'help',signupDeadline:'2026-10-05T23:59:59'};
  assert.equal(ctx.editSignupDeadlinePayload(),'2026-10-05T23:59:59');
  ctx.editTask={taskType:'reward',signupDeadline:null};
  assert.equal(ctx.editSignupDeadlinePayload(),null);   // 长期有效继续保持长期有效
});

test('picking a window recomputes the deadline from today at 23:59:59',()=>{
  const {ctx}=setup();
  ctx.editTask={taskType:'help',signupDeadline:null};
  ctx.toggleEditSignupDeadline(15);
  const d=new Date();d.setDate(d.getDate()+15);
  const p=x=>String(x).padStart(2,'0');
  assert.equal(ctx.editSignupDeadlinePayload(),
    d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T23:59:59');
  assert.equal(ctx.editSignupMode,15);
});

test('revision diff lists every field and highlights only what changed',()=>{
  const {ctx,el}=setup();
  const base={id:5,title:'旧标题',description:'旧描述',requirements:'旧要求',skillCategory:'study',skillSub:'数学',
    reward:10,claimMode:'single',maxClaimers:null,contact:'wx:old',
    signupDeadline:'2026-10-05T23:59:59',completeDeadline:null};
  ctx.reviewRecords=[{publisherNickname:'小明',task:base,
    pendingRevision:Object.assign({},base,{reward:20,claimMode:'multiple',maxClaimers:3})}];

  ctx.openRevisionDiff(5);

  const body=el('revisionDiffBody').innerHTML;
  assert.equal((body.match(/<tr/g)||[]).length,12);            // 表头 1 + 11 个字段
  assert.match(body,/共 <b>3<\/b> 处改动/);
  assert.equal(el('revisionDiffModal').style.display,'flex');
  assert.equal((body.match(/#FFF7ED/g)||[]).length,3);         // 只有 3 行被标为改动
  /* 证明图不参与改稿：对比表里没有它（仍是 11 个字段），只在下面的独立容器里摆实体图 */
  assert.match(el('revisionDiffProof').innerHTML,/td-proof-none">未上传证明图片/,
    '没有证明图时也要显式告诉审核员');
  assert.match(el('revisionDiffProof').innerHTML,/本次未改动/,'要写明证明图本次未改动（沿用原图）');
});

test('diff shows the existing proof image but never puts it in the diff table',()=>{
  const {ctx,el}=setup();
  const base={id:5,title:'旧标题',description:'旧描述',requirements:'旧要求',skillCategory:'study',skillSub:'数学',
    reward:10,claimMode:'single',maxClaimers:null,contact:'wx:old',
    signupDeadline:'2026-10-05T23:59:59',completeDeadline:null,proofImageId:42};
  ctx.reviewRecords=[{publisherNickname:'小明',task:base,pendingRevision:Object.assign({},base,{reward:20})}];

  ctx.openRevisionDiff(5);

  assert.equal((el('revisionDiffBody').innerHTML.match(/<tr/g)||[]).length,12,'证明图不该出现在字段表里');
  assert.match(el('revisionDiffProof').innerHTML,/data-stub-proof="42"/,'要摆出发布时上传的那张图');
  assert.match(el('revisionDiffProof').innerHTML,/本次未改动/,'改稿没换图时说明「仍是这张」');
});

/* 2026-10-07：改稿支持补充 / 替换 / 移除证明图，审核员要看到「通过后会变成哪张」 */
test('diff shows the replacement proof image with the current one beside it',()=>{
  const {ctx,el}=setup();
  const base={id:5,title:'旧标题',description:'旧描述',requirements:'旧要求',skillCategory:'study',skillSub:'数学',
    reward:10,claimMode:'single',maxClaimers:null,contact:'wx:old',
    signupDeadline:'2026-10-05T23:59:59',completeDeadline:null,proofImageId:42};
  ctx.reviewRecords=[{publisherNickname:'小明',task:base,
    pendingRevision:Object.assign({},base,{reward:20,proofImageId:99})}];

  ctx.openRevisionDiff(5);

  const proof=el('revisionDiffProof').innerHTML;
  assert.match(proof,/通过后换成下面这张/,'要说明通过后会换图');
  assert.match(proof,/data-stub-proof="99"/,'要摆出修改稿带来的新图');
  assert.match(proof,/当前图片/,'同时摆出当前那张便于对照');
  assert.match(proof,/data-stub-proof="42"/);
  assert.equal((el('revisionDiffBody').innerHTML.match(/<tr/g)||[]).length,12,'证明图仍不进字段表');
});

test('diff marks a revision that removes the proof image',()=>{
  const {ctx,el}=setup();
  const base={id:5,title:'旧标题',description:'旧描述',requirements:'旧要求',skillCategory:'study',skillSub:'数学',
    reward:10,claimMode:'single',maxClaimers:null,contact:'wx:old',
    signupDeadline:'2026-10-05T23:59:59',completeDeadline:null,proofImageId:42};
  ctx.reviewRecords=[{publisherNickname:'小明',task:base,
    pendingRevision:Object.assign({},base,{reward:20,proofImageId:null})}];

  ctx.openRevisionDiff(5);

  const proof=el('revisionDiffProof').innerHTML;
  assert.match(proof,/移除<\/b>证明图|移除/,'要明确写出这次修改会移除证明图');
  assert.match(proof,/将被移除/,'当前那张要标为将被移除');
});

test('edit form mirrors the publish form: proof picker, per-type contact visibility',()=>{
  const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','growth-schoolv3.html'),'utf8');
  // 取图区（复用发布的压缩与上传链路）
  assert.match(html,/id="editProofWrap"/,'修改表单要有证明图取图区');
  assert.match(html,/id="editProofInput"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html,/compressPublishProofImage\(file\)[\s\S]{0,400}uploadEditProofImage/,'复用同一压缩流水线');
  assert.match(html,/proofImageId: editProofImageId \|\| null/,'提交改稿要回填 proofImageId');
  assert.match(html,/clearProofImage: !!editProofCleared/,'要能表达「本次移除证明图」');
  // 联系方式：教学 / 组队隐藏（自动建群），求助与官方奖励保留；且不再是必填
  assert.match(html,/id="editContactWrap"/);
  assert.match(html,/function syncEditContactVisibility\(\)/);
  assert.match(html,/isGrouped = !!\(editTask && \(editTask\.taskType === 'teach' \|\| editTask\.taskType === 'team'\)\)/,'教学/组队才隐藏');
  assert.ok(!/联系方式 <span style="color:var\(--red\)">\*<\/span>/.test(html),'修改表单的联系方式不再标必填');
  assert.ok(!/if\(!contact\)\{ toast\('请填写联系方式'\); return; \}/.test(html),'前端不再硬拦联系方式');
  // 后端同口径：旧流程才要求
  const svc=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','backend/src/main/java/com/eggworld/service/TaskService.java'),'utf8');
  assert.match(svc,/isTaskAutoGroup\(\)[\s\S]{0,200}请填写联系方式后再修改/,'后端按流程开关判定');
});

/* 2026-10-07 真实反馈：审核卡片显示的是**旧图**，审核员却点「通过修改」放行。
   卡片必须展示「通过后会用的那张图」，三态与对比弹窗一致。 */
test('review card shows the image the revision will use, never the stale one',()=>{
  const {ctx}=setup();
  const task={id:5,title:'旧标题',proofImageId:42};

  const swapped=ctx.reviewProofHtml({title:'新标题',proofImageId:99},task);
  assert.match(swapped,/data-stub-proof="99"/,'卡片要显示改稿的新图');
  assert.ok(!/data-stub-proof="42"/.test(swapped),'不能再显示旧图（否则等于闭眼放行）');
  assert.match(swapped,/改稿已换新图/);

  const same=ctx.reviewProofHtml({title:'新标题',proofImageId:42},task);
  assert.match(same,/data-stub-proof="42"/);
  assert.match(same,/本次修改未改动/);

  const cleared=ctx.reviewProofHtml({title:'新标题',proofImageId:null},task);
  assert.match(cleared,/移除/,'要提示这次修改会移除证明图');
  assert.match(cleared,/未上传证明图片/,'移除后按「没有图」渲染');

  /* 没有改稿：仍是任务现值（老口径不变） */
  assert.match(ctx.reviewProofHtml(null,task),/data-stub-proof="42"/);
});

test('diff refuses to open for a task without a revision in review',()=>{
  const {ctx,el}=setup();
  ctx.reviewRecords=[{task:{id:5,title:'旧标题'}}];
  ctx.openRevisionDiff(5);
  assert.equal(el('revisionDiffModal').style.display,'');
});
