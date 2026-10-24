const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* 每日签到连续进度 · 回归测试（2026-10-11 实测缺陷）
   缺陷：getCheckinInfo 按「距上次签到时刻的小时差 > streakResetHours(36)」判断签，
   而签到本身按自然日（lastCheckinDate !== today）。两者口径不一致：
   昨天 09:00 签到、今天 23:00 打开 → 间隔 38h > 36h → 连续进度被错误重置为第 1 天，
   表现为「前一日已签到、次日签到却从第一天重新开始」。
   修复：断签判定改为自然日口径——上次签到日早于「昨天」才算断签（与后端 checkin_streak 一致）。 */

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

// 可控时钟的引擎环境：clock.t 为「当前时刻」，测试里随时推进
function loadEngineWithClock(initialDate) {
  const clock = { t: initialDate.getTime() };
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(clock.t);
      else super(...args);
    }
    static now() { return clock.t; }
  }
  const window = {};
  const ctx = { window, localStorage: makeStorage(), console, Date: FakeDate };
  vm.createContext(ctx);
  vm.runInContext(petDataSrc, ctx);
  vm.runInContext(petEngineSrc, ctx);
  window.PET_ENGINE.init();
  return { window, clock };
}

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function seedCheckin(window, { lastCheckinDate, streakDays, totalCheckins = streakDays }) {
  const st = window.PET_ENGINE.getState();
  st.checkin = { lastCheckinDate, streakDays, totalCheckins };
  return st;
}

test('regression: 昨天 09:00 签、今天 23:00（间隔 38h>36h）连续进度不被重置', () => {
  const { window, clock } = loadEngineWithClock(new Date(2026, 9, 11, 23, 0, 0));  // 10-11 23:00
  const yesterday = new Date(2026, 9, 10, 9, 0, 0);
  seedCheckin(window, { lastCheckinDate: ymd(yesterday), streakDays: 5 });
  const info = window.PET_ENGINE.getCheckinInfo();
  assert.equal(info.streakDays, 5, '跨过 36h 小时差但仍是「昨天签过」，连续进度必须保留');
  assert.equal(info.nextDay, 6, '下一次签到应为第 6 天');
  assert.equal(info.canCheckIn, true);
  void clock;
});

test('真断签（上次签到早于昨天）才归零重计', () => {
  const { window } = loadEngineWithClock(new Date(2026, 9, 11, 23, 0, 0));
  seedCheckin(window, { lastCheckinDate: ymd(new Date(2026, 9, 9)), streakDays: 5 });  // 前天签的
  const info = window.PET_ENGINE.getCheckinInfo();
  assert.equal(info.streakDays, 0, '隔了一整天没签才算断签');
  assert.equal(info.nextDay, 1);
});

test('连续 3 天签到进度正确累加（跨自然日推进时钟）', () => {
  const { window, clock } = loadEngineWithClock(new Date(2026, 9, 9, 8, 0, 0));
  const st = window.PET_ENGINE.getState();
  st.checkin = { lastCheckinDate: '', streakDays: 0, totalCheckins: 0 };

  const r1 = window.PET_ENGINE.doCheckin();
  assert.equal(r1.success, true);
  assert.equal(r1.day, 1);
  assert.equal(st.checkin.streakDays, 1);

  clock.t = new Date(2026, 9, 10, 22, 0, 0).getTime();   // 次日晚：距首日 14h
  const r2 = window.PET_ENGINE.doCheckin();
  assert.equal(r2.success, true);
  assert.equal(r2.day, 2, '第 2 天签到必须落在第 2 档，而不是重置回第 1 天');
  assert.equal(st.checkin.streakDays, 2);

  clock.t = new Date(2026, 9, 11, 9, 0, 0).getTime();    // 第三日早：距昨日 11h
  const r3 = window.PET_ENGINE.doCheckin();
  assert.equal(r3.success, true);
  assert.equal(r3.day, 3);
  assert.equal(st.checkin.streakDays, 3);
  assert.equal(st.checkin.totalCheckins, 3);
  assert.equal(st.checkin.lastCheckinDate, ymd(new Date(2026, 9, 11)));
});

test('同一天重复签到被拒绝且不影响进度', () => {
  const { window } = loadEngineWithClock(new Date(2026, 9, 11, 10, 0, 0));
  const st = window.PET_ENGINE.getState();
  st.checkin = { lastCheckinDate: '', streakDays: 0, totalCheckins: 0 };
  assert.equal(window.PET_ENGINE.doCheckin().success, true);
  const again = window.PET_ENGINE.doCheckin();
  assert.equal(again.success, false);
  assert.match(again.msg, /已经签到/);
  assert.equal(st.checkin.streakDays, 1, '重复签到不改变连续天数');
});

test('断签后重签从第 1 天开始，累计次数继续增加', () => {
  const { window, clock } = loadEngineWithClock(new Date(2026, 9, 11, 12, 0, 0));
  seedCheckin(window, { lastCheckinDate: ymd(new Date(2026, 9, 8)), streakDays: 5, totalCheckins: 5 });
  const r = window.PET_ENGINE.doCheckin();
  assert.equal(r.success, true);
  assert.equal(r.day, 1, '断签后从第 1 档重新计');
  const st = window.PET_ENGINE.getState();
  assert.equal(st.checkin.streakDays, 1);
  assert.equal(st.checkin.totalCheckins, 6, '累计签到次数是历史总量，断签不清零');
  void clock;
});
