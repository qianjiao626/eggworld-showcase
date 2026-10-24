/* ============================================================
 * 「解锁新角色」恭喜弹窗 —— 让真实任务流程也能触发
 *
 * 背景：
 *   页面里已经有弹窗样式、DOM 和 showUnlockModal()，但触发代码只写在
 *   本地模拟的 completeTask() 里（手动改本地 USER/CHAR_STATE），
 *   真实流程（POST /api/tasks/{id}/confirm）不会弹出。
 *
 * 原理：
 *   后端在任务被确认完成时，会把该用户对应分类的 user_characters 计数 +1，
 *   首次完成时 unlocked 由 0 置 1（ClaimService.incrementCharCount）。
 *   前端所有角色状态都经 applyUserData() 写入 CHAR_STATE，
 *   所以在这里对比「解锁状态集」的变化：出现 false → true 即代表本次新解锁，
 *   调用页面已有的 showUnlockModal() 弹出恭喜动画。
 *
 * 为什么用 localStorage 记录基线（而不是只比内存上一次状态）：
 *   认领者的「完成」是由发布者点确认触发的，本人浏览器当时并不知情；
 *   持久化每个账号的已知解锁集合后，等本人下次打开页面即可补弹一次，
 *   同时避免首次访问（新设备/清缓存）把历史已解锁角色全部弹一遍。
 *
 * 约束：不改动 growth-schoolv3.html 的内联逻辑。
 * ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'egg_unlocked_map';   // localStorage: { "<userId>": { study:true, ... } }
  var DELAY = 900;                      // 等结算提示/页面刷新先呈现，再弹恭喜
  var NEXT_GAP = 400;                   // 多个同时解锁时，弹窗之间的间隔

  var queue = [];                       // 待展示的分类
  var showing = false;

  function chars() {
    var cs = window.CHAR_STATE && window.CHAR_STATE.characters;
    return cs || null;
  }

  /* 当前各分类解锁状态快照 */
  function snapshot() {
    var cs = chars();
    var m = {};
    if (!cs) return m;
    Object.keys(cs).forEach(function (k) { m[k] = !!cs[k].unlocked; });
    return m;
  }

  /* ---- 每账号的已知解锁集合（localStorage） ---- */
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function knownFor(uid) {
    var all = readStore();
    return all[String(uid)] || null;    // null 表示该账号还没有基线
  }
  function saveKnown(uid, map) {
    try {
      var all = readStore();
      all[String(uid)] = map;
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  /* ---- 弹窗队列（一次可能解锁多个分类） ---- */
  function enqueue(cat) {
    if (queue.indexOf(cat) === -1) queue.push(cat);
    drain();
  }

  function drain() {
    if (showing || !queue.length) return;
    if (typeof window.showUnlockModal !== 'function') { queue.length = 0; return; }
    var cat = queue.shift();
    showing = true;
    setTimeout(function () {
      try {
        window.showUnlockModal(cat);
      } catch (e) {
        showing = false;
        drain();
      }
    }, DELAY);
  }

  /* 关闭后继续弹队列里的下一个（包装页面已有的 closeUnlockModal） */
  function wrapClose() {
    var original = window.closeUnlockModal;
    if (typeof original !== 'function' || original.__ucWrapped) return;
    var wrapped = function () {
      var ret = original.apply(this, arguments);
      showing = false;
      setTimeout(drain, NEXT_GAP);
      return ret;
    };
    wrapped.__ucWrapped = true;
    window.closeUnlockModal = wrapped;
  }

  /* ---- 核心：角色状态同步后判断是否出现新解锁 ---- */
  function detectAndShow() {
    var uid = (window.USER && window.USER.id) || 0;
    if (!uid) return;                       // 未登录，忽略

    var now = snapshot();
    if (!Object.keys(now).length) return;    // 无角色数据

    var known = knownFor(uid);
    if (!known) {
      /* 该账号首次同步：只记录基线，不弹窗
         （CHAR_STATE 初始值是演示数据，且历史已解锁的角色不应再弹一遍） */
      saveKnown(uid, now);
      return;
    }

    var newly = [];
    Object.keys(now).forEach(function (k) {
      if (now[k] && !known[k]) newly.push(k);
    });

    /* 先落盘再弹窗，避免刷新导致同一角色重复弹 */
    saveKnown(uid, now);
    newly.forEach(enqueue);
  }

  function wrapApplyUserData() {
    var original = window.applyUserData;
    if (typeof original !== 'function' || original.__ucWrapped) return;

    var wrapped = function () {
      var ret = original.apply(this, arguments);
      try { detectAndShow(); } catch (e) {}
      return ret;
    };
    wrapped.__ucWrapped = true;
    window.applyUserData = wrapped;
  }

  function setup() {
    wrapClose();
    wrapApplyUserData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
