const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('growth-schoolv3.html');
const chatJs=read('js/chatroom.js');
const groupService=read('backend/src/main/java/com/eggworld/service/ChatGroupService.java');
const msgService=read('backend/src/main/java/com/eggworld/service/ChatMessageService.java');
const permService=read('backend/src/main/java/com/eggworld/service/ChatPermissionService.java');
const sql=read('backend/sql/migrate-dissolve-private-groups.sql');

/* 私密群停用（2026-09-21）的三层契约：
   ① 不允许新建 —— ChatGroupService.create() 只收 public
   ② 存量冻结只读 —— ChatPermissionService.requireCanSend() 拦截 private group
   ③ 可选彻底解散 —— migrate-dissolve-private-groups.sql
   红线：一对一私聊（type=direct）的 visibility 同为 private，任何一层都不得误伤。 */

/* ---------- ① 不允许新建 ---------- */

test('后端拒绝创建私密群（权威拦截）',()=>{
  const i=groupService.indexOf('public Long create(');
  assert.ok(i>0,'未找到 create 方法');
  const body=groupService.slice(i,groupService.indexOf('@Transactional',i+10));
  assert.ok(body.includes('"public".equals(visibility)'),'必须校验 visibility 只能是 public');
  assert.equal(/"private"\.equals\(visibility\)/.test(body),false,'不应再放行 private');
});

test('前端建群表单不再提供私密群选项',()=>{
  const i=html.indexOf('id="chatroomGroupVisibility"');
  assert.ok(i>0,'未找到可见性字段');
  const seg=html.slice(i,html.indexOf('</select>',i));
  assert.ok(seg.includes('value="public"'),'应保留 public 选项');
  assert.equal(seg.includes('value="private"'),false,'不应再有 private 选项');
  assert.equal(seg.includes('私密群'),false,'不应再出现「私密群」字样');
  assert.ok(seg.includes('disabled'),'下拉框应 disabled，防止用户改动');
});

/* ---------- ② 存量私密群冻结为只读 ---------- */

test('存量私密群禁止发言（发言闸门拦截）',()=>{
  assert.match(permService,/PRIVATE_GROUP_ENABLED\s*=\s*false/,'应有私密群总开关且为关闭');
  const i=permService.indexOf('public void requireCanSend(');
  assert.ok(i>0,'未找到 requireCanSend');
  const body=permService.slice(i,permService.indexOf('\n    }',i));
  assert.ok(body.includes('PRIVATE_GROUP_ENABLED'),'发言闸门必须引用该开关');
  assert.match(body,/"group"\.equals\(c\.getType\(\)\)/,'必须限定 type=group');
  assert.match(body,/"private"\.equals\(c\.getVisibility\(\)\)/,'必须限定 visibility=private');
});

test('🔴 私聊不得被误伤（visibility 同为 private）',()=>{
  // 本次改动最大的风险点：direct 的 visibility 也是 private，
  // 只按 visibility 拦截会把一对一私聊一起禁掉。
  const i=permService.indexOf('public void requireCanSend(');
  assert.ok(i>0,'未找到 requireCanSend');
  // 取 requireCanSend 的方法体：到文件末尾即可（后面没有其他方法引用该开关）
  const body=permService.slice(i);
  const at=body.indexOf('PRIVATE_GROUP_ENABLED');
  assert.ok(at>0,'requireCanSend 内未引用私密群开关');
  // 从该位置往前找最近的 if(，截取完整条件（避免把前面的 ! 切掉）
  const ifAt=body.lastIndexOf('if (',at);
  assert.ok(ifAt>0&&ifAt<at,'未找到开关所在的 if 语句');
  const braceAt=body.indexOf('{',at);
  const cond=body.slice(ifAt,braceAt>0?braceAt:at+200);
  assert.ok(cond.includes('!PRIVATE_GROUP_ENABLED'),'条件必须含 !PRIVATE_GROUP_ENABLED，实际: '+cond);
  assert.ok(cond.includes('"group".equals(c.getType())'),'条件必须含 type=group 判定，实际: '+cond);
  assert.ok(cond.includes('"private".equals(c.getVisibility())'),'条件必须含 visibility=private 判定，实际: '+cond);
  const andCount=(cond.match(/&&/g)||[]).length;
  assert.ok(andCount>=2,'三个条件必须以 && 连接，实际 && 数量='+andCount);
});
test('私聊总开关独立保留，未被本次改动影响',()=>{
  assert.ok(msgService.includes('DIRECT_CHAT_ENABLED'),'私聊总开关必须保留');
  assert.ok(msgService.includes('createDirect'),'createDirect 必须保留');
  assert.equal(groupService.includes('DIRECT_CHAT_ENABLED'),false,'建群逻辑不应引用私聊开关');
});

/* ---------- ③ 可选：解散存量私密群 ---------- */

test('解散脚本只针对 group + private，且不动私聊',()=>{
  // 两条 UPDATE 都必须同时限定 type='group' 与 visibility='private'
  const convUpdate=sql.slice(sql.indexOf("UPDATE chat_conversations"),sql.indexOf(';',sql.indexOf("UPDATE chat_conversations")));
  assert.ok(convUpdate.includes("type = 'group'"),'会话 UPDATE 必须限定 type=group');
  assert.ok(convUpdate.includes("visibility = 'private'"),'会话 UPDATE 必须限定 visibility=private');
  assert.ok(convUpdate.includes("status = 'active'"),'会话 UPDATE 必须限定 status=active');
  // 绝不能出现无 type 限定的删除/更新
  assert.equal(/DELETE\s+FROM/i.test(sql),false,'不应使用 DELETE（保留数据可回溯）');
  assert.equal(/UPDATE\s+chat_conversations[^;]*type\s*=\s*'direct'/i.test(sql),false,'绝不应对私聊执行写操作');
});

test('解散脚本是幂等的（重复执行无副作用）',()=>{
  // 两条 UPDATE 都带 status='active' 条件 → 第二次执行匹配 0 行
  const matches=[...sql.matchAll(/UPDATE\s+\w+[\s\S]*?status\s*=\s*'active'/g)];
  assert.ok(matches.length>=2,'两条 UPDATE 都应带 status=active 幂等条件');
});

/* ---------- 手机版误触修复（同批改动） ---------- */

test('聊天室页隐藏反馈悬浮按钮（桌面端与手机端都生效）',()=>{
  const i=html.indexOf('body:has(#page-lab.active) .contact-fab');
  assert.ok(i>0,'缺少「聊天室页隐藏 .contact-fab」的规则');
  const rule=html.slice(i,html.indexOf('}',i)+1);
  assert.match(rule,/display\s*:\s*none/,'该规则必须是 display:none');
  // 2026-09-22 起改为双端生效：必须位于 @media 之外（全局作用域），
  // 否则桌面端进聊天室时按钮不会隐藏。
  const mqBefore=html.lastIndexOf('@media',i);
  let inMedia=false;
  if(mqBefore>0){
    // 找该 @media 块的结束位置：从 mqBefore 起数大括号配对
    let depth=0, j=html.indexOf('{',mqBefore), end=-1;
    for(let k=j;k<html.length;k++){
      if(html[k]==='{')depth++;
      else if(html[k]==='}'){ depth--; if(depth===0){ end=k; break; } }
    }
    inMedia = end>0 && i<end;
  }
  assert.equal(inMedia,false,'规则必须位于 @media 之外（双端生效）');
});

test('隐藏按「实验室页」判断，不绑单个子面板（为后续新增子项留余地）',()=>{
  const i=html.indexOf('body:has(#page-lab.active) .contact-fab');
  assert.ok(i>0,'未找到规则');
  const sel=html.slice(i,i+45);
  assert.ok(sel.includes('#page-lab.active'),'必须按 #page-lab.active 判断');
  // 不得绑到具体子面板（如 .lab-panel[data-lab-panel=...]）
  assert.equal(/\.lab-panel\[data-lab-panel/.test(sel),false,
    '不应绑具体子面板，否则实验室新增子项时需逐个补规则');
});
test('反馈入口只被隐藏、未被移除（其他页仍可用）',()=>{
  assert.ok(html.includes('class="contact-fab"'),'FAB 按钮本体必须保留');
  assert.ok(html.includes('openFeedbackModal()'),'反馈弹窗入口必须保留');
  const hides=[...html.matchAll(/\.contact-fab[^{]*\{[^}]*display\s*:\s*none/g)];
  assert.equal(hides.length,1,'只应有 1 处隐藏 .contact-fab 的规则，实际 '+hides.length);
});
