const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('growth-schoolv3.html', 'utf8');
const script = fs.readFileSync('js/dormitory.js', 'utf8');

/* 最小 DOM 替身：只为验证"点击哪个元素会被宿舍审核的全局 click 监听器接走"。
   closest 支持 [a] 与 [a][b] 两种写法，因此能区分修复前后的选择器。 */
function fakeElement(attrs) {
  const has = (name) => Object.prototype.hasOwnProperty.call(attrs, name);
  const el = {
    id: attrs.id === undefined ? '' : attrs.id,
    getAttribute: (name) => (has(name) ? String(attrs[name]) : null)
  };
  el.closest = (selector) => {
    const names = (selector.match(/\[[^\]]+\]/g) || []).map((token) => token.slice(1, -1));
    return names.length && names.every(has) ? el : null;
  };
  return el;
}

function loadDormitory() {
  const clicks = [];
  const posts = [];
  const prompts = [];
  const sandbox = {
    console,
    API_BASE: '',
    USER: { registered: true },
    URL,
    sessionStorage: { getItem: () => null },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: (type, fn) => { if (type === 'click') clicks.push(fn); }
    },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ code: 200, data: [] }) }),
    prompt: (message) => { prompts.push(message); return ''; },
    apiGet: () => Promise.resolve({ code: 200, data: [] }),
    apiPost: (path) => { posts.push(path); return Promise.resolve({ code: 200 }); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(script, sandbox, { filename: 'js/dormitory.js' });
  assert.equal(clicks.length, 1, 'dormitory.js 应只注册一个 click 监听器');
  return { clicks, posts, prompts };
}

function click(target, clicks) {
  clicks.forEach((fn) => fn({ target }));
}

/* 断言整页 HTML 时不要用 assert.match / doesNotMatch ——
   失败会把 70 多万字符的整页打出来，CI 日志直接爆掉。 */
function checkHtml(pattern, message) {
  assert.ok(pattern.test(html), message);
}

function rejectHtml(pattern, message) {
  assert.ok(!pattern.test(html), message);
}

function functionSource(signature) {
  const start = html.indexOf(signature);
  assert.ok(start >= 0, `growth-schoolv3.html 里应存在 ${signature}`);
  const rest = html.slice(start);
  const end = rest.indexOf('\n  }\n');
  assert.ok(end > 0, `${signature} 的函数体应能定位到结尾`);
  return rest.slice(0, end);
}

/* ===== 回归：2026-09-25 线上事故 =====
   审核中心的卡片自带布尔属性 data-review，被宿舍审核的全局监听器当成自己的按钮截获，
   于是拿 data-id（不存在 → null）去请求 POST /api/dormitories/review/null → 500。 */
test('点击任务审核卡不再被宿舍审核监听器接走（不再打出 review/null 请求）', () => {
  const { clicks, posts, prompts } = loadDormitory();
  click(fakeElement({ 'data-review': '', 'data-task-id': '151' }), clicks);
  assert.deepEqual(posts, [], '任务审核卡不应触发任何宿舍审核请求');
  assert.deepEqual(prompts, [], '任务审核卡不应弹出宿舍驳回原因的原生输入框');
});

test('宿舍审核卡自己的「通过 / 驳回」按钮仍然正常工作', () => {
  const { clicks, posts } = loadDormitory();

  click(fakeElement({ 'data-review': 'reject', 'data-id': '7' }), clicks);
  assert.deepEqual(posts, ['/api/dormitories/review/7']);

  const { clicks: approveClicks, posts: approvePosts } = loadDormitory();
  click(fakeElement({ 'data-review': 'approve', 'data-id': '9' }), approveClicks);
  assert.deepEqual(approvePosts, ['/api/dormitories/review/9']);
});

test('宿舍审核按钮缺少 data-id 时被忽略，不再拼出 null', () => {
  const { clicks, posts, prompts } = loadDormitory();
  click(fakeElement({ 'data-review': 'reject' }), clicks);
  assert.deepEqual(posts, []);
  assert.deepEqual(prompts, []);
});

test('任务审核卡改用专属属性，避免与宿舍模块再次同名', () => {
  checkHtml(/'<div class="plaza-card" data-review-card data-task-id="/, '审核卡应改用自己的 data-review-card 属性');
  rejectHtml(/data-review\s+data-task-id/, '审核卡不应再带裸 data-review 属性');
  rejectHtml(/\[data-review\]/, '页面里不应再有裸 [data-review] 选择器');
  assert.doesNotMatch(script, /closest\('\[data-review\]'\)/, '宿舍模块不应再按裸 [data-review] 匹配');
});

/* ===== 防误触：审核通过必须二次确认（通过后任务立即上线，误触代价高） ===== */
test('审核通过前先弹二次确认，不再点一下就直接上线', () => {
  checkHtml(/id="approveConfirmModal"/, '应存在审核通过确认弹窗');
  checkHtml(/onclick="submitApproveConfirm\(\)"/, '确认弹窗里应有「确认通过」按钮');

  const review = functionSource('async function apiReviewTask(');
  assert.match(review, /openApproveConfirm\(taskId, title, isRevision\)/);
  assert.doesNotMatch(review, /apiPost\('\/api\/admin\/tasks\/'/);

  const confirm = functionSource('async function submitApproveConfirm(');
  assert.match(confirm, /apiPost\('\/api\/admin\/tasks\/' \+ approveConfirmTaskId \+ '\/approve'\)/);
});

/* ===== 同源加固：文字投稿审核按钮（data-review-note）曾与照片审核有同一个隐患 ===== */
test('文字投稿审核按钮仍正常发出请求（带 data-review-note + data-id）', () => {
  const { clicks, posts } = loadDormitory();
  click(fakeElement({ 'data-review-note': 'reject', 'data-id': '12' }), clicks);
  assert.deepEqual(posts, ['/api/dormitories/review/notes/12']);
});

test('带 data-review-note 却没有 data-id 的元素被忽略，不再拼出 notes/null', () => {
  const { clicks, posts, prompts } = loadDormitory();
  click(fakeElement({ 'data-review-note': '' }), clicks);
  assert.deepEqual(posts, [], '缺 data-id 时不应发出任何文字审核请求');
  assert.deepEqual(prompts, [], '缺 data-id 时不应弹出驳回原因输入框');
});

test('两类宿舍审核按钮都要求「属性 + data-id」同时命中', () => {
  assert.match(script, /closest\('\[data-review-note\]\[data-id\]'\)/);
  assert.match(script, /closest\('\[data-review\]\[data-id\]'\)/);
  assert.doesNotMatch(script, /closest\('\[data-review-note\]'\)/, '不应再按裸 [data-review-note] 匹配');
});
