/* ============================================================
   权限管理（学生协管员）—— 后台页面（仅主管理员）

   做法（与 js/admin-workbench.js 一致，不改主 HTML 结构）：
     · 运行时注入样式 + 自建确认 / 审计弹窗
     · 由 growth-schoolv3.html 的 go('permissions') 调 window.renderPermissions()

   交互（2026-10-13 调整）：先勾选用户（可多选）→ 点「授予权限 / 收回权限」
   → 在弹窗里勾选要授予 / 收回的权限点（可多选）→ 确认，逐个权限点调接口。
   列表展示每个用户已授权的全部权限点，不再按单一权限点筛选。

   权限模型：用户 → 权限点（两段式，无角色层）；权限点清单来自后端 /codes。
   ============================================================ */
(function () {
  'use strict';

  var API = {
    codes: '/api/admin/permissions/codes',
    users: '/api/admin/permissions/users',
    grant: '/api/admin/permissions/grant',
    revoke: '/api/admin/permissions/revoke',
    audit: '/api/admin/permissions/audit'
  };

  var DEFAULT_CODES = [
    { code: 'content_review', label: '内容审核' },
    { code: 'data_dashboard', label: '数据看板' }
  ];

  var state = {
    codes: DEFAULT_CODES.slice(),
    keyword: '',
    page: 1,
    size: 20,
    total: 0,
    records: [],
    selected: {},
    searchTimer: null,
    auditPage: 1
  };

  var STYLE_ID = 'permPageStyle';

  /* ---------------- 工具 ---------------- */

  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) { if (typeof window.toast === 'function') window.toast(msg); }

  function labelOf(code) {
    var hit = state.codes.filter(function (c) { return c.code === code; })[0];
    return hit ? hit.label : code;
  }

  function selectedIds() {
    return Object.keys(state.selected).filter(function (k) { return state.selected[k]; })
      .map(function (k) { return Number(k); });
  }

  /* ---------------- 样式（运行时注入） ---------------- */

  var CSS = [
    '#page-permissions .perm-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}',
    '#page-permissions .perm-search{height:34px;flex:1 1 220px;min-width:180px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--white);color:var(--ink);font:inherit}',
    '#page-permissions .perm-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:var(--muted);font-size:13px}',
    '#page-permissions .perm-head-left{display:inline-flex;align-items:center;gap:12px}',
    '#page-permissions .perm-clear{padding:0;border:0;background:none;color:var(--primary);cursor:pointer;font:inherit;font-size:13px}',
    '#page-permissions .perm-table{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--white)}',
    '#page-permissions .perm-row{display:grid;grid-template-columns:40px minmax(140px,1.4fr) minmax(110px,1fr) minmax(140px,1.4fr);align-items:center;gap:10px;padding:12px 14px;border-top:1px solid var(--border)}',
    '#page-permissions .perm-row:first-child{border-top:0}',
    '#page-permissions .perm-row:hover{background:var(--bg-tint)}',
    '#page-permissions .perm-name{color:var(--ink);font-weight:600}',
    '#page-permissions .perm-sub{color:var(--muted);font-size:12px;margin-top:2px}',
    '#page-permissions .perm-tag{display:inline-flex;align-items:center;height:22px;padding:0 8px;margin:2px 4px 2px 0;border-radius:6px;background:var(--primary-tint);color:var(--primary);font-size:12px;font-weight:600}',
    '#page-permissions .perm-empty{padding:28px;text-align:center;color:var(--muted)}',
    '#page-permissions .perm-pager{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:10px;color:var(--muted);font-size:13px}',
    '#page-permissions .perm-btn{height:32px;padding:0 14px;border:1px solid var(--border);border-radius:8px;background:var(--white);color:var(--ink);cursor:pointer;font:inherit}',
    '#page-permissions .perm-btn-primary{background:var(--primary);border-color:var(--primary);color:#fff}',
    '#page-permissions .perm-btn:disabled{opacity:.55;cursor:not-allowed}',
    '#page-permissions .perm-actionbar{position:sticky;bottom:0;margin-top:12px;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:12px;background:var(--white);box-shadow:0 2px 12px rgba(27,42,74,.08)}',
    '#page-permissions .perm-actionbar[hidden]{display:none}',
    '#page-permissions .perm-selected{flex:1;color:var(--ink);font-weight:600}',
    '#page-permissions .perm-result{margin-top:10px;padding:10px 14px;border-radius:12px;background:var(--bg-tint);color:var(--ink);font-size:13px}',
    '#page-permissions .perm-result ul{margin:6px 0 0;padding-left:18px;color:var(--muted)}',
    '#page-permissions .perm-modal{display:none;position:fixed;inset:0;z-index:60;align-items:center;justify-content:center;padding:16px}',
    '#page-permissions .perm-modal.is-open{display:flex}',
    '#page-permissions .perm-mask{position:absolute;inset:0;background:rgba(27,42,74,.45)}',
    '#page-permissions .perm-card{position:relative;width:min(560px,100%);max-height:80vh;overflow:auto;background:var(--white);border-radius:14px;padding:18px}',
    '#page-permissions .perm-card h3{margin:0 0 10px;font-size:16px;color:var(--ink)}',
    '#page-permissions .perm-picks{display:flex;flex-direction:column;gap:8px;margin:10px 0}',
    '#page-permissions .perm-pick{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:14px;color:var(--ink)}',
    '#page-permissions .perm-pick:hover{background:var(--bg-tint)}',
    '#page-permissions .perm-pick-hint{margin-left:auto;color:var(--muted);font-size:12px}',
    '#page-permissions .perm-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}',
    '#page-permissions .perm-audit-row{padding:10px 0;border-top:1px solid var(--border);font-size:13px;color:var(--ink)}',
    '#page-permissions .perm-audit-row:first-child{border-top:0}',
    '#page-permissions .perm-audit-meta{color:var(--muted);font-size:12px;margin-top:2px}',
    '@media (max-width:768px){',
    '  #page-permissions .perm-row{grid-template-columns:34px 1fr;row-gap:2px}',
    '  #page-permissions .perm-cell-school,#page-permissions .perm-cell-perms{grid-column:2}',
    '  #page-permissions .perm-actionbar{bottom:76px}',
    '}'
  ].join('\n');

  function ensureStyle() {
    if (byId(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------- 骨架 ---------------- */

  function skeleton() {
    return ''
      + '<div class="perm-bar">'
      + '  <input id="permSearch" class="perm-search" type="search" placeholder="搜索昵称 / 邮箱">'
      + '</div>'
      + '<div class="perm-head"><span class="perm-head-left">'
      + '<label><input type="checkbox" id="permSelectAll"> 全选本页</label>'
      + '<button type="button" class="perm-clear" id="permClearSel" hidden>取消多选</button>'
      + '</span><span id="permCount"></span></div>'
      + '<div class="perm-table" id="permTable"></div>'
      + '<div class="perm-pager" id="permPager"></div>'
      + '<div id="permResult"></div>'
      + '<div class="perm-actionbar" id="permActionBar" hidden>'
      + '  <span class="perm-selected" id="permSelected"></span>'
      + '  <button type="button" class="perm-btn perm-btn-primary" id="permGrantBtn">授予权限</button>'
      + '  <button type="button" class="perm-btn" id="permRevokeBtn">收回权限</button>'
      + '</div>'
      + '<div class="perm-modal" id="permModal"><div class="perm-mask" data-perm-close="1"></div>'
      + '  <div class="perm-card" id="permModalCard"></div></div>';
  }

  /* ---------------- 入口 ---------------- */

  async function renderPermissions() {
    ensureStyle();
    var host = byId('permHost');
    if (!host) return;
    if (!host.dataset.built) {
      host.innerHTML = skeleton();
      host.dataset.built = '1';
      bindStatic(host);
    }
    closeModal();
    bindAuditButton();
    await loadCodes();
    loadUsers();
  }

  function bindAuditButton() {
    var btn = byId('permAuditBtn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', openAudit);
    }
  }

  function bindStatic(host) {
    var search = byId('permSearch');
    search.addEventListener('input', function () {
      if (state.searchTimer) clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(function () {
        state.keyword = search.value.trim();
        state.page = 1;
        loadUsers();
      }, 300);
    });

    byId('permSelectAll').addEventListener('change', function () {
      var on = this.checked;
      state.records.forEach(function (r) { state.selected[r.id] = on; });
      paintSelection();
    });

    // 取消多选：一键清空已勾选用户
    byId('permClearSel').addEventListener('click', clearSelection);

    // 勾选用户后先点按钮，再在弹窗里选权限点
    byId('permGrantBtn').addEventListener('click', function () { askApply(true); });
    byId('permRevokeBtn').addEventListener('click', function () { askApply(false); });

    host.addEventListener('click', function (e) {
      var close = e.target.closest('[data-perm-close]');
      if (close) closeModal();
      var pager = e.target.closest('[data-perm-page]');
      if (pager) { state.page = Number(pager.getAttribute('data-perm-page')); loadUsers(); }
      var aPage = e.target.closest('[data-perm-apage]');
      if (aPage) { state.auditPage = Number(aPage.getAttribute('data-perm-apage')); openAudit(); }
    });

    // 行勾选：事件委托，避免每次渲染重复绑定
    byId('permTable').addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-perm-id]');
      if (!cb) return;
      state.selected[Number(cb.getAttribute('data-perm-id'))] = cb.checked;
      paintSelection();
    });
  }

  /* ---------------- 数据加载 ---------------- */

  async function loadCodes() {
    var res = await window.apiGet(API.codes);
    if (res && res.code === 200 && Array.isArray(res.data) && res.data.length) {
      state.codes = res.data;
    }
  }

  async function loadUsers() {
    renderLoading();
    var q = API.users + '?page=' + state.page + '&size=' + state.size
      + (state.keyword ? '&keyword=' + encodeURIComponent(state.keyword) : '');
    var res = await window.apiGet(q);
    if (!res || res.code !== 200) {
      byId('permTable').innerHTML = '<div class="perm-empty">加载失败，请稍后重试</div>';
      byId('permPager').innerHTML = '';
      return;
    }
    var d = res.data || {};
    state.records = d.records || [];
    state.total = Number(d.total || 0);
    // 被过滤掉的行不再保留勾选
    var alive = {};
    state.records.forEach(function (r) { if (state.selected[r.id]) alive[r.id] = true; });
    state.selected = alive;
    paintRows();
  }

  function renderLoading() {
    byId('permTable').innerHTML = '<div class="perm-empty">加载中…</div>';
  }

  function permsHtml(codes) {
    if (!codes || !codes.length) return '<span class="perm-sub">未授权</span>';
    return codes.map(function (c) {
      return '<span class="perm-tag">' + esc(labelOf(c)) + '</span>';
    }).join('');
  }

  function paintRows() {
    var rows = state.records;
    byId('permCount').textContent = '共 ' + state.total + ' 人';
    if (!rows.length) {
      byId('permTable').innerHTML = '<div class="perm-empty">没有符合条件的用户</div>';
    } else {
      byId('permTable').innerHTML = rows.map(function (r) {
        return '<label class="perm-row">'
          + '<input type="checkbox" data-perm-id="' + r.id + '"' + (state.selected[r.id] ? ' checked' : '') + '>'
          + '<div><div class="perm-name">' + esc(r.nickname) + '</div>'
          + '<div class="perm-sub">' + esc(r.email) + '</div></div>'
          + '<div class="perm-cell-school"><div class="perm-sub">'
          + esc([r.school, r.major].filter(Boolean).join(' · ') || '—') + '</div></div>'
          + '<div class="perm-cell-perms">' + permsHtml(r.permCodes) + '</div>'
          + '</label>';
      }).join('');
    }
    paintPager();
    paintSelection();
  }

  function paintPager() {
    var pages = Math.max(1, Math.ceil(state.total / state.size));
    byId('permPager').innerHTML = ''
      + '<button type="button" class="perm-btn" data-perm-page="' + (state.page - 1) + '"'
      + (state.page <= 1 ? ' disabled' : '') + '>上一页</button>'
      + '<span>第 ' + state.page + ' / ' + pages + ' 页</span>'
      + '<button type="button" class="perm-btn" data-perm-page="' + (state.page + 1) + '"'
      + (state.page >= pages ? ' disabled' : '') + '>下一页</button>';
  }

  function paintSelection() {
    var ids = selectedIds();
    var bar = byId('permActionBar');
    bar.hidden = ids.length === 0;
    byId('permSelected').textContent = '已选 ' + ids.length + ' 人';
    var clear = byId('permClearSel');
    if (clear) clear.hidden = ids.length === 0;
    var all = byId('permSelectAll');
    if (all) {
      var onPage = state.records.length;
      var checkedOnPage = state.records.filter(function (r) { return state.selected[r.id]; }).length;
      all.checked = onPage > 0 && checkedOnPage === onPage;
      all.indeterminate = checkedOnPage > 0 && checkedOnPage < onPage;
    }
  }

  /** 取消多选：清空勾选并重绘行（不重新请求数据） */
  function clearSelection() {
    state.selected = {};
    paintRows();
  }

  /* ---------------- 授予 / 收回 ---------------- */

  /** 选中用户中已持有某权限点的人数（供弹窗提示「已持有 N 人」） */
  function heldCount(code, ids) {
    var n = 0;
    state.records.forEach(function (r) {
      if (ids.indexOf(r.id) >= 0 && (r.permCodes || []).indexOf(code) >= 0) n++;
    });
    return n;
  }

  function askApply(grant) {
    var ids = selectedIds();
    if (!ids.length) { toast('请先勾选用户'); return; }
    var verb = grant ? '授予' : '收回';
    var picks = state.codes.map(function (c) {
      return '<label class="perm-pick">'
        + '<input type="checkbox" data-perm-pick="' + esc(c.code) + '">'
        + '<span>' + esc(c.label) + '</span>'
        + '<span class="perm-pick-hint">已持有 ' + heldCount(c.code, ids) + ' 人</span>'
        + '</label>';
    }).join('');
    openModal(
      '<h3>' + verb + '权限</h3>'
      + '<p>将给选中的 <strong>' + ids.length + '</strong> 位用户' + verb + '以下权限（可多选）：</p>'
      + '<div class="perm-picks">' + picks + '</div>'
      + '<p class="perm-sub">' + (grant ? '已授权的会跳过；失败项会逐条列出。' : '未授权的会跳过；撤销后不影响其历史审核动作。') + '</p>'
      + '<div class="perm-foot">'
      + '<button type="button" class="perm-btn" data-perm-close="1">取消</button>'
      + '<button type="button" class="perm-btn perm-btn-primary" id="permApplyOk">确认' + verb + '</button>'
      + '</div>'
    );
    byId('permApplyOk').addEventListener('click', function () {
      var chosen = [];
      byId('permModalCard').querySelectorAll('[data-perm-pick]').forEach(function (cb) {
        if (cb.checked) chosen.push(cb.getAttribute('data-perm-pick'));
      });
      if (!chosen.length) { toast('请至少选择一个权限点'); return; }
      doApply(grant, ids, chosen, this);
    });
  }

  /** 逐权限点调用接口（接口一次只接受一个 permCode），再汇总结果 */
  async function doApply(grant, ids, codes, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    var text = btn.textContent;
    btn.textContent = '处理中…';
    var results = [];
    for (var i = 0; i < codes.length; i++) {
      var res = await window.apiPost(grant ? API.grant : API.revoke, {
        userIds: ids,
        permCode: codes[i]
      });
      results.push({
        code: codes[i],
        error: (!res || res.code !== 200) ? ((res && res.msg) || '请求失败') : '',
        data: (res && res.code === 200) ? (res.data || {}) : null
      });
    }
    btn.disabled = false;
    btn.textContent = text;
    closeModal();
    showResult(grant, results);
    state.selected = {};
    loadUsers();
  }

  function showResult(grant, results) {
    var verb = grant ? '授予' : '收回';
    var success = 0, skipped = 0, problems = [];
    var lines = results.map(function (item) {
      if (item.error) {
        problems.push(labelOf(item.code) + '：' + item.error);
        return '<li>' + esc(labelOf(item.code)) + '：' + esc(item.error) + '</li>';
      }
      var s = Number(item.data.success || 0);
      var k = Number(item.data.skipped || 0);
      var f = item.data.failed || [];
      success += s;
      skipped += k;
      f.forEach(function (one) {
        problems.push(labelOf(item.code) + ' · 用户 #' + one.userId + '：' + one.reason);
      });
      return '<li>' + esc(labelOf(item.code)) + '：成功 ' + s + ' · 跳过 ' + k + ' · 失败 ' + f.length + '</li>';
    }).join('');
    byId('permResult').innerHTML = '<div class="perm-result">'
      + verb + '完成：成功 <strong>' + success + '</strong> · 跳过 ' + skipped + ' · 失败 ' + problems.length
      + '<ul>' + lines
      + problems.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('')
      + '</ul>'
      + '</div>';
    toast('已' + verb + ' ' + success + ' 项');
  }

  /* ---------------- 审计 ---------------- */

  async function openAudit() {
    var res = await window.apiGet(API.audit + '?page=' + state.auditPage + '&size=20');
    var d = (res && res.code === 200 && res.data) ? res.data : {};
    var rows = d.records || [];
    var total = Number(d.total || 0);
    var pages = Math.max(1, Math.ceil(total / 20));

    var body = rows.length ? rows.map(function (a) {
      var verb = a.action === 'grant' ? '授予' : '收回';
      return '<div class="perm-audit-row">'
        + esc(a.operatorNickname || ('#' + a.operatorId)) + ' 给 '
        + esc(a.targetNickname || ('#' + a.targetUserId)) + ' <strong>' + verb + '</strong> '
        + esc(labelOf(a.permCode))
        + '<div class="perm-audit-meta">' + esc(a.createdAt || '') + '</div>'
        + '</div>';
    }).join('') : '<div class="perm-empty">暂无审计记录</div>';

    openModal(
      '<h3>审计记录</h3>'
      + '<div>' + body + '</div>'
      + '<div class="perm-pager">'
      + '<button type="button" class="perm-btn" data-perm-apage="' + (state.auditPage - 1) + '"'
      + (state.auditPage <= 1 ? ' disabled' : '') + '>上一页</button>'
      + '<span>第 ' + state.auditPage + ' / ' + pages + ' 页</span>'
      + '<button type="button" class="perm-btn" data-perm-apage="' + (state.auditPage + 1) + '"'
      + (state.auditPage >= pages ? ' disabled' : '') + '>下一页</button>'
      + '</div>'
      + '<div class="perm-foot"><button type="button" class="perm-btn" data-perm-close="1">关闭</button></div>'
    );
  }

  /* ---------------- 弹窗 ---------------- */

  function openModal(html) {
    var card = byId('permModalCard');
    if (!card) return;
    card.innerHTML = html;
    byId('permModal').classList.add('is-open');
  }

  function closeModal() {
    var m = byId('permModal');
    if (m) m.classList.remove('is-open');
  }

  window.renderPermissions = renderPermissions;
  window.openPermissionAudit = openAudit;
})();
