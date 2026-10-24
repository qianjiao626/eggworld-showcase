/* ============================================================
   协管工作台（学生端）—— 仅持有权限点的学生可见

   做法（真复用，不改现有页面函数）：
     · 不重写审核/看板 UI，而是把现有的 #page-reviewcenter / #page-dashboard
       两个区块节点**临时移入**协管页的插槽，离开时移回原容器。
       同一 DOM 节点 → id 不重复、既有渲染函数/事件照旧，即「原样复用」。
     · 具体显示哪个 tab 由 USER.permissions 决定（内容审核 / 数据看板）。
   ============================================================ */
(function () {
  'use strict';

  var TABS = [
    {
      key: 'review', perm: 'content_review', label: '内容审核',
      page: 'reviewcenter', slot: 'coworkReviewSlot',
      /* 协管员不展示「📣 爆料审核与治理」：该区块含爆料奖励结算，留给主 / 副管理员 */
      hide: ['reportAdminSection'],
      load: function () { if (typeof window.loadReviewTasks === 'function') window.loadReviewTasks(); }
    },
    {
      key: 'dashboard', perm: 'data_dashboard', label: '数据看板',
      page: 'dashboard', slot: 'coworkDashboardSlot',
      load: function () { if (typeof window.wbRefresh === 'function') window.wbRefresh(); }
    }
  ];

  /* 被移出区块原本的父容器（页面区块同属一个容器，记一次即可） */
  var origParent = null;

  function byId(id) { return document.getElementById(id); }
  function perms() { return (window.USER && window.USER.permissions) || []; }
  function has(code) { return perms().indexOf(code) >= 0; }
  function available() { return TABS.filter(function (t) { return has(t.perm); }); }

  function mount(tab) {
    var node = byId('page-' + tab.page);
    var slot = byId(tab.slot);
    if (!node || !slot) return;
    if (!origParent) origParent = node.parentNode;
    if (node.parentNode !== slot) slot.appendChild(node);
    node.classList.add('active');
    setHidden(tab, true);
  }

  function unmountAll() {
    TABS.forEach(function (t) {
      var node = byId('page-' + t.page);
      if (node) node.classList.remove('active');
      if (node && origParent && node.parentNode !== origParent) origParent.appendChild(node);
      /* 复用同一批 DOM 节点，离开协管页时必须把被隐藏的区块还原给主 / 副管理员视图 */
      setHidden(t, false);
    });
  }

  /** 按 tab 配置显示 / 隐藏复用区块内的局部节点 */
  function setHidden(tab, hidden) {
    (tab.hide || []).forEach(function (id) {
      var el = byId(id);
      if (el) el.style.display = hidden ? 'none' : '';
    });
  }

  function selectTab(key) {
    unmountAll();
    var tabs = available();
    var t = null;
    for (var i = 0; i < tabs.length; i++) { if (tabs[i].key === key) { t = tabs[i]; break; } }
    if (!t) t = tabs[0];

    var host = byId('coworkTabs');
    if (host) {
      host.querySelectorAll('[data-cowork-tab]').forEach(function (b) {
        b.classList.toggle('active', !!t && b.getAttribute('data-cowork-tab') === t.key);
      });
    }
    if (!t) return;
    mount(t);
    t.load();
  }

  function renderTabs() {
    var host = byId('coworkTabs');
    if (!host) return;
    var tabs = available();
    /* 只有一个权限时不需要切换器（被移入的区块自带标题，chip 会显得多余） */
    host.style.display = tabs.length > 1 ? '' : 'none';
    host.innerHTML = tabs.map(function (t) {
      return '<button type="button" class="chip" data-cowork-tab="' + t.key + '">' + t.label + '</button>';
    }).join('');
    host.querySelectorAll('[data-cowork-tab]').forEach(function (b) {
      b.addEventListener('click', function () { selectTab(b.getAttribute('data-cowork-tab')); });
    });
    selectTab(tabs.length ? tabs[0].key : null);
  }

  /** 进协管页（由 go('cowork') 调用） */
  window.coworkEnter = function () { renderTabs(); };

  /** 离开协管页：把移入的区块移回原位（go() 切到别的页面时调用） */
  window.coworkLeave = function () { unmountAll(); };

  /**
   * 入口显隐：学生且持有 ≥1 个权限点时，显示底部/侧栏「协管」入口与「我的」页入口卡。
   * 在 applyUserData / logout 后调用。
   */
  /* 入口名称按被授予的权限命名（不再叫「协管」）：
     只有一个权限 → 该权限名；两个都有 → 「审核 · 看板」 */
  var SHORT = { review: '审核', dashboard: '看板' };
  function entryLabel() {
    var tabs = available();
    if (!tabs.length) return '协管';
    if (tabs.length === 1) return tabs[0].label;              // 内容审核 / 数据看板
    return tabs.map(function (t) { return SHORT[t.key]; }).join(' · ');
  }

  window.syncCoworkEntries = function () {
    ensureEntryStyle();
    var u = window.USER || {};
    var show = !!u.registered && !u.isAdmin && perms().length > 0;
    var label = entryLabel();
    var nav = document.querySelector('#studentNav .nav-item[data-page="cowork"]');
    if (nav) {
      nav.style.display = show ? '' : 'none';
      var span = nav.querySelector('span');
      if (span) span.textContent = label;
    }
    var card = byId('mineCoworkCard');
    if (card) {
      card.style.display = show ? '' : 'none';
      card.textContent = '进入' + label;
    }
  };

  /* 侧栏「协管」入口与普通学生 tab 区分：用站点 chip 的青蓝主色（#4ECDC4→#45B7D1） */
  var STYLE_ID = 'coworkEntryStyle';
  function ensureEntryStyle() {
    if (byId(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.sidebar .nav-item[data-page="cowork"] > span{color:#7FE0DA}',
      '.sidebar .nav-item[data-page="cowork"]:hover > span{color:#A6F2EE}',
      '.sidebar .nav-item[data-page="cowork"].active{background:linear-gradient(90deg,rgba(78,205,196,.24) 0%,rgba(69,183,209,.06) 100%);border-left:3px solid #4ECDC4;box-shadow:inset 0 0 24px rgba(78,205,196,.12),0 2px 8px rgba(78,205,196,.12)}',
      '.sidebar .nav-item[data-page="cowork"].active > span{color:#8FEDE7;font-weight:700}',
      '.sidebar .nav-item[data-page="cowork"] svg{color:#4ECDC4}'
    ].join('\n');
    document.head.appendChild(st);
  }
})();
