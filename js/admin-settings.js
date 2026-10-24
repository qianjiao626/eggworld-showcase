/* ============================================================
   系统设置 —— 后台页面（仅主管理员）

   做法与 js/admin-permissions.js / admin-task-manage.js 一致：
     · 不改主 HTML 结构：样式运行时注入 <style>，内容自建在 #settingsHost
     · 由 growth-schoolv3.html 的 go('settings') 调 window.renderAdminSettings()
     · 接口统一返回 {code,msg,data}，先判 code === 200 再取 data

   两块钱一样的配置：
     · 大师兄简历 · 深度对标
     · 大师兄找方向 · 职业测评
   每组都是「是否收费 / 单次价格 / 每人每天次数（0 = 不限）」，
   后端每次请求实时读取 app_settings，保存后立即生效，不用重启。
   ============================================================ */
(function () {
  'use strict';

  var STYLE_ID = 'asPageStyle';

  var GROUPS = [
    {
      key: 'resume',
      api: '/api/admin/settings/resume',
      icon: '📄',
      eyebrow: '学生工坊 · 大师兄简历',
      title: '深度对标',
      desc: '关掉收费后学生免费使用；每天次数用于控制 AI 成本，填 0 表示不限。',
      costHint: '单位：蛋蛋币。免费期间不扣费，恢复收费后直接按这个金额扣'
    },
    {
      key: 'career',
      api: '/api/admin/settings/career',
      icon: '🧭',
      eyebrow: '学生工坊 · 大师兄找方向',
      title: '职业测评',
      desc: '答完 19 题、生成报告时扣费；生成失败不扣费。填 0 表示不限次数。',
      costHint: '单位：蛋蛋币。学生点「开始测评」时会先看到这个价格'
    },
    {
      key: 'workshop',
      kind: 'order',
      api: '/api/admin/settings/workshop',
      icon: '🎛',
      eyebrow: '学生工坊',
      title: '入口排序',
      desc: '调整学生工坊里软件卡片的先后顺序；保存后学生下次进入工坊即刻生效。'
    }
  ];

  var state = { saving: {}, workshop: [] };

  function byId(id) { return document.getElementById(id); }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
    else alert(msg);
  }

  function el(group, name) { return byId('as-' + group.key + '-' + name); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 样式 ---------------- */

  function ensureStyle() {
    if (byId(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.as-wrap{display:flex;flex-direction:column;gap:18px;max-width:860px}',
      '.as-card{background:#fff;border:1px solid var(--border);border-radius:22px;overflow:hidden;box-shadow:0 6px 24px rgba(27,42,74,.06)}',
      '.as-head{display:flex;align-items:flex-start;gap:14px;padding:22px 24px;border-bottom:1px solid var(--border);',
      '  background:linear-gradient(135deg,rgba(78,205,196,.10),rgba(69,183,209,.04))}',
      '.as-head-ic{width:44px;height:44px;flex:none;border-radius:14px;background:#fff;display:flex;align-items:center;',
      '  justify-content:center;font-size:22px;box-shadow:0 2px 8px rgba(27,42,74,.08)}',
      '.as-eyebrow{margin:0;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}',
      '.as-head h3{margin:4px 0;font-size:19px;color:var(--ink)}',
      '.as-sub{margin:0;font-size:12.5px;line-height:1.6;color:var(--muted)}',
      '.as-state{margin-left:auto;flex:none;font-size:12px;font-weight:700;color:var(--ink2);background:#fff;',
      '  border:1px solid var(--border);padding:5px 12px;border-radius:999px;white-space:nowrap}',
      '.as-rows{padding:4px 24px}',
      '.as-row{display:flex;align-items:center;gap:18px;padding:18px 0;border-bottom:1px dashed var(--border)}',
      '.as-row:last-child{border-bottom:0}',
      '.as-row-main{flex:1;min-width:0}',
      '.as-row-main strong{display:block;font-size:14px;color:var(--ink)}',
      '.as-row-main span{display:block;margin-top:4px;font-size:12px;line-height:1.6;color:var(--muted)}',
      '.as-num{display:flex;align-items:center;gap:8px;flex:none}',
      '.as-num input{width:104px;height:40px;border-radius:12px;border:2px solid var(--border);background:#fff;',
      '  text-align:center;font-size:15px;font-weight:800;color:var(--ink);font-family:inherit;outline:none;transition:.2s}',
      '.as-num input:focus{border-color:#4ECDC4;box-shadow:0 0 0 4px rgba(78,205,196,.12)}',
      '.as-num em{font-style:normal;font-size:12px;color:var(--muted);white-space:nowrap}',
      '.as-switch{position:relative;display:inline-flex;width:52px;height:30px;flex:none}',
      '.as-switch input{position:absolute;inset:0;z-index:2;margin:0;opacity:0;cursor:pointer}',
      '.as-slider{position:relative;width:100%;height:100%;border-radius:999px;background:#D9D3C4;transition:background .2s}',
      '.as-slider:before{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;',
      '  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s}',
      '.as-switch input:checked + .as-slider{background:linear-gradient(135deg,#4ECDC4,#45B7D1)}',
      '.as-switch input:checked + .as-slider:before{transform:translateX(22px)}',
      '.as-switch input:focus-visible + .as-slider{outline:3px solid rgba(78,205,196,.35);outline-offset:2px}',
      '.as-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 24px;',
      '  border-top:1px solid var(--border);background:#FCFAF4}',
      '.as-updated{font-size:12px;color:var(--muted)}',
      '.as-order{padding:6px 24px 2px}',
      '.as-order-empty{padding:18px 0;font-size:12.5px;color:var(--muted)}',
      '.as-order-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px dashed var(--border)}',
      '.as-order-item:last-child{border-bottom:0}',
      '.as-order-ic{width:34px;height:34px;flex:none;border-radius:10px;background:#F6F1E6;display:flex;',
      '  align-items:center;justify-content:center;font-size:18px}',
      '.as-order-name{flex:1;min-width:0;font-size:14px;font-weight:700;color:var(--ink)}',
      '.as-order-actions{display:flex;gap:6px;flex:none}',
      '.as-order-btn{width:34px;height:32px;border-radius:10px;border:1px solid var(--border);background:#fff;',
      '  color:var(--ink2);font-weight:800;font-size:14px;cursor:pointer;transition:.15s}',
      '.as-order-btn:hover:not(:disabled){border-color:#4ECDC4;color:#2f9e94}',
      '.as-order-btn:disabled{opacity:.3;cursor:not-allowed}',
      '@media (max-width:640px){',
      '  .as-head{flex-wrap:wrap}.as-state{margin-left:0}',
      '  .as-row{align-items:flex-start;flex-wrap:wrap}',
      '  .as-num input{width:88px}',
      '  .as-foot{flex-direction:column-reverse;align-items:stretch}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ---------------- 骨架 ---------------- */

  function card(group) {
    var k = group.key;
    var head = '' +
      '<section class="as-card" data-as-group="' + k + '">' +
        '<header class="as-head">' +
          '<div class="as-head-ic" aria-hidden="true">' + group.icon + '</div>' +
          '<div class="as-head-txt">' +
            '<p class="as-eyebrow">' + group.eyebrow + '</p>' +
            '<h3>' + group.title + '</h3>' +
            '<p class="as-sub">' + group.desc + '</p>' +
          '</div>' +
          '<span class="as-state" id="as-' + k + '-state">读取中…</span>' +
        '</header>';
    var foot = '' +
        '<footer class="as-foot">' +
          '<span class="as-updated" id="as-' + k + '-updated"></span>' +
          '<button class="btn btn-primary" type="button" id="as-' + k + '-save">保存设置</button>' +
        '</footer>' +
      '</section>';

    if (group.kind === 'order') {
      return head
        + '<div class="as-order" id="as-' + k + '-list">'
        + '<div class="as-order-empty">读取中…</div></div>'
        + foot;
    }

    return head +
        '<div class="as-rows">' +
          '<div class="as-row">' +
            '<div class="as-row-main"><strong>是否收费</strong>' +
              '<span>关闭后不扣蛋蛋币，记录里的花费显示为 0</span></div>' +
            '<label class="as-switch"><input type="checkbox" id="as-' + k + '-charge" aria-label="是否收费">' +
              '<span class="as-slider"></span></label>' +
          '</div>' +
          '<div class="as-row">' +
            '<div class="as-row-main"><strong>单次价格</strong><span>' + group.costHint + '</span></div>' +
            '<div class="as-num"><input type="number" id="as-' + k + '-cost" min="1" max="10000" step="1" inputmode="numeric" aria-label="单次价格"><em>蛋蛋币 / 次</em></div>' +
          '</div>' +
          '<div class="as-row">' +
            '<div class="as-row-main"><strong>每人每天次数</strong>' +
              '<span>按自然日统计成功生成的记录；填 0 表示不限次数</span></div>' +
            '<div class="as-num"><input type="number" id="as-' + k + '-limit" min="0" max="100" step="1" inputmode="numeric" aria-label="每人每天次数"><em>次 / 天</em></div>' +
          '</div>' +
        '</div>' +
        foot;
  }

  function skeleton() {
    return '<div class="as-wrap">' + GROUPS.map(card).join('') + '</div>';
  }

  /* ---------------- 渲染 ---------------- */

  function paint(group, data) {
    if (group.kind === 'order') {
      paintOrder(group, data);
      return;
    }
    var charge = !!data.chargeEnabled;
    var cost = data.analyzeCost == null ? 50 : data.analyzeCost;
    var limit = data.dailyLimit == null ? 3 : data.dailyLimit;
    el(group, 'charge').checked = charge;
    el(group, 'cost').value = cost;
    el(group, 'limit').value = limit;
    el(group, 'state').textContent = charge
      ? ('收费中 · ' + cost + ' 币/次')
      : '免费中';
    el(group, 'updated').textContent = data.updatedAt
      ? ('最后保存：' + data.updatedAt)
      : '尚未保存过（当前按默认值运行）';
  }

  /* 学生工坊排序：功能名称/图标以 student-workshop.js 为准 */
  function workshopFeatures() {
    return (typeof window.getStudentWorkshopFeatures === 'function')
      ? window.getStudentWorkshopFeatures() : [];
  }

  function paintOrder(group, data) {
    var list = workshopFeatures();
    var byId = {};
    list.forEach(function (f) { byId[f.id] = f; });
    var ids = [];
    (Array.isArray(data.order) ? data.order : []).forEach(function (id) {
      if (byId[id] && ids.indexOf(id) < 0) ids.push(id);
    });
    /* 后台还没配过的新功能补在末尾，保证所有入口都能显示 */
    list.forEach(function (f) { if (ids.indexOf(f.id) < 0) ids.push(f.id); });
    state.workshop = ids;
    renderOrder(group);
    el(group, 'state').textContent = '共 ' + ids.length + ' 项';
    el(group, 'updated').textContent = '保存后学生下次进入工坊即刻生效';
  }

  function renderOrder(group) {
    var box = el(group, 'list');
    if (!box) return;
    if (!state.workshop.length) {
      box.innerHTML = '<div class="as-order-empty">暂无可排序的功能</div>';
      return;
    }
    var byId = {};
    workshopFeatures().forEach(function (f) { byId[f.id] = f; });
    box.innerHTML = state.workshop.map(function (id, idx) {
      var f = byId[id] || { name: id, icon: '•' };
      return '<div class="as-order-item">'
        + '<span class="as-order-ic">' + esc(f.icon) + '</span>'
        + '<span class="as-order-name">' + esc(f.name) + '</span>'
        + '<span class="as-order-actions">'
        + '<button type="button" class="as-order-btn" data-order-up="' + esc(id) + '"'
        + (idx === 0 ? ' disabled' : '') + ' aria-label="上移">↑</button>'
        + '<button type="button" class="as-order-btn" data-order-down="' + esc(id) + '"'
        + (idx === state.workshop.length - 1 ? ' disabled' : '') + ' aria-label="下移">↓</button>'
        + '</span></div>';
    }).join('');
  }

  function moveFeature(id, delta) {
    var idx = state.workshop.indexOf(id);
    var next = idx + delta;
    if (idx < 0 || next < 0 || next >= state.workshop.length) return;
    var tmp = state.workshop[idx];
    state.workshop[idx] = state.workshop[next];
    state.workshop[next] = tmp;
    var group = GROUPS.filter(function (g) { return g.key === 'workshop'; })[0];
    if (group) renderOrder(group);
  }

  /* ---------------- 数据 ---------------- */

  async function load(group) {
    var stateEl = el(group, 'state');
    if (stateEl) stateEl.textContent = '读取中…';
    var res = await window.apiGet(group.api);
    if (!res || res.code !== 200) {
      if (stateEl) stateEl.textContent = '读取失败';
      toast((res && res.msg) || '设置读取失败，请稍后重试');
      return;
    }
    paint(group, res.data || {});
  }

  async function save(group) {
    if (group.kind === 'order') {
      await saveOrder(group);
      return;
    }
    if (state.saving[group.key]) return;
    var charge = el(group, 'charge').checked;
    var cost = Number(el(group, 'cost').value);
    var limit = Number(el(group, 'limit').value);

    if (!Number.isInteger(cost) || cost < 1 || cost > 10000) {
      toast('单次价格需在 1–10000 蛋蛋币之间');
      return;
    }
    if (!Number.isInteger(limit) || limit < 0 || limit > 100) {
      toast('每人每天次数需在 0–100 之间（0 表示不限）');
      return;
    }

    var btn = el(group, 'save');
    state.saving[group.key] = true;
    btn.disabled = true;
    btn.textContent = '保存中…';
    var res = await window.apiPut(group.api, {
      chargeEnabled: charge,
      analyzeCost: cost,
      dailyLimit: limit
    });
    state.saving[group.key] = false;
    btn.disabled = false;
    btn.textContent = '保存设置';

    if (!res || res.code !== 200) {
      toast((res && res.msg) || '保存失败，请稍后重试');
      return;
    }
    paint(group, res.data || {});
    toast('设置已保存，下一次使用立即生效');
  }

  async function saveOrder(group) {
    if (state.saving[group.key]) return;
    var btn = el(group, 'save');
    state.saving[group.key] = true;
    btn.disabled = true;
    btn.textContent = '保存中…';
    var res = await window.apiPut(group.api, { order: state.workshop });
    state.saving[group.key] = false;
    btn.disabled = false;
    btn.textContent = '保存设置';

    if (!res || res.code !== 200) {
      toast((res && res.msg) || '排序保存失败，请稍后重试');
      return;
    }
    paintOrder(group, res.data || {});
    toast('排序已保存，学生下次进入工坊生效');
  }

  /* ---------------- 入口 ---------------- */

  function renderAdminSettings() {
    ensureStyle();
    var host = byId('settingsHost');
    if (!host) return;
    if (!host.dataset.built) {
      host.innerHTML = skeleton();
      host.dataset.built = '1';
      GROUPS.forEach(function (group) {
        el(group, 'save').addEventListener('click', function () { save(group); });
      });
      /* 排序卡的上移/下移：事件委托，重渲染后不用重新绑定 */
      host.addEventListener('click', function (e) {
        var up = e.target.closest('[data-order-up]');
        var down = e.target.closest('[data-order-down]');
        if (up) moveFeature(up.getAttribute('data-order-up'), -1);
        else if (down) moveFeature(down.getAttribute('data-order-down'), 1);
      });
    }
    GROUPS.forEach(load);
  }

  window.renderAdminSettings = renderAdminSettings;
})();
