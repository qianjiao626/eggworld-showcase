/* ============================================================
   蛋蛋世界 · 实验室.beta「宠物系统 v2.1（简化版）」（外联 JS）
   循环：赚币 → 商店买食物/玩具 → 喂食/互动 → 属性达标进化 → 图鉴收集
   · 扣币走后端 /api/pets/buy（PointService，type=spend）
   · 宠物/背包状态落库（换设备不丢），前端只做展示与交互
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var state = { loaded: false, shop: null, pets: [], activePet: null, tab: 'pets' };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function toast(m) { if (typeof window.toast === 'function') window.toast(m); else window.alert(m); }
  function api(path, method, body) {
    var headers = {}; var token = sessionStorage.getItem('token');
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body != null) headers['Content-Type'] = 'application/json';
    return fetch((window.API_BASE || '') + path, { method: method || 'GET', headers: headers, body: body == null ? undefined : JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function needLogin() { if (!window.USER || !window.USER.registered) { toast('请先登录'); return true; } return false; }

  var ATTR = { grass: '草木', fire: '火焰', water: '水系', electric: '电气', rock: '岩石', ghost: '幽灵', light: '光明', mystic: '神秘' };

  function load() {
    state.tab = 'pets';
    render();
    api('/api/pets/shop').then(function (r) { if (r && r.code === 200) state.shop = r.data; render(); });
    if (window.USER && window.USER.registered) refreshPets();
    state.loaded = true;
  }
  function refreshPets() {
    api('/api/pets/mine').then(function (r) { if (r && r.code === 200) { state.pets = r.data || []; if (state.activePet == null && state.pets.length) state.activePet = state.pets[0].id; render(); } });
  }

  function bar(label, v, max) { var pct = Math.max(0, Math.min(100, (v / (max || 100)) * 100)); return '<div class="pet-bar"><span class="pet-bar-l">' + label + '</span><div class="pet-bar-track"><i style="width:' + pct + '%"></i></div><span class="pet-bar-v">' + v + '</span></div>'; }

  function petCard(pet, active) {
    var stats = pet.stats || {};
    var total = Object.keys(stats).reduce(function (a, k) { return a + (Number(stats[k]) || 0); }, 0);
    var attrBars = Object.keys(ATTR).map(function (k) { return '<span class="pet-attr"><em>' + ATTR[k] + '</em>' + (stats[k] || 0) + '</span>'; }).join('');
    return '<div class="pet-card' + (active ? ' active' : '') + '" onclick="petSelect(' + pet.id + ')">' +
      '<div class="pet-emoji">' + esc(pet.emoji || '🥚') + (pet.shiny ? ' ✨' : '') + '</div>' +
      '<div class="pet-name">' + esc(pet.name || pet.speciesName || '宠物') + '</div>' +
      '<div class="pet-stage">' + (['蛋蛋期', '基础形态', '一阶进化', '二阶进化', '究极形态'][pet.stage] || ('阶段' + pet.stage)) + '</div>' +
      '<div class="pet-total">属性总值 ' + total + ' · 亲密 ' + pet.intimacy + '</div>' +
      '</div>';
  }

  function render() {
    var body = el('petBody');
    if (!body) return;
    var tabs = '<div class="pet-tabs">' +
      ['pets|我的宠物', 'shop|商店', 'dex|图鉴'].map(function (t) { var k = t.split('|')[0]; return '<button type="button" class="pet-tab' + (state.tab === k ? ' active' : '') + '" onclick="petTab(\'' + k + '\')">' + t.split('|')[1] + '</button>'; }).join('') +
      '</div>';
    var content = state.tab === 'shop' ? renderShop() : state.tab === 'dex' ? renderDex() : renderPets();
    body.innerHTML = tabs + content;
  }

  function renderPets() {
    if (!window.USER || !window.USER.registered) return '<div class="pet-empty">登录后即可领养宠物、开始养成～</div>';
    var pets = state.pets || [];
    var grid = pets.length
      ? '<div class="pet-grid">' + pets.map(function (p) { return petCard(p, p.id === state.activePet); }).join('') + '</div>'
      : '<div class="pet-empty">还没有宠物。先去商店买个普通蛋孵化吧～</div>';
    var active = pets.find(function (p) { return p.id === state.activePet; });
    var detail = active ? renderPetDetail(active) : '';
    return '<div class="pet-toolbar"><button type="button" class="btn btn-primary" onclick="petHatch(false)">🥚 孵化普通蛋</button><button type="button" class="btn btn-ghost" onclick="petHatch(true)">✨ 孵化稀有蛋</button></div>' + grid + detail;
  }

  function renderPetDetail(pet) {
    var stats = pet.stats || {};
    return '<div class="pet-detail">' +
      '<div class="pet-detail-head"><span class="pet-detail-emoji">' + esc(pet.emoji || '🥚') + '</span><div><h4>' + esc(pet.name || pet.speciesName) + (pet.shiny ? ' ✨闪光' : '') + '</h4>' +
      '<p>阶段：' + (['蛋蛋期', '基础形态', '一阶进化', '二阶进化', '究极形态'][pet.stage] || pet.stage) + (pet.hasNext ? ' · 可继续进化' : ' · 已到顶') + '</p></div>' +
      '<button type="button" class="btn btn-ghost" onclick="petRename(' + pet.id + ')">改名</button></div>' +
      '<div class="pet-needs">' + bar('饱食', pet.satiety) + bar('心情', pet.mood) + bar('活力', pet.energy) + bar('清洁', pet.cleanliness) + '</div>' +
      '<div class="pet-attrs">' + Object.keys(ATTR).map(function (k) { return '<span class="pet-attr"><em>' + ATTR[k] + '</em>' + (stats[k] || 0) + '</span>'; }).join('') + '</div>' +
      '<div class="pet-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="petInteract(' + pet.id + ',\'pet\')">🤚 抚摸</button>' +
      '<button type="button" class="btn btn-ghost" onclick="petInteract(' + pet.id + ',\'play\')">🎾 玩耍</button>' +
      '<button type="button" class="btn btn-ghost" onclick="petInteract(' + pet.id + ',\'clean\')">🛁 洗澡</button>' +
      '</div>' +
      '<div class="pet-feed"><b>喂食</b><div class="pet-feed-list">' +
      ((state.shop && state.shop.foods) || []).map(function (f) { return '<button type="button" class="pet-food" title="' + esc(f.name) + ' +' + f.attrValue + ' ' + ATTR[f.attr] + '" onclick="petFeed(' + pet.id + ',\'' + f.id + '\')">' + esc(f.icon) + '<small>' + esc(f.name) + '</small></button>'; }).join('') +
      '</div></div></div>';
  }

  function renderShop() {
    if (!state.shop) return '<div class="pet-empty">商店加载中…</div>';
    var foods = state.shop.foods.map(function (f) { return shopItem(f); }).join('');
    var toys = state.shop.toys.map(function (t) { return shopItem(t); }).join('');
    var items = state.shop.items.map(function (i) { return shopItem(i); }).join('');
    return '<div class="pet-shop"><h4>🍽️ 食物</h4><div class="pet-shop-grid">' + foods + '</div>' +
      '<h4>🧸 玩具</h4><div class="pet-shop-grid">' + toys + '</div>' +
      '<h4>🎁 道具</h4><div class="pet-shop-grid">' + items + '</div></div>';
  }

  function shopItem(it) {
    return '<button type="button" class="pet-shop-item" onclick="petBuy(\'' + it.id + '\')"><span class="pet-shop-ico">' + esc(it.icon) + '</span><span class="pet-shop-name">' + esc(it.name) + '</span><span class="pet-shop-price">🪙 ' + it.price + '</span></button>';
  }

  function renderDex() {
    var owned = {}; (state.pets || []).forEach(function (p) { owned[p.speciesId] = true; });
    return '<div class="pet-dex"><p>已收录 ' + Object.keys(owned).length + ' 种。收集越多，越接近全图鉴～</p><div class="pet-dex-grid">' +
      (state.pets || []).map(function (p) { return '<div class="pet-dex-item">' + esc(p.emoji || '🥚') + '<small>' + esc(p.speciesName || p.name) + '</small></div>'; }).join('') +
      '</div></div>';
  }

  /* ---------- actions ---------- */
  function tab(k) { state.tab = k; render(); }
  function select(id) { state.activePet = id; render(); }
  function buy(itemId) {
    if (needLogin()) return;
    api('/api/pets/buy', 'POST', { itemId: itemId, qty: 1 }).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '购买失败'); return; }
      if (window.USER && r.data && r.data.balance != null) window.USER.points = r.data.balance;
      toast('购买成功，余额 ' + (r.data.balance) + ' 蛋蛋币');
    });
  }
  function hatch(rare) {
    if (needLogin()) return;
    api('/api/pets/hatch', 'POST', { rare: !!rare }).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '孵化失败'); return; }
      toast('孵化成功：' + (r.data.name || r.data.speciesName));
      refreshPets();
    });
  }
  function feed(petId, foodId) {
    api('/api/pets/' + petId + '/feed', 'POST', { foodId: foodId }).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '喂食失败'); return; }
      replacePet(r.data); toast('喂食成功 +1'); 
    });
  }
  function interact(petId, action) {
    api('/api/pets/' + petId + '/interact', 'POST', { action: action }).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '互动失败'); return; }
      replacePet(r.data);
    });
  }
  function rename(petId) {
    var name = window.prompt('给宠物起个名字（1–20 字）：', '');
    if (name == null) return;
    api('/api/pets/' + petId + '/rename', 'POST', { nickname: name }).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '改名失败'); return; }
      refreshPets();
    });
  }
  function replacePet(p) { var i = (state.pets || []).findIndex(function (x) { return x.id === p.id; }); if (i >= 0) state.pets[i] = p; else state.pets.push(p); state.activePet = p.id; render(); }

  window.petSystemLoad = load;
  window.petTab = tab;
  window.petSelect = select;
  window.petBuy = buy;
  window.petHatch = hatch;
  window.petFeed = feed;
  window.petInteract = interact;
  window.petRename = rename;
})();
