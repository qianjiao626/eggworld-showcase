const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const chatJs=read('js/chatroom.js');
const msgService=read('backend/src/main/java/com/eggworld/service/ChatMessageService.java');

/* 「聊天室消息日期显示成 1970-01-01」的回归契约。
   根因（两层）：
     后端：MyBatis-Plus 的 insert 不回读数据库生成的默认值，实体里 createdAt 仍是 null
           → VO 带 createdAt=null 返回；同时 last_message_at 也被写成 null
     前端：new Date(null) 是**合法日期**（1970-01-01），isNaN 拦不住
   修复：后端 insert 前显式赋值；前端 dayLabel/dayKey 显式挡掉空值。 */

/* ---------- 前端：必须显式挡掉 null/undefined/空串 ---------- */

test('🔴 new Date(null) 会得到 1970-01-01，isNaN 拦不住（说明为何必须显式判空）',()=>{
  assert.equal(isNaN(new Date(null)),false,'new Date(null) 是合法日期，isNaN 为 false');
  assert.equal(new Date(null).getFullYear(),1970,'这正是显示 1970 的原因');
  // 对照：undefined / 空串才会被判为 Invalid Date
  assert.equal(isNaN(new Date(undefined)),true);
  assert.equal(isNaN(new Date('')),true);
});

test('dayLabel 对空值返回空串，不再产出 1970',()=>{
  const ctx={};
  vm.createContext(ctx);
  const start=chatJs.indexOf('function dayLabel(');
  assert.ok(start>0,'未找到 dayLabel');
  const end=chatJs.indexOf('\n',start);
  vm.runInContext(chatJs.slice(start,end),ctx);
  for (const v of [null,undefined,'']) {
    assert.equal(ctx.dayLabel(v),'','dayLabel('+String(v)+') 应为空串');
  }
  // 正常值仍要能工作
  const today=new Date().toISOString();
  assert.equal(ctx.dayLabel(today),'今天','正常时间戳仍应显示「今天」');
});

test('dayKey 对空值返回空串，避免渲染出错误日期分组',()=>{
  const ctx={};
  vm.createContext(ctx);
  const start=chatJs.indexOf('function dayKey(');
  assert.ok(start>0,'未找到 dayKey');
  const end=chatJs.indexOf('\n',start);
  vm.runInContext(chatJs.slice(start,end),ctx);
  for (const v of [null,undefined,'']) {
    assert.equal(ctx.dayKey(v),'','dayKey('+String(v)+') 应为空串');
  }
});

test('timeText / shortTime 同样有空值守卫（口径一致）',()=>{
  for (const fn of ['timeText','shortTime']) {
    const start=chatJs.indexOf('function '+fn+'(');
    assert.ok(start>0,'未找到 '+fn);
    const line=chatJs.slice(start,chatJs.indexOf('\n',start));
    assert.ok(line.includes("if(!s)return"),fn+' 必须有 if(!s) 守卫');
  }
});

test('日期分隔只在 dayKey 非空时渲染（空值不产生空标签）',()=>{
  const i=chatJs.indexOf('var dk=dayKey(m.createdAt);');
  assert.ok(i>0,'未找到渲染处的 dayKey 调用');
  const seg=chatJs.slice(i,i+220);
  assert.ok(seg.includes('if(dk&&dk!==lastDay)'),'必须判 dk 非空再渲染日期分隔');
});


/* 精确取 send() 方法体：从方法签名到下一个方法签名（避免把别的方法里的 now() 算进来） */
function sendBody(){
  const i=msgService.indexOf('public ChatMessageVO send(');
  assert.ok(i>0,'未找到 send 方法');
  // 下一个方法：markRead（read 状态）——它排在 send 之后
  const after=msgService.indexOf('public void markRead',i);
  return msgService.slice(i, after>i?after:msgService.length);
}

/* ---------- 后端：insert 前显式赋值 ---------- */

test('后端 send() 在 insert 前显式赋值 createdAt',()=>{
  const body=sendBody();
  assert.ok(body.includes('setCreatedAt('),'send() 必须在 insert 前 setCreatedAt');
  const setAt=body.indexOf('message.setCreatedAt(');
  const insertAt=body.indexOf('messageMapper.insert(message)');
  assert.ok(setAt>0&&insertAt>0,'未找到赋值或 insert');
  assert.ok(setAt<insertAt,'setCreatedAt 必须在 insert 之前');
});

test('last_message_at 用同一个非空时间，不再写 null',()=>{
  const body=sendBody();
  // 不应再出现「取刚 insert 对象的 createdAt」这种会拿到 null 的写法
  assert.equal(body.includes('getLastMessageAt, message.getCreatedAt()'),false,
    '不应再把 message.getCreatedAt() 写进 last_message_at（insert 后未回读，必为 null）');
  assert.ok(body.includes('getLastMessageAt, now'),'应写入 insert 前取好的非空时间');
});

test('时间戳在 insert 前取一次，两处复用（避免两次 now() 不一致）',()=>{
  const body=sendBody();
  const nowCount=(body.match(/LocalDateTime\.now\(\)/g)||[]).length;
  assert.equal(nowCount,1,'send() 内应只取一次当前时间，实际 '+nowCount+' 次');
});
