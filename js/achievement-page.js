/* ============================================================
 * 蛋蛋世界 · 成就殿堂 / 我的装扮（页面逻辑）
 *
 * 状态：已从 growth-schoolv3.html 抽离，主文件当前不加载本文件。
 * 原因：线上数据库尚未执行 backend/sql/migrate-achievement.sql，
 *       成就相关接口会报错，故整条链路暂时下线。
 * 恢复：在 growth-schoolv3.html 中放开 achievement-page.css 与本文件的引用，
 *       并把脚本里的 ACH_PAGE_ENABLED 改回 true、删掉隐藏导航项的样式规则。
 *
 * 依赖（恢复时需一并加载）：
 *   js/deco.css、js/deco.js、js/deco-integration.js
 * 数据源：
 *   GET  /api/achievements         全部成就 + 我的进度 + 解锁状态
 *   GET  /api/achievements/unread  未读解锁（驱动红点与解锁弹窗）
 *   POST /api/achievements/{id}/read
 *   GET  /api/deco/catalog         装扮图鉴（全部特效/称号 + 是否已解锁）
 *   GET  /api/users/me/equip       我的当前穿戴
 *   PUT  /api/users/me/equip       穿戴 / 卸下
 * ============================================================ */
var ACH_CATS = [
  ['all','全部'],['checkin','签到'],['publish','发布任务'],['complete','完成任务'],
  ['team','组队共创'],['rating','口碑评价'],['gossip','求知问答'],['invite','邀约好友'],
  ['complaint','大学吐槽'],['meta','综合成就']
];
var ACH_STATE = { list: [], cur: 'all', catalog: null, equip: {}, inited: false };
var SLOT_LABEL = { aura:'光环', cloak:'披风', outfit:'服装', frame:'边框', charm:'挂件', title:'称号', skin:'皮肤' };

function emptyDeco(){
  return { aura:null, cloak:null, outfit:null, frame:null, charm:null, title:null, skin:null, titleName:null, titleStyle:null };
}

/** 拉取成就页全部数据并渲染 */
async function loadAchievementsPage(){
  if(!USER.registered){
    var box = document.getElementById('achList');
    if(box) box.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--muted);font-size:14px">请先登录后查看成就</div>';
    return;
  }
  if(ACH_STATE.inited){ renderAchList(); return; }
  var requestedUser = USER.id;
  var rList = await apiGet('/api/achievements');
  if(!USER.registered || USER.id !== requestedUser) return;
  if(rList.code !== 200){ toast(rList.msg || '成就加载失败，请重试'); return; }
  ACH_STATE.list = (rList.code === 200 && rList.data) || [];
  var rCat = await apiGet('/api/deco/catalog');
  ACH_STATE.catalog = (rCat.code === 200 && rCat.data) || null;
  var rEq = await apiGet('/api/users/me/equip');
  if(!USER.registered || USER.id !== requestedUser) return;
  ACH_STATE.equip = (rEq.code === 200 && rEq.data) ? rEq.data : emptyDeco();
  if(!ACH_STATE.equip.titleName) ACH_STATE.equip.titleName = null;

  ACH_STATE.inited = rCat.code === 200 && rEq.code === 200;
  renderAchCats();
  renderAchList();
  renderDecoPane();
  syncDecoFxToggle();
}

function switchAchTab(t){
  var tabs = document.querySelectorAll('#page-achievements .ach-tab');
  tabs.forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-ach-tab') === t); });
  var lp = document.getElementById('achPane');
  var dp = document.getElementById('decoPane');
  if(lp) lp.style.display = (t === 'list') ? '' : 'none';
  if(dp) dp.style.display = (t === 'deco') ? '' : 'none';
}

function renderAchCats(){
  var host = document.getElementById('achCatRow');
  if(!host) return;
  host.innerHTML = ACH_CATS.map(function(c){
    return '<button type="button" class="cat-chip' + (ACH_STATE.cur === c[0] ? ' on' : '') +
      '" onclick="setAchCat(\'' + c[0] + '\')">' + c[1] + '</button>';
  }).join('');
}

function setAchCat(c){ ACH_STATE.cur = c; renderAchCats(); renderAchList(); }

function renderAchList(){
  var host = document.getElementById('achList');
  if(!host) return;
  var list = ACH_STATE.list.filter(function(a){ return ACH_STATE.cur === 'all' || a.category === ACH_STATE.cur; });
  if(!list.length){
    host.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--muted);font-size:14px">该分类下暂无成就</div>';
    return;
  }
  host.innerHTML = list.map(function(a){
    var done = !!a.unlocked;
    var pct = done ? 100 : Math.min(99, Math.round((a.progress || 0) / Math.max(1, a.target) * 100));
    /* 预览该成就奖励的特效（走 light 模式，避免 30 张卡片同时跑全效动效） */
    var prev = { aura:null, cloak:null, outfit:null, frame:null, charm:null, skin:null };
    if(a.rewardEffectKey && a.rewardEffectSlot) prev[a.rewardEffectSlot] = a.rewardEffectKey;
    var prevHtml = decoBuild({img:charImgForSelf(),deco:prev,size:'deco-md',light:true});

    var foot = '<span class="ach-pill ' + (done ? 'on' : 'off') + '">' + (done ? '已解锁' : '未解锁') + '</span>';
    if(a.rewardEffectName) foot += '<span>特效 · ' + escapeHtml(a.rewardEffectName) + '</span>';
    if(a.rewardTitleName){
      foot += decoTitleMarkup({titleName:a.rewardTitleName,titleStyle:a.rewardTitleStyle});
    }
    return '<div class="ach-card ' + (done ? 'done' : 'locked') + '">' + prevHtml +
      '<div class="ach-body">' +
        '<div class="ach-name">' + escapeHtml(a.name) + '</div>' +
        '<div class="ach-desc">' + escapeHtml(a.description) + '</div>' +
        '<div class="ach-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="ach-progress">' + Math.max(0, Number(a.progress) || 0) + ' / ' + Math.max(1, Number(a.target) || 1) + '</div>' +
        '<div class="ach-foot">' + foot + '</div>' +
      '</div></div>';
  }).join('');
  renderAchStat();
}

function renderAchStat(){
  var host = document.getElementById('achStat');
  if(!host) return;
  var total = ACH_STATE.list.length;
  var done = ACH_STATE.list.filter(function(a){ return a.unlocked; }).length;
  var cat = ACH_STATE.catalog;
  host.innerHTML =
    '<div><b>' + done + ' / ' + total + '</b><br><span>成就解锁</span></div>' +
    (cat ? '<div><b>' + cat.unlockedEffects + ' / ' + cat.totalEffects + '</b><br><span>特效收集</span></div>' +
           '<div><b>' + cat.unlockedTitles + ' / ' + cat.totalTitles + '</b><br><span>称号收集</span></div>' : '');
}

/* ---------- 我的装扮 ---------- */

function renderDecoPane(){
  var prev = document.getElementById('decoPreview');
  if(prev){
    var img = charImgForSelf();
    prev.className = '';
    prev.innerHTML = decoBuild({ img: img, deco: ACH_STATE.equip, size: 'deco-lg', field: true });
  }
  var nameEl = document.getElementById('decoPreviewName');
  if(nameEl){
    // 称号由装扮组件显示；此处保留用户昵称，避免重复称号。
    nameEl.textContent = USER.nickname || '我的形象';
  }
  var descEl = document.getElementById('decoPreviewDesc');
  if(descEl) descEl.textContent = decoSummary(ACH_STATE.equip);

  var host = document.getElementById('decoSlots');
  if(!host) return;
  if(!USER.registered){
    host.innerHTML = '<div style="color:var(--muted);font-size:13px">请先登录后装扮</div>';
    return;
  }
  var cat = ACH_STATE.catalog;
  var order = ['aura','cloak','outfit','frame','charm','title','skin'];
  host.replaceChildren();
  order.forEach(function(slot){
    var row = document.createElement('div'); row.className = 'deco-srow';
    var label = document.createElement('span'); label.className = 'deco-slbl'; label.textContent = SLOT_LABEL[slot];
    var options = document.createElement('div'); options.className = 'deco-opts';
    function option(key, name){
      var button = document.createElement('button'); button.type = 'button'; button.className = 'deco-opt';
      button.classList.toggle('on', (ACH_STATE.equip[slot] || null) === key);
      button.textContent = name; button.addEventListener('click', function(){ doEquip(slot,key); }); options.append(button);
    }
    option(null, '不佩戴');
    if(cat){
      var src = slot === 'title' ? (cat.titles || []) : (cat.effects || []).filter(function(e){return e.slot === slot;});
      src.filter(function(item){return item.unlocked;}).forEach(function(item){ option(item.key, item.name); });
    }
    row.append(label,options); host.append(row);
  });
}

function decoSummary(deco){
  if(!deco) return '未穿戴任何装扮';
  var parts = [];
  ['aura','cloak','outfit','frame','charm'].forEach(function(s){
    if(deco[s]) parts.push(SLOT_LABEL[s]);
  });
  if(deco.title) parts.push('称号·' + (deco.titleName || ''));
  if(deco.skin) parts.push('皮肤');
  return parts.length ? ('已穿戴：' + parts.join(' · ')) : '未穿戴任何装扮';
}

/** 我的角色立绘路径（管理员用隐士蛋） */
function charImgForSelf(){
  if(USER.role === 'admin' || USER.isAdmin) return 'assets/char-eggy-hermit.jpg';
  var ch = typeof CHAR_STATE !== 'undefined' && CHAR_STATE && CHAR_STATE.characters && CHAR_STATE.characters[CHAR_STATE.current];
  return (ch && ch.img) || charImg('life');
}

var equipBusy = false;
async function doEquip(slot, key){
  if(!USER.registered){ toast('请先登录'); return; }
  if(equipBusy) return;
  var requestedUser = USER.id;
  equipBusy = true;
  try {
    var res = await apiPut('/api/users/me/equip', { slot: slot, key: key || null });
    if(!USER.registered || USER.id !== requestedUser) return;
    if(res.code !== 200){ toast(res.msg || '装扮失败'); return; }
    ACH_STATE.equip = res.data || emptyDeco();
    USER.deco = ACH_STATE.equip;
    renderDecoPane();
    mountSelfDeco();
    toast('已更新装扮');
  } finally { equipBusy = false; }
}

/* ---------- 特效降级开关 ---------- */

function syncDecoFxToggle(){
  var el = document.getElementById('decoFxToggle');
  if(el) el.checked = decoFxEnabled();
}

function onDecoFxToggle(on){
  setDecoFx(!!on);
  toast(on ? '已开启装饰动效' : '已关闭装饰动效');
}

/* ---------- 解锁红点 + 解锁弹窗 ---------- */

async function updateAchBadge(){
  /* 成就殿堂暂时下线：不再拉未读、不再弹解锁弹窗与红点（ACH_PAGE_ENABLED 见导航绑定处） */
  if(!ACH_PAGE_ENABLED) return;
  var badge = document.getElementById('achUnreadBadge');
  if(!badge) return;
  if(!USER.registered){ badge.hidden = true; return; }
  var requestedUser = USER.id;
  var res = await apiGet('/api/achievements/unread');
  if(!USER.registered || USER.id !== requestedUser || res.code !== 200) return;
  var list = (res.code === 200 && res.data) || [];
  badge.hidden = list.length === 0;
  badge.textContent = list.length > 9 ? '9+' : String(list.length);
  if(list.length) showUnlockQueue(list);
}

var UNLOCK_QUEUE = [];
function showUnlockQueue(list){
  var known = new Set(UNLOCK_QUEUE.map(function(x){return String(x.id);}));
  var modal = document.getElementById('achUnlockModal');
  if(modal && modal.style.display === 'flex') known.add(modal.getAttribute('data-uaid'));
  list.forEach(function(x){ if(!known.has(String(x.id))){known.add(String(x.id));UNLOCK_QUEUE.push(x);} });
  if(document.getElementById('achUnlockModal') &&
     document.getElementById('achUnlockModal').style.display === 'flex') return;
  showNextUnlock();
}

function showNextUnlock(){
  var modal = document.getElementById('achUnlockModal');
  if(!modal) return;
  var item = UNLOCK_QUEUE.shift();
  if(!item){ modal.style.display = 'none'; modal.removeAttribute('data-uaid'); return; }

  modal.style.display = 'flex';
  modal.setAttribute('data-uaid', item.id);
  var prev = document.getElementById('achUnlockPreview');
  if(prev){
    var deco = emptyDeco();
    if(item.rewardEffectKey && item.rewardEffectSlot) deco[item.rewardEffectSlot] = item.rewardEffectKey;
    deco.titleName = item.rewardTitleName || null;
    deco.titleStyle = item.rewardTitleStyle || null;
    prev.className = '';
    prev.innerHTML = decoBuild({ img: charImgForSelf(), deco: deco, size: 'deco-lg', field: true });
  }
  var set = function(id, txt){ var el = document.getElementById(id); if(el) el.textContent = txt; };
  set('achUnlockName', item.name || '新成就');
  set('achUnlockDesc', item.description || '');
  var gains = [];
  if(item.rewardEffectName) gains.push('特效 · ' + item.rewardEffectName);
  if(item.rewardTitleName) gains.push('称号 · ' + item.rewardTitleName);
  set('achUnlockGains', gains.length ? ('获得 ' + gains.join('　')) : '获得成就徽章');
}

async function closeUnlockModal(){
  var modal = document.getElementById('achUnlockModal');
  if(!modal) return;
  var id = modal.getAttribute('data-uaid');
  if(modal.dataset.reading) return;
  modal.dataset.reading = '1';
  try {
    if(id){ var read = await apiPost('/api/achievements/' + id + '/read', {}); if(read.code !== 200){ toast('标记已读失败，请重试'); return; } }
  } finally { delete modal.dataset.reading; }
  modal.style.display = 'none';
  modal.removeAttribute('data-uaid');
  var badge = document.getElementById('achUnreadBadge');
  if(badge){badge.hidden = !UNLOCK_QUEUE.length; badge.textContent = String(UNLOCK_QUEUE.length);}
  /* 解锁后成就列表与装扮选项会变化，标记为待刷新 */
  ACH_STATE.inited = false;
  if(document.getElementById('page-achievements') &&
     document.getElementById('page-achievements').classList.contains('active')){
    loadAchievementsPage();
  }
  showNextUnlock();
}

/* ---------- 全站装扮挂载 ---------- */

/** 把「自己」的装扮挂到侧边栏头像与个人中心 */
function resetAchievementSession(){
  if(typeof ACH_STATE !== 'undefined' && ACH_STATE){ACH_STATE.inited=false;ACH_STATE.list=[];ACH_STATE.catalog=null;ACH_STATE.equip=emptyDeco();}
  UNLOCK_QUEUE=[];
  var modal=document.getElementById('achUnlockModal');if(modal){modal.style.display='none';modal.removeAttribute('data-uaid');}
  var badge=document.getElementById('achUnreadBadge');if(badge)badge.hidden=true;
}
function mountSelfDeco(){
  var deco = USER.deco;
  var avatar = document.getElementById('userAvatar');
  var side = document.getElementById('sidebarDecoHost');
  if(avatar && !side){
    side = document.createElement('span'); side.id = 'sidebarDecoHost'; avatar.after(side);
  }
  if(side){
    avatar.style.display = USER.registered ? 'none' : '';
    side.hidden = !USER.registered;
    if(USER.registered) decoMount(side, {img:charImgForSelf(),deco:deco,size:'deco-sm',light:false});
    else side.replaceChildren();
  }
}
