const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');
const chatroom=fs.readFileSync(path.join(root,'js','chatroom.js'),'utf8');

/* 本批（feat/task-chat-ux-flow）的契约：「任务绑定群聊」上线后，
   教学/组队的沟通全部收口到任务群 —— 前端不再收集站外联系方式（微信/QQ），
   把「进群」做成认领与进行中的主入口，任务完成后群转只读归档。
   做法沿用 mytasks-rejected.test.cjs：只抽函数源码在 vm 里跑，不拉起整页依赖。 */

/* 从主文件抽 2 空格缩进的函数（闭包判定为「下一处 \n  }」） */
function loadHtmlFns(names, ctx){
  vm.createContext(ctx);
  for(const name of names){
    const start=html.indexOf('  function '+name+'(');
    if(start<0) throw new Error('未找到函数: '+name);
    const end=html.indexOf('\n  }',start)+4;
    vm.runInContext(html.slice(start,end),ctx);
  }
  return ctx;
}
/* 从 chatroom.js 抽顶层函数（0 缩进） */
function loadChatroomFn(name, ctx){
  const start=chatroom.indexOf('function '+name+'(');
  if(start<0) throw new Error('未找到函数: '+name);
  const end=chatroom.indexOf('\n}',start)+2;
  vm.createContext(ctx);
  vm.runInContext(chatroom.slice(start,end),ctx);
  return ctx;
}

/* ---------- ① 发布表单：教学/组队不收集联系方式 ---------- */

test('发布表单：教学/组队隐藏联系方式、显示「沟通方式升级」提示卡；求助型相反',()=>{
  for(const [type,isGrouped] of [['teach',true],['team',true],['help',false]]){
    const els={publishContactWrap:{style:{}},publishGroupTip:{style:{}}};
    const ctx=loadHtmlFns(['syncPublishContactVisibility'],
      {document:{getElementById:id=>els[id]||null},publishTaskType:type});
    ctx.syncPublishContactVisibility();
    assert.equal(els.publishContactWrap.style.display,isGrouped?'none':'',type+' 的联系方式块显隐不对');
    assert.equal(els.publishGroupTip.style.display,isGrouped?'flex':'none',type+' 的提示卡显隐不对');
  }
});

test('发布提交：教学/组队强制空联系方式，不把隐藏输入框里的历史值带上',()=>{
  assert.ok(html.includes("var contact = (taskType === 'teach' || taskType === 'team') ? '' : (contactEl ? contactEl.value.trim() : '');"),
    'submitPublish 必须对教学/组队强制空联系方式');
});

/* ---------- ② 认领漏斗 ---------- */

test('认领提交：教学/组队强制空联系方式，且不覆盖已保存的 USER.claimContact',()=>{
  assert.ok(html.includes("var claimerContact = isGrouped ? '' : document.getElementById('claimContactInput').value.trim();"),
    'doConfirmClaim 必须对教学/组队强制空联系方式');
  assert.ok(html.includes('if(!isGrouped) USER.claimContact = claimerContact;'),
    '教学/组队不应覆盖 USER.claimContact');
});

test('认领弹窗：教学「支付 X 币+进教学群」、组队「冻结 X 币+进协作群」居中强调；求助型保留联系方式',()=>{
  function claimDialog(){
    const mk=()=>({textContent:'',innerHTML:'',style:{cssText:''}});
    const els={claimConfirmTitle:mk(),claimConfirmBtn:mk(),claimContactWrap:{style:{display:'flex'}},claimContactHint:mk(),claimConfirmTip:mk()};
    const ctx=loadHtmlFns(['setClaimDialogCopy'],{document:{getElementById:id=>els[id]||null}});
    return {ctx,els};
  }
  const teach=claimDialog();
  teach.ctx.setClaimDialogCopy('teach',20);
  assert.equal(teach.els.claimContactWrap.style.display,'none','教学必须隐藏联系方式块');
  assert.equal(teach.els.claimConfirmBtn.textContent,'确认入队');
  assert.match(teach.els.claimConfirmTip.innerHTML,/支付 <b[^>]*>20<\/b> 蛋蛋币，并立即加入教学专属群聊/);
  assert.match(teach.els.claimConfirmTip.style.cssText,/text-align:center/,'资金与进群要居中强调');

  const team=claimDialog();
  team.ctx.setClaimDialogCopy('team',10);
  assert.equal(team.els.claimContactWrap.style.display,'none');
  assert.match(team.els.claimConfirmBtn.textContent,/冻结 10 蛋蛋币出资/);
  assert.match(team.els.claimConfirmTip.innerHTML,/冻结 <b[^>]*>10<\/b> 蛋蛋币，并立即加入项目协作群聊/);

  const help=claimDialog();
  help.ctx.setClaimDialogCopy('help',10);
  assert.equal(help.els.claimContactWrap.style.display,'flex','求助型没有任务群，必须保留联系方式块');
  assert.equal(help.els.claimConfirmBtn.textContent,'确认报名');
  assert.match(help.els.claimConfirmTip.innerHTML,/先报名、后挑选/);
});

test('认领成功弹窗：只在任务确实有群时才弹（不空口承诺已入群）',()=>{
  assert.ok(html.includes("if(card && card.getAttribute('data-conversation-id')) showClaimSuccess(card, taskType, reward);"),
    '没有任务群的任务认领后不应弹「已加入群聊」');
  assert.ok(html.includes('id="claimSuccessModal"'),'认领成功弹窗必须存在');
  assert.ok(html.includes("onclick=\"goClaimedTaskChat()\""),'必须提供「立即前往聊天室」入口');
});

/* ---------- ③ 我的任务：名单按钮分流（新版不挑人） ---------- */

test('名单按钮只在「还有改版前待配对报名」时出现；认领即入队的新版任务不给按钮',()=>{
  const ctx=loadHtmlFns(['myPrimaryAction'],{myRateEntry:()=>({hot:false,text:'评价'})});
  // 新版教学：全员自动入队（claimCount == memberCount）→ 发布者无事可做，不给名单按钮
  assert.equal(ctx.myPrimaryAction({id:1,status:'approved',taskType:'teach',maxClaimers:3,conversationId:88},{claimCount:3,memberCount:3},true,'approved'),'',
    '认领即入队后发布者不再挑人，教学不该再出现名单按钮');
  // 有群但仍有改版前的待配对报名 → 保留入口，并把 conversationId 传给弹窗（决定黄条文案）
  const legacy=ctx.myPrimaryAction({id:2,status:'approved',taskType:'teach',maxClaimers:3,conversationId:88},{claimCount:4,memberCount:3},true,'approved');
  assert.match(legacy,/学员名单/);
  assert.match(legacy,/openClaimerApi\(2, 'teach', 3, 88\)/);
  // 无群的改版前组队任务：同样按「有待配对」口径给「搭子名单」，conversationId 传 0
  const oldTeam=ctx.myPrimaryAction({id:3,status:'approved',taskType:'team',maxClaimers:2},{claimCount:1,memberCount:0},true,'approved');
  assert.match(oldTeam,/搭子名单/);
  assert.match(oldTeam,/openClaimerApi\(3, 'team', 2, 0\)/);
  // 求助型没有任务群、始终由发布者选人 → 不受影响
  assert.match(ctx.myPrimaryAction({id:4,status:'approved',taskType:'help',maxClaimers:2},{claimCount:1,memberCount:0},true,'approved'),/选择帮办/);
});

test('卡片文案：有群的教学/组队引导进群；没有群的组队仍指向「查看队友」',()=>{
  const ctx=loadHtmlFns(['myTaskNote'],{});
  assert.match(ctx.myTaskNote({id:1,status:'approved',taskType:'teach',maxClaimers:3,conversationId:9},{claimCount:2,memberCount:2},true,'approved'),
    /已建立专属群聊/);
  assert.match(ctx.myTaskNote({id:1,status:'approved',taskType:'teach',maxClaimers:3,conversationId:9},{claimCount:3,memberCount:2},true,'approved'),
    /人报名待选/);
  assert.match(ctx.myTaskNote({id:1,status:'in_progress',taskType:'team',conversationId:9},{myClaimStatus:'in_progress'},false,'in_progress'),
    /进度请在任务群内同步/);
  assert.match(ctx.myTaskNote({id:1,status:'in_progress',taskType:'team'},{myClaimStatus:'in_progress'},false,'in_progress'),
    /查看队友/);
});

/* ---------- ④ 未读红点与接线 ---------- */

test('未读红点：有未读才渲染红点；conversationId 可从「我的任务」缓存按任务找',()=>{
  const ctx=loadHtmlFns(['chatDotHtml','findMyTaskConversationId'],
    {window:{chatroomUnreadOf:()=>2},myTaskItems:{todo:[],active:[{task:{id:7,conversationId:77}}],done:[],expired:[]}});
  assert.equal(ctx.chatDotHtml(77).includes('hidden'),false,'有未读应渲染红点');
  ctx.window.chatroomUnreadOf=()=>0;
  assert.ok(ctx.chatDotHtml(77).includes('hidden'),'无未读应隐藏红点');
  assert.equal(ctx.findMyTaskConversationId(7),77);
  assert.equal(ctx.findMyTaskConversationId(999),'');
});

test('红点接线：聊天室导出未读入口并在会话刷新后通知主站，主站注册了订阅位',()=>{
  assert.ok(chatroom.includes('window.chatroomUnreadOf=unreadOf;'),'chatroom.js 必须导出按会话取未读数的入口');
  assert.ok(chatroom.includes('notifyUnreadChanged();'),'loadConversations 之后必须通知主站刷新红点');
  assert.ok(html.includes('window.onChatroomUnreadChanged = refreshMyTaskChatBadges;'),'主站必须注册未读变化回调');
});

test('unreadOf：按会话 ID 取未读数，找不到返回 0（不编造数据）',()=>{
  const ctx=loadChatroomFn('unreadOf',{state:{conversations:[{id:5,unreadCount:3},{id:'6',unreadCount:0}]}});
  assert.equal(ctx.unreadOf(5),3);
  assert.equal(ctx.unreadOf('6'),0);
  assert.equal(ctx.unreadOf('7'),0);
});

/* ---------- ⑤ 任务完成 → 群只读归档 ---------- */

function archiveCtx(){
  const els={chatroomComposer:{style:{}},chatroomArchivedNote:{style:{}}};
  const ctx=loadChatroomFn('syncArchiveState',{document:{getElementById:id=>els[id]||null},$:id=>els[id]||null});
  return {ctx,els};
}

test('归档群（read_only=1）：隐藏输入区、显示归档说明；非归档反之',()=>{
  const on=archiveCtx();on.ctx.syncArchiveState({id:1,readOnly:1});
  assert.equal(on.els.chatroomComposer.style.display,'none','归档后不应还能输入');
  assert.equal(on.els.chatroomArchivedNote.style.display,'');
  const off=archiveCtx();off.ctx.syncArchiveState({id:1,readOnly:0});
  assert.equal(off.els.chatroomComposer.style.display,'');
  assert.equal(off.els.chatroomArchivedNote.style.display,'none');
  const none=archiveCtx();none.ctx.syncArchiveState({id:1});
  assert.equal(none.els.chatroomComposer.style.display,'','没有 readOnly 字段时按可发言处理');
});

test('归档相关的页面元素成对存在（输入区 / 归档说明 / 确认完成预告）',()=>{
  assert.ok(html.includes('id="chatroomComposer"'),'输入区必须有 id 供归档时隐藏');
  assert.ok(html.includes('id="chatroomArchivedNote"'),'归档说明块必须存在');
  assert.ok(html.includes('id="confirmMembersArchiveHint"'),'确认完成弹窗必须有归档预告');
  assert.ok(chatroom.includes('syncArchiveState(fresh);'),'会话列表刷新后要重新同步当前会话的归档态');
});
