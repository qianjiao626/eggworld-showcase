'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');

/* 认领人数按等级收敛，官方任务按角色放宽（2026-10-07 需求 + 同日修订）。
   前端从主文件里**真实切出** LEVELS / getLevel / 上限与放宽判断来跑，不另抄一份口径；
   两边必须与后端 com.eggworld.common.LevelPolicy 完全一致。 */

function slice(startMarker, endMarker){
  const start=html.indexOf(startMarker);
  assert.ok(start>0,'主文件里找不到：'+startMarker);
  const end=html.indexOf(endMarker,start);
  assert.ok(end>start,'找不到结束标记：'+endMarker);
  return html.slice(start,end);
}

function setup(){
  const ctx={
    USER:{exp:0, role:'student'},
    publishTaskType:'teach',
    document:{getElementById:()=>({style:{},classList:{toggle(){}},setAttribute(){},removeAttribute(){},innerHTML:'',value:''})},
    toast:()=>{},
    escapeHtml:s=>String(s===null||s===undefined?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    console
  };
  vm.createContext(ctx);
  vm.runInContext(slice('  var LEVELS = [','\n  ];')+'\n  ];',ctx);            // 等级表
  vm.runInContext(slice('  function getLevel(exp){','\n  }')+'\n  }',ctx);      // 等级换算
  vm.runInContext(slice('  var LEVEL_MAX_CLAIMERS_BASE = 2;','\n  function updatePublishRewardHint()'),ctx);
  return ctx;
}

const cases=[
  {exp:0,    level:1, name:'新手蛋', allowed:2},
  {exp:50,   level:1, name:'新手蛋', allowed:2},
  {exp:99,   level:1, name:'新手蛋', allowed:2},
  {exp:100,  level:2, name:'进阶蛋', allowed:3},
  {exp:299,  level:2, name:'进阶蛋', allowed:3},
  {exp:300,  level:3, name:'达人蛋', allowed:4},
  {exp:599,  level:3, name:'达人蛋', allowed:4},
  {exp:600,  level:4, name:'大神蛋', allowed:5},
  {exp:1000, level:5, name:'传奇蛋', allowed:6},
  {exp:99999,level:5, name:'传奇蛋', allowed:6}
];

test('等级 → 认领人数上限：2 人起步、每级 +1',()=>{
  const ctx=setup();
  for(const c of cases){
    ctx.USER.exp=c.exp;
    assert.equal(ctx.publishLevelOf(),c.level,'经验 '+c.exp+' 的等级序号');
    assert.equal(ctx.getLevel(c.exp).name,c.name,'经验 '+c.exp+' 的等级名');
    assert.equal(ctx.publishMaxClaimersAllowed(),c.allowed,'经验 '+c.exp+' 的认领人数上限');
  }
});

test('前端阈值与后端 LevelPolicy 一致（0/100/300/600/1000）',()=>{
  const ctx=setup();
  /* 注意：vm 里造出来的数组原型与宿主不同，deepEqual 前要转成宿主数组 */
  const mins=Array.from(ctx.LEVELS,l=>l.min);
  assert.deepEqual(mins,[0,100,300,600,1000],'等级门槛不能私自改：后端 LevelPolicy.LEVEL_MIN_EXP 是同一套');
  assert.equal(ctx.LEVEL_MAX_CLAIMERS_BASE,2,'新用户基数必须是 2 人');
});

test('官方任务按角色放宽（2026-10-07 修订）',()=>{
  const ctx=setup();
  /* 学生：任何类型都按等级 */
  ctx.USER={exp:0, role:'student'};
  for(const type of ['teach','help','team','reward']){
    ctx.publishTaskType=type;
    assert.equal(ctx.publishClaimersUnlimited(),false,'学生发 '+type+' 不该放宽');
    assert.equal(ctx.publishClaimerCap(),2,'学生发 '+type+' 上限为等级额度');
  }
  /* 主管理员：所有类型都不设限（实际仍受 50 人硬上限） */
  ctx.USER={exp:0, role:'admin'};
  for(const type of ['teach','help','team','reward']){
    ctx.publishTaskType=type;
    assert.equal(ctx.publishClaimersUnlimited(),true,'主管理员发 '+type+' 不设限');
    assert.equal(ctx.publishClaimerCap(),50);
  }
  /* 副管理员：只有奖励型不设限 */
  ctx.USER={exp:0, role:'subadmin'};
  ctx.publishTaskType='reward';
  assert.equal(ctx.publishClaimersUnlimited(),true,'副管理员发奖励型不设限');
  assert.equal(ctx.publishClaimerCap(),50);
  for(const type of ['teach','help','team']){
    ctx.publishTaskType=type;
    assert.equal(ctx.publishClaimersUnlimited(),false,'副管理员发 '+type+' 仍按自己的等级');
    assert.equal(ctx.publishClaimerCap(),2);
  }
});

test('超出上限会被收敛并提示，不是静默改小',()=>{
  const ctx=setup();
  const toasts=[];
  ctx.toast=m=>toasts.push(m);
  ctx.USER={exp:0, role:'student'};
  const el={value:'5'};
  const v=ctx.clampPublishClaimers(el,ctx.publishClaimerCap());
  assert.equal(el.value,2,'输入 5 人应被收敛到 2');
  assert.equal(v,2);
  assert.equal(toasts.length,1,'必须给用户一句解释');
  assert.match(toasts[0],/最多可选 2 名/);
});

test('在上限之内原样放行，不打扰用户',()=>{
  const ctx=setup();
  const toasts=[];
  ctx.toast=m=>toasts.push(m);
  ctx.USER={exp:300, role:'student'};             // 达人蛋 4 人
  const el={value:'4'};
  assert.equal(ctx.clampPublishClaimers(el,ctx.publishClaimerCap()),4);
  assert.equal(el.value,'4','不超限不应改动输入框');
  assert.equal(toasts.length,0);
});

test('放宽时的提示口径，且组队冻资提示不会被顶掉',()=>{
  const ctx=setup();
  ctx.USER={exp:0, role:'admin'};
  ctx.publishTaskType='teach';
  assert.match(ctx.claimerLimitText(),/官方任务不设认领人数等级限制/, '主管理员看到的口径');
  ctx.USER={exp:0, role:'subadmin'};
  ctx.publishTaskType='reward';
  assert.match(ctx.claimerLimitText(),/奖励型官方任务不设认领人数等级限制/, '副管理员看到的口径');
  ctx.publishTaskType='teach';
  assert.match(ctx.claimerLimitText(),/你的等级：/, '副管理员发非奖励型回到等级口径');
  assert.match(html,/mch\.innerHTML = teamNote \? \(limitNote \+ '<br>' \+ teamNote\) : limitNote/,
    '等级提示与组队冻资提示要合并写入，不能互相覆盖');
});

test('发布表单接线：上限按等级/角色算、输入即时收敛、提交前再挡一次',()=>{
  assert.match(html,/id="maxClaimersHint"/,'提示挂载点还在');
  assert.match(html,/function syncPublishClaimerLimit\(\)/);
  assert.match(html,/function claimerLimitText\(\)/,'提示文案由 claimerLimitText 统一给');
  assert.match(html,/最多可选 <b>' \+ allowed/,'提示要说清允许人数');
  assert.match(html,/再获得 <b>/,'提示要给出「再得多少经验能多带 1 人」');
  /* 输入即时收敛：只有手填（放宽角色）需要收敛，下拉框天然选不出超限值 */
  assert.match(html,/if\(publishClaimersUnlimited\(\) && maxInputEl\) clampPublishClaimers\(maxInputEl, publishClaimerCap\(\)\)/,
    '手填超过上限要即时收敛（上限按等级/角色算）');
  /* 提交前再挡一次（前端先挡、后端再拒；只有手填的角色会超限，下拉框不会） */
  assert.match(html,/if\(mode === 'multiple' && maxC && publishClaimersUnlimited\(\)\)\{[\s\S]{0,320}publishClaimerCap\(\)/,
    'submitPublish 要收敛后再提交');
  /* 任务类型切换会影响放宽判断（副管理员只有奖励型不设限） */
  assert.match(html,/function toggleTaskType\(type\)\{[\s\S]{0,700}syncPublishClaimerLimit\(\)/,'切任务类型要重算上限');
  /* 进发布页与登录后都要刷新（等级会随经验变化） */
  assert.match(html,/function goPublish\([\s\S]{0,1400}syncPublishClaimerLimit\(\)/,'进发布页要刷新上限');
  assert.match(html,/syncPublishClaimerLimit\(\);\n\s*USER\.bio/,'applyUserData 之后要刷新上限');
  /* 人数控件（2026-10-08 修订）：按等级用下拉框、放宽角色用输入框，取值统一走 publishMaxClaimersValue */
  assert.match(html,/id="publishMaxClaimersSelect"/,'发布表单要有下拉框');
  assert.match(html,/function renderPublishClaimerOptions\(sel, cap\)/,'下拉框选项按上限生成');
  assert.match(html,/function publishMaxClaimersValue\(\)/,'取值要区分下拉框/输入框');
  assert.match(html,/var maxC = publishMaxClaimersValue\(\)/,'提交时读生效控件');
  assert.match(html,/function syncPublishClaimerLimit\(\)\{[\s\S]{0,900}prefillPublishClaimers\(\);[\s\S]{0,120}updatePublishRewardHint/,
    'syncPublishClaimerLimit 要顺带备好控件');
});

/* 2026-10-08 需求修订：按等级封顶的用户**用下拉框**（选不出超限值、默认选中上限）；
   主管理员 / 副管理员发奖励型不受等级限制 → 保留输入框手填。 */
test('多人认领：学生用下拉框（默认上限、选不出超限），管理员仍手填',()=>{
  const ctx=setup();
  const els={};
  const el=id=>els[id]||(els[id]={id,value:'',innerHTML:'',style:{},
    classList:{toggle(){}},setAttribute(){},removeAttribute(){},getAttribute:()=>null});
  ctx.document={getElementById:el,querySelectorAll:()=>[]};
  ctx.toast=()=>{};
  const sel=()=>el('publishMaxClaimersSelect');
  const input=()=>el('publishMaxClaimers');

  /* 达人蛋（300 经验）→ 上限 4：下拉框 1/2/3/4，默认选 4，输入框隐藏 */
  ctx.USER={exp:300, role:'student'};
  ctx.publishTaskType='teach';
  ctx.publishClaimMode='multiple';
  ctx.syncPublishClaimerLimit();
  assert.equal((sel().innerHTML.match(/<option/g)||[]).length,4,'选项应是从 1 人到上限的 4 个');
  assert.match(sel().innerHTML,/<option value="1">1 人<\/option>/,'最低要能选 1 人');
  assert.match(sel().innerHTML,/<option value="4">4 人<\/option>/);
  assert.ok(!/<option value="5"/.test(sel().innerHTML),'不能出现超出等级上限的选项');
  assert.equal(sel().value,'4','默认选中自己的上限');
  assert.equal(sel().style.display,'','学生看到下拉框');
  assert.equal(input().style.display,'none','学生不再看到手填输入框');
  assert.equal(ctx.publishMaxClaimersValue(),4,'取值走下拉框');

  /* 用户选 1：再刷新不能被顶回上限（尊重他的选择），且不出现超限选项 */
  sel().value='1';
  ctx.syncPublishClaimerLimit();
  assert.equal(sel().value,'1','额度内的选择要保留');

  /* 换等级/换任务类型导致额度变小：选项跟着收缩，额度内的旧选择保留 */
  ctx.USER={exp:100, role:'student'};                 // 进阶蛋 → 3
  ctx.syncPublishClaimerLimit();
  assert.equal((sel().innerHTML.match(/<option/g)||[]).length,3,'选项收缩为 1/2/3');
  assert.equal(sel().value,'1','原选择 1 仍在新额度内 → 保留，而不是顶回上限');
  assert.ok(!/<option value="4"/.test(sel().innerHTML),'额度收缩后不能留下 4 人选项');
});

test('多人认领：管理员手填输入框（预填 50、超限收敛），单人认领不预填',()=>{
  const ctx=setup();
  const els={};
  const el=id=>els[id]||(els[id]={id,value:'',innerHTML:'',style:{},
    classList:{toggle(){}},setAttribute(){},removeAttribute(){},getAttribute:()=>null});
  ctx.document={getElementById:el,querySelectorAll:()=>[]};
  ctx.toast=()=>{};
  const sel=()=>el('publishMaxClaimersSelect');
  const input=()=>el('publishMaxClaimers');

  /* 主管理员：输入框可见并预填 50（放宽上限），下拉框隐藏 */
  ctx.USER={exp:0, role:'admin'};
  ctx.publishTaskType='teach';
  ctx.publishClaimMode='multiple';
  ctx.syncPublishClaimerLimit();
  assert.equal(input().style.display,'','主管理员仍手填');
  assert.equal(sel().style.display,'none','主管理员不用下拉框');
  assert.equal(input().value,50,'输入框预填放宽上限 50');
  assert.equal(ctx.publishMaxClaimersValue(),50);

  /* 用户改成更小值：不覆盖 */
  input().value='1';
  ctx.syncPublishClaimerLimit();
  assert.equal(input().value,'1','不能覆盖用户自己填的更小值');

  /* 超限：收敛到 50 */
  input().value='99';
  ctx.syncPublishClaimerLimit();
  assert.equal(input().value,50,'超过放宽上限要收敛');

  /* 副管理员：奖励型手填、发教学回到下拉框（进阶蛋 3 档） */
  ctx.USER={exp:100, role:'subadmin'};
  ctx.publishTaskType='reward';
  ctx.syncPublishClaimerLimit();
  assert.equal(sel().style.display,'none','副管理员发奖励型仍手填');
  ctx.publishTaskType='teach';
  ctx.syncPublishClaimerLimit();
  assert.equal(sel().style.display,'','副管理员发教学回到下拉框');
  assert.equal(sel().value,'3','按自己等级（进阶蛋 3）');
  assert.equal(input().style.display,'none');

  /* 单人认领：控件隐藏且不预填 */
  ctx.publishClaimMode='single';
  sel().value='';
  ctx.prefillPublishClaimers();
  assert.equal(sel().value,'','单人认领不预填');

  /* 发布成功清空表单后要重建控件，别让下一个任务停在空值 */
  assert.match(html,/value = '';\n\s*\/\* 发布成功后表单清空[\s\S]{0,200}syncPublishClaimerLimit\(\)/,
    '发布成功清空表单后要重建人数控件');
  /* 后端「不填 = 不限」仍是既有口径（配对时再定人）：前端换控件不改变它，仅放宽角色手填时才可能留空 */
  const svc=fs.readFileSync(path.join(root,'backend/src/main/java/com/eggworld/service/TaskService.java'),'utf8');
  const from=svc.indexOf('public void publish');
  assert.ok(!/claimMode[\s\S]{0,80}请填写最大认领人数/.test(svc.slice(from,from+9000)),
    '发布侧不强制填人数（不填 = 不限是刻意保留的口径；只有提交修改稿那条要求必填）');
});
