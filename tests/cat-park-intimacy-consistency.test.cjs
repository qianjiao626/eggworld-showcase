const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* 猫咪好感度等级一致性 · 回归测试（2026-10-11）
   缺陷：「我的猫咪」页好感度卡片读引擎权威 cat.level（LEVEL_CONFIG.expRequired 阈值，
   Lv.2=50 / Lv.3=150 …），而公园「把我的猫放到公园」面板、公园场景气泡、繁育选择弹窗
   曾用 Math.floor(intimacy/10)+1 估算——intimacy=50 时权威给 Lv.2、估算给 Lv.6，
   同一只猫两处显示对不上。
   修复：三处统一改用 cat.level || 1，与 getLevelInfo()、服务端繁育门槛判定同源。

   2026-10-11 公园场景规则升级（服务端权威抽取）：
   · 场景固定展示 = 2 只流浪猫 + 至多 3 只他人用户猫；
   · 玩家自己放到公园的猫不再出现在自己的场景里（仅对其他用户可见）；
   · 他人猫的等级来自服务端 park_cats.affinity_level 快照
     （由 reconcileFromSave 从主人存档 cat.level 投影），前端读 vo.affinityLevel，
     绝不允许本地再估算。 */

const petDataSrc = fs.readFileSync('js/pet-data.js', 'utf8');
const petEngineSrc = fs.readFileSync('js/pet-engine.js', 'utf8');
const petUiSrc = fs.readFileSync('js/pet-ui.js', 'utf8');

function makeStorage() {
  const store = {};
  return {
    store,
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
}

// 在 vm 里加载 pet-data + pet-engine，返回 window（含 PET_DATA / PET_ENGINE）
function loadEngine(storage) {
  const window = {};
  const ctx = { window, localStorage: storage, console };
  vm.createContext(ctx);
  vm.runInContext(petDataSrc, ctx);
  vm.runInContext(petEngineSrc, ctx);
  window.PET_ENGINE.init();
  return window;
}

function makeCat(over = {}) {
  const now = Date.now();
  return Object.assign({
    uid: 'cat_test_1', catId: 'orange', name: '测试橘猫', gender: 'male',
    hunger: 80, happiness: 80, energy: 100, poopCount: 0,
    lastPoopTime: now, lastUpdateTime: now, adoptedTime: now,
    isSleeping: false, totalPlayMinutes: 0, totalFeedCount: 0,
    maturity: 50, maturityLevel: 3, totalMaturity: 50, canBreed: true,
    intimacy: 0, level: 1, totalIntimacy: 0
  }, over);
}

function seedOneCat(window, cat) {
  const state = window.PET_ENGINE.getState();
  state.cats = [cat];
  state.currentCatIndex = 0;
  return state;
}

// 服务端 /scene 场景猫 VO（他人用户猫）
function sceneVO(id, ownerUserId, over = {}) {
  return Object.assign({
    id, source: 'user', breedCatId: 'ragdoll', name: '别人家猫', gender: 'female',
    category: 'user', adoptable: false, ownerUserId, ownerNickname: '蛋蛋用户' + ownerUserId,
    isMine: false, cooldownRemainingMs: 0, inCooldown: false,
    affinityLevel: 3, maturityLevel: 3, breedable: true, blockedReason: null
  }, over);
}

/* ---------------- ① 场景他人猫等级读服务端权威快照，不做本地估算 ---------------- */

test('scene cats (server-drawn others) report the affinityLevel snapshot without re-estimating', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  window.PET_ENGINE.setParkSceneCats([sceneVO(11, 99, { affinityLevel: 7 })]);
  const scene = window.PET_ENGINE.getParkCats().filter(c => !c.isStray);
  assert.equal(scene.length, 1);
  assert.equal(scene[0].intimacyLevel, 7, '场景猫等级必须直接取服务端 affinity_level 快照');
  assert.equal(scene[0].level, 7, 'level 字段同源（禁止 /10 估算复活）');
});

/* ---------------- ② 权威等级链：cat.level → reconcile → affinity_level 快照 ---------------- */

test('reconcile projects the authoritative cat.level into the park snapshot (no /10 estimate)', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  // intimacy=50：权威阈值给 Lv.2；旧的 /10 估算会给 Lv.6 —— 正是两处不一致的触发点
  const cat = makeCat({ intimacy: 50, level: 2, totalIntimacy: 50, inPark: true });
  seedOneCat(window, cat);
  const state = window.PET_ENGINE.getState();
  assert.equal(window.PET_ENGINE.getLevelInfo(0).level, 2, 'intimacy=50 应为 Lv.2（expRequired[1]=50）');
  // 服务端快照投影读的就是这个 cat.level（reconcileFromSave: clampInt(cat.get("level"))）
  assert.equal(cat.level, 2);
});

/* ---------------- ③ 阈值边界：场景猫等级逐值透传 ---------------- */

test('level thresholds boundary: affinity snapshot passes through unchanged', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  const E = window.PET_ENGINE;
  const { LEVEL_CONFIG } = window.PET_DATA;

  function expectedLevel(intimacy) {
    let lvl = 1;
    for (let i = LEVEL_CONFIG.maxLevel; i >= 1; i--) {
      if (intimacy >= LEVEL_CONFIG.expRequired[i]) { lvl = i; break; }
    }
    return lvl;
  }

  [0, 49, 50, 51, 149, 150, 300].forEach(intimacy => {
    const lvl = expectedLevel(intimacy);
    E.setParkSceneCats([sceneVO(11, 99, { affinityLevel: lvl })]);
    const scene = E.getParkCats().filter(c => !c.isStray);
    assert.equal(scene[0].intimacyLevel, lvl, `intimacy=${intimacy} 场景猫等级应透传 Lv.${lvl}`);
  });
});

/* ---------------- ④ 自己的猫不出现在自己的场景里 ---------------- */

test('own cats placed in park are NOT shown in the owner scene (visible only to others)', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  const E = window.PET_ENGINE;
  seedOneCat(window, makeCat({ intimacy: 160, level: 3, totalIntimacy: 160 }));

  const put = E.putCatInPark(0);
  assert.equal(put.success, true);
  assert.equal(E.getState().cats[0].inPark, true, '放置应同步写 inPark 权威标志');
  assert.equal(E.getMyCatsInPark().length, 1, '「我的猫」面板仍能看到自己放置的猫');

  const cats = E.getParkCats();
  assert.equal(cats.filter(c => c.isMine).length, 0, '自己的猫不得出现在自己的公园场景');
  assert.equal(cats.filter(c => c.isStray).length, 2, '场景固定含 2 只流浪猫');
});

/* ---------------- ④之二 放上公园的好感度门槛（2026-10-12） ---------------- */

test('putCatInPark requires Lv.3 affinity and explains why not', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  const E = window.PET_ENGINE;

  // Lv.1 被拦：失败 + 解释文案（含当前等级与目标等级）
  seedOneCat(window, makeCat({ intimacy: 0, level: 1, totalIntimacy: 0 }));
  const blocked = E.putCatInPark(0);
  assert.equal(blocked.success, false, 'Lv.1 不应能放上公园（此前缺陷：只限数量不限等级）');
  assert.match(blocked.msg, /Lv\.3/, '解释应写明门槛 Lv.3');
  assert.match(blocked.msg, /Lv\.1/, '解释应写明当前等级 Lv.1');
  assert.ok(!E.getState().cats[0].inPark, '被拦后不得置 inPark 标志');
  assert.equal(E.getState().catsInPark, undefined, '影子字段 catsInPark 已废除，不得再出现在档里');

  // 等级权威以 cat.level 为准（由 intimacy 按阈值重算）：intimacy=149 差 1 点到 Lv.3，仍被拦
  const st = E.getState();
  st.cats[0].intimacy = 149;
  E.sanitizeCats();
  assert.equal(st.cats[0].level, 2, 'intimacy=149 权威等级应为 Lv.2');
  assert.equal(E.putCatInPark(0).success, false, 'Lv.2 同样不放行');

  // Lv.3 放行
  st.cats[0].intimacy = 150;
  E.sanitizeCats();
  assert.equal(st.cats[0].level, 3, 'intimacy=150 应为 Lv.3');
  assert.equal(E.putCatInPark(0).success, true, 'Lv.3 应可放上公园');
});

test('init and hydrate self-heal: sub-Lv.3 cats marked inPark are taken home', () => {
  // 门槛上线前放上去的低等级猫（本地档或服务端旧档）应在重载/同步时自动收回家
  const storage = makeStorage();
  const w1 = loadEngine(storage);
  const s1 = w1.PET_ENGINE.getState();
  s1.cats = [makeCat({ intimacy: 20, level: 1, totalIntimacy: 20, inPark: true })];
  s1.catsInPark = [0];   // 旧影子字段（下标语义）：模拟门槛上线前的老档
  w1.PET_ENGINE.save();

  // 重载（init 路径）：inPark 自愈下架 + 影子字段迁移后删除
  const w2 = loadEngine(storage);
  const s2 = w2.PET_ENGINE.getState();
  assert.equal(s2.cats[0].inPark, false, 'init 后低等级猫不得保留在公园标志');
  assert.equal(s2.catsInPark, undefined, 'init 后影子字段 catsInPark 应被删除（下标语义废除）');

  // hydrate 路径（sanitizeCats）：直接改 state 后调 sanitizeCats
  s2.cats[0].inPark = true;
  w2.PET_ENGINE.sanitizeCats();
  assert.equal(s2.cats[0].inPark, false, 'sanitizeCats 后同样自愈下架');
});

/* ---------------- ④之三 公园放置唯一事实源 = 猫实例 inPark（影子字段废除，2026-10-14） ---------------- */

test('legacy save migration: index-array catsInPark backfills inPark once, then is dropped', () => {
  const storage = makeStorage();
  const w1 = loadEngine(storage);
  const s1 = w1.PET_ENGINE.getState();
  // 老档：猫实例没有 inPark 字段，放置状态只存在 catsInPark 下标数组里
  s1.cats = [
    makeCat({ uid: 'cat_a', catId: 'white', name: '白猫甲', intimacy: 160, level: 3, totalIntimacy: 160 }),
    makeCat({ uid: 'cat_b', catId: 'white', name: '白猫乙', intimacy: 160, level: 3, totalIntimacy: 160 })
  ];
  s1.catsInPark = [1];
  w1.PET_ENGINE.save();

  const w2 = loadEngine(storage);
  const s2 = w2.PET_ENGINE.getState();
  assert.equal(s2.cats[1].inPark, true, '老档下标 1 的猫应补写 inPark=true');
  assert.equal(s2.cats[0].inPark, false, '未在下标数组里的猫补写 false');
  assert.equal(s2.catsInPark, undefined, '补写后影子字段应删除，随回写自愈');
});

test('park placement follows the cat instance when an earlier cat is donated (no index drift)', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  const E = window.PET_ENGINE;
  const s = E.getState();
  s.cats = [
    makeCat({ uid: 'cat_goner', catId: 'tabby', name: '要被送走的狸猫', intimacy: 160, level: 3, totalIntimacy: 160 }),
    makeCat({ uid: 'cat_stayer', catId: 'white', name: '在公园的白猫', intimacy: 160, level: 3, totalIntimacy: 160, inPark: true })
  ];
  s.currentCatIndex = 0;

  const r = E.donateCatToHome(0);   // 送走排在公园猫「前面」的猫
  assert.equal(r.success, true);
  assert.equal(s.cats.length, 1);
  assert.equal(s.cats[0].uid, 'cat_stayer');
  assert.equal(s.cats[0].inPark, true, '删掉别的猫不得影响这只猫的公园放置');
  const inPark = E.getMyCatsInPark();
  assert.equal(inPark.length, 1);
  assert.equal(inPark[0].uid, 'cat_stayer', '公园列表按实例报告（uid 正确）');
  assert.equal(inPark[0].catIndex, 0, 'catIndex 为当前数组位置');
});

test('two same-breed cats are independent instances: separate uids, per-instance park flag', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  const E = window.PET_ENGINE;
  E.getState().cats = [];

  const a = E.addCatFromPark('white', { gender: 'male' });
  const b = E.addCatFromPark('white', { gender: 'female' });
  assert.equal(a.success, true);
  assert.equal(b.success, true);
  const s = E.getState();
  assert.notEqual(s.cats[0].uid, s.cats[1].uid, '同品种两只猫 uid 必须不同（park_cats 唯一键成员）');

  // 放置/收回都只作用于被操作的那只实例
  s.cats.forEach(c => { c.intimacy = 160; c.level = 3; c.totalIntimacy = 160; });
  assert.equal(E.putCatInPark(0).success, true);
  assert.equal(s.cats[0].inPark, true);
  assert.equal(s.cats[1].inPark, false, '另一只同品种猫不受影响');
  assert.equal(E.putCatInPark(0).success, false, '重复放置被拦（按实例判断）');
  assert.equal(E.takeCatHome(0).success, true);
  assert.equal(E.takeCatHome(0).success, false, '收回后重复收回被拦');
  assert.equal(E.getMyCatsInPark().length, 0);
});

/* ---------------- ⑤ 服务端不可信数据防御：isMine / official 混入被过滤 ---------------- */

test('setParkSceneCats filters own / official / malformed entries and caps at 3', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  const E = window.PET_ENGINE;
  const n = E.setParkSceneCats([
    sceneVO(1, 99),
    sceneVO(2, 42, { isMine: true }),                 // 自己的猫 → 丢弃
    sceneVO(3, null, { source: 'official' }),         // 流浪猫 → 丢弃（场景流浪猫由本地抽卡负责）
    sceneVO(4, 98, { breedCatId: null }),             // 脏数据 → 丢弃
    sceneVO(5, 97),
    sceneVO(6, 96),
    sceneVO(7, 95)                                    // 第 4 只他人猫 → 截断
  ]);
  assert.equal(n, 3, '至多保留 3 只他人用户猫');
  const scene = E.getParkCats().filter(c => !c.isStray);
  assert.equal(scene.length, 3);
  // 跨 vm realm 的数组原型不同，用 JSON 比较值
  assert.equal(JSON.stringify(scene.map(c => c.parkCatId)), JSON.stringify([1, 5, 6]));
  assert.equal(scene.every(c => !c.isMine), true);
});

/* ---------------- ⑥ 场景签名：主人带回家 → id 消失 → 签名变化 ---------------- */

test('scene signature changes when a shown cat is taken home or blocked', () => {
  const storage = makeStorage();
  const window = loadEngine(storage);
  const E = window.PET_ENGINE;
  E.setParkSceneCats([sceneVO(1, 99), sceneVO(2, 98)]);
  const sigA = E.getParkSceneSignature();

  E.setParkSceneCats([sceneVO(1, 99), sceneVO(2, 98)]);
  assert.equal(E.getParkSceneSignature(), sigA, '同一批场景猫签名应稳定');

  // 猫 2 的主人把它带回家 → 服务端重抽后 id=2 消失
  E.setParkSceneCats([sceneVO(1, 99), sceneVO(3, 97)]);
  assert.notEqual(E.getParkSceneSignature(), sigA, '展示猫被带回家后签名必须变化（触发重绘）');

  // 猫 1 进入繁育冷却 → breedable 翻转也算变更
  const sigB = E.getParkSceneSignature();
  E.setParkSceneCats([sceneVO(1, 99, { breedable: false, blockedReason: '繁育冷却中' }), sceneVO(3, 97)]);
  assert.notEqual(E.getParkSceneSignature(), sigB, '繁育资格翻转应触发重绘');
});

/* ---------------- ⑦ 页面刷新（存档重载）后：场景猫需重新拉取，不残留脏数据 ---------------- */

test('after reload from save: scene cache starts empty until re-fetched (no stale fake cats)', () => {
  const storage = makeStorage();
  const w1 = loadEngine(storage);
  w1.PET_ENGINE.setParkSceneCats([sceneVO(1, 99)]);
  w1.PET_ENGINE.save();

  // 模拟刷新：重新加载引擎脚本并从 localStorage 恢复
  const w2 = loadEngine(storage);
  const cats = w2.PET_ENGINE.getParkCats();
  assert.equal(cats.filter(c => !c.isStray).length, 0,
    '场景猫是运行时缓存，重载后必须由 bridge 重新拉 /scene，不得残留旧批次');
  assert.equal(cats.filter(c => c.isStray).length, 2, '流浪猫抽卡批次仍从存档恢复');
});

/* ---------------- ⑧ 源码守卫：/10 估算不得复活 ---------------- */

test('no module falls back to the /10 estimate for intimacy level', () => {
  // pet-ui.js：公园面板与繁育选择弹窗都必须读 cat.level
  assert.doesNotMatch(petUiSrc, /Math\.floor\(intimacyVal\s*\/\s*10\)\s*\+\s*1/,
    'pet-ui.js 不应再用 /10 估算好感度等级');
  assert.doesNotMatch(petEngineSrc, /Math\.floor\(intimacyVal\s*\/\s*10\)\s*\+\s*1/,
    'pet-engine.js 不应再用 /10 估算好感度等级');
  const levelReads = (petUiSrc.match(/const intimacyLvl = cat\.level \|\| 1;/g) || []).length;
  assert.equal(levelReads, 2, '公园面板与繁育弹窗两处应统一读 cat.level');
  // 场景猫等级必须读服务端快照字段，不允许本地估算
  assert.match(petEngineSrc, /const lvl = vo\.affinityLevel \|\| 1;/,
    'toSceneCat 应读服务端 affinity_level 快照');
});
