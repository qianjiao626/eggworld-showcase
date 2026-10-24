/* ============================================================
   管理端「反馈工单」（外联 JS）—— 主从布局 v2
   设计语言：完全沿用站点既有令牌与组件，不引入自有配色
     · 卡片：白底 + radius 18 + var(--shadow)（同 .card）
     · 状态筛选：复用站点 .chip / .chip.active（薄荷青渐变选中态）
     · 标签：复用站点 .tag-*（red/lilac/orange/green/gray）
     · 按钮：复用 .btn .btn-primary / .btn-ghost .btn-sm
     · 输入：对齐 .input / .textarea（2px var(--border)、聚焦薄荷青光环）

   间距体系（v2 重点，避免模块粘连）：
     · 根容器 flex column，gap 20（工具条 ↔ 两栏）
     · 卡片内边距 24 上下留白；列表行 14×18，行内 3 行间距 7
     · 详情分区：小节标题上方 24、下方 12；描述/对话/回复区之间 24
     · 列表行不再套色块，改为纯文本三行（图标 + 摘要 / 人·时间 / 最近消息）

   布局：全宽筛选行 + 两栏（左：状态 chip 卡头 + 可滚动列表；右：同高详情卡）

   做法（不改主 HTML 逻辑）：运行时注入样式并覆盖 window.renderFeedbackTickets，
   继续维护 fbTicketsCache / feedbackBadge，页面原有回复弹窗与红点照旧可用。
   ============================================================ */
(function () {
  'use strict';

  var OVERDUE_MS = 24 * 3600 * 1000;      // 24 小时未处理 → 超时提醒

  var selId = null;
  var searchText = '';
  var sortMode = 'recent';
  var shellReady = false;

  var lastSig = '';            // 数据指纹：无变化则不重绘，避免闪动/打断阅读
  var pollTimer = null;
  var POLL_MS = 15000;         // 停留在该页时每 15 秒轻量轮询一次

  var QUICK = [
    '已收到，我们正在排查，有进展会在这里回复你～',
    '这个问题已修复，请强制刷新（Ctrl+F5）后重试～',
    '感谢建议！我们已记录，会在后续版本评估排期～',
    '麻烦补充一下：出现问题的页面 + 你的设备/浏览器，方便我们复现～'
  ];

  /* 类型 → 站点既有 tag 配色 / 紧凑图标 */
  var TYPE = {
    bug:        { tag: 'tag-red',    icon: '🐛', text: 'Bug 反馈' },
    suggestion: { tag: 'tag-lilac',  icon: '💡', text: '功能建议' },
    report:     { tag: 'tag-orange', icon: '🚨', text: '内容举报' },
    other:      { tag: 'tag-gray',   icon: '📝', text: '其他' }
  };
  var STATUS = {
    pending: { text: '待处理', tag: 'tag-orange' },
    replied: { text: '已回复', tag: 'tag-green' },
    closed:  { text: '已关闭', tag: 'tag-gray' }
  };

  /* ---------------- 工具 ---------------- */
  function statusOf(t) { return t.status === 'open' ? 'pending' : t.status; }
  function typeOf(t) { return TYPE[t.type] ? t.type : 'other'; }
  function typeInfo(t) { return TYPE[typeOf(t)]; }
  function statusInfo(st) { return STATUS[st] || { text: st, tag: 'tag-gray' }; }

  function createdMs(t) {
    if (!t || !t.createdAt) return 0;
    return new Date(String(t.createdAt).replace('T', ' ')).getTime() || 0;
  }
  function updatedMs(t) {
    var s = t.updatedAt || t.repliedAt || t.createdAt;
    return s ? (new Date(String(s).replace('T', ' ')).getTime() || 0) : 0;
  }
  function waitText(t) {
    return (typeof fbTimeText === 'function') ? fbTimeText(t.createdAt) : '';
  }
  function timeTextOf(iso) {
    return (typeof fbTimeText === 'function') ? fbTimeText(iso) : '';
  }
  function fullTime(iso) {
    return iso ? String(iso).replace('T', ' ').slice(0, 16) : '';
  }
  function isOverdue(t) {
    return statusOf(t) === 'pending' && (Date.now() - createdMs(t)) > OVERDUE_MS;
  }
  function msgsOf(t) { return t.messages || []; }
  function lastMsgOf(t) { var m = msgsOf(t); return m.length ? m[m.length - 1] : null; }

  /** 数据指纹：用于判断"这次拉取和上次相比有没有实质变化" */
  function signature(list) {
    return (list || []).map(function (t) {
      return [t.id, statusOf(t), t.userRead, msgsOf(t).length].join(',');
    }).join(';');
  }

  /** 回复框里有没有没发出去的草稿 */
  function replyDraftEl() { return document.getElementById('faReplyText'); }

  function nowIso() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function escape2(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortText(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ---------------- 样式 ---------------- */
  function injectStyle() {
    if (document.getElementById('faStyle')) return;
    var caret = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' ' +
      'width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%237A8AA8\' ' +
      'stroke-width=\'3\'><path d=\'M6 9l6 6 6-6\'/></svg>")';

    var css =
      /* — 隐藏页面原有的假搜索框、旧筛选行、旧单列列表 — */
      '#page-feedback .topbar .search{display:none}' +
      '#page-feedback > .filter-row{display:none}' +
      '#feedbackList{display:none!important}' +

      /* — 根：工具条与两栏之间固定 20 留白（v1 缺这层，导致贴在一起） — */
      '#faRoot{display:flex;flex-direction:column;gap:20px}' +

      /* — 全宽筛选行 — */
      '#faRoot .fa-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
      '#faRoot .fa-search{position:relative;flex:1;min-width:240px;max-width:460px}' +
      '#faRoot .fa-search input{width:100%;height:42px;padding:0 16px 0 38px;border-radius:14px;' +
        'background:#fff;border:2px solid var(--border);font-size:13px;color:var(--ink);' +
        'font-family:inherit;transition:border-color .2s,box-shadow .2s}' +
      '#faRoot .fa-search input::placeholder{color:var(--faint)}' +
      '#faRoot .fa-search input:focus{outline:none;border-color:var(--primary);' +
        'box-shadow:0 0 0 4px rgba(78,205,196,.12)}' +
      '#faRoot .fa-search .ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);' +
        'font-size:13px;color:var(--muted);pointer-events:none}' +
      '#faRoot select.fa-sel{height:42px;padding:0 36px 0 16px;border-radius:14px;background:#fff;' +
        'border:2px solid var(--border);font-size:13px;font-weight:600;color:var(--ink2);' +
        'font-family:inherit;cursor:pointer;transition:border-color .2s,box-shadow .2s;' +
        'appearance:none;-webkit-appearance:none;background-image:' + caret + ';' +
        'background-repeat:no-repeat;background-position:right 14px center}' +
      '#faRoot select.fa-sel:focus{outline:none;border-color:var(--primary);' +
        'box-shadow:0 0 0 4px rgba(78,205,196,.12)}' +

      /* — 两栏：等高卡片 — */
      '#faRoot .fa-body{display:grid;grid-template-columns:348px minmax(0,1fr);gap:20px;' +
        'align-items:stretch;height:calc(100vh - 300px);min-height:520px;max-height:900px}' +
      '#faRoot .fa-pane,#faRoot .fa-detail{display:flex;flex-direction:column;min-height:0;' +
        'background:#fff;border-radius:18px;box-shadow:var(--shadow);overflow:hidden}' +

      /* — 左栏：卡头（状态 chip）+ 列表 — */
      '#faRoot .fa-pane-head{display:flex;flex-wrap:wrap;gap:8px;flex:none;' +
        'padding:16px 18px;border-bottom:1px solid var(--border)}' +
      '#faRoot .fa-chip{padding:7px 12px;border-radius:12px;font-size:12.5px;gap:6px}' +
      '#faRoot .fa-chip .n{font-size:11px;font-weight:700;color:var(--muted)}' +
      '#faRoot .fa-chip.active .n{color:rgba(255,255,255,.92)}' +
      '#faRoot .fa-chip .n.hot{color:var(--red)}' +
      '#faRoot .fa-chip.active .n.hot{color:#fff}' +
      '#faRoot .fa-list{flex:1;min-height:0;overflow-y:auto}' +
      '#faRoot .fa-list::-webkit-scrollbar{width:6px}' +
      '#faRoot .fa-list::-webkit-scrollbar-thumb{background:#D8D2C2;border-radius:6px}' +

      /* — 列表行：纯文本三行，无嵌套色块 — */
      '#faRoot .fa-row{display:flex;flex-direction:column;gap:7px;position:relative;' +
        'padding:15px 18px;cursor:pointer;border-bottom:1px solid rgba(226,220,200,.55);' +
        'transition:background .18s}' +
      '#faRoot .fa-row:last-child{border-bottom:none}' +
      '#faRoot .fa-row:hover{background:var(--bg)}' +
      '#faRoot .fa-row.active{background:var(--primary-tint)}' +
      '#faRoot .fa-row.active::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;' +
        'background:var(--primary)}' +
      '#faRoot .fa-row-l1{display:flex;align-items:center;gap:8px;min-width:0}' +
      '#faRoot .fa-row-ico{font-size:14px;line-height:1;flex:none}' +
      '#faRoot .fa-row-subject{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:var(--ink);' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#faRoot .fa-row-l2{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
        'font-size:12px;color:var(--muted)}' +
      '#faRoot .fa-row-when{display:flex;align-items:center;gap:6px;min-width:0}' +
      '#faRoot .fa-row-when .dot{color:var(--faint)}' +
      '#faRoot .fa-row-flag{display:flex;align-items:center;gap:6px;flex:none}' +
      '#faRoot .fa-st{font-size:12px;font-weight:600}' +
      '#faRoot .fa-st.pending{color:var(--orange)}' +
      '#faRoot .fa-st.replied{color:var(--green)}' +
      '#faRoot .fa-st.closed{color:var(--muted)}' +
      '#faRoot .fa-hot{font-size:12px;font-weight:600;color:var(--red)}' +
      '#faRoot .fa-row-l3{font-size:12px;color:var(--muted);overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap}' +
      '#faRoot .fa-row-l3 b{color:var(--ink2);font-weight:600}' +

      /* — 右栏：详情 — */
      '#faRoot .fa-detail{padding:24px 26px;overflow-y:auto}' +
      '#faRoot .fa-detail::-webkit-scrollbar{width:6px}' +
      '#faRoot .fa-detail::-webkit-scrollbar-thumb{background:#D8D2C2;border-radius:6px}' +
      '#faRoot .fa-d-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px}' +
      '#faRoot .fa-code{font-size:13px;font-weight:700;color:var(--muted);letter-spacing:.4px}' +
      '#faRoot .fa-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));' +
        'gap:12px 28px;font-size:13px;color:var(--muted);padding-bottom:20px;' +
        'border-bottom:1px solid var(--border)}' +
      '#faRoot .fa-meta b{color:var(--ink2);font-weight:600}' +
      '#faRoot .fa-meta .overdue b{color:var(--red)}' +
      '#faRoot .fa-sec{display:flex;align-items:center;gap:8px;margin:24px 0 12px;' +
        'font-size:13px;font-weight:700;color:var(--ink2)}' +
      '#faRoot .fa-sec .cnt{font-size:12px;font-weight:600;color:var(--muted)}' +
      '#faRoot .fa-desc{background:var(--bg);border-radius:14px;padding:16px 18px;font-size:13px;' +
        'color:var(--ink2);line-height:1.75;white-space:pre-wrap;word-break:break-word}' +
      '#faRoot .fa-thread{display:flex;flex-direction:column;gap:14px}' +
      '#faRoot .fa-msg{display:flex;flex-direction:column;max-width:82%}' +
      '#faRoot .fa-msg.who-admin{align-self:flex-end;align-items:flex-end}' +
      '#faRoot .fa-msg.who-user{align-self:flex-start}' +
      '#faRoot .fa-msg-who{font-size:11px;font-weight:600;color:var(--faint);margin-bottom:5px}' +
      '#faRoot .fa-msg-bubble{padding:11px 15px;border-radius:14px;font-size:13px;line-height:1.7;' +
        'white-space:pre-wrap;word-break:break-word}' +
      '#faRoot .fa-msg.who-admin .fa-msg-bubble{background:var(--primary-tint);' +
        'color:var(--primary-dark);border-bottom-right-radius:5px}' +
      '#faRoot .fa-msg.who-user .fa-msg-bubble{background:var(--bg);color:var(--ink2);' +
        'border-bottom-left-radius:5px}' +
      '#faRoot .fa-msg-time{font-size:11px;color:var(--faint);margin-top:5px}' +

      /* — 回复区 — */
      '#faRoot .fa-reply{margin-top:24px;padding-top:20px;border-top:1px solid var(--border)}' +
      '#faRoot .fa-reply-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}' +
      '#faRoot .fa-quick{height:36px;padding:0 32px 0 14px;border-radius:11px;background:#fff;' +
        'border:2px solid var(--border);font-size:12.5px;font-weight:600;color:var(--ink2);' +
        'font-family:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;' +
        'background-image:' + caret + ';background-repeat:no-repeat;background-position:right 13px center}' +
      '#faRoot .fa-quick:focus{outline:none;border-color:var(--primary)}' +
      '#faRoot .fa-kbd{font-size:11.5px;color:var(--faint);margin-left:auto}' +
      '#faRoot .fa-textarea{display:block;width:100%;min-height:104px;padding:14px 16px;' +
        'border-radius:14px;resize:vertical;background:#fff;border:2px solid var(--border);' +
        'font-size:13px;color:var(--ink);font-family:inherit;line-height:1.7;' +
        'box-sizing:border-box;transition:border-color .2s,box-shadow .2s}' +
      '#faRoot .fa-textarea::placeholder{color:var(--faint)}' +
      '#faRoot .fa-textarea:focus{outline:none;border-color:var(--primary);' +
        'box-shadow:0 0 0 4px rgba(78,205,196,.12)}' +
      '#faRoot .fa-actions{display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap}' +
      '#faRoot .fa-closed-tip{background:var(--bg);border-radius:14px;padding:18px;text-align:center;' +
        'font-size:13px;color:var(--muted);line-height:1.8}' +

      /* — 空状态 — */
      '#faRoot .fa-empty{flex:1;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:10px;padding:48px 24px;text-align:center;' +
        'font-size:13px;color:var(--muted);line-height:1.9}' +
      '#faRoot .fa-empty .ico{font-size:34px;opacity:.85}' +
      '#faRoot .fa-empty.inline{flex:none;padding:20px 0}' +

      '@media (max-width:1100px){' +
        '#faRoot .fa-body{grid-template-columns:1fr;height:auto;max-height:none;gap:16px}' +
        '#faRoot .fa-pane{height:54vh}' +
        '#faRoot .fa-detail{height:auto}' +
      '}';
    var st = document.createElement('style');
    st.id = 'faStyle';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------------- 骨架（只建一次） ---------------- */
  function ensureShell() {
    if (shellReady && document.getElementById('faRoot')) return true;
    injectStyle();

    var page = document.getElementById('page-feedback');
    var oldList = document.getElementById('feedbackList');
    if (!page || !oldList) return false;

    /* 标题行右侧：沿用站点 .tag，只留两个关键数字 */
    var tagBox = page.querySelector('.title-row .gap8');
    if (tagBox) {
      tagBox.id = 'faStats';
      tagBox.className = 'gap8';
      tagBox.style.display = 'flex';
      tagBox.style.gap = '8px';
      tagBox.style.alignItems = 'center';
    }

    if (!document.getElementById('faRoot')) {
      var root = document.createElement('div');
      root.id = 'faRoot';
      root.innerHTML =
        '<div class="fa-toolbar">' +
          '<div class="fa-search"><span class="ic">🔍</span>' +
            '<input type="text" id="faSearch" placeholder="搜索内容 / 用户 / 联系方式 / 工单号">' +
          '</div>' +
          '<select class="fa-sel" id="faType">' +
            '<option value="all">全部类型</option>' +
            '<option value="bug">🐛 Bug 反馈</option>' +
            '<option value="suggestion">💡 功能建议</option>' +
            '<option value="report">🚨 内容举报</option>' +
            '<option value="other">📝 其他</option>' +
          '</select>' +
          '<select class="fa-sel" id="faSort">' +
            '<option value="recent">最新动态优先</option>' +
            '<option value="waiting">等待最久优先</option>' +
            '<option value="oldest">最早提交优先</option>' +
          '</select>' +
        '</div>' +
        '<div class="fa-body">' +
          '<div class="fa-pane">' +
            '<div class="fa-pane-head" id="faTabs"></div>' +
            '<div class="fa-list" id="faList"></div>' +
          '</div>' +
          '<div class="fa-detail" id="faDetail"></div>' +
        '</div>';
      oldList.parentNode.insertBefore(root, oldList.nextSibling);
    }

    bindShell(document.getElementById('faRoot'));
    shellReady = true;
    return true;
  }

  function bindShell(root) {
    root.querySelector('#faTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.fa-chip');
      if (!b) return;
      window.fbFilterStatus = b.getAttribute('data-st');
      paint();
    });

    var search = root.querySelector('#faSearch');
    search.addEventListener('input', function () {
      searchText = search.value.trim();
      renderListOnly();
    });

    root.querySelector('#faType').addEventListener('change', function () {
      window.fbFilterType = this.value;
      renderListOnly();
    });
    root.querySelector('#faSort').addEventListener('change', function () {
      sortMode = this.value;
      renderListOnly();
    });

    root.querySelector('#faList').addEventListener('click', function (e) {
      var row = e.target.closest('.fa-row');
      if (!row) return;
      var next = parseInt(row.getAttribute('data-id'), 10);
      if (next !== selId) {
        var ta = replyDraftEl();          // 换单：丢弃上一条的草稿，避免串到别的工单
        if (ta) ta.value = '';
      }
      selId = next;
      renderListOnly();
      renderDetail();
    });

    var detail = root.querySelector('#faDetail');
    detail.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = parseInt(btn.getAttribute('data-id'), 10);
      if (act === 'send') {
        var ta = detail.querySelector('#faReplyText');
        sendReply(id, ta ? ta.value : '', btn);
      } else if (act === 'close') {
        if (typeof closeFeedbackTicket === 'function') closeFeedbackTicket(id);
      }
    });
    detail.addEventListener('change', function (e) {
      if (e.target.id !== 'faQuick') return;
      var ta = detail.querySelector('#faReplyText');
      if (ta && e.target.value) {
        ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + e.target.value;
        ta.focus();
      }
      e.target.value = '';
    });
    detail.addEventListener('keydown', function (e) {
      if (e.target.id !== 'faReplyText') return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        var btn = detail.querySelector('[data-act="send"]');
        sendReply(parseInt(btn.getAttribute('data-id'), 10), e.target.value, btn);
      }
    });
  }

  /* ---------------- 数据 ---------------- */
  /**
   * 拉取工单列表
   * @param force true=用户主动触发（无变化也重绘、失败会提示）
   *              false=轮询/后台核对（无实质变化则不重绘，避免闪动）
   */
  async function refresh(force) {
    if (!ensureShell()) return;
    var res = await apiGet('/api/admin/feedback?page=1&size=100');
    if (!res || res.code !== 200) {
      if (force) toast('读取工单失败，请稍后再试');
      return;
    }
    var list = (res.data && res.data.records) || [];
    window.fbTicketsCache = list;                       // 页面原有回复弹窗/红点都读它
    if (typeof updateFeedbackBadge === 'function') updateFeedbackBadge();

    var sig = signature(list);
    if (!force && sig === lastSig) return;              // 无实质变化：保持现状
    lastSig = sig;
    paint();
  }

  function allTickets() { return window.fbTicketsCache || []; }

  function filteredTickets() {
    var st = window.fbFilterStatus || 'all';
    var ty = window.fbFilterType || 'all';
    var kw = searchText.toLowerCase();
    return allTickets().filter(function (t) {
      if (st !== 'all' && statusOf(t) !== st) return false;
      if (ty !== 'all' && typeOf(t) !== ty) return false;
      if (kw) {
        var hay = ((t.content || '') + ' ' + (t.userName || '') + ' ' + (t.contact || '') + ' #' + t.id).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (sortMode === 'oldest') return createdMs(a) - createdMs(b);
      if (sortMode === 'waiting') {
        var pa = statusOf(a) === 'pending' ? 0 : 1, pb = statusOf(b) === 'pending' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return createdMs(a) - createdMs(b);
      }
      return updatedMs(b) - updatedMs(a);
    });
  }

  function counts() {
    var c = { all: 0, pending: 0, replied: 0, closed: 0, overdue: 0 };
    allTickets().forEach(function (t) {
      c.all++;
      var st = statusOf(t);
      if (c[st] != null) c[st]++;
      if (isOverdue(t)) c.overdue++;
    });
    return c;
  }

  /* ---------------- 渲染 ---------------- */
  function paint() {
    if (selId == null) {
      var first = filteredTickets()[0];
      if (first) selId = first.id;
    }
    renderStats();
    renderTabs();
    renderListOnly();
    renderDetail();
  }

  function renderStats() {
    var box = document.getElementById('faStats');
    if (!box) return;
    var c = counts();
    box.innerHTML =
      '<span class="tag tag-orange">待处理 ' + c.pending + '</span>' +
      (c.overdue ? '<span class="tag tag-red">⚠ 超时 ' + c.overdue + '</span>' : '');
  }

  function renderTabs() {
    var box = document.getElementById('faTabs');
    if (!box) return;
    var c = counts();
    var cur = window.fbFilterStatus || 'all';
    var defs = [
      { k: 'all', n: '全部', v: c.all, hot: false },
      { k: 'pending', n: '待处理', v: c.pending, hot: c.overdue > 0 },
      { k: 'replied', n: '已回复', v: c.replied, hot: false },
      { k: 'closed', n: '已关闭', v: c.closed, hot: false }
    ];
    box.innerHTML = defs.map(function (d) {
      return '<span class="chip fa-chip' + (cur === d.k ? ' active' : '') + '" data-st="' + d.k + '">' +
        d.n + '<span class="n' + (d.hot ? ' hot' : '') + '">' + d.v + '</span></span>';
    }).join('');
  }

  function renderListOnly() {
    var box = document.getElementById('faList');
    if (!box) return;
    var list = filteredTickets();
    if (!list.length) {
      box.innerHTML = '<div class="fa-empty"><span class="ico">📭</span>' +
        (searchText ? '没有匹配的工单<br>换个关键词试试' : '当前筛选下暂无工单') + '</div>';
      return;
    }
    box.innerHTML = list.map(function (t) {
      var st = statusOf(t);
      var info = typeInfo(t);
      var overdue = isOverdue(t);
      var lm = lastMsgOf(t);
      var preview = lm
        ? '💬　<b>' + (lm.senderType === 'admin' ? '我' : '用户') + '</b>　' + escape2(shortText(lm.content, 26))
        : (t.contact ? '📞　' + escape2(shortText(t.contact, 26)) : '💬　暂无对话');

      return '<div class="fa-row' + (t.id === selId ? ' active' : '') + '" data-id="' + t.id + '">' +
        '<div class="fa-row-l1">' +
          '<span class="fa-row-ico">' + info.icon + '</span>' +
          '<span class="fa-row-subject">' + escape2(shortText(t.content, 22)) + '</span>' +
        '</div>' +
        '<div class="fa-row-l2">' +
          '<span class="fa-row-when">' +
            '<span>' + escape2(t.userName || '匿名') + '</span>' +
            '<span class="dot">·</span>' +
            '<span>等待 ' + waitText(t) + '</span>' +
          '</span>' +
          '<span class="fa-row-flag">' +
            (overdue ? '<span class="fa-hot">⚠ 超时</span>' : '') +
            '<span class="fa-st ' + st + '">' + statusInfo(st).text + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="fa-row-l3">' + preview + '</div>' +
      '</div>';
    }).join('');
  }

  function renderDetail() {
    var box = document.getElementById('faDetail');
    if (!box) return;

    /* 重绘前记住回复框里的草稿与焦点，重绘后还原：
       这样轮询/后台核对触发的重绘不会把正在写的内容清掉 */
    var draftEl = replyDraftEl();
    var draft = draftEl ? draftEl.value : '';
    var hadFocus = !!(draftEl && document.activeElement === draftEl);

    var t = allTickets().filter(function (x) { return x.id === selId; })[0];
    if (!t) {
      box.innerHTML = '<div class="fa-empty"><span class="ico">👈</span>' +
        '从左侧选择一条工单<br>查看详情并回复</div>';
      return;
    }

    var st = statusOf(t);
    var overdue = isOverdue(t);
    var msgs = msgsOf(t);
    var info = typeInfo(t);
    var stInfo = statusInfo(st);

    var thread = msgs.length
      ? msgs.map(function (m) {
          var isAdmin = m.senderType === 'admin';
          return '<div class="fa-msg ' + (isAdmin ? 'who-admin' : 'who-user') + '">' +
            '<div class="fa-msg-who">' + (isAdmin ? '我（管理员）' : '用户') + '</div>' +
            '<div class="fa-msg-bubble">' + escape2(m.content) + '</div>' +
            '<div class="fa-msg-time">' + timeTextOf(m.createdAt) + '</div>' +
          '</div>';
        }).join('')
      : '<div class="fa-empty inline">还没有对话记录</div>';

    var replyArea = st === 'closed'
      ? '<div class="fa-reply"><div class="fa-closed-tip">该工单已关闭。<br>' +
        '如需继续沟通，可让用户重新提交一条反馈。</div></div>'
      : '<div class="fa-reply">' +
          '<div class="fa-reply-head">' +
            '<select class="fa-quick" id="faQuick">' +
              '<option value="">快捷语模板</option>' +
              QUICK.map(function (q) {
                return '<option value="' + escape2(q) + '">' + escape2(shortText(q, 26)) + '</option>';
              }).join('') +
            '</select>' +
            '<span class="fa-kbd">Ctrl / ⌘ + Enter 发送</span>' +
          '</div>' +
          '<textarea class="fa-textarea" id="faReplyText" ' +
            'placeholder="写下回复，用户会在「帮助与反馈 → 我的反馈」里看到～"></textarea>' +
          '<div class="fa-actions">' +
            '<button class="btn btn-primary btn-sm" data-act="send" data-id="' + t.id + '">📨 发送回复</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="close" data-id="' + t.id + '">' +
              (st === 'pending' ? '✅ 标记已处理' : '🔒 关闭工单') + '</button>' +
          '</div>' +
        '</div>';

    box.innerHTML =
      '<div class="fa-d-head">' +
        '<span class="fa-code">#' + t.id + '</span>' +
        '<span class="tag ' + info.tag + '">' + info.icon + ' ' + info.text + '</span>' +
        '<span class="tag ' + stInfo.tag + '">' + stInfo.text + '</span>' +
        (overdue ? '<span class="tag tag-red">⚠ 已超时</span>' : '') +
      '</div>' +
      '<div class="fa-meta">' +
        '<span>👤 提交人　<b>' + escape2(t.userName || '匿名') + '</b></span>' +
        '<span>🕒 提交时间　<b>' + fullTime(t.createdAt) + '</b></span>' +
        '<span class="' + (overdue ? 'overdue' : '') + '">⏳ 已等待　<b>' + waitText(t) + '</b></span>' +
        (t.contact ? '<span>📞 联系方式　<b>' + escape2(t.contact) + '</b></span>' : '') +
      '</div>' +
      '<div class="fa-sec">📝 用户描述</div>' +
      '<div class="fa-desc">' + escape2(t.content || '') + '</div>' +
      '<div class="fa-sec">💬 对话记录' +
        (msgs.length ? '<span class="cnt">共 ' + msgs.length + ' 条</span>' : '') + '</div>' +
      '<div class="fa-thread">' + thread + '</div>' +
      replyArea;

    /* 还原草稿（若重绘前有未发送内容） */
    if (draft) {
      var ta = replyDraftEl();
      if (ta) {
        ta.value = draft;
        if (hadFocus) {
          ta.focus();
          try { ta.setSelectionRange(draft.length, draft.length); } catch (e) {}
        }
      }
    }
  }

  /* ---------------- 动作 ---------------- */
  /** 发送成功后先写进本地缓存 → 立刻上屏（不等下一次网络往返） */
  function applyLocalReply(id, text) {
    var t = allTickets().filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var iso = nowIso();
    if (!t.messages) t.messages = [];
    t.messages.push({ ticketId: id, senderType: 'admin', content: text, createdAt: iso });
    t.adminReply = text;
    t.repliedAt = iso;
    t.status = 'replied';
    t.userRead = 0;
    t.updatedAt = iso;
    lastSig = signature(allTickets());     // 与随后服务器返回对齐，避免二次闪动
    paint();
  }

  async function sendReply(id, text, btn) {
    text = (text || '').trim();
    if (!text) {
      toast('请先填写回复内容');
      var ta0 = replyDraftEl();
      if (ta0) ta0.focus();
      return;
    }
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }

    var res;
    try {
      res = await apiPost('/api/admin/feedback/' + id + '/reply', { adminReply: text });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
    if (!res || res.code !== 200) {
      toast((res && res.msg) || '发送失败，请稍后再试');
      return;
    }

    /* 先清空草稿再上屏：这样重绘时不会把刚发出去的内容当成"未发送草稿"还原回来 */
    var ta = replyDraftEl();
    if (ta) ta.value = '';

    applyLocalReply(id, text);
    toast('回复已发送并保存 ✉️');

    refresh(false);                        // 后台与服务器核对（指纹一致则不会重绘）
  }

  /* ---------------- 接入 ---------------- */
  /**
   * 停留在此页时轻量轮询：用户新提交的工单、新追问会自动出现，不用手动刷新。
   * 正在写回复时不打断（避免草稿被清）。
   */
  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      var page = document.getElementById('page-feedback');
      if (!page || !page.classList.contains('active')) return;
      var ta = replyDraftEl();
      if (ta && ta.value.trim()) return;
      refresh(false);
    }, POLL_MS);
  }

  function setup() {
    if (!ensureShell()) {
      setTimeout(function () { if (ensureShell()) { refresh(true); startPoll(); } }, 600);
      return;
    }
    window.renderFeedbackTickets = function () { return refresh(true); };
    startPoll();
    var page = document.getElementById('page-feedback');
    if (page && page.classList.contains('active')) refresh(true);
  }

  document.addEventListener('click', function (e) {
    var nav = e.target.closest && e.target.closest('.nav-item[data-page="feedback"]');
    if (!nav) return;
    setTimeout(function () {
      if (!(window.fbTicketsCache || []).length) refresh();
    }, 300);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
