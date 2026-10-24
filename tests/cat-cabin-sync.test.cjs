const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/cat-cabin-bridge.js', 'utf8');
const flush = () => new Promise(r => setImmediate(r));
async function settle(n = 10) { for (let i = 0; i < n; i++) await flush(); }

/**
 * 用假引擎驱动 bridge，跳过真实脚本注入，验证 P1 同步 + P2 金币代理。
 * responder(path, method, body) 决定每次 fetch 的返回。
 */
function setup(responder) {
  const calls = [];
  const state = { coins: 500, cats: [], lastUpdateTime: 1, newbieTasks: {} };
  const engine = {
    init() {},
    getState() { return state; },
    save() { if (window.__catCabinOnSave) window.__catCabinOnSave(state); },
    updateAllCats() {},
    completeNewbieTask(id) {
      if (state.newbieTasks && state.newbieTasks[id]) return { success: false };
      if (!state.newbieTasks) state.newbieTasks = {};
      state.newbieTasks[id] = { completedAt: 1, claimed: true };
      engine.save();
      return { success: true };
    },
    addCoins(a) { state.coins += a; engine.save(); if (window.__catCabinCoins) window.__catCabinCoins.earned('checkin', {}); },
    spendCoins(a) { if (state.coins < a) return false; state.coins -= a; engine.save(); if (window.__catCabinCoins) window.__catCabinCoins.spent(a, 'adopt', 'orange'); return true; }
  };
  let rendered = 0;
  const ui = { open() {}, close() {}, render() { rendered++; } };
  const window = {
    USER: { registered: true },
    PET_ENGINE: engine,
    PET_UI: ui,
    toast() {},
    matchMedia: () => ({ matches: true }),
    addEventListener() {}
  };
  const document = {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return { setAttribute() {} }; },
    head: { appendChild() {} },
    hidden: false
  };
  const lsStore = {};
  const ctx = {
    window, document, console,
    sessionStorage: { getItem: () => 'tok' },
    localStorage: {
      getItem: k => (k in lsStore ? lsStore[k] : null),
      setItem: (k, v) => { lsStore[k] = String(v); },
      removeItem: k => { delete lsStore[k]; }
    },
    fetch: (path, opts) => {
      const method = (opts && opts.method) || 'GET';
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      calls.push({ path, method, body });
      return Promise.resolve({ json: async () => responder(path, method, body) });
    },
    setTimeout, clearTimeout
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { window, state, calls, rendered: () => rendered, lsStore };
}

const ok = data => ({ code: 200, data });

/* ---------------- P1 存档同步 ---------------- */

test('服务端无存档时把本地档作为首次上传（baseVersion=0）', async () => {
  const { window, calls } = setup((path, method) =>
    method === 'GET' ? ok({ exists: false, version: 0, save: null, coins: 500 }) : ok({ version: 1 }));
  window.catCabinEnter();
  await settle();
  const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/state'));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.baseVersion, 0);
});

test('服务端有存档时以服务端为准覆盖本地，且不触发回写', async () => {
  const { window, state, calls } = setup(() =>
    ok({ exists: true, version: 7, save: { coins: 123, cats: [{ uid: 'c1' }], lastUpdateTime: 99 } }));
  window.catCabinEnter();
  await settle();
  assert.equal(state.coins, 123);
  assert.equal(state.cats[0].uid, 'c1');
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);   // 只有 GET，无 POST
});

test('earn 建的占位空档（save={}）不覆盖本地，走首次上传', async () => {
  const { window, state, calls } = setup((path, method) =>
    method === 'GET' ? ok({ exists: true, version: 1, save: {}, coins: 42 })
      : ok({ version: 2 }));
  window.catCabinEnter();
  await settle();
  assert.equal(state.coins, 42);   // 占位档 coins 仍被镜像为真实余额
  assert.ok(calls.some(c => c.method === 'POST' && c.path.includes('/state')));
});

test('POST 返回 409 时重新拉取服务端存档（服务端权威）', async () => {
  let gets = 0;
  const { window, calls } = setup((path, method) => {
    if (method === 'GET') {
      gets++;
      return ok({ exists: gets === 1 ? false : true, version: gets, save: gets === 1 ? null : { coins: 999, cats: [] } });
    }
    return { code: 409, msg: '冲突' };
  });
  window.catCabinEnter();
  await settle();
  assert.ok(calls.filter(c => c.path.includes('/state')).length >= 3);  // GET→POST→(409)重拉 GET
});

test('占位档被回填余额（save 只有 coins，无 cats）时不得覆盖本地，走首次上传', async () => {
  /* 线上事故回归：后端曾把 save_json='{}' 的占位行回填成 {coins:N}，
     旧判据 Object.keys(save)>0 判成「有内容」→ hydrate 整档覆盖 → 刚领养的猫丢档 */
  const { window, state, calls } = setup((path, method) =>
    method === 'GET' ? ok({ exists: true, version: 1, save: { coins: 42 }, coins: 42 })
      : ok({ version: 2 }));
  state.cats.push({ uid: 'mine-1', catId: 'white' });   // 本地已有（刚领养的）猫
  window.catCabinEnter();
  await settle();
  assert.equal(state.coins, 42);                        // 余额仍被镜像为真实余额
  assert.equal(state.cats.length, 1);                   // 本地猫未被空档覆盖
  assert.equal(state.cats[0].uid, 'mine-1');
  const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/state'));
  assert.equal(posts.length, 1);                        // 按「首次上传」把本地档写回
  assert.equal(posts[0].body.save.cats.length, 1);
});

test('POST 409 只刷新版本号后补发本地档，不整档覆盖本地（不丢刚领养的猫）', async () => {
  let gets = 0;
  const { window, state, calls } = setup((path, method) => {
    if (method === 'GET') {
      gets++;
      // 第 1 次：服务端还没有档；第 2 次（409 后只刷版本号）：其它端刚建了档
      return ok(gets === 1
        ? { exists: false, version: 0, save: null, coins: 500 }
        : { exists: true, version: 4, save: { coins: 500, cats: [] }, coins: 500 });
    }
    const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/state'));
    return posts.length === 1 ? { code: 409, msg: '存档已在其它端更新' } : ok({ version: 5 });
  });
  state.cats.push({ uid: 'mine-1', catId: 'white' });
  window.catCabinEnter();
  await settle(20);
  assert.equal(state.cats.length, 1);                   // 本地猫没被服务端旧档覆盖掉
  const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/state'));
  assert.equal(posts.length, 2);                        // 409 后补发一次
  assert.equal(posts[1].body.baseVersion, 4);           // 用刷新到的新版本号补发
  assert.equal(posts[1].body.save.cats.length, 1);      // 补发的就是本地档
});

test('未登录时 catCabinEnter 直接拦截，不加载引擎不发请求', async () => {
  const { window, calls } = setup(() => ok({ exists: false, version: 0, save: null }));
  window.USER = { registered: false };
  window.catCabinEnter();
  await settle();
  assert.equal(calls.length, 0);
});

test('桌面端（matchMedia 不命中移动端）catCabinEnter 不再拦截，正常同步存档', async () => {
  /* 2026-10-12 取消「猫咪小屋仅移动端开放」限制：
     视口宽度 >768px（matches=false）时也应加载引擎并拉服务端档 */
  const { window, calls } = setup((path, method) =>
    method === 'GET' ? ok({ exists: false, version: 0, save: null, coins: 500 }) : ok({ version: 1 }));
  window.matchMedia = () => ({ matches: false });
  window.catCabinEnter();
  await settle();
  const gets = calls.filter(c => c.method === 'GET' && c.path.includes('/state'));
  assert.equal(gets.length, 1);
  const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/state'));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.baseVersion, 0);
});

/* ---------------- P2 金币合并 ---------------- */

test('扣币成功：POST /spend 带 reason，用服务端 balance 校正镜像', async () => {
  const { window, state } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 1, save: { coins: 500, cats: [] } });
    if (path.includes('/spend')) return ok({ coins: 120, balance: 380 });
    return ok({ version: 2 });
  });
  window.catCabinEnter();
  await settle();
  window.PET_ENGINE.spendCoins(120, 'adopt', 'orange');   // 本地乐观扣到 380，再回调代理
  await settle();
  assert.equal(state.coins, 380);   // 服务端 balance 覆盖
});

test('扣币失败（402）：重同步余额，本地乐观扣款被服务端真实余额覆盖', async () => {
  let spendFails = false;
  const { window, state } = setup((path, method) => {
    if (path.includes('/spend')) { spendFails = true; return { code: 402, msg: '蛋蛋币余额不足' }; }
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 1, save: { coins: 50, cats: [] }, coins: 50 });
    return ok({ version: 2 });
  });
  window.catCabinEnter();
  await settle();
  state.coins = 50;
  window.__catCabinCoins.spent(120, 'adopt', 'orange');   // 直接触发代理（模拟引擎已乐观扣款）
  await settle();
  assert.ok(spendFails);
  assert.equal(state.coins, 50);   // refreshCoins 把余额对齐回 50（乐观扣款作废）
});

test('赚币成功：POST /earn 不传数额，用服务端 balance 校正', async () => {
  const { window, state } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 1, save: { coins: 100, cats: [] } });
    if (path.includes('/earn')) return ok({ coins: 30, balance: 130 });
    return ok({ version: 2 });
  });
  window.catCabinEnter();
  await settle();
  window.__catCabinCoins.earned('checkin', {});
  await settle();
  assert.equal(state.coins, 130);   // 服务端实发 30 后余额
});

test('赚币被日上限截断为 0：余额不变并 toast', async () => {
  const toasts = [];
  const { window, state } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 1, save: { coins: 200, cats: [] } });
    if (path.includes('/earn')) return ok({ coins: 0, balance: 200 });
    return ok({ version: 2 });
  });
  window.toast = m => toasts.push(m);
  window.catCabinEnter();
  await settle();
  window.__catCabinCoins.earned('checkin', {});
  await settle();
  assert.equal(state.coins, 200);
  assert.ok(toasts.some(t => t.includes('上限')));
});

/* ---------------- 新手任务事件桥（修 bug：发布/认领后家园未解锁） ---------------- */

test('引擎就绪后 notify(task) → 完成新手任务并回写服务端', async () => {
  const { window, state, calls } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 3, save: { coins: 100, cats: [], newbieTasks: {} } });
    return ok({ version: 4 });
  });
  window.catCabinEnter();
  await settle();
  window.catCabinNotify('task');
  await settle();
  assert.ok(state.newbieTasks['newbie_post_or_claim_task'], '家园解锁标记应写入存档');
  window.catCabinLeave();   // 离开触发 flush（防抖 5s 测试里等不起）
  await settle();
  const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/state'));
  assert.ok(posts.length >= 1, '完成事件应触发存档回写');
  assert.ok(posts[posts.length - 1].body.save.newbieTasks['newbie_post_or_claim_task']);
});

test('未进小屋时 notify 进待处理队列，进屋同步后自动消费', async () => {
  const { window, state, lsStore } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 1, save: { coins: 100, cats: [], newbieTasks: {} } });
    return ok({ version: 2 });
  });
  // 引擎未加载时先记录事件（bridge 静态引入即生效）
  window.catCabinNotify('tucao');
  assert.match(lsStore['eggworld_cat_pending'] || '', /tucao/);
  window.catCabinEnter();
  await settle();
  assert.ok(state.newbieTasks['newbie_post_tucao'], '队列事件应在同步完成后被消费');
  assert.equal(lsStore['eggworld_cat_pending'], '{}', '消费后队列清空');
});

test('历史兜底：发布过任务但存档未解锁 → 进屋自动补记（my-published 有记录）', async () => {
  const { window, state } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 1, save: { coins: 100, cats: [], newbieTasks: {} } });
    if (path.includes('/my-published')) return ok({ total: 2, records: [{ id: 1 }] });
    if (path.includes('/my-claimed')) return ok({ total: 0, records: [] });
    if (path.includes('/complaints/mine')) return ok([]);
    return ok({ version: 2 });
  });
  window.catCabinEnter();
  await settle();
  assert.ok(state.newbieTasks['newbie_post_or_claim_task'], '有发布记录应补记完成');
});

test('历史兜底：吐槽历史（complaints/mine 非空）解锁流浪猫领养', async () => {
  const { window, state } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') return ok({ exists: true, version: 1, save: { coins: 100, cats: [], newbieTasks: {} } });
    if (path.includes('/my-published') || path.includes('/my-claimed')) return ok({ total: 0, records: [] });
    if (path.includes('/complaints/mine')) return ok([{ id: 7 }]);
    return ok({ version: 2 });
  });
  window.catCabinEnter();
  await settle();
  assert.ok(state.newbieTasks['newbie_post_tucao']);
  assert.ok(!state.newbieTasks['newbie_post_or_claim_task'], '无任务记录不应误解锁家园');
});

test('历史兜底不覆盖已完成状态（幂等，无多余写回）', async () => {
  const { window, state, calls } = setup((path, method) => {
    if (path.includes('/state') && method === 'GET') {
      return ok({ exists: true, version: 5, save: { coins: 100, cats: [], newbieTasks: { newbie_post_or_claim_task: { completedAt: 1, claimed: true } } } });
    }
    if (path.includes('/my-published')) return ok({ total: 2, records: [{ id: 1 }] });
    return ok({ version: 6 });
  });
  window.catCabinEnter();
  await settle();
  // 已完成 → completeNewbieTask 返回 success:false → applied=false → 不 schedulePush
  const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/state'));
  assert.equal(posts.length, 0, '已解锁用户不应因兜底查询产生空写回');
  window.catCabinNotify('task');   // 重复事件也不报错
  await settle();
  assert.ok(state.newbieTasks['newbie_post_or_claim_task']);
});
