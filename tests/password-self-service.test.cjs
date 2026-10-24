const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');

/* 契约（2026-10-13 需求）：改密下放给用户、登录/注册处提供邮箱找回。
   · 「我的信息」页自助改密：只需当前密码，不走邮箱验证码 → POST /api/users/me/password
   · 登录 / 注册页「忘记密码」：邮箱验证码 + 新密码 → POST /api/auth/reset-password
   这里钉住入口、弹窗字段与请求路径，避免以后被重构掉。 */

function slice(from, to) {
  const start=html.indexOf(from);
  assert.ok(start>=0, '找不到锚点：'+from);
  const end=html.indexOf(to, start);
  assert.ok(end>start, '找不到结束锚点：'+to);
  return html.slice(start, end);
}

test('登录与注册处都有「忘记密码」入口，指向同一个邮箱找回弹窗',()=>{
  assert.match(html,/onclick="closeLoginModal\(\);openForgotPwdModal\(\)"/, '登录页缺少忘记密码入口');
  assert.match(html,/onclick="closeRegModal\(\);openForgotPwdModal\(\)"/, '注册页缺少忘记密码入口');
  assert.match(html,/id="forgotPwdModal"/, '找回密码弹窗不存在');
});

test('找回密码弹窗字段齐全，走「发验证码 → 提交新密码」两步',()=>{
  const modal=slice('id="forgotPwdModal"','<div id="stage">');
  for (const id of ['forgotEmail','forgotCode','forgotSendCodeBtn','forgotPwd','forgotPwdConfirm','forgotPwdOk']) {
    assert.ok(modal.includes('id="'+id+'"'), '弹窗缺少字段 '+id);
  }
  assert.match(html,/function sendForgotCode\(\)/, '缺少发送验证码逻辑');
  assert.match(html,/apiPost\('\/api\/auth\/send-code'/, '应复用 send-code 发验证码');
  assert.match(html,/apiPost\('\/api\/auth\/reset-password',\s*\{\s*email: email, code: code, password: pwd \}\)/,
    '找回密码应提交邮箱+验证码+新密码到 /api/auth/reset-password');
});

test('「我的信息」页有账号安全入口，自助改密提交 /api/users/me/password',()=>{
  const info=slice('id="mine-panel-info"','id="page-publish"');
  assert.match(info,/账号安全/, '我的信息页缺少账号安全区块');
  assert.match(info,/onclick="openChangePwdModal\(\)"/, '缺少修改密码按钮');
  assert.match(html,/id="changePwdModal"/, '修改密码弹窗不存在');
  assert.match(html,/apiPost\('\/api\/users\/me\/password',\s*\{\s*oldPassword: oldPwd, newPassword: newPwd \}\)/,
    '自助改密应提交当前密码+新密码');
});

test('自助改密不要求邮箱验证码（与找回密码区分）',()=>{
  const modal=slice('id="changePwdModal"','id="resetPwdModal"');
  assert.ok(!/验证码/.test(modal), '自助改密弹窗不应出现验证码字段');
  assert.ok(modal.includes('changePwdOld'), '自助改密需要当前密码字段');
});

test('两处新流程沿用注册的密码规则（6-20 位、字母+数字）',()=>{
  const change=slice('async function doChangePwd','function openResetPwdModal');
  const forgot=slice('async function doForgotPwd','function regBasicsError');
  for (const [name,body] of [['doChangePwd',change],['doForgotPwd',forgot]]) {
    assert.match(body,/< 6 \|\| .+ > 20/, name+' 应校验密码长度 6-20');
    assert.ok(body.includes('[A-Za-z]') && body.includes('\\d'), name+' 应校验字母+数字');
    assert.match(body,/两次输入的新密码不一致/, name+' 应校验两次输入一致');
  }
});
