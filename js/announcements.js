/* 全站公告：
   ① 顶部一行胶囊（挂在各页 topbar 动作区，「新手指引」与「邀请赚币」之间）——不再独占一行；
   ② 查看公告对话框（web 两栏阅读 / 移动全屏阅读，含主管理员管理视图）；
   ③ 登录进系统后弹一次最新公告；点「我知道了」/关闭后记住该公告，直到管理员发布新公告才再弹。
   本地记忆只用 localStorage（已读锚点），隐私模式/禁用时静默降级，不影响读取。 */
(function (global) {
  'use strict';
  var KEY_SEEN = 'eggworld.announcement.seenId';
  var KEY_POPUP_ACK = 'eggworld.announcement.popupAckId';

  var page = 1, pages = 1, latestId = null, selectedId = null, records = [], managed = [], editing = null;
  var saving = false, removing = false, view = 'list';   // list | detail | manage
  var latestRecord = null, chipsFailed = false, chips = [];

  function el(id) { return document.getElementById(id); }
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); }
  function lines(value) { return escape(value).replace(/\r?\n/g, '<br>'); }
  function date(value) { return escape(String(value || '').replace('T',' ').slice(0,16)); }
  function idOf(value) { var n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function canEdit() { return !!(global.USER && global.USER.role === 'admin'); }
  function status(message) { var node = el('announcementStatus'); if (node) node.textContent = message; }

  /* ===== 已读锚点（localStorage；任何异常都不抛出） ===== */
  function store(key, value) {
    var s;
    try { s = global.localStorage; } catch (error) { s = null; }
    try {
      if (!s) return value === undefined ? null : value;
      if (value === undefined) return s.getItem(key);
      if (value === null) { s.removeItem(key); return null; }
      s.setItem(key, String(value));
      return value;
    } catch (error) { return value === undefined ? null : value; }
  }
  function seenId() { return idOf(store(KEY_SEEN)); }
  function markSeen(id) { if (idOf(id)) store(KEY_SEEN, idOf(id)); }
  /* 弹窗确认锚点：按用户存（同一浏览器多账号互不影响），值为最后确认过的公告 ID */
  function popupAckKey() {
    var uid = global.USER && Number(global.USER.id);
    return Number.isSafeInteger(uid) && uid > 0 ? KEY_POPUP_ACK + '.' + uid : KEY_POPUP_ACK;
  }
  function popupAckedId() { return idOf(store(popupAckKey())); }
  function shouldPopup(id) {
    var acked = popupAckedId();
    return !!id && !(acked && id <= acked);   // 只有比已确认公告更新时才再弹
  }
  function ackPopupFor(id) { if (idOf(id)) store(popupAckKey(), idOf(id)); }
  function hasNew() { return !!(latestId && latestId !== seenId()); }
  function dot() {
    return hasNew() ? '<i class="announcement-dot" aria-hidden="true"></i><span class="announcement-sr">有新公告</span>' : '';
  }

  /* ===== ① 顶部一行胶囊（仅宽屏） =====
     插进各页 .topbar 的动作区（「新手指引」之后，即新手指引与邀请赚币之间；没有那两个按钮的
     页面放在铃铛之前）。
     移动端不放入口（窄屏那行本来就会溢出被裁掉），移动端只在登录时弹一次公告弹窗。 */
  function newChip() {
    var chip = document.createElement ? document.createElement('button') : null;
    if (!chip) return null;
    chip.type = 'button';
    chip.className = 'announcement-chip';
    chip.setAttribute('data-announcement-action', 'open');
    chip.setAttribute('aria-label', '查看全站公告');
    return chip;
  }
  function mountChips() {
    var slots = document.querySelectorAll ? document.querySelectorAll('.topbar .right') : [];
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (!slot) continue;
      if (slot.querySelector && slot.querySelector('.announcement-chip')) continue;
      var chip = newChip();
      if (!chip) continue;
      var guide = slot.querySelector ? slot.querySelector('[onclick="openOnboard()"]') : null;
      var bell = slot.querySelector ? slot.querySelector('.bell-wrap') : null;
      if (guide && guide.parentNode === slot) slot.insertBefore(chip, guide.nextSibling);
      else if (bell && bell.parentNode === slot) slot.insertBefore(chip, bell);
      else slot.appendChild(chip);
    }
    chips = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('.announcement-chip')) : [];
  }
  function renderChips() {
    if (!chips.length) mountChips();
    var show = !!latestRecord || chipsFailed || canEdit();
    var html = latestRecord
      ? '<span class="announcement-chip-mark">' + dot() + '📢 公告</span>' +
        '<span class="announcement-chip-title">' + escape(latestRecord.title) + '</span>'
      : '<span class="announcement-chip-mark">📢 公告</span>' +
        '<span class="announcement-chip-title">' + (chipsFailed ? '公告加载失败' : (canEdit() ? '还没有公告' : '暂无公告')) + '</span>';
    for (var i = 0; i < chips.length; i++) {
      chips[i].hidden = !show;
      chips[i].innerHTML = html;
    }
  }
  async function loadLatest() {
    if (!chips.length) mountChips();
    try {
      var res = await global.apiGet('/api/announcements?page=1&size=1');
      if (res.code !== 200) throw new Error('公告加载失败');
      latestRecord = (res.data && res.data.records || [])[0] || null;
      chipsFailed = false;
      latestId = latestRecord ? idOf(latestRecord.id) : null;
      if (latestId && !seenId()) markSeen(latestId);   // 首次访问：当前这条不算「新」
    } catch (error) {
      latestRecord = null;
      latestId = null;
      chipsFailed = true;                              // 读不到也要留出入口，点进去可重试
    }
    renderChips();
    return latestRecord;
  }

  /* ===== ② 查看公告：列表 / 详情 ===== */
  function renderCard(a, active) {
    var id = idOf(a.id);
    return '<button type="button" class="announcement-list-item' + (active ? ' is-active' : '') + '"' +
      ' data-announcement-action="detail" data-id="' + id + '"' + (active ? ' aria-current="true"' : '') + '>' +
      '<strong>' + escape(a.title) + '</strong>' +
      '<span class="announcement-list-meta">' + escape(a.publisherNickname || '已注销用户') + ' · ' + date(a.publishedAt || a.published_at) + '</span>' +
      '</button>';
  }
  function renderDetail(a) {
    return '<h3 class="announcement-detail-title">' + escape(a.title) + '</h3>' +
      '<p class="announcement-detail-meta">由 ' + escape(a.publisherNickname || '已注销用户') + ' 发布 · ' + date(a.publishedAt || a.published_at) + '</p>' +
      '<div class="announcement-detail-body">' + lines(a.content) + '</div>';
  }
  function renderList() {
    var box = el('announcementHistory'); if (!box) return;
    if (!records.length) { box.innerHTML = '<li class="announcement-empty">暂无公告</li>'; return; }
    box.innerHTML = records.map(function (a) {
      return '<li>' + renderCard(a, idOf(a.id) === selectedId) + '</li>';
    }).join('');
  }
  async function loadHistory() {
    var box = el('announcementHistory'); if (!box) return;
    box.innerHTML = '<li class="announcement-skeleton" aria-hidden="true"></li><li class="announcement-skeleton" aria-hidden="true"></li>';
    try {
      var res = await global.apiGet('/api/announcements?page=' + page + '&size=10');
      if (res.code !== 200) throw new Error(res.msg || '读取公告失败');
      pages = Math.max(1, Number(res.data.pages) || 1);
      records = res.data.records || [];
      renderList();
      var label = el('announcementPageLabel'); if (label) label.textContent = '第 ' + page + ' / ' + pages + ' 页';
      // 首页最新一条视为「已读」→ 胶囊上的圆点消失（第二页起不改变已读锚点）
      if (page === 1) {
        var newest = idOf((records[0] || {}).id);
        if (newest && newest !== seenId()) { markSeen(newest); return loadLatest(); }
      }
    } catch (error) {
      box.innerHTML = '<li class="announcement-list-error"><span>' + escape(error.message || '公告暂时无法加载') + '</span>' +
        '<button type="button" data-announcement-action="reload">重试</button></li>';
    }
  }
  async function select(id) {
    id = idOf(id); if (!id) return;
    var pane = el('announcementDetail'); if (!pane) return;
    selectedId = id;
    var cached = records.filter(function (a) { return idOf(a.id) === id; })[0];
    pane.innerHTML = cached ? renderDetail(cached) : '<p class="announcement-empty">正在读取…</p>';
    setView('detail');
    renderList();
    if (cached) return;
    var res = await global.apiGet('/api/announcements/' + id);
    if (idOf(id) !== selectedId) return;
    pane.innerHTML = res.code === 200 ? renderDetail(res.data)
      : '<p class="announcement-empty">' + escape(res.msg || '公告不存在或已下架') + '</p>';
  }
  function backToList() { selectedId = null; setView('list'); renderList(); }

  /* ===== 视图切换（宽度差异交给 CSS 的容器查询，这里只管状态） ===== */
  function setView(next) {
    view = next;
    var wrap = el('announcementBodyWrap');
    if (wrap) wrap.setAttribute('data-view', view);
    var listPane = el('announcementListPane'), readPane = el('announcementReadPane'), manager = el('announcementManager');
    if (listPane) listPane.hidden = (view === 'manage');
    if (readPane) readPane.hidden = (view === 'manage');
    if (manager) manager.hidden = (view !== 'manage');
    var toggle = el('announcementManageToggle');
    if (toggle) { toggle.hidden = !canEdit(); toggle.textContent = view === 'manage' ? '返回公告' : '管理'; }
    var back = el('announcementBack');
    if (back) back.hidden = (view !== 'detail');   // 返回键只在详情态需要
  }

  /* ===== 管理（仅主管理员；后端仍会再校验一次） ===== */
  function renderManage(a) {
    var id = idOf(a.id), published = a.status === 'published';
    if (!id) return '';
    return '<article class="announcement-manage-card"><strong>' + escape(a.title) + '</strong><small>' +
      (published ? '公开中' : '已下架') + ' · ' + escape(a.publisherNickname || '已注销用户') + '</small>' +
      (published ? '<div class="announcement-manage-actions"><button type="button" data-announcement-action="edit" data-id="' + id + '">编辑</button>' +
        '<button type="button" data-announcement-action="unpublish" data-id="' + id + '">下架</button></div>' : '') + '</article>';
  }
  async function loadManage() {
    if (!canEdit()) { managed = []; return; }
    var box = el('announcementManageList'); if (!box) return;
    try {
      var res = await global.apiGet('/api/admin/announcements');
      if (res.code !== 200) throw new Error(res.msg || '读取管理列表失败');
      managed = res.data || [];
      box.innerHTML = managed.length ? managed.map(renderManage).join('') : '<p class="announcement-empty">暂无公告记录</p>';
    } catch (error) { status(error.message || '读取管理列表失败'); }
  }
  function cancelEdit() {
    editing = null;
    el('announcementEditorTitle').value = '';
    el('announcementEditorContent').value = '';
    el('announcementSave').textContent = '立即发布';
    var cancel = el('announcementCancelEdit'); if (cancel) cancel.hidden = true;
    status('');
  }
  function edit(id) {
    if (!canEdit()) return;
    var a = managed.filter(function (item) { return Number(item.id) === idOf(id) && item.status === 'published'; })[0];
    if (!a) { status('公告不存在或已下架，请刷新列表'); return; }
    editing = idOf(id);
    el('announcementEditorTitle').value = a.title;
    el('announcementEditorContent').value = a.content;
    el('announcementSave').textContent = '保存修改';
    var cancel = el('announcementCancelEdit'); if (cancel) cancel.hidden = false;
    status('正在编辑公告 #' + editing);
    el('announcementEditorTitle').focus();
  }
  async function save() {
    if (!canEdit()) { status('仅主管理员可以发布或编辑公告'); return; }
    if (saving) return;
    var title = el('announcementEditorTitle').value.trim(), content = el('announcementEditorContent').value.trim();
    if (!title || title.length > 120 || !content || content.length > 3000) { status('标题和正文不能为空，且不得超过字数限制'); return; }
    saving = true; el('announcementSave').disabled = true;
    try {
      var res = editing
        ? await global.apiPut('/api/admin/announcements/' + editing, {title:title,content:content})
        : await global.apiPost('/api/admin/announcements', {title:title,content:content});
      if (res.code !== 200) { status(res.msg || '保存失败，草稿已保留'); return; }
      cancelEdit();
      page = 1;
      await Promise.all([loadLatest(), loadHistory(), loadManage()]);
      status('公告已发布或更新');
    } catch (error) { status('网络出错，草稿已保留，请重试'); }
    finally { saving = false; el('announcementSave').disabled = false; }
  }
  async function unpublish(id) {
    if (!canEdit() || removing || !idOf(id)) return;
    removing = true;
    try {
      var res = await global.apiPost('/api/admin/announcements/' + idOf(id) + '/unpublish', {});
      if (res.code !== 200) { status(res.msg || '下架失败'); return; }
      if (editing === idOf(id)) cancelEdit();
      page = 1;
      await Promise.all([loadLatest(), loadHistory(), loadManage()]);
      status('公告已下架');
    } catch (error) { status('网络出错，请重试'); }
    finally { removing = false; }
  }
  async function toggleManage() {
    if (!canEdit()) return;
    setView(view === 'manage' ? 'list' : 'manage');
    if (view === 'manage') await loadManage();
  }

  /* ===== 打开 / 关闭查看公告 ===== */
  async function open() {
    var dialog = el('announcementDialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    page = 1; selectedId = null;
    setView('list');
    await Promise.all([loadHistory(), loadManage()]);
  }
  function close() {
    var dialog = el('announcementDialog');
    if (dialog && typeof dialog.close === 'function' && dialog.open) dialog.close();
  }

  /* ===== ③ 登录进系统后弹一次最新公告 =====
     同一公告确认过（「我知道了」/✕/查看全部）后不再弹，管理员发布新公告才再弹；
     「只显示最新的一条」；读取失败/无公告/不支持 <dialog> 一律静默跳过，绝不影响登录流程。 */
  async function showLatestPopup() {
    var dialog = el('announcementPopup'), body = el('announcementPopupBody');
    if (!dialog || !body || typeof dialog.showModal !== 'function') return;
    var latest = await loadLatest();        // 顺带把顶部胶囊刷新到最新
    if (!latest || !shouldPopup(latestId)) return;
    body.innerHTML = renderDetail(latest);
    if (!dialog.open) dialog.showModal();
  }
  function closePopup() {
    var dialog = el('announcementPopup');
    if (dialog && typeof dialog.close === 'function' && dialog.open) dialog.close();
  }
  function ackPopup() {                      // 「我知道了」/ ✕：读过即清掉圆点，并记住这条公告
    if (latestId) { markSeen(latestId); ackPopupFor(latestId); renderChips(); }
    closePopup();
  }
  function openAllFromPopup() {              // 查看全部也视为已看过，避免下次登录重复打扰
    if (latestId) ackPopupFor(latestId);
    closePopup();
    return open();
  }

  function init() {
    mountChips();
    renderChips();
    loadLatest();
    document.addEventListener('click', function (event) {
      var target = event.target.closest ? event.target.closest('[data-announcement-action]') : null;
      if (!target) return;
      var action = target.getAttribute('data-announcement-action'), id = idOf(target.getAttribute('data-id'));
      if (action === 'open') return open();
      if (action === 'publish') return open().then(function () { setView('manage'); return loadManage(); });
      if (action === 'popup-close' || action === 'popup-ack') return ackPopup();
      if (action === 'popup-open') return openAllFromPopup();
      if (action === 'close') return close();
      if (action === 'retry') return loadLatest();
      if (action === 'reload') return loadHistory();
      if (action === 'back') return backToList();
      if (action === 'manage') return toggleManage();
      if (action === 'detail') return select(id);
      if (action === 'prev' && page > 1) { page--; selectedId = null; return loadHistory(); }
      if (action === 'next' && page < pages) { page++; selectedId = null; return loadHistory(); }
      if (!canEdit()) return;
      if (action === 'save') return save();
      if (action === 'cancel-edit') return cancelEdit();
      if (action === 'edit') return edit(id);
      if (action === 'unpublish' && id && (!global.confirm || global.confirm('确定下架此公告？'))) return unpublish(id);
    });
  }
  global.EggAnnouncements = {
    canEdit:canEdit, renderCard:renderCard, renderDetail:renderDetail,
    loadLatest:loadLatest, loadHistory:loadHistory, loadManage:loadManage,
    save:save, edit:edit, unpublish:unpublish, open:open, close:close,
    select:select, backToList:backToList, toggleManage:toggleManage, setView:setView, hasNew:hasNew,
    mountChips:mountChips, renderChips:renderChips,
    showLatestPopup:showLatestPopup, ackPopup:ackPopup, openAllFromPopup:openAllFromPopup
  };
  document.addEventListener('DOMContentLoaded',init);
})(window);
