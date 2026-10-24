/* ============================================================
   反馈工单中心（外联 JS）—— 「帮助与反馈」
   P0 目标：让用户能看到管理员的回复、并知道"有回复了"

   做法（不改主 HTML）：
     · 悬浮入口仍是原来的按钮，文案改为「帮助与反馈」，未读时挂红点数字
     · 复用原有弹窗，顶部注入两个 tab：`✍️ 我要反馈` / `📬 我的反馈`
       （原表单节点由本文件在运行时收进 #fbTabSubmit，不删不改）
     · 「我的反馈」拉 GET /api/feedback/mine，展示：类型 / 状态 / 我的内容 /
       官方回复气泡 / 时间；未读回复加红点与高亮
     · 打开面板时自动把未读回复标记已读（POST /api/feedback/{id}/read），
       本次仍保留高亮，下次进来就不亮了
     · 提交反馈改走带 type 的请求（原提交函数漏传类型，导致管理端全是"其他"）

   配套后端：/api/feedback/mine、/api/feedback/mine/summary、
             /api/feedback/{id}/read；管理员回复时会写一条站内通知（铃铛）
   ============================================================ */
(function () {
  'use strict';

  var TYPES = { bug: '🐛 Bug 反馈', suggestion: '💡 功能建议', report: '🚨 内容举报', other: '📝 其他' };
  var STATUS = { pending: '待处理', replied: '已回复', closed: '已关闭' };

  /* 轮询相关：面板打开时自动核对，管理员回复无需刷新页面即可看到 */
  var mineRows = [];        // 最近一次拉到的「我的反馈」
  var mineSig = '';         // 数据指纹：无变化则不重绘，避免闪动
  var pollTimer = null;
  var POLL_MS = 15000;      // 每 15 秒核对一次（红点 + 已打开的列表）

  function nowIso() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function mineSignature(rows) {
    return (rows || []).map(function (t) {
      return [t.id, normStatus(t.status), t.userRead, (t.messages || []).length].join(',');
    }).join(';');
  }

  /** 列表里有没有还没发出去的追问草稿（有就别重绘，免得清掉用户输入） */
  function hasFollowDraft() {
    var list = document.getElementById('fbMineList');
    if (!list) return false;
    var inputs = list.querySelectorAll('.fb-followup-input');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value.trim()) return true;
    }
    return false;
  }

  function typeLabel(t) {
    if (typeof getFbTypeLabel === 'function') return getFbTypeLabel(t);
    return TYPES[t] || TYPES.other;
  }

  function statusLabel(st) {
    if (typeof getFbStatusLabel === 'function') return getFbStatusLabel(st);
    return STATUS[st] || st;
  }

  /* 后端 open → 前端 pending（与页面既有约定一致） */
  function normStatus(raw) {
    return raw === 'open' ? 'pending' : raw;
  }

  function fmtTime(s) {
    if (!s) return '';
    var str = String(s).replace('T', ' ');
    return str.length >= 16 ? str.slice(5, 16) : str;
  }

  function isUnreadReply(t) {
    return normStatus(t.status) === 'replied' && !!t.adminReply && t.userRead === 0;
  }

  /* ---------- 样式（只作用于本文件注入的元素） ---------- */
  function injectStyle() {
    if (document.getElementById('fbCenterStyle')) return;
    var css =
      /* tab */
      '#feedbackModal .fb-tabs{display:flex;gap:6px;padding:4px;background:#F4F1FF;border-radius:13px;margin-bottom:18px}' +
      '#feedbackModal .fb-tab{flex:1;padding:9px 10px;border:none;background:transparent;border-radius:10px;' +
        'font-size:13px;font-weight:700;color:#7C7C8A;cursor:pointer;transition:all .18s ease;font-family:inherit;white-space:nowrap}' +
      '#feedbackModal .fb-tab:hover{color:#6366F1}' +
      '#feedbackModal .fb-tab.active{background:#fff;color:#4F46E5;box-shadow:0 2px 8px rgba(99,102,241,.18)}' +
      '#feedbackModal .fb-tab-badge{display:inline-block;min-width:16px;height:16px;line-height:16px;padding:0 4px;' +
        'margin-left:5px;border-radius:8px;background:#EF4444;color:#fff;font-size:10px;font-weight:800;vertical-align:1px}' +
      /* 我的反馈列表 */
      '.fb-mine-list{display:flex;flex-direction:column;gap:10px;max-height:46vh;overflow-y:auto;padding-right:2px}' +
      '.fb-mine-card{border:1.5px solid #EFE9FB;border-radius:14px;padding:13px 14px;background:#fff;transition:all .18s ease}' +
      '.fb-mine-card.unread{border-color:#C7BFFF;background:#FBFAFF}' +
      '.fb-mine-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}' +
      '.fb-mine-dot{width:7px;height:7px;border-radius:50%;background:#EF4444;flex:none}' +
      '.fb-mine-type{font-size:11px;font-weight:700;padding:3px 9px;border-radius:8px;background:#F3F0FF;color:#6D28D9}' +
      '.fb-mine-status{font-size:11px;font-weight:700;padding:3px 9px;border-radius:8px}' +
      '.fb-mine-status.pending{background:#FFF7E6;color:#B45309}' +
      '.fb-mine-status.replied{background:#E9FBF0;color:#15803D}' +
      '.fb-mine-status.closed{background:#F3F4F6;color:#6B7280}' +
      '.fb-mine-id{font-size:11px;color:#C4B5FD;font-weight:700}' +
      '.fb-mine-time{margin-left:auto;font-size:11px;color:#9CA3AF}' +
      '.fb-mine-content{font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;word-break:break-word}' +
      '.fb-mine-reply{margin-top:10px;padding:11px 13px;border-radius:12px;' +
        'background:linear-gradient(135deg,#F5F3FF,#EEF2FF);border-left:3px solid #8B5CF6}' +
      '.fb-mine-reply-title{font-size:11px;font-weight:800;color:#6D28D9;margin-bottom:5px}' +
      '.fb-mine-reply-text{font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;word-break:break-word}' +
      '.fb-mine-reply-time{font-size:11px;color:#9CA3AF;margin-top:6px}' +
      /* 会话线程（用户追问 P1）：自己的靠右、官方的靠左 */
      '.fb-thread{margin-top:11px;padding-top:11px;border-top:1px dashed #EAE2FA;display:flex;flex-direction:column;gap:9px}' +
      '.fb-msg{display:flex;flex-direction:column;max-width:88%}' +
      '.fb-msg.from-admin{align-self:flex-start}' +
      '.fb-msg.from-me{align-self:flex-end;align-items:flex-end}' +
      '.fb-msg-who{font-size:10.5px;font-weight:800;color:#A78BFA;margin-bottom:3px}' +
      '.fb-msg.from-me .fb-msg-who{color:#F0A0B8}' +
      '.fb-msg-bubble{padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.6;' +
        'white-space:pre-wrap;word-break:break-word}' +
      '.fb-msg.from-admin .fb-msg-bubble{background:linear-gradient(135deg,#F5F3FF,#EEF2FF);' +
        'color:#374151;border-top-left-radius:4px}' +
      '.fb-msg.from-me .fb-msg-bubble{background:#FFF1F5;color:#4B3A46;border-top-right-radius:4px}' +
      '.fb-msg-time{font-size:10.5px;color:#B9AEC9;margin-top:3px}' +
      /* 追问输入（用 #feedbackModal 提权，覆盖弹窗内 input 的通用样式） */
      '#feedbackModal .fb-followup{display:flex;gap:8px;margin-top:12px}' +
      '#feedbackModal .fb-followup-input{flex:1;min-width:0;width:auto;height:36px;padding:0 12px;' +
        'border:1.5px solid #E8E0F5;border-radius:10px;font-size:13px;font-family:inherit;' +
        'background:#FAF7FF;color:#374151;outline:none;box-sizing:border-box;transition:all .18s ease}' +
      '#feedbackModal .fb-followup-input:focus{border-color:#8B5CF6;background:#fff}' +
      '#feedbackModal .fb-followup-btn{flex:none;padding:0 16px;height:36px;border:none;border-radius:10px;' +
        'background:linear-gradient(135deg,#8B5CF6,#6366F1);color:#fff;font-size:13px;font-weight:700;' +
        'cursor:pointer;font-family:inherit;transition:all .18s ease}' +
      '#feedbackModal .fb-followup-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(99,102,241,.3)}' +
      '#feedbackModal .fb-followup-btn[disabled]{opacity:.6;cursor:default;transform:none}' +
      '.fb-followup-closed{margin-top:11px;padding:9px 12px;border-radius:10px;background:#F7F7F9;' +
        'color:#8A8A99;font-size:12px;text-align:center}' +
      /* 管理端回复弹窗里的对话记录 */
      '#replyModal .fb-admin-thread{max-height:30vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:4px 0 2px}' +
      '.fb-mine-empty{text-align:center;padding:34px 12px;color:#9CA3AF;font-size:13px;line-height:1.7}' +
      '.fb-mine-empty .ico{font-size:38px;display:block;margin-bottom:10px}' +
      /* 悬浮入口红点（FAB 本身是 fixed，绝对定位子元素即可） */
      '.contact-fab .fb-fab-badge{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;line-height:18px;' +
        'padding:0 5px;border-radius:9px;background:#EF4444;color:#fff;font-size:11px;font-weight:800;' +
        'box-shadow:0 2px 6px rgba(239,68,68,.45);pointer-events:none}' +
      /* 悬浮入口可拖动：触屏上不让页面滚动抢走手势；拖动中禁用过渡与 hover 形效
         （.contact-fab 基础样式带 transition:all .3s 与 hover 的 scale/rotate，拖动时会拖泥带水） */
      '.contact-fab{touch-action:none}' +
      '.contact-fab.dragging,.contact-fab.dragging:hover{transition:none;cursor:grabbing;transform:none}' +
      /* 拖到屏幕左半边时，悬停提示改往右弹，避免提示文字跑出屏幕 */
      '.contact-fab.tip-right .fab-tip{left:68px;right:auto}';
    var st = document.createElement('style');
    st.id = 'fbCenterStyle';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- 入口红点 ---------- */
  function ensureFabBadge() {
    var fab = document.querySelector('.contact-fab');
    if (!fab || document.getElementById('fbFabBadge')) return;
    var b = document.createElement('span');
    b.id = 'fbFabBadge';
    b.className = 'fb-fab-badge';
    b.style.display = 'none';
    fab.appendChild(b);
  }

  /* ---------- 悬浮入口可拖动（避免遮挡其他页面的功能按钮） ----------
     · 位移超过阈值才算拖动，否则仍按点击打开面板；拖动过的那一次 click 会被拦掉
     · 位置用 inline left/top（right/bottom 置 auto）；没拖过时保持 CSS 里的默认位置
     · 位置记在 localStorage，刷新/重开后仍在；视口变化时夹回可视区域，避免拖出去找不回来
     · 移动端额外避开底部导航（横跨整宽、且贴在视口下半部的那种），免得拖过去反而挡住它 */
  var FAB_POS_KEY = 'eggworld:fabPos';
  var FAB_EDGE = 8;            // 距视口边缘的最小间距
  var FAB_DRAG_THRESHOLD = 5;  // 超过这个位移才判定为拖动
  var fabEl = null, fabDrag = null, fabMoved = false, fabSuppressClick = false;

  function clampNum(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function fabRange() {
    var w = window.innerWidth, h = window.innerHeight;
    var maxLeft = Math.max(FAB_EDGE, w - fabEl.offsetWidth - FAB_EDGE);
    var maxTop = Math.max(FAB_EDGE, h - fabEl.offsetHeight - FAB_EDGE);
    var bar = document.querySelector('.sidebar');
    if (bar) {
      var r = bar.getBoundingClientRect();
      if (r.width >= w - 2 && r.top > h / 2) {   // 横跨整宽 + 位于下半屏 = 移动端底部栏
        maxTop = Math.min(maxTop, Math.max(FAB_EDGE, r.top - fabEl.offsetHeight - FAB_EDGE));
      }
    }
    return { maxLeft: maxLeft, maxTop: maxTop };
  }

  function placeFab(left, top) {
    var r = fabRange();
    var l = clampNum(left, FAB_EDGE, r.maxLeft);
    var t = clampNum(top, FAB_EDGE, r.maxTop);
    fabEl.style.left = l + 'px';
    fabEl.style.top = t + 'px';
    fabEl.style.right = 'auto';
    fabEl.style.bottom = 'auto';
    fabEl.classList.toggle('tip-right', l < window.innerWidth / 2);
  }

  function saveFabPos() {
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({
        left: parseFloat(fabEl.style.left) || 0,
        top: parseFloat(fabEl.style.top) || 0
      }));
    } catch (e) {}
  }

  function restoreFabPos() {
    var raw = null;
    try { raw = localStorage.getItem(FAB_POS_KEY); } catch (e) { return false; }
    if (!raw) return false;
    var pos = null;
    try { pos = JSON.parse(raw); } catch (e) { return false; }
    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return false;
    placeFab(pos.left, pos.top);   // 内部会夹回当前可视区域
    return true;
  }

  function enableFabDrag() {
    var el = document.querySelector('.contact-fab');
    if (!el || el.__fbDragBound) return;
    el.__fbDragBound = true;
    fabEl = el;
    restoreFabPos();

    el.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;   // 只响应主键 / 触摸
      fabSuppressClick = false;                 // 新一轮交互：先清掉上一次拖动留下的拦截标记
      var r = el.getBoundingClientRect();
      fabDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      fabMoved = false;
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
    });

    el.addEventListener('pointermove', function (e) {
      if (!fabDrag || e.pointerId !== fabDrag.id) return;
      var dx = e.clientX - fabDrag.x, dy = e.clientY - fabDrag.y;
      if (!fabMoved) {
        if (Math.abs(dx) + Math.abs(dy) < FAB_DRAG_THRESHOLD) return;
        fabMoved = true;
        el.classList.add('dragging');
      }
      e.preventDefault();   // 触屏上阻止页面跟着滚
      placeFab(fabDrag.left + dx, fabDrag.top + dy);
    });

    var endDrag = function (e) {
      if (!fabDrag || (e && e.pointerId !== fabDrag.id)) return;
      fabDrag = null;
      el.classList.remove('dragging');
      if (!fabMoved) return;   // 没移动 = 普通点击，交给原来的 onclick
      fabMoved = false;
      saveFabPos();
      fabSuppressClick = true; // 吃掉紧接着合成的那次 click
      setTimeout(function () { fabSuppressClick = false; }, 400);
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    /* 拖动后不应再打开反馈面板。按钮的 onclick 是内联的、注册得比这里早，
       只能在 document 的捕获阶段截断这次 click。 */
    document.addEventListener('click', function (e) {
      if (!fabSuppressClick) return;
      if (!e.target || !e.target.closest || !e.target.closest('.contact-fab')) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    /* 旋转 / 缩放窗口后夹回可视区域 */
    window.addEventListener('resize', function () {
      if (!fabEl.style.left) return;
      placeFab(parseFloat(fabEl.style.left), parseFloat(fabEl.style.top));
    });
  }

  function setBadge(n) {
    var fab = document.getElementById('fbFabBadge');
    if (fab) {
      fab.textContent = n;
      fab.style.display = n > 0 ? '' : 'none';
    }
    var tab = document.getElementById('fbMineBadge');
    if (tab) {
      tab.textContent = n;
      tab.style.display = n > 0 ? '' : 'none';
    }
  }

  async function refreshBadge() {
    if (!(window.USER && USER.registered)) {
      setBadge(0);
      return 0;
    }
    var res = await apiGet('/api/feedback/mine/summary');
    var n = (res && res.code === 200 && res.data) ? (res.data.unread || 0) : 0;
    setBadge(n);
    return n;
  }

  /* ---------- tab 结构注入 ---------- */
  function ensureTabs() {
    var card = document.querySelector('#feedbackModal .feedback-card');
    if (!card || document.getElementById('fbTabBar')) return;
    var header = card.querySelector('.fb-header');
    if (!header) return;

    /* 1) 原有表单节点（header 之后的全部）收进 #fbTabSubmit */
    var submit = document.createElement('div');
    submit.id = 'fbTabSubmit';
    var nodes = [];
    for (var n = header.nextSibling; n; n = n.nextSibling) nodes.push(n);
    nodes.forEach(function (x) { submit.appendChild(x); });

    /* 2) tab 栏 */
    var bar = document.createElement('div');
    bar.id = 'fbTabBar';
    bar.className = 'fb-tabs';
    bar.innerHTML =
      '<button type="button" class="fb-tab active" data-tab="submit">✍️ 我要反馈</button>' +
      '<button type="button" class="fb-tab" data-tab="mine">📬 我的反馈' +
        '<span class="fb-tab-badge" id="fbMineBadge" style="display:none">0</span></button>';
    Array.prototype.forEach.call(bar.querySelectorAll('.fb-tab'), function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });
    header.parentNode.insertBefore(bar, header.nextSibling);
    header.parentNode.insertBefore(submit, bar.nextSibling);

    /* 3) 我的反馈容器 */
    var mine = document.createElement('div');
    mine.id = 'fbTabMine';
    mine.style.display = 'none';
    mine.innerHTML = '<div class="fb-mine-list" id="fbMineList"></div>';
    card.appendChild(mine);

    /* 4) 文案：入口与标题统一为「帮助与反馈」 */
    var tip = card.querySelector('.fb-title');
    if (tip) tip.textContent = '帮助与反馈';
    var sub = card.querySelector('.fb-sub');
    if (sub) sub.textContent = '有问题、建议或吐槽？提交后可在「我的反馈」里看到我们的回复';
    var fab = document.querySelector('.contact-fab .fab-tip');
    if (fab) fab.textContent = '帮助与反馈 · 提交问题';
  }

  function switchTab(name) {
    var submit = document.getElementById('fbTabSubmit');
    var mine = document.getElementById('fbTabMine');
    var bar = document.getElementById('fbTabBar');
    if (!submit || !mine || !bar) return;
    var isMine = name === 'mine';
    submit.style.display = isMine ? 'none' : '';
    mine.style.display = isMine ? '' : 'none';
    Array.prototype.forEach.call(bar.querySelectorAll('.fb-tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    if (isMine) loadMine(true);
  }

  /* ---------- 我的反馈 ---------- */
  /* 单条气泡：own=true 表示"我方"（用户视角=用户本人，管理端=管理员） */
  function bubbleHtml(senderIsAdmin, content, time, ownIsAdmin) {
    var mine = ownIsAdmin ? senderIsAdmin : !senderIsAdmin;   // 是否显示在右侧
    var who = senderIsAdmin ? '💬 官方' : '🙋 我';
    if (ownIsAdmin) who = senderIsAdmin ? '💬 我（管理员）' : '🙋 用户';
    return '<div class="fb-msg ' + (mine ? 'from-me' : 'from-admin') + '">' +
      '<div class="fb-msg-who">' + who + '</div>' +
      '<div class="fb-msg-bubble">' + escapeHtml(content || '') + '</div>' +
      (time ? '<div class="fb-msg-time">' + fmtTime(time) + '</div>' : '') +
    '</div>';
  }

  /* 会话线程（用户视角：官方在左、自己在右） */
  function threadHtml(t) {
    var msgs = t.messages || [];
    var inner;
    if (msgs.length) {
      inner = msgs.map(function (m) {
        return bubbleHtml(m.senderType === 'admin', m.content, m.createdAt, false);
      }).join('');
    } else if (t.adminReply) {
      /* 兼容：迁移前留下的老回复（此刻已由迁移脚本补进线程，这里只是兜底） */
      inner = bubbleHtml(true, t.adminReply, t.repliedAt, false);
    } else {
      return '';
    }
    return '<div class="fb-thread">' + inner + '</div>';
  }

  /* 追问输入区（已关闭的工单不给追问） */
  function followUpHtml(t) {
    if (normStatus(t.status) === 'closed') {
      return '<div class="fb-followup-closed">该反馈已关闭，如有新问题请重新提交一条反馈</div>';
    }
    return '<div class="fb-followup">' +
      '<input type="text" class="fb-followup-input" data-fid="' + t.id + '" maxlength="2000" ' +
        'placeholder="还有疑问？补充说明或继续追问…">' +
      '<button type="button" class="fb-followup-btn" data-fid="' + t.id + '">发送</button>' +
    '</div>';
  }

  function cardHtml(t) {
    var st = normStatus(t.status);
    var unread = isUnreadReply(t);
    return '<div class="fb-mine-card' + (unread ? ' unread' : '') + '">' +
      '<div class="fb-mine-head">' +
        (unread ? '<span class="fb-mine-dot"></span>' : '') +
        '<span class="fb-mine-type">' + typeLabel(t.type) + '</span>' +
        '<span class="fb-mine-status ' + st + '">' + statusLabel(st) + '</span>' +
        (t.id ? '<span class="fb-mine-id">#' + t.id + '</span>' : '') +
        '<span class="fb-mine-time">' + fmtTime(t.createdAt) + '</span>' +
      '</div>' +
      '<div class="fb-mine-content">' + escapeHtml(t.content || '') + '</div>' +
      threadHtml(t) +
      followUpHtml(t) +
    '</div>';
  }

  /* ---------- 追问 ---------- */
  async function sendFollowUp(id, inputEl, btnEl) {
    var text = inputEl ? inputEl.value.trim() : '';
    if (!text) {
      toast('请先输入追问内容');
      if (inputEl) inputEl.focus();
      return;
    }
    var oldText = btnEl ? btnEl.textContent : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '发送中'; }

    var res;
    try {
      res = await apiPost('/api/feedback/' + id + '/follow-up', { content: text });
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = oldText; }
    }
    if (!res || res.code !== 200) {
      toast((res && res.code === 400) ? (res.msg || '该反馈已关闭') : '发送失败，请稍后再试～');
      return;
    }
    /* 先清空输入框，再本地插入并即时上屏；最后与服务器核对 */
    if (inputEl) inputEl.value = '';
    applyLocalFollowUp(id, text);
    toast('已发送并保存，我们会尽快回复～');
    loadMine(false);
  }

  /** 发送成功后先写进本地缓存 → 立刻上屏（不等下一次网络往返） */
  function applyLocalFollowUp(id, text) {
    var t = mineRows.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var iso = nowIso();
    if (!t.messages) t.messages = [];
    t.messages.push({ ticketId: id, senderType: 'user', content: text, createdAt: iso });
    t.status = 'open';              // 追问后退回「待处理」
    t.userRead = 1;
    t.updatedAt = iso;
    mineSig = mineSignature(mineRows);   // 与随后服务器返回对齐，避免二次闪动
    renderMine();
  }

  function bindFollowUps() {
    var list = document.getElementById('fbMineList');
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.fb-followup-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-fid');
        var input = list.querySelector('.fb-followup-input[data-fid="' + id + '"]');
        sendFollowUp(id, input, btn);
      });
    });
    Array.prototype.forEach.call(list.querySelectorAll('.fb-followup-input'), function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var id = input.getAttribute('data-fid');
        var btn = list.querySelector('.fb-followup-btn[data-fid="' + id + '"]');
        sendFollowUp(id, input, btn);
      });
    });
  }

  /** 渲染「我的反馈」（只画 DOM，不请求；重绘前后保留各输入框草稿与焦点） */
  function renderMine() {
    var list = document.getElementById('fbMineList');
    if (!list) return;
    var rows = mineRows;

    var drafts = {};
    var focusId = null;
    Array.prototype.forEach.call(list.querySelectorAll('.fb-followup-input'), function (inp) {
      if (inp.value) drafts[inp.getAttribute('data-fid')] = inp.value;
      if (document.activeElement === inp) focusId = inp.getAttribute('data-fid');
    });

    if (!rows.length) {
      list.innerHTML = '<div class="fb-mine-empty"><span class="ico">📭</span>' +
        '还没有反馈记录<br>遇到问题随时在「我要反馈」里告诉我们～</div>';
      return;
    }

    list.innerHTML = rows.map(cardHtml).join('');
    bindFollowUps();

    Object.keys(drafts).forEach(function (id) {
      var inp = list.querySelector('.fb-followup-input[data-fid="' + id + '"]');
      if (inp) inp.value = drafts[id];
    });
    if (focusId) {
      var f = list.querySelector('.fb-followup-input[data-fid="' + focusId + '"]');
      if (f) {
        f.focus();
        try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {}
      }
    }

    /* 打开即视为已读：后台标记（本次仍保留高亮，下次进来不再标红） */
    var unreadIds = rows.filter(isUnreadReply).map(function (t) { return t.id; });
    if (unreadIds.length) {
      unreadIds.forEach(function (id) { apiPost('/api/feedback/' + id + '/read'); });
      setTimeout(refreshBadge, 400);
    }
  }

  /**
   * 拉取「我的反馈」
   * @param force true=用户主动打开（显示读取中、无变化也重绘）
   *              false=轮询/后台核对（无变化不重绘，避免闪动）
   */
  async function loadMine(force) {
    var list = document.getElementById('fbMineList');
    if (!list) return;
    if (force || !mineSig) list.innerHTML = '<div class="fb-mine-empty">读取中…</div>';

    var res = await apiGet('/api/feedback/mine?page=1&size=50');
    if (!res || res.code !== 200) {
      if (force || !mineSig) {
        list.innerHTML = '<div class="fb-mine-empty"><span class="ico">😕</span>' +
          '暂时读取不到反馈记录<br>请稍后再试～</div>';
      }
      return;
    }
    var rows = (res.data && res.data.records) || [];
    var sig = mineSignature(rows);
    if (!force && sig === mineSig) return;      // 无实质变化：保持现状
    mineSig = sig;
    mineRows = rows;
    renderMine();
  }

  /* ---------- 管理端：回复弹窗里展示完整对话 ---------- */
  /* 用户追问后管理员必须能看到上下文，否则回复会答非所问；
     数据随管理端列表一起返回（FeedbackTicket.messages） */
  function renderAdminThread() {
    var modal = document.getElementById('replyModal');
    if (!modal) return;
    var card = modal.querySelector('.reply-modal-card');
    if (!card) return;

    var old = document.getElementById('fbAdminThread');
    if (old) old.parentNode.removeChild(old);

    var ticket = null;
    try {
      var cache = window.fbTicketsCache || [];
      var curId = window.currentReplyTicketId;
      ticket = cache.filter(function (t) { return t.id === curId; })[0] || null;
    } catch (e) {}
    if (!ticket) return;

    var msgs = ticket.messages || [];
    if (!msgs.length) return;

    var box = document.createElement('div');
    box.id = 'fbAdminThread';
    box.innerHTML = '<div class="rm-lbl">对话记录</div>' +
      '<div class="fb-admin-thread">' +
        msgs.map(function (m) {
          return bubbleHtml(m.senderType === 'admin', m.content, m.createdAt, true);
        }).join('') +
      '</div>';

    var orig = card.querySelector('.rm-original');
    if (orig && orig.parentNode) {
      orig.parentNode.insertBefore(box, orig.nextSibling);
    } else {
      card.insertBefore(box, card.firstChild);
    }
  }

  /* ---------- 提交反馈：带上类型（原函数漏传，导致管理端全是"其他"） ---------- */
  async function submitFeedbackWithType() {
    var contentEl = document.getElementById('fbContent');
    var content = contentEl ? contentEl.value.trim() : '';
    if (!content) {
      toast('请填写反馈内容');
      if (contentEl) contentEl.focus();
      return;
    }
    var contactEl = document.getElementById('fbContact');
    var contact = contactEl ? contactEl.value.trim() : '';
    var type = window.currentFeedbackType || 'other';

    var res = await apiPost('/api/feedback', { content: content, contact: contact, type: type });
    if (!res || res.code !== 200) {
      toast((res && res.msg) || '提交失败');
      return;
    }
    var id = res.data;
    if (typeof closeFeedbackModal === 'function') closeFeedbackModal();
    toast(id ? ('反馈已提交（#' + id + '），可在「我的反馈」查看回复～') : '反馈提交成功！我们会尽快处理 💌');

    if (window.USER && USER.registered && typeof addNotif === 'function') {
      addNotif('你提交了一条新反馈，感谢你的支持～', 'feedback_submit');
    }
    if (typeof updateFeedbackBadge === 'function') updateFeedbackBadge();

    /* 管理员同时在管理端反馈页时，实时刷新那把列表 */
    var pf = document.getElementById('page-feedback');
    if (window.USER && USER.isAdmin && pf && pf.classList.contains('active') &&
        typeof renderFeedbackTickets === 'function') {
      renderFeedbackTickets();
    }

    /* 重新打开并切到「我的反馈」，让用户立刻看到它落在哪里。
       注意：openFeedbackModal 被本文件包装过（内部会异步刷新红点并按未读切 tab），
       所以要等这一步结束再切，否则会被它的回调覆盖。 */
    var opened = (typeof openFeedbackModal === 'function') ? openFeedbackModal() : null;
    var goMine = function () { switchTab('mine'); };
    if (opened && typeof opened.then === 'function') {
      opened.then(goMine);
    } else {
      goMine();
    }
  }

  /* ---------- 包装工具：原函数执行完（含 async）后回调 ----------
     若 after 返回 Promise，则把它作为返回值透出，调用方可以据此等待
     "包装后的完整流程"结束（提交反馈后切 tab 就依赖这一点） */
  function wrapAfter(name, after) {
    var original = window[name];
    if (typeof original !== 'function' || original.__fbWrapped) return;
    var wrapped = function () {
      var ret = original.apply(this, arguments);
      var out;
      var run = function () {
        try { out = after(); } catch (e) {}
      };
      if (ret && typeof ret.then === 'function') {
        return ret.then(function (v) { run(); return v; });
      }
      run();
      return (out && typeof out.then === 'function') ? out : ret;
    };
    wrapped.__fbWrapped = true;
    window[name] = wrapped;
  }

  /**
   * 轻量轮询：停留在页面上时自动核对，管理员回复无需刷新页面即可看到
   * · 悬浮入口红点：登录后持续核对（这样关着面板也能收到提示）
   * · 「我的反馈」列表：仅当面板打开且停在该 tab 时核对
   * · 正在写追问草稿时不打断（避免清掉输入）
   */
  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (!(window.USER && USER.registered)) return;
      refreshBadge();
      var modal = document.getElementById('feedbackModal');
      var mine = document.getElementById('fbTabMine');
      var open = modal && modal.style.display !== 'none' &&
                 mine && mine.style.display !== 'none';
      if (!open) return;
      if (hasFollowDraft()) return;
      loadMine(false);
    }, POLL_MS);
  }

  function setup() {
    injectStyle();
    ensureFabBadge();
    enableFabDrag();
    ensureTabs();
    window.submitFeedback = submitFeedbackWithType;   // 覆盖：带上反馈类型
    startPoll();

    /* 打开面板：刷新红点，有未读回复就直接落在「我的反馈」
       （返回 Promise，便于调用方等这次自动落点结束再决定切到哪个 tab） */
    wrapAfter('openFeedbackModal', function () {
      return refreshBadge().then(function (n) {
        switchTab(n > 0 ? 'mine' : 'submit');
      });
    });
    /* 登录/恢复会话后刷新一次红点；通知刷新时也顺带对齐 */
    wrapAfter('applyUserData', function () { setTimeout(refreshBadge, 300); });
    wrapAfter('updateNotifBadge', function () { setTimeout(refreshBadge, 300); });
    /* 管理端：打开回复弹窗后，把这条工单的完整对话补进去 */
    wrapAfter('replyFeedback', renderAdminThread);

    ensureFabBadge();
    setTimeout(refreshBadge, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
