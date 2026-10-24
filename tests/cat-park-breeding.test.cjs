const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* 猫咪公园繁育交互 · 前端侧回归测试
   真正的规则裁决（双方好感度门槛 / 48h 冷却 / 并发复查 / 归属越权 / 后代幂等）由后端
   CatParkService 权威实现并单测覆盖；本文件守住三类前端易出问题的点：
   ① 好感度等级阈值（LEVEL_CONFIG.expRequired）必须稳定——服务端读存档 cat.level 快照，
      等级由该阈值算出，阈值漂移会让「前端 Lv.3 可繁育」与「后端快照」对不上；
   ② 公园 tab 必须把社交区渲染 hook 接到 bridge 的 window.catPark（漏接则整块不显示）；
   ③ 用户猫模型下 interact（陌生人刷好感）端点必须已下线，避免两套好感度体系并存。 */

const petData = fs.readFileSync('js/pet-data.js', 'utf8');
const petUi = fs.readFileSync('js/pet-ui.js', 'utf8');
const bridge = fs.readFileSync('js/cat-cabin-bridge.js', 'utf8');

// 在 vm 里执行 pet-data.js（纯数据 IIFE），取 window.PET_DATA
function loadPetData() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(petData, ctx);
  return ctx.window.PET_DATA;
}

test('affinity level thresholds stable (Lv.3 breed gate = 150, feeds cat.level snapshot)', () => {
  const PET_DATA = loadPetData();
  const exp = PET_DATA.LEVEL_CONFIG.expRequired;
  // 服务端繁育门槛读 park_cats.affinity_level（= 存档 cat.level 快照），
  // cat.level 由引擎按此阈值算出；Lv.3 门槛 = 150（2026-10-11 门槛由 Lv.2 上调为 Lv.3），
  // 阈值漂移会让前后端判定对不上。
  assert.equal(exp[1], 50, 'Lv.2 门槛应为 50');
  assert.equal(exp[2], 150, 'Lv.3 门槛应为 150（与后端 MIN_BREED_LEVEL=3 的语义一致）');
  // 跨 vm realm 的数组原型不同，用 JSON 比较值
  assert.equal(JSON.stringify(exp), JSON.stringify([0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500, 5000]),
    '好感度阈值数组漂移会导致存档等级与服务端快照判定不一致，必须保持稳定');
});

test('park tab wires the social section render hook to window.catPark', () => {
  // pet-ui.js 的 park 分支必须在 renderParkTab 之后调用 catPark.renderSection
  assert.match(petUi, /window\.catPark\s*&&\s*typeof window\.catPark\.renderSection === 'function'/,
    'pet-ui.js 应检测并调用 window.catPark.renderSection');
  assert.match(petUi, /window\.catPark\.renderSection\(contentEl\)/,
    'pet-ui.js 应把公园内容容器传给 renderSection');
});

test('bridge exposes window.catPark with renderSection + refresh and the full park API surface', () => {
  assert.match(bridge, /window\.catPark\s*=\s*\{[\s\S]*?renderSection[\s\S]*?refresh/,
    'bridge 必须导出 window.catPark（renderSection + refresh）');
  // 繁育端点：accept/reject 通过 doHandle(id, 'accept'|'reject') 动态拼接，故断言调用形态
  ['/cats', '/adopt', '/breeding/requests', '/claim'].forEach(p =>
    assert.ok(bridge.includes(p), `bridge 应调用 ${p} 端点`));
  assert.ok(bridge.includes("'/breeding/requests/' + reqId + '/' + action"),
    '同意/拒绝应走 /breeding/requests/{id}/{action} 动态端点');
  assert.ok(bridge.includes("doHandle(id, 'accept'") && bridge.includes("doHandle(id, 'reject'"),
    '同意与拒绝两个动作都应被绑定');
  // 回归（用户猫模型）：陌生人「对目标猫刷互动攒好感度」的 interact 端点必须已下线
  assert.ok(!bridge.includes('/interact'), 'interact 端点应随 cat_affinity 一起废弃（好感度=双方各自与自家猫）');
});

test('bridge materializes server-adopted stray and offspring via engine addCatFromPark', () => {
  // 领养与后代都走服务端裁决 + 引擎物化，不能绕过（否则冷却/归属形同虚设）
  assert.ok(bridge.includes('window.PET_ENGINE.addCatFromPark('),
    'bridge 必须用 addCatFromPark 把后端裁决的猫写入存档');
  assert.ok(bridge.includes("'/cats/' + catId + '/adopt'"),
    '领养必须先经后端 /adopt 校验');
  assert.ok(bridge.includes("'/breeding/requests/' + reqId + '/claim'"),
    '后代领取必须走后端幂等 /claim');
});

/* ---------------- 公园放置/带回家即时刷新 ---------------- */

// 从源码中提取「我的猫」面板切换按钮的 onclick 处理函数并执行。
// 回归（2026-10-11 实测缺陷）：旧代码把 const result 声明在 if/else 分支内，
// 分支外引用 result.success 抛 ReferenceError → render() 永不执行 →
// 放置后公园场景与按钮不刷新，只有退出重进才正常。
function extractToggleHandler() {
  const marker = "const btn = item.querySelector('.my-cat-toggle-btn');";
  const start = petUi.indexOf(marker);
  assert.ok(start >= 0, 'pet-ui.js 应保留 my-cat-toggle-btn 按钮绑定');
  const head = 'btn.onclick = () => {';
  const hStart = petUi.indexOf(head, start);
  assert.ok(hStart >= 0, '切换按钮应绑定 onclick');
  const bodyStart = hStart + head.length;
  const end = petUi.indexOf('\n          };', bodyStart);
  assert.ok(end > bodyStart, 'onclick 处理函数应完整可定位');
  const body = petUi.slice(bodyStart, end);
  const fn = new Function('inPark', 'idx', 'window', 'toast', 'render', body);
  return (inPark, idx, env) => fn(inPark, idx, env.window, env.toast, env.render);
}

function toggleEnv(engineResult) {
  const calls = { toasts: [], renders: 0, flushes: 0 };
  const window = {
    PET_ENGINE: {
      putCatInPark: () => engineResult,
      takeCatHome: () => engineResult
    },
    catCabinFlush: () => { calls.flushes++; }
  };
  return { calls, window,
    toast: m => calls.toasts.push(m),
    render: () => { calls.renders++; } };
}

test('park toggle put-cat refreshes scene and button immediately (no exit/re-enter)', () => {
  const handler = extractToggleHandler();
  const env = toggleEnv({ success: true, msg: '🐱 猫咪去公园溜达啦~' });
  // 放置：inPark=false → putCatInPark
  handler(false, 2, env);
  assert.equal(env.calls.renders, 1, '放置成功后必须立即 render()，公园场景与按钮即时刷新');
  assert.equal(env.calls.flushes, 1, '放置成功后必须立即 catCabinFlush() 回写服务端名录');
  assert.match(env.calls.toasts.join(' '), /去公园溜达/);
});

test('park toggle take-home refreshes immediately and failure path does not re-render', () => {
  const handler = extractToggleHandler();
  const env = toggleEnv({ success: true, msg: '🏠 猫咪回家啦~' });
  handler(true, 0, env);   // inPark=true → takeCatHome
  assert.equal(env.calls.renders, 1, '带回家成功后必须立即 render()');
  assert.equal(env.calls.flushes, 1, '带回家成功后必须立即 catCabinFlush()');

  const failEnv = toggleEnv({ success: false, msg: '最多只能放 N 只' });
  handler(false, 1, failEnv);
  assert.equal(failEnv.calls.renders, 0, '失败时不应重渲染');
  assert.equal(failEnv.calls.flushes, 0, '失败时不应回写名录');
  assert.match(failEnv.calls.toasts.join(' '), /最多只能放/);
});
