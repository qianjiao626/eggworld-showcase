const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* 猫咪冒险全链路 · 回归测试（2026-10-12）
   缺陷（P0，2026-10-12 校验发现）：claimAdventureReward 把食物/玩具写进 cat.inventory，
   但猫实例（createCat）从未有 inventory 字段，背包实际是全局 state.inventory ——
   领取时必抛 TypeError，奖励全漏发，且异常发生在状态更新之前，猫咪永久卡在冒险中
   （再次出发被 active 拦截、再次领取再抛），冒险功能端到端不可用。
   本文件守住：
   ① 触发条件：睡觉/重复出发/无效地点/提前领取全部拦截；
   ② 领取成功路径：奖励按 选择组合key 落进全局背包 state.inventory（不允许写 cat.inventory）；
   ③ 领取后状态机闭合：rewardClaimed=true、active=false，可再次出发、不可重复领取；
   ④ 好感度/心情按配置发放且不越界。 */

const petDataSrc = fs.readFileSync('js/pet-data.js', 'utf8');
const petEngineSrc = fs.readFileSync('js/pet-engine.js', 'utf8');

function makeStorage() {
  const store = {};
  return {
    store,
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
}

// 在 vm 里加载 pet-data + pet-engine，注入一只测试猫
function loadEngine() {
  const window = {};
  const ctx = { window, localStorage: makeStorage(), console };
  vm.createContext(ctx);
  vm.runInContext(petDataSrc, ctx);
  vm.runInContext(petEngineSrc, ctx);
  window.PET_ENGINE.init();
  const state = window.PET_ENGINE.getState();
  const now = Date.now();
  state.cats = [{
    uid: 'cat_adv_test', catId: 'orange', name: '测试橘猫', gender: 'male',
    hunger: 80, happiness: 80, energy: 100, poopCount: 0,
    lastPoopTime: now, lastUpdateTime: now, adoptedTime: now,
    isSleeping: false, totalPlayMinutes: 0, totalFeedCount: 0,
    maturity: 50, maturityLevel: 3, totalMaturity: 50, canBreed: true,
    intimacy: 0, level: 1, totalIntimacy: 0
  }];
  state.currentCatIndex = 0;
  return { window, state, cat: state.cats[0] };
}

/* ---------------- ① 触发条件 ---------------- */

test('睡觉中不能出发冒险', () => {
  const { window, cat } = loadEngine();
  cat.isSleeping = true;
  const r = window.PET_ENGINE.startAdventure(0, 'forest', { path: 'flower', encounter: 'help' });
  assert.equal(r.success, false);
  assert.match(r.msg, /睡觉/);
});

test('无效地点不能出发冒险', () => {
  const { window } = loadEngine();
  const r = window.PET_ENGINE.startAdventure(0, 'nowhere', {});
  assert.equal(r.success, false);
  assert.match(r.msg, /地点不存在/);
});

test('冒险中重复出发被拦截', () => {
  const { window } = loadEngine();
  assert.equal(window.PET_ENGINE.startAdventure(0, 'forest', { path: 'flower', encounter: 'help' }).success, true);
  const r = window.PET_ENGINE.startAdventure(0, 'beach', { path: 'sand', encounter: 'open' });
  assert.equal(r.success, false);
  assert.match(r.msg, /已经在冒险中/);
});

test('未到期提前领取被拒绝且不改变状态', () => {
  const { window, cat } = loadEngine();
  window.PET_ENGINE.startAdventure(0, 'forest', { path: 'flower', encounter: 'help' });
  const r = window.PET_ENGINE.claimAdventureReward(0);
  assert.equal(r.success, false);
  assert.match(r.msg, /还没结束/);
  assert.equal(cat.adventure.rewardClaimed, false);
  assert.equal(cat.adventure.active, true);
});

/* ---------------- ② 领取成功路径（P0 回归核心） ---------------- */

test('到期领取：奖励落进全局背包 state.inventory，不抛异常（P0 回归）', () => {
  const { window, state, cat } = loadEngine();
  window.PET_ENGINE.startAdventure(0, 'forest', { path: 'flower', encounter: 'help' });
  cat.adventure.endTime = Date.now() - 1; // 模拟 3 小时到期

  let r;
  assert.doesNotThrow(() => { r = window.PET_ENGINE.claimAdventureReward(0); },
    '领取不得抛 TypeError（历史缺陷：写进不存在的 cat.inventory）');
  assert.equal(r.success, true);

  // forest 的 flower+help：fish×2 chicken×1 ball×1 好感度+15
  assert.equal(state.inventory.foods.fish, 2, '小鱼干应到账 2');
  assert.equal(state.inventory.foods.chicken, 1, '鸡胸肉应到账 1');
  assert.equal(state.inventory.toys.ball, 1, '毛线球应到账 1');

  // 猫实例上绝不允许出现 inventory（背包唯一权威是全局 state.inventory）
  assert.equal(cat.inventory, undefined, '不得把奖励写进 cat.inventory');

  // 奖励不重复叠加
  assert.equal(Object.values(state.inventory.foods).reduce((a, b) => a + b, 0), 3);
});

test('领取时同步发放好感度与心情，且不越界', () => {
  const { window, cat } = loadEngine();
  window.PET_ENGINE.startAdventure(0, 'city', { path: 'alley', encounter: 'share' });
  cat.adventure.endTime = Date.now() - 1;
  const r = window.PET_ENGINE.claimAdventureReward(0);
  assert.equal(r.success, true);
  assert.equal(r.intimacy, 20, 'alley+share 好感度应为 20');
  assert.equal(cat.intimacy, 20);
  assert.equal(cat.totalIntimacy, 20);
  assert.equal(cat.happiness, 95, '心情 +15（80→95，未越上限）');

  // 心情贴顶时不超 maxHappiness
  cat.happiness = 100;
  window.PET_ENGINE.startAdventure(0, 'beach', { path: 'sand', encounter: 'open' });
  cat.adventure.endTime = Date.now() - 1;
  window.PET_ENGINE.claimAdventureReward(0);
  assert.ok(cat.happiness <= 100, '心情不得越上限');
});

/* ---------------- ③ 领取后状态机闭合 ---------------- */

test('领取后：状态闭合、不可重复领取、可再次出发', () => {
  const { window, state, cat } = loadEngine();
  window.PET_ENGINE.startAdventure(0, 'forest', { path: 'moss', encounter: 'watch' });
  cat.adventure.endTime = Date.now() - 1;
  assert.equal(window.PET_ENGINE.claimAdventureReward(0).success, true);

  assert.equal(cat.adventure.rewardClaimed, true);
  assert.equal(cat.adventure.active, false);
  assert.equal(cat.adventure.completed, true);

  // 重复领取被拦截（领取后 active=false，走"没有进行中的冒险"分支）、背包不二次叠加
  const dup = window.PET_ENGINE.claimAdventureReward(0);
  assert.equal(dup.success, false);
  assert.equal(state.inventory.toys.ball, 2, 'moss+watch ball×2，重复领取不得叠加');

  // 进度查询：active=false 应返回 null（UI 据此回到选地点）
  assert.equal(window.PET_ENGINE.getAdventureProgress(0), null);

  // 可再次出发
  assert.equal(window.PET_ENGINE.startAdventure(0, 'beach', { path: 'rock', encounter: 'leave' }).success, true);
});

test('领取成功后返回值携带 story/foods/toys/intimacy 供 UI 展示', () => {
  const { window, cat } = loadEngine();
  window.PET_ENGINE.startAdventure(0, 'beach', { path: 'sand', encounter: 'open' });
  cat.adventure.endTime = Date.now() - 1;
  const r = window.PET_ENGINE.claimAdventureReward(0);
  assert.equal(r.success, true);
  assert.ok(r.story && r.story.includes('藏宝图'));
  // 跨 vm realm 数组原型不同，用 JSON 比较值
  assert.equal(JSON.stringify(r.foods), JSON.stringify([{ id: 'fish', count: 3 }, { id: 'chicken', count: 1 }]));
  assert.equal(JSON.stringify(r.toys), JSON.stringify([{ id: 'ball', count: 1 }, { id: 'feather', count: 1 }]));
  assert.equal(r.intimacy, 16);
});

/* ---------------- ④ 配置一致性 ---------------- */

test('ADVENTURE_CONFIG 所有奖励组合 key 与 choices 对齐且物品 ID 有效', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(petDataSrc, ctx);
  const PET_DATA = ctx.window.PET_DATA;
  const foodIds = new Set(PET_DATA.FOODS.map(f => f.id));
  const toyIds = new Set(PET_DATA.TOYS.map(t => t.id));

  for (const loc of PET_DATA.ADVENTURE_CONFIG.locations) {
    const optionIdsPerChoice = loc.choices.map(c => new Set(c.options.map(o => o.id)));
    const expectedKeys = optionIdsPerChoice.reduce((acc, set) =>
      acc.flatMap(k => [...set].map(id => k ? k + '+' + id : id)), ['']);
    assert.equal(Object.keys(loc.rewards).length, expectedKeys.length,
      loc.id + ' 奖励组合数应与选择笛卡尔积一致');
    for (const key of expectedKeys) {
      const reward = loc.rewards[key];
      assert.ok(reward, loc.id + ' 缺少组合 ' + key + ' 的奖励');
      (reward.foods || []).forEach(f => assert.ok(foodIds.has(f.id), '未知食物 ' + f.id));
      (reward.toys || []).forEach(t => assert.ok(toyIds.has(t.id), '未知玩具 ' + t.id));
    }
  }
});
