/* ============================================================
   用户管理 - 表格宽度与操作列样式增强（外联 JS）

   一、表格铺满：行宽原本写死 1080px，屏幕再宽也不铺满，右侧留白。
      改为 width:100% + min-width:1170px —— 宽屏铺满、窄屏保底并横向滚动；
      余量按列分摊，避免全部堆在"任务进展"一列。
      （min-width 由 1080 → 1170：用户管理新增「邀请」列 90px）

   二、操作列聚合：查看 / 认定 / 封禁 / 删除 4 个按钮原本在单元格里纵向堆叠，
      行高被撑高、视觉拥挤。
     · 外露：查看、封禁/解封（高频，一键可达）
     · 收进「⋯ 更多」：认定（一次性授权，低频）、删除（极低频且不可恢复，埋一层防误点）
      按钮改为横向轻量按钮组——透明底、语义色、hover 柔和底色。

   实现：不改页面内联逻辑，全部通过注入样式 + 包装全局 renderUsers() 完成；
       下拉菜单里放的是原按钮节点（不是克隆），
       故 onclick 与"从本行取昵称"的行为完全不变。
   ============================================================ */
(function () {
  'use strict';

  var CSS = `
/* 宽屏时铺满容器（避免右侧留白）；窄屏时保底 1170px 并横向滚动（保留原行为） */
.table-users .trow,
.table-users .trow.thead {
  width: 100%;
  min-width: 1170px;
}
/* 余量按列分摊，避免全部堆在"任务进展"一列导致那里空一大块 */
.table-users .c-stu { width: 220px; flex: 1 0 220px }
.table-users .c-school { width: 200px; flex: 1 0 200px }
.table-users .c-task { flex: 1 0 160px }
.table-users .c-points { width: 80px; flex: 0 0 80px }
.table-users .c-exp { width: 160px; flex: 1 0 160px }
.table-users .c-invite { width: 90px; flex: 0 0 90px }
.table-users .c-status { width: 110px; flex: 0 0 110px }
.table-users .c-op { width: 150px; flex: 0 0 150px }

/* 操作列：横向按钮组（宽度沿用原来的 150px，其它列不受影响） */
.table-users .cell.c-op {
  width: 150px;
  flex-direction: row;      /* 覆盖 .table-users .cell 的 column */
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  overflow: visible;        /* 避免 hover 底色与下拉菜单被裁切 */
}

/* 轻量按钮 */
.ua-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 9px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background .16s ease, color .16s ease, transform .12s ease;
}
.ua-btn:hover { background: var(--ua-hover, rgba(0, 0, 0, .05)) }
.ua-btn:active { transform: translateY(1px) }
.table-users .ua-btn.ua-view { color: var(--primary); --ua-hover: var(--primary-tint) }
.table-users .ua-btn.ua-verify { color: #B07E00; --ua-hover: #FFF6DF }
.table-users .ua-btn.ua-pwd { color: #7048E8; --ua-hover: #F0EAFF }
.table-users .ua-btn.ua-warn { color: #D9480F; --ua-hover: #FFF0E8 }
.table-users .ua-btn.ua-ok { color: #2F9E44; --ua-hover: #EAF7EE }
.table-users .ua-btn.ua-danger { color: #C92A2A; --ua-hover: #FDECEC }

/* 「⋯ 更多」触发器 */
.ua-more-wrap { position: relative; display: inline-flex }
.table-users .ua-btn.ua-more {
  width: 30px;
  padding: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--ink2);
  --ua-hover: var(--bg2);
}
.table-users .ua-btn.ua-more[aria-expanded="true"] {
  background: var(--primary-tint);
  color: var(--primary);
}

/* 下拉菜单 */
.ua-menu { display: none }
.ua-more-wrap.open .ua-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 104px;
  padding: 6px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(20, 30, 50, .14);
  z-index: 60;
}
.ua-more-wrap.open .ua-menu.ua-up { top: auto; bottom: calc(100% + 6px) }
.ua-menu .ua-btn {
  position: relative;
  display: flex;
  width: 100%;
  height: 32px;
  justify-content: flex-start;
  padding: 0 10px;
  border-radius: 8px;
}
/* 危险项在菜单里改用横向分隔线（去掉外露时的竖线） */
.ua-menu .ua-btn.ua-danger { margin-top: 6px }
.ua-menu .ua-btn.ua-danger::before { display: none }
.ua-menu .ua-btn.ua-danger::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  top: -3px;
  height: 1px;
  background: var(--border);
}
`;

  function injectCss() {
    if (document.getElementById('userActionsStyle')) return;
    var style = document.createElement('style');
    style.id = 'userActionsStyle';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* 按钮 → 语义样式类（按 onclick 判断，比按文案判断更稳） */
  function kindOf(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    if (onclick.indexOf('openAdminUserModal') > -1) return 'ua-view';
    if (onclick.indexOf('openUserVerifyModal') > -1) return 'ua-verify';
    if (onclick.indexOf('openResetPwdModal') > -1) return 'ua-pwd';
    if (onclick.indexOf('toggleBanUser') > -1) return btn.textContent.trim() === '解封' ? 'ua-ok' : 'ua-warn';
    if (onclick.indexOf('openDeleteUserConfirm') > -1) return 'ua-danger';
    return '';
  }

  /* 需要收进「更多」的动作：认定、改密、删除 */
  function isFoldable(kind) {
    return kind === 'ua-verify' || kind === 'ua-pwd' || kind === 'ua-danger';
  }

  /* 组装该行的「⋯」按钮 + 下拉菜单，并把折叠项原样搬进去 */
  function buildMenu(cell, foldItems) {
    var wrap = document.createElement('div');
    wrap.className = 'ua-more-wrap';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ua-btn ua-more';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = '⋯';

    var menu = document.createElement('div');
    menu.className = 'ua-menu';
    foldItems.forEach(function (btn) { menu.appendChild(btn); });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    cell.appendChild(wrap);
  }

  /* 渲染完成后整理操作列 */
  function decorate() {
    var rows = document.querySelectorAll('#usersTableBody .trow');
    Array.prototype.forEach.call(rows, function (row) {
      var cell = row.querySelector('.c-op');
      if (!cell) return;
      var foldItems = [];
      Array.prototype.forEach.call(cell.querySelectorAll('button'), function (btn) {
        var kind = kindOf(btn);
        if (!kind) return;
        btn.removeAttribute('style');   // 去掉内联 color，统一交给样式表
        btn.classList.remove('op');     // 去掉旧的竖排样式类
        btn.classList.add('ua-btn', kind);
        if (isFoldable(kind)) foldItems.push(btn);
      });
      if (foldItems.length) buildMenu(cell, foldItems);
    });
  }

  /* ---------- 菜单开关 ---------- */
  function closeAllMenus(except) {
    Array.prototype.forEach.call(document.querySelectorAll('.ua-more-wrap.open'), function (wrap) {
      if (wrap === except) return;
      wrap.classList.remove('open');
      var t = wrap.querySelector('.ua-more');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }

  function openMenu(wrap) {
    closeAllMenus(wrap);
    var trigger = wrap.querySelector('.ua-more');
    var menu = wrap.querySelector('.ua-menu');
    if (!trigger || !menu) return;
    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');

    /* 菜单超出表格可视区域时改为向上展开（表格容器是横向滚动容器，会裁切纵向溢出） */
    menu.classList.remove('ua-up');
    var menuH = menu.offsetHeight || 84;
    var tr = trigger.getBoundingClientRect();
    var scroller = wrap.closest('.table-users');
    var limit = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
    if (tr.bottom + 6 + menuH + 8 > limit) menu.classList.add('ua-up');
  }

  function bindGlobalHandlers() {
    var find = function (el, sel) {
      return (el && el.closest) ? el.closest(sel) : null;
    };

    document.addEventListener('click', function (e) {
      var target = e.target;
      var trigger = find(target, '.ua-more');
      if (trigger) {
        var wrap = trigger.parentNode;
        if (wrap.classList.contains('open')) {
          wrap.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        } else {
          openMenu(wrap);
        }
        return;
      }
      /* 点了菜单项：交给按钮自身 onclick，随后收起菜单 */
      if (find(target, '.ua-menu')) {
        closeAllMenus(null);
        return;
      }
      /* 点了别处：收起 */
      if (!find(target, '.ua-more-wrap')) closeAllMenus(null);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllMenus(null);
    });

    /* 表格滚动时收起，避免菜单悬空 */
    var scroller = document.querySelector('.table-users');
    if (scroller) scroller.addEventListener('scroll', function () { closeAllMenus(null); });
  }

  function wrapRenderUsers() {
    var original = window.renderUsers;
    if (typeof original !== 'function' || original.__uaWrapped) return;
    var wrapped = function () {
      var ret = original.apply(this, arguments);
      var after = function () { try { decorate(); } catch (e) {} };
      if (ret && typeof ret.then === 'function') return ret.then(function (v) { after(); return v; });
      after();
      return ret;
    };
    wrapped.__uaWrapped = true;
    window.renderUsers = wrapped;
  }

  function setup() {
    injectCss();
    bindGlobalHandlers();
    wrapRenderUsers();
    try { decorate(); } catch (e) {}   // 首次进入时列表可能已渲染过
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
