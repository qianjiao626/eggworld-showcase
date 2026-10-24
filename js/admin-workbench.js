/* ============================================================
   管理员工作台（外联 JS）—— 数据监控仪表盘 + 页面热度 + 埋点上报

   设计原则：**每个数字都要有去处**
     · 待办类 KPI 可点直达处理页（并给目标页传筛选：举报/已封禁）
     · 分类分布图点条形 → 带分类预填跳「发官方任务」（数据 → 动作）
     · 资金概览「详情」→ 类型汇总 / 流水明细（可筛）/ 冻结清单
     · 趋势可配置：8 条指标池任选 ≤3 条 + 累计/增量，配置存 localStorage
     · 快照类死数字（全站待配对/待确认）明确标注「发布者侧 · 非你待办」

   指标口径（与后端 AdminStatsService 一致，详见 tasks/admin-workbench-plan.md）：
     · 平台投放 = 区间 type='reward' 的净额，平台真正增发的币（唯一影响币总量）
     · 任务流转 = 区间 type='earn' 的净额，用户间转移规模（活跃度，不改变币总量）
     · 流通总量 = 注册赠币 + 任务/邀请净往来 − 冻结中

   做法（不改主 HTML 逻辑）：
     · 运行时注入样式与资金详情弹窗
     · 包装 window.go / renderDashboard / renderUsers / renderFeedbackTickets

   依赖：js/chart.umd.min.js（本地化 Chart.js，运行时零外网请求）
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var PAGE_NAMES = {
    plaza: '技能变现', teamplaza: '组队共创', helplaza: '求助中心', rankhall: '神蛋榜单',
    gossip: '八卦吃瓜', blacklist: '大学黑榜', lab: '实验室.beta', mine: '我的', publish: '发布任务'
  };

  var TASK_TYPE_ORDER = ['teach', 'help', 'team', 'reward'];
  var TASK_TYPE_NAMES = { teach: '教学型', help: '求助型', team: '组队型', reward: '奖励型' };
  var SKILL_CAT_ORDER = ['study', 'job', 'side', 'hobby', 'game', 'life'];
  var SKILL_CAT_NAMES = { study: '学业技术', job: '就业技能', side: '副业技能', hobby: '兴趣爱好', game: '游戏搭子', life: '生活互助' };

  /* 趋势指标池：key 与后端 AdminStatsVO.SeriesVO.key 对应 */
  var TREND_POOL = [
    { key: 'newUsers', name: '新增用户', color: '#4C9FD8' },
    { key: 'publishedTasks', name: '发布任务', color: '#F2B134' },
    { key: 'completedTasks', name: '完成任务', color: '#2D7D4F' },
    { key: 'pageViews', name: '页面浏览', color: '#8B5CF6' },
    { key: 'platformIssued', name: '平台投放', color: '#D4A017' },
    { key: 'taskTurnover', name: '任务流转', color: '#45B7D1' },
    { key: 'newRatings', name: '新增评价', color: '#FF6B6B' },
    { key: 'newGossip', name: '新增打听', color: '#C4A3D4' }
  ];
  var TREND_CFG_KEY = 'egg_wb_trend_cfg';

  /* 流水类型 → 中文名 */
  var POINT_TYPE_NAMES = { reward: '平台投放', earn: '任务收入', spend: '任务支付', freeze: '冻结', refund: '退回' };
  var POINT_TYPE_ORDER = ['reward', 'earn', 'spend', 'freeze', 'refund'];

  /* 任务状态 → 中文名（冻结清单用） */
  var TASK_STATUS_NAMES = {
    pending: '待审核', approved: '待认领', in_progress: '进行中', full: '已满员',
    completed: '已完成', cancelled: '已取消', expired: '已超时', rejected: '已驳回'
  };

  var STUDENT_PAGES = ['plaza', 'teamplaza', 'helplaza', 'rankhall', 'gossip', 'blacklist', 'lab', 'mine', 'publish'];

  var RANGE_LABEL = { today: '今日', '7d': '近 7 日', '30d': '近 30 日' };
  var RANGES = ['today', '7d', '30d'];

  var C = { primary: '#4C9FD8', orange: '#F2B134', gold: '#D4A017', red: '#FF6B6B', green: '#2D7D4F', violet: '#8B5CF6' };

  var REDUCED_MOTION = false;
  try {
    REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { /* 老浏览器忽略 */ }

  var range = '7d';
  var charts = {};
  var loading = false;
  var firstRender = true;
  var lastStats = null;
  var trendCfg = { metrics: ['newUsers', 'publishedTasks'], mode: 'delta' };

  /* ---------------- 小工具 ---------------- */

  function byId(id) { return document.getElementById(id); }
  function user() { return window.USER || {}; }
  function num(n) { return (n == null ? 0 : n).toLocaleString('en-US'); }
  function signed(n) { var v = n || 0; return (v > 0 ? '+' : '') + num(v); }
  function pct(n) { return (n == null ? 0 : n).toFixed(1) + '%'; }
  function sum(arr) { return (arr || []).reduce(function (a, b) { return a + (b || 0); }, 0); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDay(s) { return s ? String(s).replace('T', ' ').slice(0, 10) : ''; }
  function fmtMinute(s) { return s ? String(s).replace('T', ' ').slice(0, 16) : ''; }

  /* 注意：主站 USER.isAdmin 对"副管理员"也为 true（见 applyUserData），
     不能用它判断主管理员；主管理员的可靠依据是 role === 'admin' */
  function isFullAdmin() { return user().role === 'admin'; }
  function isModerator() { var r = user().role; return r === 'admin' || r === 'subadmin'; }

  /* 是否持有某权限点（学生协管员；主/副管理员不落表） */
  function hasPerm(code) {
    var u = user();
    return !!(u && u.permissions && u.permissions.indexOf(code) >= 0);
  }

  /* 能否看工作台：主/副管理员，或持有「数据看板」权限的学生协管员（协管页复用工作台区块） */
  function canViewDashboard() { return isModerator() || hasPerm('data_dashboard'); }

  /* 协管员（持 data_dashboard 的学生）：能看大盘，但不能看具体数据 / 明细，也不能跳转处理页 */
  function isCoworker() { return !isModerator() && hasPerm('data_dashboard'); }

  /* 协管员的下钻 / 弹窗 / 跳转入口统一拦在这里：给提醒并返回 true（调用方直接 return） */
  function coworkBlocked() {
    if (!isCoworker()) return false;
    if (typeof window.toast === 'function') window.toast('协管员无法查看具体数据');
    return true;
  }

  /* 协管员视角精简：去掉与其无关的操作入口
     （提醒待配对发布者 / 发布任务 / 顶栏「待审核 N」胶囊 / 趋势「配置」 / 「查看数据表」 / 资金「详情」） */
  function applyCoworkChrome() {
    var dash = byId('page-dashboard');
    if (!dash) return;
    var hide = isCoworker();
    function toggle(sel) {
      dash.querySelectorAll(sel).forEach(function (el) { el.style.display = hide ? 'none' : ''; });
    }
    toggle('.title-row .gap8');
    toggle('.wb-cfg-wrap');
    toggle('.wb-alt');
    /* 资金「详情」的显隐由 canDetail 判定，这里只在协管员视角额外隐藏，避免把副管理员本来隐藏的又显出来 */
    if (hide) toggle('[data-block="coin"] .wb-link');
    /* 顶栏「待审核 N」胶囊按文案识别，避免误改「刷新」 */
    dash.querySelectorAll('.topbar .btn-ghost').forEach(function (b) {
      if ((b.textContent || '').trim().indexOf('待审核') === 0) b.style.display = hide ? 'none' : '';
    });
  }

  function toggleBlock(name, visible) {
    var el = document.querySelector('#page-dashboard [data-block="' + name + '"]');
    if (el) el.style.display = visible ? '' : 'none';
  }

  function setStatus(msg) {
    var el = byId('wbStatus');
    if (el) el.textContent = msg || '';
  }

  function showEmpty(canvas, msg) {
    if (!canvas) return;
    var box = canvas.parentNode;
    if (!box) return;
    var ex = box.querySelector('.wb-empty');
    if (ex) { ex.textContent = msg; return; }
    var p = document.createElement('p');
    p.className = 'wb-empty';
    p.textContent = msg;
    box.appendChild(p);
  }
  function clearEmpty(canvas) {
    var box = canvas && canvas.parentNode;
    var ex = box && box.querySelector('.wb-empty');
    if (ex) ex.remove();
  }

  /* ---------------- 样式注入 ---------------- */

  /* 说明：
     · 令牌集中在 #page-dashboard 上，不外泄到站点其它页面（css §5 设计令牌）
     · 字号一律用 rem，尊重用户浏览器字号设置（css §7）
     · 焦点环一律用 outline + outline-offset（css §4）
     · 动效只碰 opacity / translate，并用 @starting-style 做离散属性过渡（css §9）
     · 不使用 @layer：站点既有样式是未分层的，分层样式会被未分层样式压过，反而失效 */
  function injectStyle() {
    if (byId('wbStyle')) return;
    var css = ''
      /* ===== 设计令牌 =====
         令牌要挂在两处：#page-dashboard（工作台页面本身）与 .wb-overlay（工作台弹窗遮罩）。
         弹窗是 document.body.appendChild(overlay) 挂上去的，不在 #page-dashboard 子树里，
         只写 #page-dashboard 会让弹窗内的 --wb-line / --wb-shadow-2 / --wb-fs-sm / --wb-r-ctl
         全部取不到值（表现为卡片无边框无阴影、按钮直角、字号回退到 16px）。 */
      + '#page-dashboard,.wb-overlay{'
      + '--wb-line:#E8E8EF;--wb-line-soft:#F3F3F7;--wb-ink:var(--ink);--wb-ink2:var(--ink2);'
      + '--wb-accent:#4C9FD8;--wb-danger:#C0392B;'
      + '--wb-r-card:0.75rem;--wb-r-ctl:0.625rem;'
      /* 分层阴影：细描边 + 极淡近距离投影 + 柔和远距投影，比单一描边更有层次（css §8 深度） */
      + '--wb-shadow-1:0 1px 2px rgba(27,58,91,.04),0 6px 18px -8px rgba(27,58,91,.10);'
      + '--wb-shadow-2:0 2px 6px rgba(27,58,91,.06),0 18px 44px -14px rgba(27,58,91,.20);'
      + '--wb-fs-xs:.6875rem;--wb-fs-sm:.75rem;--wb-fs-md:.8125rem;'
      + '--wb-fs-num:1.625rem;--wb-trans:.16s ease;'
      + 'user-select:text;'
      + '}'
      /* 全局 user-select:none 由站点 * 规则施加，需在同级用更高特异性放开（css §5：正文应可复制） */
      + '#page-dashboard :where(.wb-kpi,.wb-block,.wb-coin,.wb-risk,.wb-cfg-panel),.wb-overlay{user-select:text}'
      + '#page-dashboard ::selection,.wb-overlay ::selection{background:#4C9FD8;color:#fff}'

      /* ===== 顶栏控件 ===== */
      + '.wb-range{display:flex;gap:.375rem}'
      + '.wb-range .chip{border:0;font-family:inherit;font-size:var(--wb-fs-sm);font-weight:600;padding:.4375rem .75rem;border-radius:var(--wb-r-ctl);line-height:1}'
      /* id 放在 :where() 之外，否则特异性会被一并清零，压不过站点既有样式 */
      + '#page-dashboard :where(.wb-range .chip,#wbRefreshBtn,.wb-link,.wb-cfg-wrap .chip,.wb-kpi.is-clickable,.wb-risk-btn,.wb-cfg-item,.wb-pager button):focus-visible{outline:3px solid var(--wb-accent);outline-offset:2px;border-radius:.375rem}'

      /* ===== 容器 ===== */
      + '.wb-body{display:flex;flex-direction:column;gap:1rem;container-type:inline-size}'
      + '.wb-body.is-loading{opacity:.5}'

      /* ===== KPI ===== */
      + '.wb-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.75rem}'
      + '.wb-group{grid-column:1/-1;font-size:var(--wb-fs-xs);font-weight:600;letter-spacing:.02em;color:var(--muted);margin-block-start:.125rem}'
      + '.wb-kpi{position:relative;background:#fff;border:1px solid var(--wb-line);border-radius:var(--wb-r-card);'
      + 'padding:.875rem 1rem .875rem 1.125rem;display:flex;flex-direction:column;gap:.3125rem;overflow:hidden;'
      + 'box-shadow:var(--wb-shadow-1);transition:box-shadow var(--wb-trans),border-color var(--wb-trans),translate var(--wb-trans)}'
      + '.wb-kpi::before{content:"";position:absolute;inset-block:0;inset-inline-start:0;inline-size:2px;background:var(--wb-accent)}'
      + '.wb-kpi .v{font-size:var(--wb-fs-num);font-weight:700;line-height:1.05;color:var(--wb-ink);'
      + 'font-variant-numeric:tabular-nums;text-box:trim-both cap alphabetic}'
      + '.wb-kpi .k{font-size:var(--wb-fs-sm);color:var(--wb-ink2)}'
      + '.wb-kpi .d{font-size:var(--wb-fs-xs);color:var(--faint);text-wrap:pretty}'
      + '.wb-kpi.is-clickable{font:inherit;text-align:start;cursor:pointer}'
      + '.wb-kpi.is-clickable:hover{border-color:color-mix(in oklab,var(--wb-accent) 45%,var(--wb-line));box-shadow:var(--wb-shadow-2);translate:0 -1px}'
      + '.wb-kpi.is-clickable:active{translate:0 0;box-shadow:var(--wb-shadow-1)}'

      /* ===== 区块 ===== */
      + '.wb-grid{display:grid;grid-template-columns:1fr;gap:1rem}'
      + '.wb-block{background:#fff;border:1px solid var(--wb-line);border-radius:var(--wb-r-card);padding:1.125rem 1.25rem;'
      + 'display:flex;flex-direction:column;gap:.75rem;box-shadow:var(--wb-shadow-1);'
      + 'content-visibility:auto;contain-intrinsic-size:auto 15rem}'
      + '@supports not (content-visibility:auto){.wb-block{contain:layout style paint}}'
      /* 更圆润的曲线：渐进增强，不支持的浏览器忽略（css §8） */
      + '@supports (corner-shape:squircle){.wb-kpi,.wb-block{corner-shape:squircle}}'
      + '.wb-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap}'
      + '.wb-block-title{font-size:var(--wb-fs-md);font-weight:600;color:var(--wb-ink);letter-spacing:.01em}'
      + '.wb-block-sub{font-size:var(--wb-fs-sm);color:var(--muted);margin-block-start:-.375rem;text-wrap:pretty}'
      + '.wb-chart-box{position:relative;block-size:13.75rem}'
      + '.wb-chart-box.is-sm{block-size:11.25rem}'
      + '.wb-chart-box canvas{inline-size:100%;block-size:100%}'

      /* ===== 数据表与折叠详情 ===== */
      + '.wb-alt{font-size:var(--wb-fs-sm);color:var(--muted)}'
      + '.wb-alt summary{cursor:pointer;padding-block:.125rem;border-radius:.25rem}'
      + '.wb-alt summary:hover{color:var(--wb-ink2)}'
      + '.wb-alt table{inline-size:100%;border-collapse:collapse;margin-block-start:.5rem;font-size:var(--wb-fs-sm)}'
      + '.wb-alt th,.wb-alt td{text-align:start;padding:.25rem .375rem;border-block-end:1px solid var(--wb-line-soft)}'
      + '.wb-alt tr:last-child th,.wb-alt tr:last-child td{border-block-end:0}'

      /* ===== 文字按钮：满足 24×24 触控目标（css §4） ===== */
      + '.wb-link{background:none;border:0;font:inherit;font-size:var(--wb-fs-sm);color:var(--wb-accent);cursor:pointer;'
      + 'padding:0;display:inline-flex;align-items:center;min-block-size:1.5rem}'
      + '.wb-link:hover{text-decoration:underline;text-underline-offset:2px}'

      /* ===== 趋势配置面板 ===== */
      + '.wb-cfg-wrap{position:relative}'
      + '.wb-cfg-wrap .chip{border:0;font-family:inherit;font-size:var(--wb-fs-sm);font-weight:600;padding:.375rem .75rem;border-radius:var(--wb-r-ctl);line-height:1}'
      + '.wb-cfg-panel{position:absolute;inset-inline-end:0;inset-block-start:calc(100% + .375rem);z-index:20;inline-size:17rem;'
      + 'background:#fff;border:1px solid var(--wb-line);border-radius:var(--wb-r-card);box-shadow:var(--wb-shadow-2);'
      + 'padding:.875rem;display:flex;flex-direction:column;gap:.5625rem;text-align:start;'
      /* 打开/关闭走原生离散属性过渡（css §9） */
      + 'transition:opacity var(--wb-trans),translate var(--wb-trans),display var(--wb-trans) allow-discrete}'
      + '.wb-cfg-panel[hidden]{display:none;opacity:0;translate:0 -.25rem}'
      + '@starting-style{.wb-cfg-panel:not([hidden]){opacity:0;translate:0 -.25rem}}'
      + '.wb-cfg-title{font-size:var(--wb-fs-sm);font-weight:600;color:var(--wb-ink)}'
      + '.wb-cfg-list{display:grid;grid-template-columns:1fr 1fr;gap:.375rem .625rem}'
      + '.wb-cfg-item{display:flex;align-items:center;gap:.375rem;font-size:var(--wb-fs-sm);color:var(--wb-ink2);'
      + 'cursor:pointer;line-height:1.4;min-block-size:1.5rem;border-radius:.25rem}'
      + '.wb-cfg-item:hover{color:var(--wb-ink)}'
      + '.wb-cfg-item input{inline-size:.875rem;block-size:.875rem;accent-color:var(--wb-accent);cursor:pointer;margin:0}'
      + '.wb-cfg-dot{inline-size:.5rem;block-size:.5rem;border-radius:.125rem;background:var(--dot,var(--wb-accent));flex:none}'
      + '.wb-cfg-sep{border-block-start:1px solid var(--wb-line-soft)}'
      + '.wb-cfg-note{font-size:var(--wb-fs-xs);color:var(--faint);line-height:1.6}'
      + '.wb-cfg-panel .chip{border:0;font-family:inherit;font-size:var(--wb-fs-xs);font-weight:600;padding:.25rem .5625rem;border-radius:.5rem;line-height:1.4}'

      /* ===== 资金概览 ===== */
      + '.wb-coin{display:flex;flex-direction:column;gap:.625rem}'
      + '.wb-coin .hero{display:flex;flex-direction:column;gap:.125rem}'
      + '.wb-coin .hero .v{font-size:var(--wb-fs-num);font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums;'
      + 'color:var(--wb-ink);text-box:trim-both cap alphabetic}'
      + '.wb-coin .hero .k{font-size:var(--wb-fs-sm);color:var(--muted)}'
      + '.wb-coin .row{display:flex;justify-content:space-between;gap:.75rem;font-size:var(--wb-fs-md);color:var(--wb-ink2)}'
      + '.wb-coin .row .n{font-weight:600;font-variant-numeric:tabular-nums;color:var(--wb-ink)}'
      + '.wb-coin .decomp{font-size:var(--wb-fs-xs);color:var(--faint);line-height:1.7;border-block-start:1px solid var(--wb-line-soft);padding-block-start:.5rem}'

      /* ===== 风险列表 ===== */
      + '.wb-risk{list-style:none;display:flex;flex-direction:column;gap:.625rem}'
      + '.wb-risk li{display:flex;align-items:center;justify-content:space-between;gap:.75rem;font-size:var(--wb-fs-md);color:var(--wb-ink2)}'
      + '.wb-risk .r{font-weight:700;color:var(--wb-ink);font-variant-numeric:tabular-nums}'
      + '.wb-risk .r.warn{color:var(--wb-danger)}'
      + '.wb-risk-btn{background:none;border:0;font:inherit;font-size:var(--wb-fs-md);color:var(--wb-accent);cursor:pointer;'
      + 'padding:0;text-align:start;display:inline-flex;align-items:center;min-block-size:1.5rem}'
      + '.wb-risk-btn:hover{text-decoration:underline;text-underline-offset:2px}'
      /* 强制高对比模式下背景会被覆盖，改用真边框承载强调色（css §5） */
      + '@media (forced-colors:active){.wb-kpi::before{display:none}.wb-kpi{border-inline-start:2px solid CanvasText}}'

      /* ===== 通用数据表 ===== */
      + '.wb-table{inline-size:100%;border-collapse:collapse;font-size:var(--wb-fs-md)}'
      + '.wb-table th{text-align:start;font-size:var(--wb-fs-sm);font-weight:500;color:var(--muted);padding:.5rem .625rem;'
      + 'border-block-end:1px solid var(--wb-line);white-space:nowrap}'
      + '.wb-table td{padding:.625rem;border-block-end:1px solid var(--wb-line-soft);font-variant-numeric:tabular-nums;vertical-align:top}'
      + '.wb-table tbody tr:last-child td{border-block-end:0}'
      + '.wb-table tbody tr:hover td{background:color-mix(in oklab,#4C9FD8 4%,#fff)}'
      + '.wb-table td.wb-t1{font-weight:700}'
      + '.wb-caption{text-align:start;font-size:var(--wb-fs-sm);color:var(--faint);padding-block-end:.5rem}'
      + '.wb-bar{block-size:.375rem;border-radius:.1875rem;background:var(--wb-line-soft);overflow:hidden;min-inline-size:3.5rem}'
      + '.wb-bar i{display:block;block-size:100%;background:var(--wb-accent);border-radius:.1875rem}'
      + '.wb-heat-cell{display:flex;align-items:center;gap:.5rem}'
      + '.wb-empty{font-size:var(--wb-fs-md);color:var(--muted);padding:1.5rem 0;text-align:center}'
      + '.wb-status{font-size:var(--wb-fs-sm);color:var(--muted);min-block-size:1rem}'

      /* ===== 弹窗 ===== */
      + '.wb-modal-card{inline-size:min(60rem,94vw);max-block-size:88vh;background:#fff;border-radius:1.125rem;'
      + 'box-shadow:var(--wb-shadow-2);border:1px solid var(--wb-line);display:flex;flex-direction:column;overflow:hidden}'
      + '.wb-modal-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;'
      + 'padding:.875rem 1.375rem;border-block-end:1px solid var(--wb-line)}'
      + '.wb-modal-title{font-size:1.0625rem;font-weight:700;color:var(--wb-ink)}'
      + '.wb-modal-close{background:none;border:0;font-size:1.375rem;line-height:1;color:var(--muted);cursor:pointer;'
      + 'padding:0;display:inline-flex;align-items:center;justify-content:center;min-inline-size:1.75rem;min-block-size:1.75rem;border-radius:.375rem}'
      + '.wb-modal-close:hover{color:var(--wb-ink);background:var(--wb-line-soft)}'
      + '.wb-modal-tabs{display:flex;gap:.375rem;flex-wrap:wrap;padding:.625rem 1.375rem;border-block-end:1px solid var(--wb-line)}'
      + '.wb-modal-tabs .chip{border:0;font-family:inherit;font-size:var(--wb-fs-sm);font-weight:600;padding:.375rem .75rem;border-radius:var(--wb-r-ctl);line-height:1}'
      + '.wb-modal-body{flex:1;overflow-y:auto;padding:.875rem 1.375rem 1.25rem;min-block-size:20rem;'
      + 'max-block-size:calc(88vh - 13rem);scrollbar-gutter:stable;'
      + 'scrollbar-width:thin;scrollbar-color:color-mix(in oklab,var(--wb-ink) 28%,#fff) transparent}'
      + '.wb-filters{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;padding-block:.625rem}'
      + '.wb-filters label{font-size:var(--wb-fs-sm);color:var(--muted)}'
      + '.wb-filters select,.wb-filters input{block-size:2rem;border:1px solid var(--wb-line);border-radius:.5rem;'
      + 'padding-inline:.625rem;font-size:var(--wb-fs-sm);font-family:inherit;background:#fff;color:var(--wb-ink)}'
      + '.wb-filters select:focus-visible,.wb-filters input:focus-visible{outline:3px solid var(--wb-accent);outline-offset:1px}'
      + '.wb-filters .chip{border:0;font-family:inherit;font-size:var(--wb-fs-sm);font-weight:600;padding:.375rem .75rem;border-radius:var(--wb-r-ctl);line-height:1}'
      + '.wb-mini{font-size:var(--wb-fs-sm);color:var(--muted);line-height:1.7;text-wrap:pretty}'
      + '.wb-pager{display:flex;gap:.625rem;align-items:center;justify-content:flex-end;padding-block-start:.75rem;font-size:var(--wb-fs-sm);color:var(--muted)}'
      + '.wb-pager button{border:1px solid var(--wb-line);background:#fff;border-radius:.5rem;min-block-size:1.75rem;'
      + 'padding-inline:.625rem;font-size:var(--wb-fs-sm);cursor:pointer;font-family:inherit;color:var(--wb-ink2)}'
      + '.wb-pager button:hover:not(:disabled){border-color:var(--wb-accent);color:var(--wb-accent)}'
      + '.wb-pager button:disabled{opacity:.45;cursor:default}'
      /* 弹窗挂在 body 下，不在 #page-dashboard 子树里，焦点环要单独再挂一份 */
      + '.modal-overlay.wb-overlay :where(.wb-btn,.chip,.wb-modal-close,.wb-pager button,.wb-link):focus-visible{outline:3px solid var(--wb-accent);outline-offset:2px;border-radius:.375rem}'

      /* ===== 确认弹窗：小卡片 + 说明列表 + 底部操作区 =====
         复用数据弹窗（最宽 60rem、正文最小 20rem 高）会让三行字撑出一个空荡的大白框，所以单独收窄。 */
      + '.wb-modal-card.is-confirm{inline-size:min(26rem,92vw)}'
      + '.wb-modal-card.is-confirm .wb-modal-body{min-block-size:0;max-block-size:none;padding:1.125rem 1.375rem 1.25rem}'
      + '.wb-confirm-lead{font-size:var(--wb-fs-md);color:var(--wb-ink);line-height:1.7;text-wrap:pretty}'
      + '.wb-confirm-lead strong{font-weight:700}'
      + '.wb-confirm-list{list-style:none;display:flex;flex-direction:column;gap:.4375rem;margin-block-start:.875rem;'
      + 'font-size:var(--wb-fs-sm);color:var(--muted);line-height:1.65}'
      + '.wb-confirm-list li{display:flex;gap:.5rem}'
      + '.wb-confirm-list li::before{content:"";flex:none;inline-size:.25rem;block-size:.25rem;border-radius:50%;'
      + 'background:var(--wb-accent);margin-block-start:.5rem}'
      + '.wb-confirm-foot{display:flex;justify-content:flex-end;gap:.5rem;margin-block-start:1.25rem;'
      + 'padding-block-start:.875rem;border-block-start:1px solid var(--wb-line-soft)}'
      + '.wb-btn{font-family:inherit;font-size:var(--wb-fs-sm);font-weight:600;line-height:1;border:1px solid transparent;'
      + 'border-radius:var(--wb-r-ctl);padding:.5625rem 1.125rem;min-block-size:2.125rem;cursor:pointer;'
      + 'transition:background var(--wb-trans),border-color var(--wb-trans),color var(--wb-trans)}'
      + '.wb-btn-ghost{background:#fff;border-color:var(--wb-line);color:var(--wb-ink2)}'
      + '.wb-btn-ghost:hover{border-color:var(--wb-accent);color:var(--wb-accent)}'
      + '.wb-btn-primary{background:var(--wb-accent);color:#fff}'
      + '.wb-btn-primary:hover{background:color-mix(in oklab,var(--wb-accent) 86%,#000)}'
      + '.wb-btn:disabled{opacity:.55;cursor:default}'
      + '@media (forced-colors:active){.wb-btn{border-color:ButtonBorder}}'

      /* ===== 加载指示 ===== */
      + '.wb-loading{display:flex;align-items:center;justify-content:center;gap:.5rem;padding:1.5rem 0;'
      + 'font-size:var(--wb-fs-md);color:var(--muted)}'
      + '.wb-spinner{inline-size:1rem;block-size:1rem;border-radius:50%;flex:none;'
      + 'border:2px solid color-mix(in oklab,#4C9FD8 25%,#fff);border-block-start-color:var(--wb-accent);'
      + 'animation:wb-spin .8s linear infinite}'
      + '@keyframes wb-spin{to{rotate:360deg}}'

      /* ===== 响应式与动效降级 ===== */
      + '@container (min-width:51.25rem){.wb-grid{grid-template-columns:repeat(3,1fr)}.wb-span2{grid-column:span 2}}'
      + '@media (pointer:coarse){#page-dashboard :where(.chip,.wb-link,.wb-risk-btn,.wb-cfg-item){min-block-size:2rem}}'
      + '@media (prefers-reduced-motion:reduce){'
      + '.wb-kpi,.wb-block,.wb-bar i,.wb-cfg-panel{animation:none;transition:none}'
      + '.wb-kpi.is-clickable:hover{translate:none}'
      /* 去掉旋转但保留"忙碌"的表达（spinner 指南） */
      + '.wb-spinner{animation:none;border-block-start-color:color-mix(in oklab,#4C9FD8 60%,#fff)}}';
    var style = document.createElement('style');
    style.id = 'wbStyle';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------------- Chart.js 公共配置 ---------------- */

  var AXIS_TICK = { font: { size: 11 }, color: '#7A8AA8' };

  function baseOptions(extra) {
    var o = {
      responsive: true,
      maintainAspectRatio: false,
      animation: REDUCED_MOTION ? false : { duration: 500 },
      plugins: { legend: { display: false } }
    };
    return Object.assign(o, extra || {});
  }

  /* 横向条形图；onPick(index) 用于"点条形 → 带分类发任务" */
  function hBar(canvas, labels, values, color, onPick) {
    if (!canvas || typeof window.Chart === 'undefined') return;
    return new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: color, borderRadius: 4, barThickness: 'flex', maxBarThickness: 22 }]
      },
      options: baseOptions({
        indexAxis: 'y',
        onClick: onPick ? function (evt) {
          var els = this.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
          if (els && els.length) onPick(els[0].index);
        } : undefined,
        onHover: onPick ? function (evt) {
          var els = this.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
          evt.native.target.style.cursor = (els && els.length) ? 'pointer' : 'default';
        } : undefined,
        plugins: { legend: { display: false }, tooltip: { displayColors: false } },
        scales: {
          x: {
            beginAtZero: true, border: { display: false },
            grid: { color: '#F0F0F5', drawTicks: false },
            ticks: Object.assign({ precision: 0 }, AXIS_TICK)
          },
          y: { grid: { display: false }, border: { display: false }, ticks: AXIS_TICK }
        }
      })
    });
  }

  function upsert(key, canvas, updater, creator) {
    if (!canvas || typeof window.Chart === 'undefined') return;
    clearEmpty(canvas);
    if (charts[key]) { updater(charts[key]); charts[key].update(); return; }
    charts[key] = creator();
  }

  function dropChart(key) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }

  /* 新增用户的统计窗口文案：今日看小时、其余显示起止日期 */
  function newUsersWindowText(trend) {
    var labels = (trend && trend.labels) || [];
    if (range === 'today' || labels.length < 2) return '今日 00:00 起';
    return labels[0] + ' ~ ' + labels[labels.length - 1];
  }

  /* ---------------- KPI（待办优先，两组） ---------------- */

  function renderKpis(data) {
    var el = byId('wbKpis');
    if (!el) return;
    var ov = data.overview || {};
    var task = data.task || {};
    var coin = data.coin || {};
    var risk = data.risk || {};
    var canDrill = isFullAdmin();
    var group2 = '平台概览';
    var items = [];

    /* 第一组：你的待办（主管理员可点直达；副管理员仅看数不下钻） */
    items.push({
      group: '你的待办', k: '待审核任务', v: num(task.pendingReview), d: '蛋蛋发布待审',
      accent: C.orange, act: function () { wbDrill('reviewcenter'); }
    });
    items.push({
      group: '你的待办', k: '官方任务待确认', v: num(task.officialPendingConfirm), d: '有人提交，待你确认发币',
      accent: C.orange, act: function () { wbDrill('taskgroups'); }
    });
    items.push({
      group: '你的待办', k: '待处理工单', v: num(risk.openTickets),
      d: canDrill ? '点击查看工单' : '仅主管理员可处理',
      accent: C.violet, act: (canDrill || isCoworker()) ? function () { wbDrill('feedback'); } : null
    });

    /* 第二组：平台概览（快照；明细下钻仅主管理员） */
    items.push({
      group: group2, k: '注册蛋蛋', v: num(ov.totalUsers),
      d: canDrill ? '全站学生，点击看名单' : '全站学生',
      accent: C.primary, act: (canDrill || isCoworker()) ? function () { wbDrillUsers('all'); } : null
    });
    items.push({
      group: group2, k: RANGE_LABEL[range] + '新增', v: num(ov.newUsersInRange),
      d: newUsersWindowText(data.trend),
      accent: C.primary, act: (canDrill || isCoworker()) ? function () { wbShowNewUsers(); } : null
    });
    var issued = coin.platformIssuedInRange || 0;
    items.push({
      group: group2, k: '平台投放', v: signed(issued),
      d: RANGE_LABEL[range] + ' · 平台净发币',
      accent: C.gold, act: (canDrill || isCoworker()) ? function () { wbOpenCoinModal('summary'); } : null
    });
    items.push({
      group: group2, k: '等待认领', v: num(task.pendingClaim), d: '已上线，还没人认领',
      accent: C.orange, act: function () { wbOpenTaskModal('approved'); }
    });
    items.push({
      group: group2, k: '任务完成率', v: pct(task.completionRate),
      d: '已完成 ' + num(task.completed) + ' / 已完结 ' + num(task.completionBase || 0) + '，点击看明细',
      accent: C.green, act: function () { wbOpenTaskModal('closed'); }
    });

    el.innerHTML = items.map(function (it, i) {
      var prev = items[i - 1];
      var head = (!prev || prev.group !== it.group)
        ? '<div class="wb-group">' + esc(it.group) + '</div>'
        : '';
      var inner = '<span class="v">' + esc(it.v) + '</span>'
        + '<span class="k">' + esc(it.k) + '</span>'
        + '<span class="d">' + esc(it.d) + '</span>';
      var card = it.act
        ? '<button type="button" class="wb-kpi is-clickable" data-idx="' + i + '" style="--wb-accent:' + it.accent + '">' + inner + '</button>'
        : '<div class="wb-kpi" style="--wb-accent:' + it.accent + '">' + inner + '</div>';
      return head + card;
    }).join('');

    el.querySelectorAll('.wb-kpi.is-clickable').forEach(function (card) {
      var idx = parseInt(card.getAttribute('data-idx'), 10);
      card.addEventListener('click', function () {
        var it = items[idx];
        if (it && it.act) it.act();
      });
    });
  }

  /* ---------------- 平台趋势（可配置指标池） ---------------- */

  function loadTrendCfg() {
    try {
      var raw = localStorage.getItem(TREND_CFG_KEY);
      if (!raw) return;
      var cfg = JSON.parse(raw);
      if (cfg && Array.isArray(cfg.metrics) && cfg.metrics.length) {
        var valid = cfg.metrics.filter(function (k) {
          return TREND_POOL.some(function (m) { return m.key === k; });
        });
        if (valid.length) trendCfg.metrics = valid;
      }
      if (cfg && (cfg.mode === 'delta' || cfg.mode === 'cumulative')) trendCfg.mode = cfg.mode;
    } catch (e) { /* 配置损坏则用默认 */ }
  }
  function saveTrendCfg() {
    try { localStorage.setItem(TREND_CFG_KEY, JSON.stringify(trendCfg)); } catch (e) { /* 忽略 */ }
  }

  /* ===== 趋势配置下拉面板 ===== */

  function renderTrendCfgPanel() {
    var panel = byId('wbTrendCfgPanel');
    if (!panel) return;
    var list = TREND_POOL.map(function (m) {
      var on = trendCfg.metrics.indexOf(m.key) >= 0;
      return '<label class="wb-cfg-item">'
        + '<input type="checkbox" data-metric="' + m.key + '"' + (on ? ' checked' : '') + '>'
        + '<span class="wb-cfg-dot" style="--dot:' + m.color + '"></span>'
        + esc(m.name) + '</label>';
    }).join('');

    panel.innerHTML = ''
      + '<div class="wb-cfg-title">显示指标（可多选）</div>'
      + '<div class="wb-cfg-list">' + list + '</div>'
      + '<div class="wb-cfg-sep"></div>'
      + '<div class="wb-cfg-title">数值口径</div>'
      + '<div class="wb-cfg-list">'
      + '<label class="wb-cfg-item"><input type="radio" name="wbTrendMode" value="delta"'
      + (trendCfg.mode === 'delta' ? ' checked' : '') + '>每桶增量</label>'
      + '<label class="wb-cfg-item"><input type="radio" name="wbTrendMode" value="cumulative"'
      + (trendCfg.mode === 'cumulative' ? ' checked' : '') + '>累计值</label>'
      + '</div>'
      + '<div class="wb-cfg-sep"></div>'
      + '<div class="wb-cfg-note">已选 ' + trendCfg.metrics.length + ' / ' + TREND_POOL.length
      + ' 条 · 配置自动保存在本机浏览器</div>'
      + '<button type="button" class="chip" id="wbTrendResetBtn">恢复默认</button>';

    panel.querySelectorAll('input[data-metric]').forEach(function (cb) {
      cb.addEventListener('change', function () { wbSetTrendMetric(cb.getAttribute('data-metric'), cb.checked); });
    });
    panel.querySelectorAll('input[name="wbTrendMode"]').forEach(function (rd) {
      rd.addEventListener('change', function () { wbSetTrendMode(rd.value); });
    });
    var reset = byId('wbTrendResetBtn');
    if (reset) reset.addEventListener('click', function () { window.wbResetTrendCfg(); });
  }

  window.wbToggleTrendCfgPanel = function () {
    var panel = byId('wbTrendCfgPanel');
    var btn = byId('wbTrendCfgBtn');
    if (!panel) return;
    var willOpen = panel.hasAttribute('hidden');
    if (willOpen) {
      renderTrendCfgPanel();
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  };

  function closeTrendCfgPanel() {
    var panel = byId('wbTrendCfgPanel');
    var btn = byId('wbTrendCfgBtn');
    if (panel && !panel.hasAttribute('hidden')) panel.setAttribute('hidden', '');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  /** 勾选/取消某个指标（不再限制条数，至少保留 1 条） */
  function wbSetTrendMetric(key, on) {
    var i = trendCfg.metrics.indexOf(key);
    if (on && i < 0) {
      /* 保持指标池顺序，避免线序随勾选顺序跳动 */
      trendCfg.metrics = TREND_POOL.map(function (m) { return m.key; })
        .filter(function (k) { return trendCfg.metrics.indexOf(k) >= 0 || k === key; });
    } else if (!on && i >= 0) {
      if (trendCfg.metrics.length === 1) {
        if (typeof window.toast === 'function') window.toast('至少保留一条趋势线');
        renderTrendCfgPanel();
        return;
      }
      trendCfg.metrics.splice(i, 1);
    } else {
      return;
    }
    saveTrendCfg();
    renderTrendCfgPanel();
    if (lastStats) renderTrend(lastStats);
  }

  function wbSetTrendMode(mode) {
    if (mode !== 'delta' && mode !== 'cumulative') return;
    trendCfg.mode = mode;
    saveTrendCfg();
    if (lastStats) renderTrend(lastStats);
  }

  window.wbResetTrendCfg = function () {
    trendCfg = { metrics: ['newUsers', 'publishedTasks'], mode: 'delta' };
    saveTrendCfg();
    renderTrendCfgPanel();
    if (lastStats) renderTrend(lastStats);
  };

  function selectedSeriesList(trend) {
    var all = (trend && trend.series) || [];
    return trendCfg.metrics.map(function (k) {
      var meta = TREND_POOL.find(function (m) { return m.key === k; }) || { key: k, name: k, color: C.primary };
      var found = all.find(function (s) { return s.key === k; });
      var raw = (found && found.data) || [];
      var data = raw;
      if (trendCfg.mode === 'cumulative') {
        var acc = 0;
        data = raw.map(function (v) { acc += (v || 0); return acc; });
      }
      return { meta: meta, data: data };
    });
  }

  function renderTrend(data) {
    var t = data.trend || {};
    var rawLabels = t.labels || [];
    var labels = rawLabels.map(function (l) { return /^\d\d$/.test(l) ? l + ':00' : l; });
    var picked = selectedSeriesList(t);

    var sub = byId('wbTrendSub');
    if (sub) {
      sub.textContent = RANGE_LABEL[range] + ' · ' + (trendCfg.mode === 'cumulative' ? '累计值' : '每桶增量')
        + ' · ' + picked.map(function (p) { return p.meta.name; }).join(' / ');
    }

    var table = byId('wbTrendTable');
    if (table) {
      var head = '<tr><th scope="col">时间</th>' + picked.map(function (p) {
        return '<th scope="col">' + esc(p.meta.name) + '</th>';
      }).join('') + '</tr>';
      var rows = rawLabels.map(function (l, i) {
        var name = /^\d\d$/.test(l) ? l + ':00' : l;
        return '<tr><th scope="row">' + esc(name) + '</th>' + picked.map(function (p) {
          return '<td>' + num(p.data[i]) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      table.innerHTML = '<table><caption class="wb-caption">趋势明细（' + esc(RANGE_LABEL[range])
        + '，' + (trendCfg.mode === 'cumulative' ? '累计' : '增量') + '）</caption>'
        + '<thead>' + head + '</thead><tbody>'
        + (rows || '<tr><td colspan="' + (picked.length + 1) + '">暂无数据</td></tr>') + '</tbody></table>';
    }

    var canvas = byId('wbTrendChart');
    if (!canvas || typeof window.Chart === 'undefined') return;
    var datasets = picked.map(function (p) {
      return {
        label: p.meta.name, data: p.data, borderColor: p.meta.color,
        backgroundColor: 'rgba(76,159,216,.08)', fill: false, tension: .35,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4
      };
    });
    upsert('trend', canvas,
      function (ch) { ch.data = { labels: labels, datasets: datasets }; },
      function () {
        return new window.Chart(canvas, {
          type: 'line',
          data: { labels: labels, datasets: datasets },
          options: baseOptions({
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } } },
            scales: {
              x: { grid: { display: false }, ticks: Object.assign({ maxRotation: 0, autoSkipPadding: 12 }, AXIS_TICK) },
              y: { beginAtZero: true, border: { display: false }, grid: { color: '#F0F0F5', drawTicks: false }, ticks: Object.assign({ precision: 0 }, AXIS_TICK) }
            }
          })
        });
      });
  }

  /* ---------------- 任务状态分布 ---------------- */

  function distSeries(data) {
    var t = data.task || {};
    return {
      labels: ['待审核', '待配对', '进行中', '待确认', '已完成', '异常'],
      values: [t.pendingReview || 0, t.pendingPairing || 0, t.inProgress || 0,
        t.submitted || 0, t.completed || 0, t.abnormal || 0],
      colors: [C.orange, '#F5C86A', C.primary, C.violet, C.green, C.red]
    };
  }

  function renderDist(data) {
    var t = data.task || {};
    var sub = byId('wbDistSub');
    if (sub) {
      sub.textContent = '完成率 ' + pct(t.completionRate) + ' · 已完成 ' + num(t.completed)
        + ' / 已完结 ' + num(t.completionBase || 0)
        + ' ｜ 平台侧（发布者责任，非你待办）：待配对 ' + num(t.pendingPairing) + ' · 待确认 ' + num(t.submitted);
    }
    var d = distSeries(data);
    var canvas = byId('wbDistChart');
    if (canvas && typeof window.Chart !== 'undefined') {
      upsert('dist', canvas,
        function (ch) { ch.data.labels = d.labels; ch.data.datasets[0].data = d.values; },
        function () {
          return new window.Chart(canvas, {
            type: 'doughnut',
            data: { labels: d.labels, datasets: [{ data: d.values, backgroundColor: d.colors, borderWidth: 0, hoverOffset: 4 }] },
            options: baseOptions({
              cutout: '60%',
              plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } } }
            })
          });
        });
    }
    var el = byId('wbDistTable');
    if (el) {
      var total = sum(d.values);
      el.innerHTML = '<table><caption class="wb-caption">任务状态分布（共 ' + num(total) + ' 个任务）</caption>'
        + '<thead><tr><th scope="col">状态</th><th scope="col">数量</th></tr></thead><tbody>'
        + d.labels.map(function (l, i) { return '<tr><th scope="row">' + esc(l) + '</th><td>' + num(d.values[i]) + '</td></tr>'; }).join('')
        + '</tbody></table>';
    }
  }

  /* ---------------- 分类分布（点条形 → 带头发布官方任务） ---------------- */

  function distribution(list, order, names) {
    var map = {};
    (list || []).forEach(function (b) { if (b && b.label) map[b.label] = b.cnt || 0; });
    var keys = [], labels = [], values = [];
    order.forEach(function (k) {
      if (map[k] === undefined) return;
      keys.push(k);
      labels.push(names[k] || k);
      values.push(map[k]);
    });
    return { keys: keys, labels: labels, values: values };
  }

  function renderCategoryChart(key, canvasId, tableId, list, order, names, color, caption, onPickKey) {
    var canvas = byId(canvasId);
    if (!canvas) return;
    var d = distribution(list, order, names);
    var total = sum(d.values);

    var el = byId(tableId);
    if (el) {
      el.innerHTML = '<table><caption class="wb-caption">' + esc(caption) + '（' + num(d.keys.length) + ' 类 / 共 '
        + num(total) + ' 个任务）</caption>'
        + '<thead><tr><th scope="col">类别</th><th scope="col">数量</th></tr></thead><tbody>'
        + (d.labels.length
          ? d.labels.map(function (l, i) {
            return '<tr><th scope="row">' + esc(l) + '</th><td>' + num(d.values[i])
              + ' <button type="button" class="wb-link" data-cat="' + esc(d.keys[i]) + '">发该类任务 ›</button></td></tr>';
          }).join('')
          : '<tr><td colspan="2">暂无数据</td></tr>')
        + '</tbody></table>';
      el.querySelectorAll('button[data-cat]').forEach(function (b) {
        b.addEventListener('click', function () { onPickKey(b.getAttribute('data-cat')); });
      });
    }

    if (typeof window.Chart === 'undefined') return;
    if (!total) {
      dropChart(key);
      showEmpty(canvas, '暂无任务数据');
      return;
    }
    var handler = function (idx) {
      var k = d.keys[idx];
      if (k) onPickKey(k);
    };
    upsert(key, canvas,
      function (ch) { ch.data.labels = d.labels; ch.data.datasets[0].data = d.values; },
      function () { return hBar(canvas, d.labels, d.values, color, handler); });
  }

  /* ---------------- 资金概览 ---------------- */

  function renderCoin(data) {
    var el = byId('wbCoin');
    if (!el) return;
    var c = data.coin || {};
    var label = RANGE_LABEL[range];
    var rows = [
      { k: '任务流转（' + label + '）', v: num(c.taskTurnoverInRange) },
      { k: '冻结中（托管）', v: num(c.frozen) }
    ];
    el.innerHTML = ''
      + '<div class="hero">'
      + '  <span class="v">' + esc(signed(c.platformIssuedInRange)) + '</span>'
      + '  <span class="k">平台投放 · ' + esc(label) + '（平台净发币，唯一影响币总量）</span>'
      + '</div>'
      + rows.map(function (r) {
        return '<div class="row"><span>' + esc(r.k) + '</span><span class="n">' + esc(r.v) + '</span></div>';
      }).join('')
      + '<div class="decomp">流通总量 ' + num(c.circulating) + '<br>= 注册赠币 ' + num(c.registrationGrant)
      + ' + 任务/邀请净往来 ' + signed(c.taskNetFlow) + ' − 冻结中 ' + num(c.frozen) + '</div>';
  }

  /* ---------------- 风险与治理（可点下钻） ---------------- */

  function renderRisk(data) {
    var el = byId('wbRisk');
    if (!el) return;
    var r = data.risk || {};
    var canDrill = isFullAdmin();
    var items = [
      {
        k: '待处理举报工单', v: r.openReports, warn: (r.openReports || 0) > 0,
        act: canDrill ? function () {
          wbDrill('feedback', function () {
            if (typeof window.filterFbByType === 'function') window.filterFbByType('report');
          });
        } : null
      },
      {
        k: '待处理反馈工单', v: r.openTickets, warn: (r.openTickets || 0) > 0,
        act: canDrill ? function () { wbDrill('feedback'); } : null
      },
      {
        k: '被隐藏的评价', v: r.hiddenRatings, warn: false,
        act: canDrill ? function () { wbOpenRatingModal(); } : null
      },
      { k: '大学黑榜吐槽', v: r.complaints, warn: false },
      {
        k: '已封禁用户', v: r.bannedUsers, warn: false,
        act: canDrill ? function () { wbDrillUsers('banned'); } : null
      }
    ];
    el.innerHTML = items.map(function (it, i) {
      var name = it.act
        ? '<button type="button" class="wb-risk-btn" data-idx="' + i + '">' + esc(it.k) + ' ›</button>'
        : '<span>' + esc(it.k) + '</span>';
      return '<li>' + name + '<span class="r' + (it.warn ? ' warn' : '') + '">' + num(it.v) + '</span></li>';
    }).join('');
    el.querySelectorAll('.wb-risk-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = items[parseInt(b.getAttribute('data-idx'), 10)];
        if (it && it.act) it.act();
      });
    });
  }

  /* ---------------- 页面热度榜 ---------------- */

  function renderHeat(data) {
    var rows = data.pageViews || [];
    var canDrill = isFullAdmin();
    var sub = byId('wbHeatSub');
    if (sub) sub.textContent = '学生端页面点击量（' + RANGE_LABEL[range] + '，不含管理员与未登录访客）';

    var body = byId('wbHeatBody');
    var total = sum(rows.map(function (r) { return r.pv; }));

    if (body) {
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="5" class="wb-empty">该时间范围内暂无浏览记录</td></tr>';
      } else {
        var max = rows.reduce(function (m, r) { return Math.max(m, r.pv || 0); }, 0) || 1;
        body.innerHTML = rows.map(function (r, i) {
          var name = PAGE_NAMES[r.pageKey] || r.pageKey;
          var w = Math.round((r.pv || 0) / max * 100);
          var share = total ? (r.pv || 0) / total * 100 : 0;
          var nameCell = canDrill
            ? '<button type="button" class="wb-link" data-pagekey="' + esc(r.pageKey) + '">'
              + esc(name) + (i === 0 ? ' · Top1' : '') + ' ›</button>'
            : esc(name) + (i === 0 ? ' · Top1' : '');
          return '<tr>'
            + '<td class="' + (i === 0 ? 'wb-t1' : '') + '">' + (i + 1) + '</td>'
            + '<td class="' + (i === 0 ? 'wb-t1' : '') + '">' + nameCell + '</td>'
            + '<td>' + num(r.pv) + '</td>'
            + '<td>' + num(r.uv) + '</td>'
            + '<td><div class="wb-heat-cell"><span class="wb-bar"><i style="width:' + w + '%"></i></span><span>' + pct(share) + '</span></div></td>'
            + '</tr>';
        }).join('');
        body.querySelectorAll('button[data-pagekey]').forEach(function (b) {
          b.addEventListener('click', function () { wbOpenPageModal(b.getAttribute('data-pagekey')); });
        });
      }
    }

    var canvas = byId('wbHeatChart');
    if (!canvas || typeof window.Chart === 'undefined') return;
    if (!rows.length) {
      dropChart('heat');
      showEmpty(canvas, '该时间范围内暂无浏览记录');
      return;
    }
    var keys = rows.map(function (r) { return r.pageKey; });
    var labels = rows.map(function (r) { return PAGE_NAMES[r.pageKey] || r.pageKey; });
    var values = rows.map(function (r) { return r.pv || 0; });
    upsert('heat', canvas,
      function (ch) { ch.data.labels = labels; ch.data.datasets[0].data = values; },
      function () {
        return hBar(canvas, labels, values, C.primary,
          canDrill ? function (i) { wbOpenPageModal(keys[i]); } : undefined);
      });
  }

  /* ---------------- 下钻（跳目标页 + 到达后套用筛选） ---------------- */

  var pendingDrill = null;

  /**
   * @param page  目标页 id（ADMIN_PAGES 中的值）
   * @param apply 目标页数据加载完成后的回调（可省略，仅跳转）
   */
  function wbDrill(page, apply) {
    if (coworkBlocked()) return;
    pendingDrill = apply ? { page: page, apply: apply } : null;
    if (typeof window.go === 'function') window.go(page);
  }

  /* 目标页数据是异步加载的，必须等它渲染完再套用筛选，否则会被覆盖 */
  function wrapRenderForDrill(name, page) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__wbDrillWrapped) return;
    var wrapped = function () {
      var ret = orig.apply(this, arguments);
      var after = function () {
        if (pendingDrill && pendingDrill.page === page) {
          var fn = pendingDrill.apply;
          pendingDrill = null;
          try { fn(); } catch (e) { /* 失败不影响页面 */ }
        }
      };
      if (ret && typeof ret.then === 'function') {
        return ret.then(function (v) { after(); return v; }, function (e) { after(); throw e; });
      }
      after();
      return ret;
    };
    wrapped.__wbDrillWrapped = true;
    window[name] = wrapped;
  }

  /* ===== 用户管理页：注入「仅今日/近 N 日新增」筛选 chip ===== */

  /** N 天前的 00:00（ISO），days=0 即今天 */
  function daysAgoIso(days) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T00:00:00';
  }
  function todayIso() { return daysAgoIso(0); }

  /** 当前 range 对应的"新增"窗口：天数与文案 */
  function rangeNewWindow() {
    if (range === 'today') return { days: 0, label: '仅今日新增' };
    if (range === '30d') return { days: 29, label: '仅近 30 日新增' };
    return { days: 6, label: '仅近 7 日新增' };
  }

  var userFilterLabel = '仅今日新增';

  function syncUserTodayChip() {
    var chip = byId('wbUserTodayChip');
    if (!chip) return;
    var on = !!(window.userCreatedFrom);
    chip.classList.toggle('active', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    chip.textContent = userFilterLabel;
  }

  /** 设置/清空用户列表的注册时间筛选；label 用于让 chip 文案与实际筛选一致 */
  function setUserCreatedFrom(iso, label) {
    window.userCreatedFrom = iso || '';
    userFilterLabel = label || '仅今日新增';
    syncUserTodayChip();
  }

  window.wbToggleUserToday = function () {
    if (window.userCreatedFrom) {
      setUserCreatedFrom('', '仅今日新增');
    } else {
      setUserCreatedFrom(todayIso(), '仅今日新增');
    }
    /* 切换日期维度后，状态筛选回到「全部」，避免 chips 与实际行状态不一致 */
    if (typeof window.filterUsers === 'function') window.filterUsers('all');
    if (typeof window.renderUsers === 'function') window.renderUsers();
  };

  function injectUserTodayChip() {
    if (byId('wbUserTodayChip')) return;
    var row = document.querySelector('#page-users .filter-row');
    if (!row) return;
    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.id = 'wbUserTodayChip';
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.addEventListener('click', function () { window.wbToggleUserToday(); });
    chip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.wbToggleUserToday(); }
    });
    row.appendChild(chip);
    syncUserTodayChip();
  }

  /* ---------------- 数据 → 动作：带分类发官方任务 ---------------- */

  /* 任务类型分布里 team 在官方发布页没有对应选项，故不预填 */
  var PUBLISHABLE_TASK_TYPES = ['reward', 'teach', 'help'];

  function wbPublishWith(skillCatKey, taskTypeKey) {
    if (coworkBlocked()) return;
    if (typeof window.go !== 'function') return;
    window.go('newgroup');

    if (taskTypeKey && PUBLISHABLE_TASK_TYPES.indexOf(taskTypeKey) >= 0) {
      window.adminTaskType = taskTypeKey;
      document.querySelectorAll('[data-group="adminTaskType"]').forEach(function (c) {
        var oc = c.getAttribute('onclick') || '';
        c.classList.toggle('active', oc.indexOf("'" + taskTypeKey + "'") >= 0);
      });
    }

    if (skillCatKey) {
      var cn = SKILL_CAT_NAMES[skillCatKey];
      var cats = window.TASK_CATEGORIES || [];
      var cat = cats.find(function (c) { return c.name === cn; });
      if (cat) {
        window.adminSelectedSkillCat = cat.name;
        if (cat.subs && cat.subs.length) window.adminSelectedSkillSub = cat.subs[0].name;
      }
    }

    if (typeof window.renderAdminPublishSkillRow === 'function') window.renderAdminPublishSkillRow();
    if (typeof window.updateRewardHint === 'function') window.updateRewardHint();

    if (typeof window.toast === 'function') {
      window.toast('已带好分类，填写任务名称即可发布');
    }
  }

  /* ---------------- 弹窗框架（资金/任务/页面/评价共用） ---------------- */

  var openModals = [];

  /**
   * 建（或复用）工作台弹窗外壳
   *
   * @param id            弹窗 id（body 元素 id 为 id + 'Body'）
   * @param title         标题
   * @param tabs          页签配置，可空
   * @param variantClass  卡片变体类（如 'is-confirm' 收窄成确认弹窗），可空
   *
   * 注意：overlay 挂到 document.body 下，所以必须带 .wb-overlay——
   * 工作台设计令牌声明在 #page-dashboard,.wb-overlay 上，少了它弹窗内取不到令牌。
   */
  function ensureModal(id, title, tabs, variantClass) {
    var el = byId(id);
    if (el) return el;
    var wrap = document.createElement('div');
    wrap.className = 'modal-overlay wb-overlay';
    wrap.id = id;
    wrap.style.display = 'none';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', id + 'Title');
    wrap.addEventListener('click', function (e) { if (e.target === wrap) hideModal(id); });
    wrap.innerHTML = ''
      + '<div class="wb-modal-card' + (variantClass ? ' ' + variantClass : '') + '">'
      + '  <div class="wb-modal-head">'
      + '    <span class="wb-modal-title" id="' + id + 'Title">' + esc(title) + '</span>'
      + '    <button type="button" class="wb-modal-close" data-close="1" aria-label="关闭">×</button>'
      + '  </div>'
      + (tabs ? '  <div class="wb-modal-tabs" id="' + id + 'Tabs"></div>' : '')
      + '  <div class="wb-modal-body" id="' + id + 'Body"></div>'
      + '</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('[data-close]').addEventListener('click', function () { hideModal(id); });
    return wrap;
  }

  function showModal(id) {
    var el = byId(id);
    if (!el) return;
    el.style.display = 'flex';
    if (openModals.indexOf(id) < 0) openModals.push(id);
  }

  function hideModal(id) {
    var el = byId(id);
    if (el) el.style.display = 'none';
    var i = openModals.indexOf(id);
    if (i >= 0) openModals.splice(i, 1);
  }

  function modalBody(id, html) {
    var el = byId(id + 'Body');
    if (el) el.innerHTML = html;
  }

  /* 加载态：可见的旋转指示 + 对读屏播报一次忙状态 */
  function loadingHtml(text) {
    return '<div class="wb-loading" role="status"><span class="wb-spinner" aria-hidden="true"></span>'
      + esc(text || '加载中') + '</div>';
  }

  function renderTabs(id, tabs, active, onSwitch) {
    var el = byId(id + 'Tabs');
    if (!el) return;
    el.innerHTML = tabs.map(function (t) {
      var on = active === t.k;
      return '<button type="button" class="chip' + (on ? ' active' : '') + '" aria-pressed="' + (on ? 'true' : 'false')
        + '" data-tab="' + t.k + '">' + esc(t.n) + '</button>';
    }).join('');
    el.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () { onSwitch(b.getAttribute('data-tab')); });
    });
  }

  function pagerHtml(page, pages) {
    return '<div class="wb-pager"><span>第 ' + page + ' / ' + (pages || 1) + ' 页</span>'
      + '<button type="button" data-pg="prev"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>'
      + '<button type="button" data-pg="next"' + (page >= (pages || 1) ? ' disabled' : '') + '>下一页</button></div>';
  }

  /** 绑定分页按钮；step 为 -1 / +1 */
  function wirePager(modalId, go) {
    var body = byId(modalId + 'Body');
    if (!body) return;
    var prev = body.querySelector('[data-pg="prev"]');
    var next = body.querySelector('[data-pg="next"]');
    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });
  }

  /* ===== 资金详情弹窗 ===== */

  var coinTab = 'summary';
  var coinPage = 1;
  var coinFilters = { type: '', minAbs: '', keyword: '' };
  var COIN_TABS = [
    { k: 'summary', n: '类型汇总' },
    { k: 'logs', n: '流水明细' },
    { k: 'frozen', n: '冻结清单' }
  ];

  function switchCoinTab(k) {
    coinTab = k;
    coinPage = 1;
    renderTabs('wbCoinModal', COIN_TABS, coinTab, switchCoinTab);
    loadCoinTab();
  }

  window.wbOpenCoinModal = function (tab) {
    if (coworkBlocked()) return;
    coinTab = tab || 'summary';
    coinPage = 1;
    ensureModal('wbCoinModal', '资金详情', COIN_TABS);
    showModal('wbCoinModal');
    renderTabs('wbCoinModal', COIN_TABS, coinTab, switchCoinTab);
    loadCoinTab();
  };

  function loadCoinTab() {
    if (coinTab === 'summary') return loadCoinSummary();
    if (coinTab === 'logs') return loadCoinLogs();
    return loadCoinFrozen();
  }

  async function loadCoinSummary() {
    modalBody('wbCoinModal', loadingHtml());
    var res = await window.apiGet('/api/admin/point-logs/summary?range=' + encodeURIComponent(range));
    if (!res || res.code !== 200) { modalBody('wbCoinModal', '<div class="wb-mini">加载失败</div>'); return; }
    var rows = res.data || [];
    var map = {};
    rows.forEach(function (r) { map[r.type] = r; });
    var totalAbs = sum(rows.map(function (r) { return r.sumAbs || 0; }));
    var body = POINT_TYPE_ORDER.map(function (t) {
      var r = map[t] || { cnt: 0, sumDelta: 0, sumAbs: 0 };
      return '<tr><th scope="row">' + esc(POINT_TYPE_NAMES[t] || t) + '</th><td>' + num(r.cnt) + '</td><td>'
        + signed(r.sumDelta) + '</td><td>' + num(r.sumAbs) + '</td></tr>';
    }).join('');
    modalBody('wbCoinModal', '<p class="wb-mini">统计范围：' + esc(RANGE_LABEL[range])
      + '。只有「平台投放」会真正增发货币；任务收入/支付是一笔钱的两端，不改变币总量。</p>'
      + '<table class="wb-table"><caption class="wb-caption">按流水类型汇总（流水规模合计 ' + num(totalAbs) + '）</caption>'
      + '<thead><tr><th scope="col">类型</th><th scope="col">笔数</th><th scope="col">净额</th><th scope="col">规模</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table>');
  }

  async function loadCoinLogs() {
    var f = coinFilters;
    modalBody('wbCoinModal', loadingHtml());
    var q = '/api/admin/point-logs?range=' + encodeURIComponent(range)
      + '&page=' + coinPage + '&size=20'
      + (f.type ? '&type=' + encodeURIComponent(f.type) : '')
      + (f.minAbs !== '' ? '&minAbs=' + encodeURIComponent(f.minAbs) : '')
      + (f.keyword ? '&keyword=' + encodeURIComponent(f.keyword) : '');
    var res = await window.apiGet(q);
    if (!res || res.code !== 200) { modalBody('wbCoinModal', '<div class="wb-mini">加载失败</div>'); return; }
    var d = res.data || {};
    var records = d.records || [];

    var typeOpts = '<option value="">全部类型</option>' + POINT_TYPE_ORDER.map(function (t) {
      return '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + esc(POINT_TYPE_NAMES[t]) + '</option>';
    }).join('');

    var filters = '<div class="wb-filters">'
      + '<label class="wb-mini" for="wbLogType">类型</label>'
      + '<select id="wbLogType">' + typeOpts + '</select>'
      + '<label class="wb-mini" for="wbLogMin">金额≥</label>'
      + '<input id="wbLogMin" type="number" min="0" style="width:90px" value="' + esc(f.minAbs) + '" placeholder="不限">'
      + '<label class="wb-mini" for="wbLogKw">用户</label>'
      + '<input id="wbLogKw" style="width:150px" value="' + esc(f.keyword) + '" placeholder="昵称/邮箱">'
      + '<button type="button" class="chip active" id="wbLogSearch">查询</button>'
      + '<button type="button" class="chip" id="wbLogReset">重置</button>'
      + '</div>';

    var rows = records.map(function (r) {
      return '<tr>'
        + '<td>' + esc(fmtMinute(r.createdAt)) + '</td>'
        + '<td>' + esc(r.userNickname || ('#' + (r.userId == null ? '-' : r.userId)))
        + ' <button type="button" class="wb-link" data-uid="' + (r.userId == null ? '' : r.userId) + '">详情</button></td>'
        + '<td>' + esc(POINT_TYPE_NAMES[r.type] || r.type) + (r.label ? ' <span class="wb-mini">' + esc(r.label) + '</span>' : '') + '</td>'
        + '<td>' + signed(r.delta) + '</td>'
        + '<td>' + num(r.balance) + '</td>'
        + '<td>' + esc(r.taskTitle || '—') + '</td>'
        + '</tr>';
    }).join('');

    var pages = d.pages || 1;
    modalBody('wbCoinModal', filters
      + '<table class="wb-table"><caption class="wb-caption">全局流水明细（共 ' + num(d.total || 0) + ' 条）</caption>'
      + '<thead><tr><th scope="col">时间</th><th scope="col">用户</th><th scope="col">类型</th>'
      + '<th scope="col">金额</th><th scope="col">变动后余额</th><th scope="col">关联任务</th></tr></thead>'
      + '<tbody>' + (rows || '<tr><td colspan="6" class="wb-empty">没有符合条件的流水</td></tr>') + '</tbody></table>'
      + pagerHtml(coinPage, pages));

    byId('wbLogSearch').addEventListener('click', function () {
      coinFilters = {
        type: byId('wbLogType').value,
        minAbs: byId('wbLogMin').value.trim(),
        keyword: byId('wbLogKw').value.trim()
      };
      coinPage = 1;
      loadCoinLogs();
    });
    byId('wbLogReset').addEventListener('click', function () {
      coinFilters = { type: '', minAbs: '', keyword: '' };
      coinPage = 1;
      loadCoinLogs();
    });
    wirePager('wbCoinModal', function (step) {
      var next = coinPage + step;
      if (next < 1 || next > pages) return;
      coinPage = next;
      loadCoinLogs();
    });

    byId('wbCoinModalBody').querySelectorAll('button[data-uid]').forEach(function (b) {
      b.addEventListener('click', function () {
        var uid = b.getAttribute('data-uid');
        if (!uid) return;
        hideModal('wbCoinModal');
        if (typeof window.openAdminUserModal === 'function') window.openAdminUserModal(parseInt(uid, 10));
      });
    });
  }

  async function loadCoinFrozen() {
    modalBody('wbCoinModal', loadingHtml());
    var res = await window.apiGet('/api/admin/frozen-coins');
    if (!res || res.code !== 200) { modalBody('wbCoinModal', '<div class="wb-mini">加载失败</div>'); return; }
    var rows = res.data || [];
    var total = sum(rows.map(function (r) { return r.amount || 0; }));
    var over7 = rows.filter(function (r) { return (r.days || 0) >= 7; }).length;
    var body = rows.map(function (r) {
      var warn = (r.days || 0) >= 7;
      return '<tr>'
        + '<td>' + (r.source === 'gossip' ? '打听悬赏' : '任务悬赏') + '</td>'
        + '<td>' + esc(r.title || '—') + '</td>'
        + '<td>' + esc(r.ownerName || '—') + '</td>'
        + '<td>' + num(r.amount) + '</td>'
        + '<td>' + esc(fmtDay(r.frozenAt)) + '</td>'
        + '<td class="' + (warn ? 'wb-t1' : '') + '">' + num(r.days) + ' 天</td>'
        + '<td>' + esc(TASK_STATUS_NAMES[r.status] || r.status || '—') + '</td>'
        + '</tr>';
    }).join('');
    modalBody('wbCoinModal', '<p class="wb-mini">冻结中的钱正在托管，结算或退回后才会回到用户余额。'
      + '「已冻结天数」≥ 7 天的条目高亮显示，通常意味着任务卡住了。</p>'
      + '<table class="wb-table"><caption class="wb-caption">冻结清单（共 ' + num(rows.length) + ' 条，合计 '
      + num(total) + ' 币；其中 ' + num(over7) + ' 条已超过 7 天）</caption>'
      + '<thead><tr><th scope="col">来源</th><th scope="col">标题</th><th scope="col">冻结方</th>'
      + '<th scope="col">金额</th><th scope="col">冻结时间</th><th scope="col">已冻结</th><th scope="col">状态</th></tr></thead>'
      + '<tbody>' + (body || '<tr><td colspan="7" class="wb-empty">当前没有冻结中的资金</td></tr>') + '</tbody></table>');
  }

  /* ===== 任务列表弹窗（完成率下钻） ===== */

  var TASK_STATUS_TABS = [
    { k: 'closed', n: '已完结' },
    { k: 'completed', n: '已完成' },
    { k: 'abnormal', n: '异常' },
    { k: 'active', n: '进行中' },
    { k: 'approved', n: '等待认领' },
    { k: 'pending', n: '待审核' },
    { k: '', n: '全部' }
  ];
  var taskFilter = 'closed';
  var taskPage = 1;

  window.wbOpenTaskModal = function (status) {
    if (coworkBlocked()) return;
    taskFilter = (status === undefined || status === null) ? 'closed' : status;
    taskPage = 1;
    ensureModal('wbTaskModal', '任务列表', TASK_STATUS_TABS);
    showModal('wbTaskModal');
    renderTabs('wbTaskModal', TASK_STATUS_TABS, taskFilter, function (k) {
      taskFilter = k; taskPage = 1;
      window.wbSwitchTaskTab(k);
    });
    loadTaskList();
  };

  window.wbSwitchTaskTab = function (k) {
    taskFilter = k;
    taskPage = 1;
    renderTabs('wbTaskModal', TASK_STATUS_TABS, taskFilter, function (k2) {
      taskFilter = k2; taskPage = 1;
      window.wbSwitchTaskTab(k2);
    });
    loadTaskList();
  };

  /* 一键提醒该任务的发布者去完成配对：邮件按发布者汇总，同一发布者每天最多一封 */
  async function remindPublisher(btn) {
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';
    var original = btn.textContent;
    btn.textContent = '发送中…';
    var res = await window.apiPost('/api/admin/tasks/' + btn.getAttribute('data-remind') + '/remind-pairing', {});
    btn.textContent = original;
    btn.dataset.busy = '0';
    if (typeof window.toast !== 'function') return;
    if (res && res.code === 200) {
      window.toast(res.data || '已发送配对提醒');
    } else {
      window.toast((res && res.msg) || '提醒失败，请稍后重试');
    }
  }

  /* 工作台右上「提醒待配对发布者」：先弹确认框，确认后才真发信 */
  window.wbRemindAll = function () {
    if (coworkBlocked()) return;
    ensureModal('wbRemindAllModal', '提醒待配对发布者', null, 'is-confirm');
    showModal('wbRemindAllModal');
    modalBody('wbRemindAllModal',
      '<p class="wb-confirm-lead">将给<strong>所有</strong>「有报名、还没确认配对」任务的发布者各发一封提醒邮件。</p>'
      + '<ul class="wb-confirm-list">'
      + '<li>邮件按发布者汇总，一人一封，列出他名下全部待配对任务</li>'
      + '<li>每人每天最多一封，今天已提醒过的会自动跳过</li>'
      + '<li>点「确认发送」后立即发信，当天无法撤销</li>'
      + '</ul>'
      + '<div class="wb-confirm-foot">'
      + '<button type="button" class="wb-btn wb-btn-ghost" data-remind-cancel="1">取消</button>'
      + '<button type="button" class="wb-btn wb-btn-primary" data-remind-ok="1">确认发送</button>'
      + '</div>');
    var box = byId('wbRemindAllModalBody');
    if (!box) return;
    var cancel = box.querySelector('[data-remind-cancel]');
    if (cancel) cancel.addEventListener('click', function () { hideModal('wbRemindAllModal'); });
    var ok = box.querySelector('[data-remind-ok]');
    if (ok) ok.addEventListener('click', function () { confirmRemindAll(ok); });
  };

  /* 确认后调用批量提醒接口：结果用 toast 反馈并关掉确认框（与每天 10:00 的自动提醒共用去重） */
  async function confirmRemindAll(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '发送中…';
    var res = await window.apiPost('/api/admin/tasks/remind-pairing/all', {});
    hideModal('wbRemindAllModal');
    if (typeof window.toast !== 'function') return;
    if (res && res.code === 200) {
      window.toast(res.data || '已发送配对提醒');
    } else {
      window.toast((res && res.msg) || '提醒失败，请稍后重试');
    }
  }

  async function loadTaskList() {
    modalBody('wbTaskModal', loadingHtml());
    var res = await window.apiGet('/api/admin/tasks?page=' + taskPage + '&size=20'
      + (taskFilter ? '&status=' + encodeURIComponent(taskFilter) : ''));
    if (!res || res.code !== 200) { modalBody('wbTaskModal', '<div class="wb-mini">加载失败</div>'); return; }
    var d = res.data || {};
    var records = d.records || [];
    var rows = records.map(function (v) {
      var t = v.task || {};
      /* 只有「已通过」（等待认领/待配对）的任务才可能有人报名没配对，其余状态不给按钮 */
      var act = t.status === 'approved'
        ? '<button type="button" class="wb-link" data-remind="' + String(t.id) + '">提醒发布者</button>'
        : '<span class="wb-mini">—</span>';
      return '<tr>'
        + '<td>' + esc(t.title || '—') + '</td>'
        + '<td>' + esc(TASK_TYPE_NAMES[t.taskType] || t.taskType || '—') + '</td>'
        + '<td>' + esc(TASK_STATUS_NAMES[t.status] || t.status || '—') + '</td>'
        + '<td>' + num(t.reward) + '</td>'
        + '<td>' + esc(v.publisherNickname || '—') + '</td>'
        + '<td>' + num(v.claimCount || 0) + '</td>'
        + '<td>' + esc(fmtDay(t.createdAt)) + '</td>'
        + '<td>' + act + '</td>'
        + '</tr>';
    }).join('');
    var label = (TASK_STATUS_TABS.filter(function (t) { return t.k === taskFilter; })[0] || {}).n || '全部';
    var pages = d.pages || 1;
    modalBody('wbTaskModal',
      '<table class="wb-table"><caption class="wb-caption">' + esc(label) + ' 任务（共 ' + num(d.total || 0) + ' 个）</caption>'
      + '<thead><tr><th scope="col">任务</th><th scope="col">类型</th><th scope="col">状态</th>'
      + '<th scope="col">悬赏</th><th scope="col">发布者</th><th scope="col">认领</th><th scope="col">发布时间</th>'
      + '<th scope="col">操作</th></tr></thead>'
      + '<tbody>' + (rows || '<tr><td colspan="8" class="wb-empty">该状态下暂无任务</td></tr>') + '</tbody></table>'
      + pagerHtml(taskPage, pages));
    var body = byId('wbTaskModalBody');
    if (body) {
      body.querySelectorAll('[data-remind]').forEach(function (b) {
        b.addEventListener('click', function () { remindPublisher(b); });
      });
    }
    wirePager('wbTaskModal', function (step) {
      var next = taskPage + step;
      if (next < 1 || next > pages) return;
      taskPage = next;
      loadTaskList();
    });
  }

  /* ===== 页面热度明细弹窗 ===== */

  async function wbOpenPageModal(pageKey) {
    if (coworkBlocked()) return;
    if (!pageKey) return;
    ensureModal('wbPageModal', '页面热度明细 · ' + (PAGE_NAMES[pageKey] || pageKey), null);
    showModal('wbPageModal');
    modalBody('wbPageModal', loadingHtml());
    var res = await window.apiGet('/api/admin/page-views/detail?pageKey=' + encodeURIComponent(pageKey)
      + '&range=' + encodeURIComponent(range));
    if (!res || res.code !== 200 || !res.data) { modalBody('wbPageModal', '<div class="wb-mini">加载失败</div>'); return; }
    var d = res.data;
    var visitors = d.topVisitors || [];
    var vRows = visitors.map(function (v) {
      return '<tr><td>' + esc(v.nickname || '（已注销）') + '</td><td>' + num(v.cnt) + '</td></tr>';
    }).join('');
    modalBody('wbPageModal',
      '<p class="wb-mini">' + esc(RANGE_LABEL[range]) + '：点击量 ' + num(d.pv) + ' 次，覆盖 ' + num(d.uv) + ' 位蛋蛋。</p>'
      + '<div class="wb-chart-box is-sm"><canvas id="wbPageChart" role="img" aria-label="该页面点击量趋势图"></canvas></div>'
      + '<table class="wb-table"><caption class="wb-caption">访问最多的蛋蛋</caption>'
      + '<thead><tr><th scope="col">蛋蛋</th><th scope="col">访问次数</th></tr></thead>'
      + '<tbody>' + (vRows || '<tr><td colspan="2" class="wb-empty">暂无访问记录</td></tr>') + '</tbody></table>');

    /* 每次按 pageKey 重建，避免残留上一个页面的曲线 */
    dropChart('pagedetail');
    var canvas = byId('wbPageChart');
    if (!canvas || typeof window.Chart === 'undefined') return;
    var labels = (d.labels || []).map(function (l) { return /^\d\d$/.test(l) ? l + ':00' : l; });
    charts.pagedetail = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '点击量', data: d.pvSeries || [], borderColor: C.primary,
          backgroundColor: 'rgba(76,159,216,.12)', fill: true, tension: .35,
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4
        }]
      },
      options: baseOptions({
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: Object.assign({ maxRotation: 0, autoSkipPadding: 12 }, AXIS_TICK) },
          y: { beginAtZero: true, border: { display: false }, grid: { color: '#F0F0F5', drawTicks: false }, ticks: Object.assign({ precision: 0 }, AXIS_TICK) }
        }
      })
    });
  }

  /* ===== 被隐藏的评价弹窗 ===== */

  var ratingPage = 1;
  var RATER_ROLE_NAMES = { publisher: '发布者评认领者', claimer: '认领者评发布者' };

  window.wbOpenRatingModal = function () {
    if (coworkBlocked()) return;
    ratingPage = 1;
    ensureModal('wbRatingModal', '被隐藏的评价', null);
    showModal('wbRatingModal');
    loadHiddenRatings();
  };

  async function loadHiddenRatings() {
    modalBody('wbRatingModal', loadingHtml());
    var res = await window.apiGet('/api/admin/ratings/hidden?page=' + ratingPage + '&size=20');
    if (!res || res.code !== 200) { modalBody('wbRatingModal', '<div class="wb-mini">加载失败</div>'); return; }
    var d = res.data || {};
    var records = d.records || [];
    var rows = records.map(function (r) {
      return '<tr>'
        + '<td>' + esc(fmtDay(r.createdAt)) + '</td>'
        + '<td>' + esc(r.raterNickname || '—') + ' → ' + esc(r.rateeNickname || '—')
        + ' <span class="wb-mini">' + esc(RATER_ROLE_NAMES[r.raterRole] || '') + '</span></td>'
        + '<td>' + num(r.score) + ' 星</td>'
        + '<td>' + esc(r.comment || '—') + '</td>'
        + '<td>' + esc(r.taskTitle || '—') + '</td>'
        + '</tr>';
    }).join('');
    var pages = d.pages || 1;
    modalBody('wbRatingModal',
      '<p class="wb-mini">被隐藏的评价不再展示、不计入该蛋蛋的口碑与条数。如需恢复展示，请在「用户管理 → 查看 → 收到的评价」中操作。</p>'
      + '<table class="wb-table"><caption class="wb-caption">已隐藏 ' + num(d.total || 0) + ' 条</caption>'
      + '<thead><tr><th scope="col">评价时间</th><th scope="col">评价关系</th><th scope="col">评分</th>'
      + '<th scope="col">内容</th><th scope="col">关联任务</th></tr></thead>'
      + '<tbody>' + (rows || '<tr><td colspan="5" class="wb-empty">当前没有被隐藏的评价</td></tr>') + '</tbody></table>'
      + pagerHtml(ratingPage, pages));
    wirePager('wbRatingModal', function (step) {
      var next = ratingPage + step;
      if (next < 1 || next > pages) return;
      ratingPage = next;
      loadHiddenRatings();
    });
  }

  /* ===== 「新增」下钻：用户管理页 + 与当前 range 一致的注册时间筛选 ===== */

  /**
   * 跳「用户管理」页并按状态筛选。
   * 会先清掉注册时间条件——否则从别处过来会莫名只剩某段时间的用户。
   */
  function wbDrillUsers(filter) {
    if (coworkBlocked()) return;
    setUserCreatedFrom('', '仅今日新增');
    wbDrill('users', function () {
      if (typeof window.filterUsers === 'function') window.filterUsers(filter || 'all');
    });
  }

  /** 点「今日/近 7 日/近 30 日新增」：筛选窗口与 KPI 的 range 保持一致 */
  function wbShowNewUsers() {
    if (coworkBlocked()) return;
    var win = rangeNewWindow();
    setUserCreatedFrom(daysAgoIso(win.days), win.label);
    injectUserTodayChip();
    /* 先回「全部」再拉取，保证 chips 与实际行状态一致 */
    if (typeof window.filterUsers === 'function') window.filterUsers('all');
    if (typeof window.go === 'function') window.go('users');
  }

  /* ---------------- 数据加载 ---------------- */

  async function wbLoad() {
    if (loading) return;
    if (typeof window.apiGet !== 'function') return;
    if (!canViewDashboard()) return;
    var body = byId('wbBody');
    if (!body) return;

    loading = true;
    body.classList.add('is-loading');
    setStatus('');

    var res = await window.apiGet('/api/admin/stats?range=' + encodeURIComponent(range));
    loading = false;
    body.classList.remove('is-loading');

    if (!res || res.code !== 200 || !res.data) {
      setStatus((res && res.msg) ? ('统计加载失败：' + res.msg) : '统计加载失败，请稍后重试');
      return;
    }

    var data = res.data;
    lastStats = data;

    /* 主管理员与副管理员同版式：工作台全部板块展示 */
    toggleBlock('trend', true);
    toggleBlock('dist', true);
    toggleBlock('tasktype', true);
    toggleBlock('skillcat', true);
    toggleBlock('coin', true);
    toggleBlock('risk', true);
    toggleBlock('heat', true);

    /* 资金「详情」弹窗与风控下钻接口仅主管理员可访问，副管理员隐藏入口/调整文案 */
    var canDetail = isFullAdmin();
    var coinDetailBtn = document.querySelector('#page-dashboard [data-block="coin"] .wb-link');
    if (coinDetailBtn) coinDetailBtn.style.display = canDetail ? '' : 'none';
    var riskSub = document.querySelector('#page-dashboard [data-block="risk"] .wb-block-sub');
    if (riskSub) riskSub.textContent = canDetail ? '点击可直达处理页' : '仅主管理员可下钻处理';

    renderTrendCfgPanel();
    renderKpis(data);
    renderTrend(data);
    renderDist(data);
    renderCategoryChart('tasktype', 'wbTaskTypeChart', 'wbTaskTypeTable',
      data.taskTypes, TASK_TYPE_ORDER, TASK_TYPE_NAMES, C.primary, '任务类型分布',
      function (key) { wbPublishWith(null, key); });
    renderCategoryChart('skillcat', 'wbSkillChart', 'wbSkillTable',
      data.skillCategories, SKILL_CAT_ORDER, SKILL_CAT_NAMES, C.green, '发布任务类型概览',
      function (key) { wbPublishWith(key, 'reward'); });
    renderCoin(data);
    renderRisk(data);
    renderHeat(data);
    loadActivity();

    /* 与既有徽标/标题联动保持一致：待审核数交给 applyPendingCount 统一刷新 */
    if (data.task && typeof data.task.pendingReview === 'number') {
      window.pendingCount = data.task.pendingReview;
    }
    if (typeof window.applyPendingCount === 'function') window.applyPendingCount();
    applyCoworkChrome();

    if (firstRender) {
      firstRender = false;
    } else {
      setStatus('已更新（' + RANGE_LABEL[range] + '）');
    }

    wbResizeCharts();
  }

  function wbResizeCharts() {
    if (!window.requestAnimationFrame) return;
    window.requestAnimationFrame(function () {
      Object.keys(charts).forEach(function (k) {
        if (charts[k] && typeof charts[k].resize === 'function') charts[k].resize();
      });
    });
  }

  /* ---------------- 埋点上报 ---------------- */

  /* 仅记录「已登录学生」的学生端切页；
     必须带 Authorization 头，故用 fetch keepalive 而非 sendBeacon（后者无法设置请求头） */
  function wbTrack(pageKey) {
    var u = user();
    if (!u.registered || u.role !== 'student') return;
    if (STUDENT_PAGES.indexOf(pageKey) < 0) return;

    var token = '';
    try { token = sessionStorage.getItem('token') || ''; } catch (e) { return; }
    if (!token) return;

    try {
      window.fetch(window.API_BASE + '/api/track/page', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ pageKey: pageKey })
      });
    } catch (e) { /* 埋点失败不影响切页 */ }
  }

  /* ---------------- 用户活跃看板 ---------------- */

  var activityRange = '7d';
  var activityCharts = {};

  async function loadActivity() {
    if (typeof window.apiGet !== 'function') return;
    if (!canViewDashboard()) return;
    var section = byId('wbActivitySection');
    if (!section) return;

    var res = await window.apiGet('/api/admin/user-activity?range=' + encodeURIComponent(activityRange));
    if (!res || res.code !== 200 || !res.data) return;
    var d = res.data;

    section.style.display = '';
    var charts = byId('wbActivityCharts'); if (charts) charts.style.display = '';
    var extra = byId('wbActivityExtra'); if (extra) extra.style.display = '';

    renderActivityKpis(d);
    renderActivityTrend(d);
    renderFunnel(d);
    renderHeatmap(d);
    renderRetention(d);
    renderDepth(d);
  }

  function renderActivityKpis(d) {
    var el = byId('wbActivityKpis'); if (!el) return;
    el.innerHTML =
      kpi('DAU（今日）', d.dauToday || 0, '👤') +
      kpi('WAU（7日）', d.wau || 0, '📊') +
      kpi('MAU（30日）', d.mau || 0, '📈');
  }
  function kpi(label, value, icon) {
    return '<div class="kpi" style="cursor:default"><div class="kpi-val">' + (icon ? icon + ' ' : '') + '<b>' + value + '</b></div><div class="kpi-label">' + label + '</div></div>';
  }

  function renderActivityTrend(d) {
    var canvas = byId('wbActivityTrendChart'); if (!canvas) return;
    var trend = d.trend || [];
    var labels = trend.map(function (r) { return r.statDate; });
    var dauData = trend.map(function (r) { return r.dau || 0; });
    var anonData = trend.map(function (r) { return r.anonymousSessions || 0; });
    var sessData = trend.map(function (r) { return r.totalSessions || 0; });

    if (activityCharts.trend) activityCharts.trend.destroy();
    activityCharts.trend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'DAU（登录用户）', data: dauData, borderColor: '#6C5CE4', backgroundColor: 'rgba(108,92,228,0.1)', fill: true, tension: 0.3 },
          { label: '匿名会话', data: anonData, borderColor: '#FF9800', backgroundColor: 'rgba(255,152,0,0.1)', fill: true, tension: 0.3 },
          { label: '总会话', data: sessData, borderColor: '#4CAF50', borderDash: [5,3], fill: false, tension: 0.3 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });

    var table = byId('wbActivityTrendTable');
    if (table) {
      table.innerHTML = '<table class="wb-table"><thead><tr><th>日期</th><th>DAU</th><th>匿名</th><th>总会话</th><th>平均时长</th></tr></thead><tbody>' +
        trend.map(function (r) { return '<tr><td>' + r.statDate + '</td><td>' + (r.dau||0) + '</td><td>' + (r.anonymousSessions||0) + '</td><td>' + (r.totalSessions||0) + '</td><td>' + formatDuration(r.avgDurationSec||0) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    }
  }

  function renderFunnel(d) {
    var el = byId('wbFunnel'); if (!el) return;
    var f = d.funnel || {};
    var steps = [
      { label: '访问', value: f.visitors || 0, color: '#6C5CE4' },
      { label: '登录', value: f.loggedIn || 0, color: '#2196F3' },
      { label: '发布', value: f.published || 0, color: '#4CAF50' },
      { label: '认领', value: f.claimed || 0, color: '#FF9800' },
      { label: '完成', value: f.completed || 0, color: '#E8657E' }
    ];
    var max = Math.max(steps[0].value, 1);
    el.innerHTML = steps.map(function (s) {
      var pct = Math.round(s.value / max * 100);
      return '<div style="margin:4px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>' + s.label + '</span><span>' + s.value + ' (' + pct + '%)</span></div>' +
        '<div style="height:20px;background:#f0f0f0;border-radius:4px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:' + s.color + ';border-radius:4px;transition:width .3s"></div></div></div>';
    }).join('');
  }

  function renderHeatmap(d) {
    var el = byId('wbHeatmap'); if (!el) return;
    var hourly = d.hourly || [];
    var hourMap = {};
    hourly.forEach(function (h) { hourMap[h.h] = h; });
    var maxSess = 1;
    hourly.forEach(function (h) { if (h.sessions > maxSess) maxSess = h.sessions; });
    var html = '<div style="display:grid;grid-template-columns:repeat(24,1fr);gap:2px">';
    for (var h = 0; h < 24; h++) {
      var data = hourMap[h] || { sessions: 0 };
      var intensity = Math.round(data.sessions / maxSess * 255);
      var bg = 'rgba(108,92,228,' + (data.sessions / maxSess * 0.8 + 0.1).toFixed(2) + ')';
      html += '<div title="' + h + '时: ' + data.sessions + '次" style="aspect-ratio:1;background:' + bg + ';border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff">' + h + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function renderRetention(d) {
    var el = byId('wbRetention'); if (!el) return;
    var ret = d.retention || [];
    if (!ret.length) { el.innerHTML = '<p style="color:var(--ink3);font-size:12px">留存数据需要 7 天以上的会话记录</p>'; return; }
    el.innerHTML = '<table class="wb-table"><thead><tr><th>日期</th><th>次日</th><th>3日</th><th>7日</th><th>30日</th></tr></thead><tbody>' +
      ret.map(function (r) {
        return '<tr><td>' + r.cohortDate + '</td>' +
          retCell(r.day1) + retCell(r.day3) + retCell(r.day7) + retCell(r.day30) + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function retCell(val) {
    if (val == null) return '<td>-</td>';
    var pct = Math.round(val * 100);
    var color = pct >= 40 ? '#4CAF50' : pct >= 20 ? '#FF9800' : '#E8657E';
    return '<td style="color:' + color + ';font-weight:600">' + pct + '%</td>';
  }

  function renderDepth(d) {
    var canvas = byId('wbDepthChart'); if (!canvas) return;
    var sd = d.sessionDepth || {};
    if (activityCharts.depth) activityCharts.depth.destroy();
    activityCharts.depth = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['1 页', '2-3 页', '4+ 页'],
        datasets: [{ data: [sd.onePage||0, sd.twoThree||0, sd.fourPlus||0], backgroundColor: ['#6C5CE4','#2196F3','#4CAF50'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function formatDuration(sec) {
    if (sec < 60) return sec + '秒';
    if (sec < 3600) return Math.round(sec / 60) + '分';
    return Math.round(sec / 3600 * 10) / 10 + '时';
  }

  window.wbSetActivityRange = function (next) {
    activityRange = next;
    loadActivity();
  };

  /* ---------------- 访客会话追踪 ---------------- */

  var WB_VID_KEY = 'egg_visitor_id';
  var WB_NEW_KEY = 'egg_visitor_seen';
  var wbSessionId = null;
  var wbHeartbeatTimer = null;

  function wbInitSession() {
    try {
      var visitorId = localStorage.getItem(WB_VID_KEY);
      var isNew = false;
      if (!visitorId) {
        visitorId = crypto.randomUUID ? crypto.randomUUID() : ('v-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        localStorage.setItem(WB_VID_KEY, visitorId);
        isNew = true;
      }
      if (!localStorage.getItem(WB_NEW_KEY)) {
        isNew = true;
        localStorage.setItem(WB_NEW_KEY, '1');
      }

      wbSessionId = crypto.randomUUID ? crypto.randomUUID() : ('s-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      var device = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet' : 'desktop';

      var base = (window.API_BASE || '');
      window.fetch(base + '/api/track/session-start', {
        method: 'POST', keepalive: true,
        headers: getTrackHeaders(),
        body: JSON.stringify({ sessionId: wbSessionId, visitorId: visitorId, referrer: document.referrer || '', uaDevice: device, newVisitor: isNew })
      }).catch(function () {});

      wbHeartbeatTimer = setInterval(function () {
        if (document.hidden) return;
        window.fetch(base + '/api/track/heartbeat', {
          method: 'POST', keepalive: true,
          headers: getTrackHeaders(),
          body: JSON.stringify({ sessionId: wbSessionId })
        }).catch(function () {});
      }, 30000);

      document.addEventListener('visibilitychange', function () {
        if (document.hidden && wbHeartbeatTimer) { clearInterval(wbHeartbeatTimer); wbHeartbeatTimer = null; }
        else if (!document.hidden && !wbHeartbeatTimer && wbSessionId) {
          wbHeartbeatTimer = setInterval(function () {
            window.fetch(base + '/api/track/heartbeat', {
              method: 'POST', keepalive: true,
              headers: getTrackHeaders(),
              body: JSON.stringify({ sessionId: wbSessionId })
            }).catch(function () {});
          }, 30000);
        }
      });
    } catch (e) { /* tracking failure must not break the app */ }
  }

  function getTrackHeaders() {
    var h = { 'Content-Type': 'application/json' };
    try { var t = sessionStorage.getItem('token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (e) {}
    return h;
  }

  /* ---------------- 对外接口 ---------------- */

  window.wbSetRange = function (next) {
    if (RANGES.indexOf(next) < 0) next = '7d';
    range = next;
    document.querySelectorAll('#wbRange .chip').forEach(function (btn) {
      var on = btn.getAttribute('data-range') === next;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    wbLoad();
  };

  window.wbRefresh = function () {
    wbLoad();
    if (typeof window.updateFeedbackBadge === 'function') window.updateFeedbackBadge();
  };

  /* ---------------- 初始化 ---------------- */

  function init() {
    injectStyle();
    loadTrendCfg();
    wbInitSession();

    if (typeof window.go === 'function') {
      var origGo = window.go;
      window.go = function (id) {
        origGo.apply(this, arguments);
        wbTrack(id);
        if (id === 'dashboard') wbLoad();
      };
    }

    if (typeof window.renderDashboard === 'function') {
      var origRender = window.renderDashboard;
      window.renderDashboard = function () {
        origRender.apply(this, arguments);
        wbLoad();
      };
    }

    /* 下钻：目标页加载完成后套用筛选（目标页数据是异步的，早调用会被覆盖） */
    wrapRenderForDrill('renderUsers', 'users');
    wrapRenderForDrill('renderFeedbackTickets', 'feedback');

    /* 用户管理页的「仅今日新增」筛选 chip（DOM 就位后注入，故延后一帧） */
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { injectUserTodayChip(); });
    } else {
      injectUserTodayChip();
    }

    /* ESC：优先关弹窗，其次关趋势配置面板 */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (openModals.length) { hideModal(openModals[openModals.length - 1]); return; }
      closeTrendCfgPanel();
    });

    /* 点击面板外部关闭趋势配置 */
    document.addEventListener('click', function (e) {
      var panel = byId('wbTrendCfgPanel');
      if (!panel || panel.hasAttribute('hidden')) return;
      var wrap = panel.parentNode;
      if (wrap && wrap.contains(e.target)) return;
      closeTrendCfgPanel();
    });

    var page = byId('page-dashboard');
    if (page && page.classList.contains('active') && isModerator()) {
      wbLoad();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
