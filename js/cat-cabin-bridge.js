/* ============================================================
   猫咪小屋 · 接入桥（bridge）（移动端 + 桌面端共用）
   ------------------------------------------------------------
   这是主文件里猫咪小屋唯一的静态引入点：引擎体积大（5 个 JS ~560KB
   + pet-module.css ~205KB），只在首次进入「猫咪小屋」时才由
   这里动态注入，其它页面不加载。

   职责：
     · ensureEngine()：按 data→engine→renderer→ui→chat 顺序注入脚本，
       注入 pet-module.css / cat-cabin.css。
     · catCabinEnter()：拉服务端存档 → hydrate 引擎 → open UI，再把引擎
       造在 body 上的全屏遮罩 .pet-modal-mask 搬进 #catCabinHost，配合
       cat-cabin.css 铺满为页面内嵌视图。
     · catCabinLeave()：先 flush 未回写的存档，再 close() 停动画/定时器。

   P1 存档互通：
     · 服务端权威：GET /api/cat-cabin/state 拉整份存档覆盖本地，但**只认含
       cats 数组的真实存档**；服务端没有档、或只有 /earn、/thought 建的占位空行
       （save_json='{}'）而本地有 → 作为首次上传（baseVersion=服务端当前版本）。
     · 回写：引擎 save() 钩子（window.__catCabinOnSave）→ 5s 防抖 POST；
       离开 tab / 页面隐藏 / 关页前 flush。
     · 冲突：POST 返回 code=409（其它端写过）→ 只刷新版本号后把本地档补发一次
       （不整档 hydrate，避免本地尚未回写的猫/公园改动被服务端旧档覆盖）；
       补发仍冲突才回落服务端权威整档重拉 + toast。

   P2 金币合并（coins = 真实蛋蛋币余额的镜像）：
     · 引擎 addCoins/spendCoins 先做本地乐观变更，再回调 window.__catCabinCoins
       的 earned/spent → 调后端 /earn /spend（PointService 原子扣入账）。
     · 服务端返回的 balance 覆盖本地 coins（权威）；spend 失败（402/网络）
       回滚本地乐观扣款并 toast。
     · 金额与资格全由后端裁决（签到/捐赠每日一次 + 每日 200 封顶），前端不报数额。
   ============================================================ */
(function () {
  var HOST_ID = 'catCabinHost';
  var JS_DIR = 'js/';
  var CSS_DIR = 'js/';   /* 项目约定：外联 CSS 与 JS 同放 js/（见 js/plaza-mobile.css） */
  /* 引擎必须按此顺序加载（后者依赖前者的 window 全局） */
  var ENGINE_JS = ['pet-data.js', 'pet-engine.js', 'pet-renderer.js', 'pet-ui.js', 'cat-chat.js'];
  var ENGINE_CSS = ['pet-module.css', 'cat-cabin.css'];
  var VER = '20261014p1';
  var API_STATE = '/api/cat-cabin/state';
  var API_SPEND = '/api/cat-cabin/spend';
  var API_EARN = '/api/cat-cabin/earn';
  var API_THOUGHT = '/api/cat-cabin/thought';
  var DEBOUNCE_MS = 5000;

  var loading = null;      // 引擎注入 Promise，避免并发重复注入
  var serverVersion = 0;   // 最近一次服务端确认的乐观锁版本号
  var dirty = false;       // 有未回写的本地变更
  var pending = false;     // 存档写请求在途
  var timer = null;        // 防抖计时器
  var suppress = false;    // hydrate 回写本地档时抑制钩子（服务端→本地不算本地变更）
  var forceFirstPush = false;  // 首次上传（服务端还没有档）时即使 dirty=false 也要发

  function host() { return document.getElementById(HOST_ID); }
  function loggedIn() { return !!(window.USER && window.USER.registered); }

  /* 与 js/cat-system.js 的 api() 同款封装：Bearer token + Result{code,msg,data} */
  function api(method, path, body) {
    var headers = {};
    var token = sessionStorage.getItem('token');
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body != null) headers['Content-Type'] = 'application/json';
    return fetch((window.API_BASE || '') + path, {
      method: method, headers: headers, body: body == null ? undefined : JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return { code: r.status, msg: '请求失败' }; }); })
      .catch(function () { return { code: 0, msg: '网络异常，请稍后重试' }; });
  }

  function loadCss(href) {
    /* 按文件名（去掉目录与 ?v=）判断是否已注入，避免第二个 CSS 被误跳过 */
    var base = href.split('/').pop().split('?')[0];
    var links = document.querySelectorAll('link[data-cat-cabin]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('href').indexOf(base) >= 0) return;
    }
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.setAttribute('data-cat-cabin', '1');
    document.head.appendChild(l);
  }

  function loadJs(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('cat-cabin load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* 串行注入 CSS（一次）+ 引擎 JS（按序），全部完成后 resolve */
  function ensureEngine() {
    if (window.PET_ENGINE && window.PET_UI) return Promise.resolve();
    if (loading) return loading;
    loadCss(CSS_DIR + ENGINE_CSS[0] + '?v=' + VER);
    loadCss(CSS_DIR + ENGINE_CSS[1] + '?v=' + VER);
    loading = ENGINE_JS.reduce(function (chain, f) {
      return chain.then(function () { return loadJs(JS_DIR + f + '?v=' + VER); });
    }, Promise.resolve());
    return loading;
  }

  /* ---------- P1 同步层 ---------- */

  /** 用服务端存档覆盖引擎内存 state（服务端为权威），并补一次离线结算。 */
  function hydrate(save) {
    var st = window.PET_ENGINE.getState();
    Object.keys(st).forEach(function (k) { delete st[k]; });
    Object.keys(save).forEach(function (k) { st[k] = save[k]; });
    /* 服务端可能存有旧客户端的脏数据（如市场购买把成熟度等级误写进好感度等级），
       hydrate 后先归一化好感度数值再结算，避免负数显示持久化回服务端。 */
    if (window.PET_ENGINE.sanitizeCats) window.PET_ENGINE.sanitizeCats();
    window.PET_ENGINE.updateAllCats();   // 按 lastUpdateTime 补离线衰减
    suppress = true;
    window.PET_ENGINE.save();            // 落 localStorage；这是服务端→本地，不触发回写
    suppress = false;
    if (window.PET_UI && window.PET_UI.render) window.PET_UI.render();  // 刷新界面（余额/猫）
  }

  /** 只刷新乐观锁版本号（不整档 hydrate）：供 409 后把本地未回写的改动补发。 */
  function refreshVersion() {
    return api('GET', API_STATE).then(function (res) {
      if (res.code === 200 && res.data) serverVersion = res.data.version || 0;
    });
  }

  /** 真正发一次存档 POST；成功后更新 serverVersion。
   *  409：只刷新版本号后把本地档补发一次（不整档 hydrate，避免本地未回写的玩法变更被覆盖）。 */
  function pushNow(retried) {
    if (!loggedIn() || !window.PET_ENGINE) return;
    if (pending) return;                 // 在途请求结束后会按 dirty 补发，不并发写
    if (!dirty && !forceFirstPush) return;
    var payload = { save: window.PET_ENGINE.getState(), baseVersion: serverVersion };
    dirty = false; forceFirstPush = false; pending = true;
    api('POST', API_STATE, payload).then(function (res) {
      pending = false;
      if (res.code === 200 && res.data) {
        serverVersion = res.data.version;
        if (dirty) schedulePush();       // 在途期间又有新变更
      } else if (res.code === 409) {
        if (retried) {
          /* 补发后仍冲突：按服务端权威整档重拉，避免无限重试 */
          pull().then(function () {
            if (window.toast) window.toast('存档已在其它端更新，已同步最新版本');
          });
          return;
        }
        /* 其它端已写（或占位行刚由 /earn 建出）：只刷新版本号后把本地档补发一次。
           旧实现这里是 pull()+hydrate：本地档被服务端旧档整档覆盖，而 dirty/forceFirstPush
           已在本次推送开头清零、不会补写 —— 刚领养的猫会被静默丢掉（已上线事故）。 */
        refreshVersion().then(function () {
          dirty = true;
          pushNow(true);
        });
      } else {
        dirty = true;                    // 网络/其它失败：下轮再试
        if (res.code !== 0 && window.toast) window.toast(res.msg || '猫咪小屋存档保存失败');
      }
    });
  }

  function schedulePush() {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; pushNow(); }, DEBOUNCE_MS);
  }

  /** 立即回写未保存的变更（离开 tab / 页面隐藏 / 关页前）。 */
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (dirty || forceFirstPush) pushNow();
  }

  /** GET 服务端存档并 hydrate；返回 Promise 供 enter 串接。 */
  function pull() {
    return api('GET', API_STATE).then(function (res) {
      if (res.code !== 200 || !res.data) return;      // 未登录/网络失败：保持本地档
      serverVersion = res.data.version || 0;
      var save = res.data.save;
      /* 只认真实引擎存档（必含 cats 数组）才覆盖本地：
         save_json='{}' 的占位空行若被回填成「只有 coins」的形状，
         旧判据 Object.keys>0 会把空档当有内容 → hydrate 整档覆盖 → 猫全丢。 */
      var hasContent = res.data.exists && save && Array.isArray(save.cats);
      if (hasContent) {
        hydrate(save);
      } else {
        /* 服务端还没有真实存档（不存在，或只有 /earn 建的占位空行 {}）：
           把本地档作为首次上传，用当前 serverVersion 走 UPDATE 覆盖占位行。 */
        forceFirstPush = true;
        if (res.data.coins != null) mirrorCoins(res.data.coins);
      }
      /* 服务端档已就位：消费待处理的新手任务事件 + 历史兜底补记 */
      pulled = true;
      flushPending();
      syncHistory();
    });
  }

  /* ---------- P2 金币合并 ---------- */

  /** 把真实余额写进引擎镜像（不触发存档回写钩子）。 */
  function mirrorCoins(balance) {
    if (typeof balance !== 'number' || !window.PET_ENGINE) return;
    var st = window.PET_ENGINE.getState();
    st.coins = balance;
    if (window.PET_UI && window.PET_UI.render) window.PET_UI.render();
  }

  /** 只重同步余额（GET /state 取 coins），不整档 hydrate——避免覆盖本地未推送的玩法变更。 */
  function refreshCoins() {
    if (!loggedIn()) return;
    api('GET', API_STATE).then(function (res) {
      if (res.code === 200 && res.data && typeof res.data.coins === 'number') {
        mirrorCoins(res.data.coins);
      }
    });
  }

  /* 引擎 addCoins/spendCoins 的回调：本地已乐观变更，这里向后端对账，
     无论成功失败最终都把 coins 对齐到服务端真实余额（真实蛋蛋币不超发/不超扣）。 */
  window.__catCabinCoins = {
    /** 扣币：成功用服务端 balance 校正；失败（402/网络）重同步余额（撤销本地乐观扣款）。 */
    spent: function (amount, reason, refId) {
      if (!loggedIn() || !window.PET_ENGINE) return;
      api('POST', API_SPEND, { reason: reason, refId: refId, amount: amount }).then(function (res) {
        if (res.code === 200 && res.data) {
          mirrorCoins(res.data.balance);            // 权威余额
        } else {
          refreshCoins();                           // 本地乐观扣款作废，重对齐服务端余额
          if (window.toast) window.toast(res.code === 402 ? '蛋蛋币余额不足' : (res.msg || '扣费失败，请重试'));
        }
      });
    },
    /** 赚币（签到/捐赠）：金额由后端裁决（每日一次 + 封顶），用 balance 校正镜像。 */
    earned: function (reason, opts) {
      if (!loggedIn() || !window.PET_ENGINE) return;
      api('POST', API_EARN, { reason: reason, slotFull: !!(opts && opts.slotFull) }).then(function (res) {
        if (res.code === 200 && res.data) {
          mirrorCoins(res.data.balance);            // 含日上限截断后的真实入账余额
          if (res.data.coins === 0 && window.toast) {
            window.toast('今日奖励已达上限（200 币）');
          }
        } else {
          refreshCoins();                           // 本地乐观加币作废，重对齐
          if (window.toast) window.toast(res.msg || '奖励发放失败');
        }
      });
    }
  };

  /* 把引擎遮罩节点搬进宿主（幂等：已在宿主内则不动） */
  function rehost() {
    var mask = document.querySelector('.pet-modal-mask');
    var h = host();
    if (mask && h && mask.parentNode !== h) h.appendChild(mask);
  }

  /* ---------- 新手任务事件桥（修 bug：发布/认领任务后猫咪家园未解锁） ----------
     引擎的 completeNewbieTask 原本全站零调用，新手任务永远不会完成。
     主文件在 任务认领/发布/吐槽 成功处调 window.catCabinNotify(event)：
       · 引擎已就绪且服务端档已同步（pulled）→ 立即完成 + 防抖回写；
       · 否则写入 localStorage 待处理队列（跨刷新不丢），pull 完成后 flush。
     另做历史兜底：每次 pull 后，对未完成的 newbie 任务查站点既有接口
     （my-published/my-claimed、complaints/mine），有证据即补记完成——
     覆盖"事件桥上线之前就发布过任务"的老用户。 */
  var PENDING_KEY = 'eggworld_cat_pending';
  var pulled = false;

  function readPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || {}; } catch (e) { return {}; }
  }
  function writePending(p) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (e) { /* 忽略 */ }
  }

  /** 完成一个新手任务事件；返回是否"本次新完成"（重复调用返回 false）。 */
  function applyNewbie(event) {
    var id = event === 'tucao' ? 'newbie_post_tucao' : 'newbie_post_or_claim_task';
    var r = window.PET_ENGINE.completeNewbieTask(id);
    return !!(r && r.success);
  }

  window.catCabinNotify = function (event) {
    var p = readPending();
    p[event] = true;
    writePending(p);
    /* 引擎就绪且已同步服务端档 → 立刻消费；否则等 pull 完成后的 flush */
    if (inited && pulled && window.PET_ENGINE) flushPending();
  };

  function flushPending() {
    var p = readPending();
    if (!p.task && !p.tucao) return;
    var didTask = p.task ? applyNewbie('task') : false;
    var didTucao = p.tucao ? applyNewbie('tucao') : false;
    writePending({});
    if (didTask || didTucao) {
      schedulePush();   // completeNewbieTask 内部已 save()，这里排队回写服务端
      if (window.toast) {
        window.toast(didTask && didTucao ? '🎉 新手任务完成：家园与流浪猫领养已解锁'
          : didTask ? '🎉 新手任务完成：已解锁「猫咪家园」'
          : '🎉 新手任务完成：已解锁流浪猫领养');
      }
    }
  }

  /** 历史兜底：未完成的任务查站点既有接口，有证据即补记。 */
  function syncHistory() {
    var st = window.PET_ENGINE.getState();
    var needTask = !st.newbieTasks || !st.newbieTasks['newbie_post_or_claim_task'];
    var needTucao = !st.newbieTasks || !st.newbieTasks['newbie_post_tucao'];
    if (!needTask && !needTucao) return Promise.resolve();
    var jobs = [];
    var applied = false;
    if (needTask) {
      /* 发布过 或 认领过 任一即满足；Page 结构 {total, records} */
      var any = function (path) {
        return api('GET', path).then(function (r) {
          return r.code === 200 && r.data && ((r.data.total || 0) > 0 || (r.data.records || []).length > 0);
        });
      };
      jobs.push(any('/api/tasks/my-published?page=1&size=1').then(function (pub) {
        return pub ? true : any('/api/tasks/my-claimed?page=1&size=1');
      }).then(function (has) {
        if (has && applyNewbie('task')) {
          applied = true;
          if (window.toast) window.toast('🎉 检测到你已发布/认领过任务，猫咪家园已解锁');
        }
      }));
    }
    if (needTucao) {
      jobs.push(api('GET', '/api/complaints/mine').then(function (r) {
        var has = r.code === 200 && Array.isArray(r.data) && r.data.length > 0;
        if (has && applyNewbie('tucao')) {
          applied = true;
          if (window.toast) window.toast('🎉 检测到你已发布过吐槽，流浪猫领养已解锁');
        }
      }));
    }
    Promise.all(jobs).then(function () { if (applied) schedulePush(); });
  }

  var inited = false;
  function openUi() {
    window.PET_UI.open();         // createModal（若已建则复用）+ display:flex + loadSprites
    rehost();
  }

  function enter() {
    if (!window.PET_ENGINE || !window.PET_UI) return;
    if (!inited) {
      window.PET_ENGINE.init();   // 读档 + 离线结算 + save()
      inited = true;
      /* 引擎每次存档变化都会回调这里 → 防抖回写服务端 */
      window.__catCabinOnSave = function () { if (!suppress) schedulePush(); };
      openUi();
      /* 先展示本地缓存档（秒开），拉到服务端档后再覆盖 */
      if (loggedIn()) {
        pull().then(function () {
          if (forceFirstPush || dirty) pushNow();
        });
      }
    } else {
      openUi();
      /* 再次进页：拉一次服务端，确保多标签页/其它设备的一致性 */
      if (loggedIn()) pull().then(function () { if (dirty || forceFirstPush) pushNow(); });
    }
  }

  function leave() {
    flush();
    if (window.PET_UI) window.PET_UI.close();  // display:none + stopAnimation + stopParkAnimation
  }

  /* 页面隐藏/关闭前兜底回写（visibilitychange 比 beforeunload 可靠，移动端尤其） */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flush();
  });
  window.addEventListener('pagehide', flush);

  /* ============================================================
     猫咪公园 · 繁育交互（服务端权威）
     ------------------------------------------------------------
     5 只固定目录猫：2 流浪猫（可直接领养、无前置）+ 3 归属真实用户的自有猫（仅繁育申请）。
     规则全部后端裁决（好感度≥Lv.3、单猫 48h 冷却、并发同意二次复查、后代幂等领取），
     本层只做 API 封装 + 渲染 + 把后端裁决的猫（流浪猫/后代）物化进引擎存档。
     渲染入口：pet-ui.js 的 park tab 渲染后回调 window.catPark.renderSection(container)。
     ============================================================ */
  var PARK_API = '/api/cat-park';
  var parkState = { cats: [], received: [], sent: [], loading: false };

  function parkApi(method, path, body) { return api(method, PARK_API + path, body); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtCooldown(ms) {
    if (ms <= 0) return '';
    var hours = Math.ceil(ms / 3600000);
    if (hours >= 24) { var d = Math.floor(hours / 24), h = hours % 24; return h > 0 ? d + '天' + h + '时' : d + '天'; }
    return hours + '小时';
  }

  // 注入一次样式（作用域限定 .cat-park-social，移动端内嵌视图）
  function parkStyle() {
    if (document.getElementById('cat-park-social-style')) return;
    var css = [
      '.cat-park-social{margin:14px 12px 8px;padding:14px;background:var(--card,#fff);border-radius:16px;box-shadow:0 2px 10px rgba(124,77,255,.08)}',
      '.cat-park-social h3{font-size:15px;margin:0 0 4px;color:var(--ink,#3A2D5C)}',
      '.cat-park-social .cps-sub{font-size:11.5px;color:var(--muted,#8a82a6);margin-bottom:10px}',
      '.cat-park-social .cps-tabs{display:flex;gap:8px;margin-bottom:12px}',
      '.cat-park-social .cps-tab{flex:1;text-align:center;padding:7px 0;border-radius:10px;font-size:12.5px;font-weight:600;background:#F3EEFB;color:#7C4DFF;cursor:pointer;border:none}',
      '.cat-park-social .cps-tab.active{background:#7C4DFF;color:#fff}',
      '.cat-park-social .cps-tab .cps-badge{display:inline-block;min-width:16px;padding:0 4px;border-radius:8px;background:#FF6B9D;color:#fff;font-size:10px;margin-left:3px}',
      '.cat-park-social .cps-cat{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px dashed #EDE6F7}',
      '.cat-park-social .cps-cat:last-child{border-bottom:none}',
      '.cat-park-social .cps-cat-emoji{font-size:26px;width:40px;text-align:center}',
      '.cat-park-social .cps-cat-info{flex:1;min-width:0}',
      '.cat-park-social .cps-cat-name{font-size:13.5px;font-weight:600;color:var(--ink,#3A2D5C)}',
      '.cat-park-social .cps-cat-meta{font-size:11px;color:var(--muted,#8a82a6);margin-top:2px}',
      '.cat-park-social .cps-tag{display:inline-block;padding:1px 7px;border-radius:8px;font-size:10.5px;margin-right:5px}',
      '.cat-park-social .cps-tag.stray{background:#FFF0F5;color:#FF6B9D}',
      '.cat-park-social .cps-tag.owned{background:#EEF4FF;color:#5B8DEF}',
      '.cat-park-social .cps-tag.cd{background:#FFF6E5;color:#E8963C}',
      '.cat-park-social .cps-cat-btns{display:flex;flex-direction:column;gap:6px;align-items:flex-end}',
      '.cat-park-social .cps-btn{padding:6px 12px;border-radius:10px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:#7C4DFF;color:#fff}',
      '.cat-park-social .cps-btn.ghost{background:#F3EEFB;color:#7C4DFF}',
      '.cat-park-social .cps-btn.ok{background:#4CAF50}',
      '.cat-park-social .cps-btn.no{background:#F3EEFB;color:#9a92b5}',
      '.cat-park-social .cps-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.cat-park-social .cps-select{padding:5px 8px;border-radius:9px;border:1px solid #E4DAF5;font-size:11.5px;background:#fff;color:#3A2D5C;max-width:130px}',
      '.cat-park-social .cps-req{padding:10px 0;border-bottom:1px dashed #EDE6F7;font-size:12.5px}',
      '.cat-park-social .cps-req:last-child{border-bottom:none}',
      '.cat-park-social .cps-req-row{display:flex;align-items:center;gap:8px;justify-content:space-between}',
      '.cat-park-social .cps-empty{padding:18px;text-align:center;color:var(--muted,#8a82a6);font-size:12.5px}',
      '.cat-park-social .cps-status{font-size:11px;color:var(--muted,#8a82a6)}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'cat-park-social-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // 我所有成年猫（含好感度不足的，用于弹窗里给出前置引导而非直接隐藏）
  function myAdultCats() {
    if (!window.PET_ENGINE) return [];
    var st = window.PET_ENGINE.getState();
    return (st.cats || []).filter(function (c) { return c.maturityLevel >= 3; });
  }

  function loadParkData() {
    if (parkState.loading) return Promise.resolve();
    parkState.loading = true;
    return Promise.all([
      parkApi('GET', '/cats'),
      parkApi('GET', '/breeding/requests/received'),
      parkApi('GET', '/breeding/requests/sent')
    ]).then(function (rs) {
      parkState.loading = false;
      if (rs[0] && rs[0].code === 200) parkState.cats = rs[0].data || [];
      if (rs[1] && rs[1].code === 200) parkState.received = rs[1].data || [];
      if (rs[2] && rs[2].code === 200) parkState.sent = rs[2].data || [];
    }).catch(function () { parkState.loading = false; });
  }

  // 公园场景猫（canvas 展示）：服务端权威抽取 2 流浪 + 至多 3 他人猫（用户去重、排除自己）。
  // 失败返回 null，调用方保留现有场景不清空。
  function loadScene() {
    return parkApi('GET', '/scene').then(function (res) {
      if (res && res.code === 200) return res.data || [];
      return null;
    });
  }

  // 场景变更后即时刷新 canvas（他人把猫带回家/进入冷却 → 重新抽取）
  function refreshParkScene() {
    if (window.PET_UI && typeof window.PET_UI.refreshParkScene === 'function') {
      try { window.PET_UI.refreshParkScene(); } catch (e) { /* 公园页未打开 */ }
    }
  }

  var parkTab = 'cats';
  function renderSection(container) {
    if (!container || !loggedIn()) return;
    parkStyle();
    var host = document.getElementById('catParkSocial');
    if (!host) {
      host = document.createElement('div');
      host.id = 'catParkSocial';
      container.appendChild(host);
    }
    paintSection(host);
    loadParkData().then(function () { paintSection(host); });
  }

  function paintSection(host) {
    var pendingReceived = parkState.received.filter(function (r) { return r.status === 'pending'; }).length;
    var ownerClaimable = parkState.received.filter(function (r) { return r.status === 'accepted' && !r.ownerClaimedAt; }).length;
    var claimable = parkState.sent.filter(function (r) { return r.status === 'accepted' && !r.claimedAt; }).length;
    var head = '<div class="cps-head"><h3>🌳 猫咪公园 · 社交</h3>'
      + '<div class="cps-sub">流浪猫可直接领养；把你和猫咪的好感度养到 Lv.3 才能放上公园，放上公园后他人可向它申请繁育（繁育同样要求 Lv.3），繁育后 48 小时冷却。</div>'
      + '<div class="cps-tabs">'
      + '<button class="cps-tab' + (parkTab === 'cats' ? ' active' : '') + '" data-tab="cats">🐱 猫咪</button>'
      + '<button class="cps-tab' + (parkTab === 'received' ? ' active' : '') + '" data-tab="received">📩 待处理'
      + ((pendingReceived + ownerClaimable) ? '<span class="cps-badge">' + (pendingReceived + ownerClaimable) + '</span>' : '') + '</button>'
      + '<button class="cps-tab' + (parkTab === 'sent' ? ' active' : '') + '" data-tab="sent">📤 我的申请'
      + (claimable ? '<span class="cps-badge">' + claimable + '</span>' : '') + '</button>'
      + '</div></div>';
    var body;
    if (parkTab === 'cats') body = renderCatsPane();
    else if (parkTab === 'received') body = renderReceivedPane();
    else body = renderSentPane();
    host.className = 'cat-park-social';
    host.innerHTML = head + body;
    bindSection(host);
  }

  function renderCatsPane() {
    if (!parkState.cats.length) return '<div class="cps-empty">公园暂时还没有猫咪，把自己的猫放上来吧～</div>';
    return parkState.cats.map(function (c) {
      var emoji = c.gender === 'female' ? '🐱' : '😺';
      var isStray = c.source === 'official' || c.category === 'stray';
      var meta;
      if (isStray) {
        meta = '<span class="cps-tag stray">流浪猫</span>平台常驻';
      } else {
        meta = '<span class="cps-tag owned">' + (c.isMine ? '我的猫' : '主人 ' + esc(c.ownerNickname || '已注销')) + '</span>'
          + '💕 主人好感 Lv.' + c.affinityLevel;
        if (c.inCooldown) meta += ' <span class="cps-tag cd">冷却 ' + fmtCooldown(c.cooldownRemainingMs) + '</span>';
      }
      var btns = '';
      if (isStray) {
        btns = '<button class="cps-btn" data-act="adopt" data-id="' + c.id + '">🏠 领养</button>';
      } else if (c.isMine) {
        btns = '<span class="cps-status">在公园展示中</span>';
      } else if (c.breedable) {
        btns = '<button class="cps-btn" data-act="breed" data-id="' + c.id + '">🐾 申请繁育</button>';
      } else {
        btns = '<span class="cps-status">' + esc(c.blockedReason || '暂不可繁育') + '</span>';
      }
      return '<div class="cps-cat"><div class="cps-cat-emoji">' + emoji + '</div>'
        + '<div class="cps-cat-info"><div class="cps-cat-name">' + esc(c.name) + '</div>'
        + '<div class="cps-cat-meta">' + meta + '</div></div>'
        + '<div class="cps-cat-btns">' + btns + '</div></div>';
    }).join('');
  }

  function renderReceivedPane() {
    if (!parkState.received.length) return '<div class="cps-empty">暂无收到的繁育申请</div>';
    return parkState.received.map(function (r) {
      var btns;
      if (r.status === 'pending') {
        btns = '<button class="cps-btn ok" data-act="accept" data-id="' + r.id + '">同意</button>'
          + '<button class="cps-btn no" data-act="reject" data-id="' + r.id + '">拒绝</button>';
      } else if (r.status === 'accepted') {
        // 双方各一只：归属方也有一只小猫待领
        btns = r.ownerClaimedAt
          ? '<span class="cps-status">你的小猫已领取 ✓</span>'
          : '<button class="cps-btn ok" data-act="claim" data-id="' + r.id + '">领取我的小猫</button>';
      } else {
        btns = '<span class="cps-status">已拒绝</span>';
      }
      return '<div class="cps-req"><div class="cps-req-row">'
        + '<div><b>' + esc(r.requesterNickname) + '</b> 想和你的「' + esc(r.targetCatName) + '」繁育</div>'
        + '<div style="display:flex;gap:6px">' + btns + '</div></div></div>';
    }).join('');
  }

  function renderSentPane() {
    if (!parkState.sent.length) return '<div class="cps-empty">你还没有发起过繁育申请</div>';
    return parkState.sent.map(function (r) {
      var right;
      if (r.status === 'pending') right = '<span class="cps-status">等待对方回应…</span>';
      else if (r.status === 'rejected') right = '<span class="cps-status">对方婉拒</span>';
      else if (r.claimedAt) right = '<span class="cps-status">你的小猫已领取 ✓</span>';
      else right = '<button class="cps-btn ok" data-act="claim" data-id="' + r.id + '">领取我的小猫</button>';
      return '<div class="cps-req"><div class="cps-req-row">'
        + '<div>向「' + esc(r.targetCatName) + '」的申请</div><div>' + right + '</div></div></div>';
    }).join('');
  }

  function bindSection(host) {
    host.querySelectorAll('.cps-tab').forEach(function (t) {
      t.onclick = function () { parkTab = t.getAttribute('data-tab'); paintSection(host); };
    });
    host.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () { handleParkAction(b.getAttribute('data-act'), Number(b.getAttribute('data-id')), host); };
    });
  }

  function handleParkAction(act, id, host) {
    if (act === 'adopt') return doAdopt(id, host);
    if (act === 'breed') return doBreed(id, host);
    if (act === 'accept') return doHandle(id, 'accept', host);
    if (act === 'reject') return doHandle(id, 'reject', host);
    if (act === 'claim') return doClaim(id, host);
  }

  // 流浪猫领养：无前置，成功后把猫物化进存档（引擎 save 钩子自动防抖回写）
  function doAdopt(catId, host) {
    var cat = parkState.cats.filter(function (c) { return c.id === catId; })[0];
    if (!cat) return;
    if (window.PET_ENGINE && window.PET_ENGINE.isCatAdopted && window.PET_ENGINE.isCatAdopted(cat.breedCatId)) {
      if (window.toast) window.toast('你已经有这只猫咪啦～'); return;
    }
    parkApi('POST', '/cats/' + catId + '/adopt').then(function (res) {
      if (res.code !== 200) { if (window.toast) window.toast(res.msg || '领养失败'); return; }
      var added = window.PET_ENGINE.addCatFromPark(res.data.breedCatId, { gender: res.data.gender });
      if (!added || !added.success) { if (window.toast) window.toast((added && added.msg) || '存档写入失败'); return; }
      if (window.PET_UI && window.PET_UI.render) window.PET_UI.render();
      flush();   // 新猫即时入库（下次进公园/他人查询都能看到）
      if (window.toast) window.toast('🎉 领养成功！' + (res.data.name || '') + ' 已加入你的猫咪队伍～');
    });
  }

  // 繁育申请：先选自己的繁育猫（服务端二次校验归属/成年/好感度/异性/冷却并给明确提示）
  function doBreed(catId, host) {
    var cat = parkState.cats.filter(function (c) { return c.id === catId; })[0];
    openBreedFlow(cat, host);
  }

  // 繁育申请通用流程（社交区列表与 canvas 场景气泡共用）：
  // 先选自己的繁育猫（服务端二次校验归属/成年/好感度/异性/冷却并给明确提示）
  function openBreedFlow(cat, host) {
    if (!cat) return;
    var adults = myAdultCats();
    if (!adults.length) { if (window.toast) window.toast('你还没有成年猫咪，先养大一只再繁育吧～'); return; }
    var targetGender = cat.gender || null;
    var optionsHtml = adults.map(function (c) {
      var reason = '';
      var ok = c.canBreed !== false;
      if (ok && (c.level || 1) < 3) { ok = false; reason = ' · 好感度不足 Lv.3'; }
      // 异性校验：繁育需一公一母，同性别猫不可选
      if (ok && targetGender && c.gender === targetGender) { ok = false; reason = ' · 与目标猫同性'; }
      return '<option value="' + esc(c.uid) + '"' + (ok ? '' : ' disabled') + '>'
        + esc(c.name) + '（Lv.' + (c.level || 1) + (ok ? '' : reason) + '）</option>';
    }).join('');
    // 轻量内联选择弹窗（带下拉），发送前读取选中的繁育猫 uid
    showBreedPicker(cat, optionsHtml, function (uid) {
      if (!uid) { if (window.toast) window.toast('请选择用于繁育的猫咪'); return; }
      parkApi('POST', '/breeding/requests', { targetCatId: cat.id, applicantCatUid: uid }).then(function (res) {
        if (res.code !== 200) { if (window.toast) window.toast(res.msg || '申请失败'); return; }
        if (window.toast) window.toast('📨 已向 ' + (res.data.ownerNickname || '对方') + ' 发送繁育申请，等待回应～');
        loadParkData().then(function () { if (host) paintSection(host); });
        refreshParkScene();   // 目标猫进入申请态后场景资格可能变化
      });
    });
  }

  // canvas 场景气泡点击「申请繁育」：场景猫自带服务端 id/性别/名字
  function sceneBreed(sceneCat) {
    if (!sceneCat || !sceneCat.parkCatId) return;
    openBreedFlow({ id: sceneCat.parkCatId, gender: sceneCat.gender, name: sceneCat.name }, null);
  }

  // 繁育猫选择弹窗（复用 petConfirm 的遮罩风格，但带一个下拉；找不到组件则退化为 prompt）
  function showBreedPicker(cat, optionsHtml, onPick) {
    var mask = document.querySelector('.pet-modal-mask');
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(58,45,92,.42);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = '<div style="background:#fff;border-radius:18px;padding:20px;width:100%;max-width:320px;box-shadow:0 8px 30px rgba(0,0,0,.2)">'
      + '<div style="font-size:15px;font-weight:700;color:#3A2D5C;margin-bottom:6px">🐾 申请与「' + esc(cat ? cat.name : '') + '」繁育</div>'
      + '<div style="font-size:12px;color:#8a82a6;margin-bottom:12px">选择你的一只成年猫咪作为繁育方：</div>'
      + '<select id="cpsBreedSelect" style="width:100%;padding:9px 12px;border-radius:11px;border:1px solid #E4DAF5;font-size:14px;margin-bottom:14px">' + optionsHtml + '</select>'
      + '<div style="display:flex;gap:10px">'
      + '<button id="cpsBreedCancel" style="flex:1;padding:10px;border-radius:11px;border:none;background:#F3EEFB;color:#7C4DFF;font-weight:600">取消</button>'
      + '<button id="cpsBreedOk" style="flex:1;padding:10px;border-radius:11px;border:none;background:#7C4DFF;color:#fff;font-weight:600">发送申请</button>'
      + '</div></div>';
    (mask || document.body).appendChild(overlay);
    overlay.querySelector('#cpsBreedCancel').onclick = function () { overlay.remove(); };
    overlay.querySelector('#cpsBreedOk').onclick = function () {
      var uid = overlay.querySelector('#cpsBreedSelect').value;
      overlay.remove();
      onPick(uid);
    };
  }

  function doHandle(reqId, action, host) {
    parkApi('POST', '/breeding/requests/' + reqId + '/' + action).then(function (res) {
      if (res.code !== 200) { if (window.toast) window.toast(res.msg || '操作失败'); return; }
      // 同意时后端冷却复查可能拦下并自动拒绝（status=rejected），如实反馈而非误报已同意
      if (action === 'accept' && res.data && res.data.status === 'rejected') {
        if (window.toast) window.toast('⚠️ ' + (res.data.msg || '猫咪进入冷却期，申请已自动拒绝'));
      } else if (window.toast) {
        window.toast(action === 'accept' ? '✅ 已同意繁育，已通知对方领取后代' : '已拒绝该申请');
      }
      loadParkData().then(function () { paintSection(host); });
      refreshParkScene();   // 同意后目标猫进入 48h 冷却，场景资格即时刷新
    });
  }

  // 领取后代：幂等，成功后物化小猫进存档
  function doClaim(reqId, host) {
    parkApi('POST', '/breeding/requests/' + reqId + '/claim').then(function (res) {
      if (res.code !== 200) { if (window.toast) window.toast(res.msg || '领取失败'); return; }
      var d = res.data;
      var parentUid = d.applicantCatUid;
      var added = window.PET_ENGINE.addCatFromPark(d.offspringBreedId, {
        isKitten: true,
        parentUids: [parentUid, 'park_' + d.targetCatName],
        parentOwnerNames: ['我', d.targetCatName]
      });
      if (!added || !added.success) { if (window.toast) window.toast((added && added.msg) || '后代写入失败'); return; }
      if (window.PET_UI && window.PET_UI.render) window.PET_UI.render();
      flush();   // 后代即时入库
      if (window.toast) window.toast('🎉 繁育成功！小猫已加入你的猫咪队伍～');
      loadParkData().then(function () { paintSection(host); });
    });
  }

  window.catCabinFlush = flush;   // 公园寄养/领养等关键动作后即时回写（消除 5s 防抖延迟）

  /* 「看看猫咪在想什么」服务端权威 6h 冷却：占位成功 allowed=true；
     冷却中 allowed=false + cooldownMs（剩余毫秒）。未登录/网络失败返回 code!=200。 */
  window.catCabinClaimThought = function () { return api('POST', API_THOUGHT, {}); };

  window.catPark = {
    renderSection: renderSection,
    refresh: function () { return loadParkData(); },
    loadScene: loadScene,
    sceneBreed: sceneBreed
  };

  /* 供主文件 go() 调用；桌面端与移动端均可进入（2026-10-12 取消「仅移动端」限制，
     桌面内嵌布局见 cat-cabin.css 的 @media(min-width:769px)） */
  window.catCabinEnter = function () {
    /* P2 金币合并：coins=真实蛋蛋币余额，必须登录后才进。
       登录门在主文件 go() 里（与 mine/lab/publish 同款）；这里是兜底。 */
    if (!loggedIn()) {
      if (window.toast) window.toast('请先登录后再进入猫咪小屋～');
      return;
    }
    ensureEngine().then(enter).catch(function (e) {
      if (window.toast) window.toast('猫咪小屋加载失败，请稍后再试');
      if (window.console) console.error(e);
    });
  };
  window.catCabinLeave = leave;
})();
