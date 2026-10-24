const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* 市场购买猫咪好感度数值合法性 · 回归测试（2026-10-11）
   缺陷：buyCatFromHome 把挂牌的「成熟度等级」catMaturityLevel 直接写进「好感度等级」cat.level，
   且漏设 totalIntimacy。于是出现 intimacy=73 / level=3（Lv.3 需 150）的组合，
   getLevelInfo 按 expRequired[level-1]=150 反推 → curLevelExp = 73-150 = -77，
   好感度弹窗显示 -77/150（负数）。移动端 hydrate 不走 migrateState，脏数据被原样持久化。
   修复：购买时好感度等级唯一由 intimacy 按权威阈值推算（computeIntimacyLevel），
   成熟度等级只作用于 maturityLevel/canBreed，并对所有数值做 clamp 校验；
   migrateState 与 hydrate 后各做一次 sanitize 自愈。 */

const petDataSrc = fs.readFileSync('js/pet-data.js', 'utf8');
const petEngineSrc = fs.readFileSync('js/pet-engine.js', 'utf8');
const bridgeSrc = fs.readFileSync('js/cat-cabin-bridge.js', 'utf8');

function makeStorage() {
  const store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
}

function loadEngine(storage) {
  const window = {};
  const ctx = { window, localStorage: storage, console };
  vm.createContext(ctx);
  vm.runInContext(petDataSrc, ctx);
  vm.runInContext(petEngineSrc, ctx);
  window.PET_ENGINE.init();
  return window;
}

/* 直接构造一条家园挂牌（模拟卖家猫：成年 Lv.3 成熟度 + 好感度 73） */
function seedListing(window, over = {}) {
  const state = window.PET_ENGINE.getState();
  state.newbieTasks = Object.assign({}, state.newbieTasks, { newbie_post_or_claim_task: { completedAt: Date.now(), claimed: true } });
  state.coins = 100000;
  state.homeListings = [Object.assign({
    id: 'listing_test_1',
    catId: 'orange',
    catUid: 'cat_seller_1',
    catName: '卖家橘猫',
    catGender: 'female',
    catMaturityLevel: 3,
    catIntimacy: 73,
    catRarity: 'common',
    price: 100,
    sellerId: 'u010',
    sellerName: '蛋蛋爱学习',
    listTime: Date.now()
  }, over)];
  return state;
}

/* ---------------- ① 购买不再把成熟度等级写进好感度等级 ---------------- */

test('buyCatFromHome derives intimacy level from intimacy value, not maturity level', () => {
  const window = loadEngine(makeStorage());
  seedListing(window);
  const res = window.PET_ENGINE.buyCatFromHome('listing_test_1');
  assert.equal(res.success, true, '购买应成功');

  const state = window.PET_ENGINE.getState();
  const bought = state.cats[state.cats.length - 1];
  assert.equal(bought.intimacy, 73, '好感度值沿用挂牌');
  // Lv.2 门槛=50，Lv.3=150 → 73 只能是 Lv.2，绝不因成熟度 Lv.3 被抬成好感度 Lv.3
  assert.equal(bought.level, 2, '好感度等级必须由 intimacy 推算（73→Lv.2）');
  assert.equal(bought.maturityLevel, 3, '成熟度等级仍为挂牌的 3');
  assert.equal(bought.totalIntimacy, 73, '累计好感度需同步补齐');
});

/* ---------------- ② 修复后 getLevelInfo 不再出现负数进度 ---------------- */

test('getLevelInfo never reports negative current-level exp after buying', () => {
  const window = loadEngine(makeStorage());
  seedListing(window);
  window.PET_ENGINE.buyCatFromHome('listing_test_1');
  const state = window.PET_ENGINE.getState();
  const idx = state.cats.length - 1;
  const info = window.PET_ENGINE.getLevelInfo(idx);
  const curLevelExp = info.currentLevelExp || 0;
  assert.ok(info.intimacy - curLevelExp >= 0,
    '当前等级内经验 = intimacy - expRequired[level-1] 必须 ≥ 0（旧缺陷会得到 -77）');
  assert.ok(info.progress >= 0 && info.progress <= 100, '进度百分比必须落在 [0,100]');
});

/* ---------------- ③ 挂牌数值非法（负/超限）时被 clamp 校验 ---------------- */

test('buyCatFromHome clamps illegal listing numbers into valid ranges', () => {
  const window = loadEngine(makeStorage());
  seedListing(window, { catIntimacy: -999, catMaturityLevel: 99 });
  const res = window.PET_ENGINE.buyCatFromHome('listing_test_1');
  assert.equal(res.success, true);
  const state = window.PET_ENGINE.getState();
  const bought = state.cats[state.cats.length - 1];
  assert.ok(bought.intimacy >= 0, '好感度不得为负');
  assert.ok(bought.maturityLevel >= 1 && bought.maturityLevel <= 3, '成熟等级钳到 1~3');
  assert.ok(bought.level >= 1 && bought.level <= window.PET_DATA.LEVEL_CONFIG.maxLevel,
    '好感度等级必须落在合法档位');
  assert.equal(bought.level, window.PET_ENGINE.computeIntimacyLevel(bought.intimacy),
    '等级与好感度值必须一致');
});

/* ---------------- ④ 脏存档经 migrateState 自愈 ---------------- */

test('migrateState self-heals a save carrying the old intimacy/maturity mixup', () => {
  // 用一份完整引擎 state 作为基底，再把猫改成线上异常形态（intimacy=73 但 level=3），
  // 避免手工构造缺字段导致的其它初始化噪音。
  const base = makeStorage();
  const w0 = loadEngine(base);
  const cleanState = JSON.parse(JSON.stringify(w0.PET_ENGINE.getState()));
  cleanState.cats = [{
    uid: 'cat_dirty', catId: 'orange', name: '橘猫', gender: 'female',
    adoptedTime: Date.now(), lastUpdateTime: Date.now(),
    hunger: 80, happiness: 80, energy: 100, poopCount: 0, lastPoopTime: Date.now(),
    isSleeping: false, maturity: 73, maturityLevel: 3, totalMaturity: 50,
    intimacy: 73, level: 3, totalIntimacy: 0, canBreed: true,
    breedingCount: 0, lastBreedingTime: 0, isNewborn: false, birthTime: 0,
    parentIds: [], parentUids: [], parentOwnerNames: [], ownerName: '我', childrenUids: []
  }];
  const storage = makeStorage();
  storage.setItem('eggworld_cat_save', JSON.stringify(cleanState));

  const window = loadEngine(storage);   // init() → migrateState()
  const cat = window.PET_ENGINE.getState().cats[0];
  assert.equal(cat.level, 2, '重载后 level 应按 intimacy=73 重算为 Lv.2');
  assert.equal(cat.totalIntimacy, 73, 'totalIntimacy 不得比 intimacy 小');
  const info = window.PET_ENGINE.getLevelInfo(0);
  assert.ok(info.intimacy - (info.currentLevelExp || 0) >= 0, '自愈后进度不为负');
});

/* ---------------- ⑤ 满级猫不被 clamp 误伤 ---------------- */

test('a max-level cat keeps its level after sanitize (no downward clamp)', () => {
  const window = loadEngine(makeStorage());
  const { LEVEL_CONFIG } = window.PET_DATA;
  const maxExp = LEVEL_CONFIG.expRequired[LEVEL_CONFIG.maxLevel];
  seedListing(window, { catIntimacy: maxExp + 500 });   // 超过满级阈值仍合法
  window.PET_ENGINE.buyCatFromHome('listing_test_1');
  const state = window.PET_ENGINE.getState();
  const bought = state.cats[state.cats.length - 1];
  assert.equal(bought.level, LEVEL_CONFIG.maxLevel, '满级猫等级保持 maxLevel');
});

/* ---------------- ⑥ 源码守卫：购买路径不得再写 catMaturityLevel 进 level ---------------- */

test('buyCatFromHome no longer assigns maturity level to intimacy level', () => {
  assert.doesNotMatch(petEngineSrc, /newCat\.level\s*=\s*listing\.catMaturityLevel/,
    'buyCatFromHome 不得把成熟度等级写进好感度等级');
  // 好感度等级必须由 computeIntimacyLevel 推算
  assert.match(petEngineSrc, /newCat\.level\s*=\s*computeIntimacyLevel\(newCat\.intimacy\)/,
    '购买后好感度等级应由 computeIntimacyLevel 统一推算');
});

/* ---------------- ⑦ hydrate 调用 sanitizeCats 自愈服务端旧档 ---------------- */

test('bridge hydrate normalizes cats so dirty server saves self-heal', () => {
  assert.match(bridgeSrc, /PET_ENGINE\.sanitizeCats/,
    'hydrate 后必须调用 sanitizeCats，避免服务端脏数据被原样持久化');
});
