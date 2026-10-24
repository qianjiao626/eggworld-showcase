const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* 「看看猫咪在想什么」6 小时冷却 · 回归测试（2026-10-11）
   需求：每 6 小时仅可点击执行一次，防频繁刷好感度；本地时间戳 + 服务端双重校验。
   本文件守住前端侧：
   ① 本地时间戳未过期 → 不发请求、不触发事件，直接提示剩余冷却；
   ② 本地过期 → 调 window.catCabinClaimThought（服务端权威裁决）；
      allowed=true 才触发事件并写回 lastAt；
   ③ 服务端返回冷却中 → 按服务端剩余毫秒校正本地时间戳（改本地时间无效），不触发事件；
   ④ 桥未加载（桌面调试）时降级为仅本地冷却；
   ⑤ bridge 暴露 catCabinClaimThought 并 POST /api/cat-cabin/thought。 */

const petUiSrc = fs.readFileSync('js/pet-ui.js', 'utf8');
const bridgeSrc = fs.readFileSync('js/cat-cabin-bridge.js', 'utf8');

const COOLDOWN_MS = 6 * 60 * 60 * 1000;

// 提取 eventBubble.onclick 处理函数体并执行（注入 window/Date/toast 等依赖）
function extractBubbleHandler() {
  const marker = "const eventBubble = document.getElementById('catEventBubble');";
  const start = petUiSrc.indexOf(marker);
  assert.ok(start >= 0, 'pet-ui.js 应保留 catEventBubble 绑定');
  const head = 'eventBubble.onclick = () => {';
  const hStart = petUiSrc.indexOf(head, start);
  assert.ok(hStart >= 0, '气泡按钮应绑定 onclick');
  const bodyStart = hStart + head.length;
  const end = petUiSrc.indexOf('\n      };', bodyStart);
  assert.ok(end > bodyStart, 'onclick 处理函数应完整可定位');
  const body = petUiSrc.slice(bodyStart, end);
  const fn = new Function('window', 'Date', 'openCatThought', 'toastThoughtCooldown', 'toast', 'refreshThoughtBubble', body);
  return env => fn(env.window, env.Date, env.openCatThought, env.toastThoughtCooldown, env.toast, env.refreshThoughtBubble);
}

function makeEnv({ lastAt = 0, now = 1_700_000_000_000, claim = null } = {}) {
  const calls = { thoughts: 0, cooldownToasts: [], toasts: [], saves: 0, claims: 0, refreshes: 0 };
  const st = { thought: { lastAt } };
  const window = {
    PET_ENGINE: { getState: () => st, save: () => { calls.saves++; } },
    CAT_CHAT: { tryTriggerStoryEvent: () => true, triggerIdleChat: () => {} },
    catCabinClaimThought: claim == null ? undefined : (...a) => { calls.claims++; return claim(...a); }
  };
  const Date_ = { now: () => now };
  return { calls, st, window, Date: Date_,
    openCatThought: () => { calls.thoughts++; },
    refreshThoughtBubble: () => { calls.refreshes++; },
    toastThoughtCooldown: ms => { calls.cooldownToasts.push(ms); },
    toast: m => { calls.toasts.push(m); } };
}

const handler = extractBubbleHandler();

test('本地 6 小时内再次点击：不发请求、不触发事件，提示剩余冷却', () => {
  const now = 1_700_000_000_000;
  const env = makeEnv({ lastAt: now - 2 * 60 * 60 * 1000, now });   // 2 小时前点过
  handler(env);
  assert.equal(env.calls.claims, 0, '本地冷却内不应请求服务端');
  assert.equal(env.calls.thoughts, 0, '本地冷却内不应触发故事事件');
  assert.equal(env.calls.cooldownToasts.length, 1, '应提示剩余冷却');
  assert.equal(env.calls.cooldownToasts[0], COOLDOWN_MS - 2 * 60 * 60 * 1000);
});

test('本地过期 + 服务端放行：触发事件并写回 lastAt + save', () => {
  const now = 1_700_000_000_000;
  const env = makeEnv({ lastAt: now - 7 * 60 * 60 * 1000, now,
    claim: () => Promise.resolve({ code: 200, data: { allowed: true, cooldownMs: 0 } }) });
  handler(env);
  return Promise.resolve().then(() => {
    assert.equal(env.calls.claims, 1, '本地过期应请求服务端权威裁决');
    assert.equal(env.calls.thoughts, 1, '服务端放行才触发故事事件');
    assert.equal(env.st.thought.lastAt, now, '放行后本地时间戳应更新为当前时刻');
    assert.equal(env.calls.saves, 1, '时间戳必须落进存档（随 /state 回写）');
    assert.equal(env.calls.refreshes, 1, '放行后必须刷新气泡外观为冷却态（与未点击区分）');
  });
});

test('服务端冷却中：校正时间戳后同样刷新气泡外观', () => {
  const now = 1_700_000_000_000;
  const env = makeEnv({ lastAt: 0, now,
    claim: () => Promise.resolve({ code: 200, data: { allowed: false, cooldownMs: 5 * 60 * 60 * 1000 } }) });
  handler(env);
  return Promise.resolve().then(() => {
    assert.equal(env.calls.refreshes, 1, '校正后必须刷新外观，让用户看到已点过');
  });
});

test('首次点击（无本地记录）：请求服务端并放行', () => {
  const now = 1_700_000_000_000;
  const env = makeEnv({ lastAt: 0, now,
    claim: () => Promise.resolve({ code: 200, data: { allowed: true } }) });
  handler(env);
  return Promise.resolve().then(() => {
    assert.equal(env.calls.claims, 1);
    assert.equal(env.calls.thoughts, 1);
    assert.equal(env.st.thought.lastAt, now);
  });
});

test('改本地时间无效：服务端返回冷却中 → 按剩余毫秒校正 lastAt，不触发事件', () => {
  const now = 1_700_000_000_000;
  // 用户把本地时间戳抹掉（模拟改系统时间绕过本地检查）
  const env = makeEnv({ lastAt: 0, now,
    claim: () => Promise.resolve({ code: 200, data: { allowed: false, cooldownMs: 5 * 60 * 60 * 1000 } }) });
  handler(env);
  return Promise.resolve().then(() => {
    assert.equal(env.calls.thoughts, 0, '服务端冷却中绝不触发故事事件（好感度不涨）');
    assert.equal(env.calls.cooldownToasts.length, 1, '应按服务端剩余毫秒提示');
    assert.equal(env.calls.cooldownToasts[0], 5 * 60 * 60 * 1000);
    // 校正后的 lastAt = now + 剩余 - 6h = 1 小时前（真实上次点击时刻）
    assert.equal(env.st.thought.lastAt, now - 60 * 60 * 1000);
    // 校正后本地再点：直接命中本地拦截，不再消耗服务端请求
    handler(env);
    assert.equal(env.calls.claims, 1, '校正后本地时间戳生效，第二次点击被本地拦截');
  });
});

test('服务端异常/网络失败：不触发事件，提示失败', () => {
  const now = 1_700_000_000_000;
  const env = makeEnv({ lastAt: 0, now, claim: () => Promise.resolve({ code: 0, msg: '网络异常' }) });
  handler(env);
  return Promise.resolve().then(() => {
    assert.equal(env.calls.thoughts, 0);
    assert.equal(env.st.thought.lastAt, 0, '失败不应更新时间戳');
    assert.match(env.calls.toasts.join(''), /网络异常/);
  });
});

test('桥未加载（调试场景）：本地冷却兜底，触发事件并记录时间戳', () => {
  const now = 1_700_000_000_000;
  const env = makeEnv({ lastAt: now - 7 * 60 * 60 * 1000, now });   // window.catCabinClaimThought 不存在
  handler(env);
  assert.equal(env.calls.thoughts, 1);
  assert.equal(env.st.thought.lastAt, now, '无桥时本地也要记录时间戳');
  assert.equal(env.calls.saves, 1);
  // 紧接着再点一次：本地兜底必须拦住
  handler(env);
  assert.equal(env.calls.thoughts, 1, '第二次点击应被本地冷却拦截');
  assert.equal(env.calls.cooldownToasts.length, 1);
});

/* ---------------- ⑤ 点击后与未点击的视觉区分 ---------------- */

const petModuleCssSrc = fs.readFileSync('js/pet-module.css', 'utf8');

test('冷却态有独立视觉样式：变灰、停跳、💭→😶（脑袋空空），与可点状态明显区分', () => {
  assert.match(petModuleCssSrc, /\.cat-event-bubble\.on-cooldown\s*\{[\s\S]*?animation:\s*none/,
    '冷却态必须停止弹跳动画');
  assert.match(petModuleCssSrc, /\.cat-event-bubble\.on-cooldown\s*\{[\s\S]*?border-color:\s*#C2C8CF/,
    '冷却态边框变灰');
  assert.match(petModuleCssSrc, /\.cat-event-bubble\.on-cooldown\.event-emoji|\.cat-event-bubble\.on-cooldown \.event-emoji\s*\{[\s\S]*?display:\s*none/,
    '冷却态隐藏 💭');
  assert.match(petModuleCssSrc, /\.cat-event-bubble\.on-cooldown::after\s*\{[\s\S]*?content:\s*'😶'/,
    '冷却态用 😶（脑袋空空）替换图标');
  assert.ok(!/content:\s*'💤'/.test(petModuleCssSrc), '不应再出现旧的 💤 午睡图标');
});

test('冷却提示文案统一为「猫咪脑袋空空 + 剩余时间」', () => {
  assert.match(petUiSrc, /猫咪脑袋空空，\$\{h > 0 \? h \+ '小时' : ''\}\$\{m\}分钟后再来看/,
    '气泡 title 应为「脑袋空空 + 时间」');
  assert.match(petUiSrc, /猫咪脑袋空空，\$\{h\}小时/, 'toast 文案应为「脑袋空空 + 时间」');
  assert.ok(!/猫咪正在午睡|刚说过啦/.test(petUiSrc), '不应残留旧的「午睡 / 刚说过」文案');
});

test('气泡按钮渲染出 event-emoji 容器，供冷却态切换图标', () => {
  assert.match(petUiSrc, /<span class="event-emoji">💭<\/span>/,
    '💭 必须包在 .event-emoji 里，冷却态才能 CSS 切换');
});

test('refreshThoughtBubble 按存档时间戳恢复 on-cooldown 外观并在冷却结束自动恢复', () => {
  assert.match(petUiSrc, /function refreshThoughtBubble\(\)\s*\{[\s\S]*?classList\.add\('on-cooldown'\)[\s\S]*?classList\.remove\('on-cooldown'\)/,
    '冷却中加 on-cooldown、结束移除，两个分支都要有');
  assert.match(petUiSrc, /refreshThoughtBubble\(\);\s*\/\/ 渲染时按存档时间戳恢复/,
    '每次渲染都要恢复外观（切猫/重进页面不丢冷却态）');
});

/* ---------------- ⑥ bridge 端点 ---------------- */

test('bridge 暴露 catCabinClaimThought 并 POST /api/cat-cabin/thought', () => {
  assert.match(bridgeSrc, /window\.catCabinClaimThought\s*=\s*function\s*\(\)\s*\{\s*return api\('POST', API_THOUGHT/,
    'bridge 必须导出 window.catCabinClaimThought');
  assert.ok(bridgeSrc.includes("var API_THOUGHT = '/api/cat-cabin/thought';"),
    'bridge 应声明 /api/cat-cabin/thought 端点');
});

// 用假 fetch 跑 bridge，验证 catCabinClaimThought 真实发出 POST 并透传响应
function runBridge(responder) {
  const calls = [];
  const window = {
    USER: { registered: true },
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    toast() {}
  };
  const document = {
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, createElement: () => ({ setAttribute() {} }),
    head: { appendChild() {} }, hidden: false
  };
  const ctx = {
    window, document, console,
    sessionStorage: { getItem: () => 'tok' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: (path, opts) => {
      calls.push({ path, method: (opts && opts.method) || 'GET' });
      return Promise.resolve({ json: async () => responder(path, opts) });
    },
    setTimeout, clearTimeout
  };
  vm.createContext(ctx);
  vm.runInContext(bridgeSrc, ctx);
  return { window, calls };
}

test('catCabinClaimThought 实际 POST /api/cat-cabin/thought 并透传 allowed', async () => {
  const { window, calls } = runBridge(() => ({ code: 200, data: { allowed: true } }));
  const res = await window.catCabinClaimThought();
  assert.equal(res.code, 200);
  assert.equal(res.data.allowed, true);
  assert.deepEqual(calls[0], { path: '/api/cat-cabin/thought', method: 'POST' });
});
