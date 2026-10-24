const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('growth-schoolv3.html','utf8');

/* 注册页不再让用户选 MBTI / 抽蛋：基础信息提交给 /api/auth/register，
   初始蛋由后端随机抽取，注册成功自动登录后弹「解锁新角色」弹窗。 */
function setup(){
  const el=v=>({value:v,textContent:'',className:'',style:{},classList:{add(){},remove(){},toggle(){}}});
  const els={
    regNickname:el('小蛋'), regEmail:el('a@b.com'), regCode:el('123456'), regPwd:el('abc123'),
    regInviteCode:el(''), regSchool:el(''), regMajor:el(''), regCity:el(''),
    regGrade:el(''), regAge:el(''),
    regModal:el('')
  };
  const posts=[],puts=[],unlockCalls=[];
  const ctx={
    document:{getElementById:id=>els[id]||el(''),querySelectorAll:()=>[],querySelector:()=>null},
    localStorage:{setItem(){},removeItem(){}},
    sessionStorage:{setItem(){}},
    window:{location:{search:''}},
    URLSearchParams,
    setTimeout:()=>0,
    USER:{role:'student'},
    CHAR_STATE:{current:'study'},
    NOTIFS:[], notifications:[], notifUnreadCount:0, notifPage:1, notifRequestVersion:0,
    apiPost:async(url,body)=>{ posts.push({url,body}); return {code:200,data:{token:'T',user:{}}}; },
    apiPut:async(url,body)=>{ puts.push({url,body}); return {code:200}; },
    apiGet:async()=>({code:200,data:{}}),
    applyUserData(){}, resetMyTaskPanel(){}, updateNotifBadge(){}, renderNotifPanel(){},
    escapeHtml:v=>String(v),
    login(){}, toast(){}, loadPlazaTasks(){}, loadMyTasks(){}, scanAndRefundExpiredTasks(){},
    showUnlockModal:(cat,isDraw)=>unlockCalls.push({cat,isDraw})
  };
  vm.createContext(ctx);
  const start=html.indexOf('  /* ===== Register ===== */');
  const end=html.indexOf('  /* ===== Page navigation ===== */');
  assert.ok(start>=0&&end>start,'register module exists');
  vm.runInContext(html.slice(start,end),ctx);
  return {ctx,els,posts,puts,unlockCalls};
}

test('注册请求只带基础信息，不再提交 MBTI 与初始蛋',async()=>{
  const {ctx,posts,puts}=setup();
  await ctx.doRegister();
  assert.equal(posts.length,2,'应依次调用注册与自动登录');
  const reg=posts[0];
  assert.equal(reg.url,'/api/auth/register');
  assert.equal(Object.prototype.hasOwnProperty.call(reg.body,'initialCategory'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(reg.body,'mbtiType'),false);
  assert.deepEqual(Object.keys(reg.body).sort(),['code','email','inviteCode','nickname','password']);
  assert.equal(posts[1].url,'/api/auth/login');
  assert.equal(puts.length,0,'选填资料全空时不发资料更新请求');
});

test('注册成功自动登录后弹解锁弹窗，展示后端随机抽到的蛋',async()=>{
  const {ctx,unlockCalls}=setup();
  ctx.CHAR_STATE.current='game';
  await ctx.doRegister();
  assert.deepEqual(unlockCalls,[{cat:'game',isDraw:true}]);
});

test('填了选填资料才提交资料，且不带 MBTI',async()=>{
  const {ctx,els,puts}=setup();
  els.regSchool.value='浙江大学'; els.regAge.value='21';
  await ctx.doRegister();
  assert.equal(puts.length,1);
  assert.equal(puts[0].url,'/api/users/me');
  assert.deepEqual(Object.keys(puts[0].body).sort(),['age','school']);
  assert.equal(puts[0].body.school,'浙江大学');
  assert.equal(puts[0].body.age,21);
});

test('注册页已无 MBTI 选择与抽蛋入口，解锁弹窗仍在',()=>{
  assert.equal(/id="regMbtiGrid"|id="eggDrawArea"|function drawEgg|function selectRegMbti/.test(html),false);
  assert.equal(/initialCategory/.test(html),false);
  assert.ok(/id="unlockModal"/.test(html),'任务解锁弹窗保留');
  assert.ok(/function showUnlockModal\(charKey, isDraw\)/.test(html));
});
