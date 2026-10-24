/* ============================================================
   任务管理 —— 后台页面（仅主管理员）

   依据已评审通过的原型 local-only/任务管理页原型.html 落成：
     · 独立页面，与「审核中心」并列；只给主管理员（enterManagerView 白名单里不含本页）
     · 由 growth-schoolv3.html 的 go('taskmanage') 调 window.renderAdminTaskManage()
     · 不改主 HTML 结构：样式运行时注入 <style>，页面骨架/弹窗/抽屉全部自建

   数据来自 /api/admin/tasks/manage（含已屏蔽 / 已删除，主管理员专用视角），
   置接口统一返回 {code,msg,data}；本模块沿用 js/admin-permissions.js 的写法：
   先判 res.code === 200，再取 res.data。

   与原型唯一的实现差异（数据来源不同所致）：
     · 原型 mock 里 status 直接用 'hidden' / 'deleted'；线上这两个是独立布尔列，
       故展示状态按 deleted > hidden > status 的优先级合成。
     · 「已屏蔽 / 已删除」对应后端 status=suspended（一次查询返回两者并集）。
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 接口 ---------------- */
  var LOGS_API = '/api/admin/task-governance-logs';
  var MANAGE_API = '/api/admin/tasks/manage';

  /* ---------------- 常量（取自原型） ---------------- */
  var TYPE_TEXT = { teach: '教学型', help: '求助型', team: '组队型', reward: '奖励型' };
  /* 技能分类中文名：与主文件 CAT_KEY_TO_NAME / js/admin-workbench.js 同值，拿不到则原样显示 */
  var CAT_NAMES = { study: '学业技术', job: '就业技能', side: '副业技能', hobby: '兴趣爱好', game: '游戏搭子', life: '生活互助' };

  var STATUS_TEXT = {
    pending: '待审核', approved: '待认领', in_progress: '进行中', full: '已满员',
    submitted: '待确认', completed: '已完成', rejected: '已驳回', expired: '已过期',
    cancelled: '已取消', hidden: '已屏蔽', deleted: '已删除'
  };
  var STATUS_TAG = {
    pending: 'tm-tag-orange', approved: 'tm-tag-lilac', in_progress: 'tm-tag-mint',
    full: 'tm-tag-lilac', submitted: 'tm-tag-orange', completed: 'tm-tag-green',
    rejected: 'tm-tag-red', expired: 'tm-tag-gray', cancelled: 'tm-tag-gray',
    hidden: 'tm-tag-red', deleted: 'tm-tag-gray'
  };
  var ACTION_TEXT = {
    hide: '屏蔽任务', restore: '恢复任务', delete: '删除任务',
    return_review: '退回审核', feature: '加精', unfeature: '取消加精'
  };

  var QUICK = {
    hide: ['垃圾广告', '重复发布刷屏', '涉嫌线下交易风险', '信息不实', '含联系方式违规'],
    del: ['违规内容：学术不端', '违法违规信息', '恶意欺诈风险'],
    back: ['票面信息需补证明', '证明图不清晰', '描述信息不完整']
  };

  /* 头像底色：按用户 id 稳定取色 */
  var AVA_COLORS = ['#4ECDC4', '#3B6BA5', '#E8657E', '#D4A017', '#2D7D4F', '#6B5B95', '#E85D3A', '#1B3A5B'];

  /* 列表展示字数上限（仅展示层截断，不改后端校验） */
  var TITLE_MAX = 18;
  var SUB_MAX = 22;

  var STYLE_ID = 'tmPageStyle';

  var state = {
    status: 'all', type: 'all', keyword: '',
    page: 1, size: 20, total: 0, allTotal: 0,
    records: [],
    logTotal: 0,
    searchTimer: null,
    drawer: null,     // { uid, name } 抽屉打开时的用户
    pending: null     // 当前待确认的处置
  };

  /* ---------------- 工具 ---------------- */
  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) { if (typeof window.toast === 'function') window.toast(msg); }

  function cut(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function catText(key) { return key ? (CAT_NAMES[key] || key) : ''; }

  function avaColor(uid) {
    var s = String(uid == null ? '' : uid), sum = 0;
    for (var i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return AVA_COLORS[sum % AVA_COLORS.length];
  }

  function fmtTime(s) {
    if (!s) return '—';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s).replace('T', ' ').slice(0, 16);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* TaskVO → 内部归一化对象 */
  function norm(vo) {
    var t = (vo && vo.task) || vo || {};
    var uid = (t.publisherId != null) ? t.publisherId : (vo ? vo.publisherId : null);
    var who = (vo && vo.publisherNickname) || ('用户#' + (uid == null ? '?' : uid));
    return {
      id: t.id,
      title: t.title || '',
      desc: t.description || '',
      type: t.taskType || t.type || '',
      reward: Number(t.reward || 0),
      status: t.status || '',
      hidden: !!t.hidden,
      deleted: !!t.deleted,
      featured: !!t.featured,
      reason: t.governanceReason || '',
      time: fmtTime(t.createdAt),
      createdAt: t.createdAt || '',
      skillCategory: t.skillCategory || '',
      skillSub: t.skillSub || '',
      uid: uid,
      who: who,
      role: (vo && vo.publisherRole) || '',
      school: (vo && vo.publisherSchool) || '',
      vo: vo
    };
  }

  /* 展示状态：deleted > hidden > status */
  function effStatus(n) {
    if (n.deleted) return 'deleted';
    if (n.hidden) return 'hidden';
    return n.status;
  }

  function statusTag(st) {
    return '<span class="tm-tag ' + (STATUS_TAG[st] || 'tm-tag-gray') + '">'
      + esc(STATUS_TEXT[st] || st) + '</span>';
  }

  function findNorm(id) {
    id = Number(id);
    for (var i = 0; i < state.records.length; i++) {
      if (Number(state.records[i].id) === id) return state.records[i];
    }
    return null;
  }

  /* ---------------- 样式（运行时注入） ---------------- */
  var CSS = [
    '.tm-root{display:flex;flex-direction:column;gap:20px;min-width:0}',
    '.tm-topbar{display:flex;align-items:center;justify-content:space-between;height:44px}',
    '.tm-crumb{font-size:13px;color:var(--muted);font-weight:600}',
    '.tm-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}',
    '.tm-title-row h2{font-size:22px;font-weight:800;letter-spacing:.3px}',
    '.tm-title-row p{font-size:13px;color:var(--muted);margin-top:6px}',
    '.tm-rec-btn{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border:2px solid var(--border);border-radius:13px;',
    '  background:#fff;font-size:12.5px;font-weight:700;color:var(--ink2);cursor:pointer;transition:all .2s;white-space:nowrap}',
    '.tm-rec-btn:hover{border-color:var(--primary);color:var(--primary);background:var(--primary-tint)}',
    '.tm-rec-btn svg{width:15px;height:15px;flex:none}',
    '.tm-rec-btn b{font-weight:800;color:var(--primary);background:var(--primary-tint);border-radius:100px;padding:1px 7px;font-size:11.5px}',
    '.tm-rec-btn:hover b{background:#fff}',
    '.tm-filter-bar{background:#fff;border-radius:16px;box-shadow:var(--shadow);padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.tm-chip{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:8px 15px;border-radius:13px;font-size:12.5px;font-weight:600;',
    '  cursor:pointer;background:var(--bg);color:var(--ink2);transition:all .2s var(--bounce);border:none}',
    '.tm-chip:hover{background:#E2EBEF}',
    '.tm-chip.active{background:linear-gradient(135deg,#4ECDC4,#45B7D1);color:#fff;box-shadow:0 3px 10px rgba(78,205,196,.25)}',
    '.tm-chip b{font-weight:800;opacity:.72;font-size:11.5px}',
    '.tm-fsel{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px;border:2px solid var(--border);border-radius:13px;background:#fff;transition:all .2s}',
    '.tm-fsel:hover{border-color:var(--faint)}',
    '.tm-fsel:focus-within{border-color:var(--primary)}',
    '.tm-fsel>span{flex:none;font-size:12px;font-weight:800;color:var(--muted)}',
    '.tm-fsel select{border:none;background:none;outline:none;font-family:inherit;font-size:12.5px;font-weight:700;color:var(--ink);cursor:pointer;padding-right:2px}',
    '.tm-fcount{margin-left:auto;font-size:12.5px;color:var(--muted)}',
    '.tm-fcount b{color:var(--ink2)}',
    '.tm-search{display:flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:12px;background:#fff;border:2px solid var(--border);',
    '  color:var(--muted);font-size:13px;transition:all .2s;flex:1 1 200px;min-width:160px;max-width:420px;margin:0 auto}',
    '.tm-search:focus-within{border-color:var(--primary)}',
    '.tm-search svg{width:16px;height:16px;flex:none}',
    '.tm-search input{border:none;outline:none;background:none;font:inherit;color:var(--ink);width:100%}',
    '.tm-search input::placeholder{color:var(--faint)}',
    '.tm-table{background:#fff;border-radius:12px;box-shadow:var(--shadow);padding:8px;flex:none}',
    '.tm-trow{display:grid;align-items:center;padding:0 16px;min-height:56px;border-radius:10px;',
    '  grid-template-columns:minmax(0,1.8fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.15fr) minmax(0,1.15fr) minmax(0,1.3fr) minmax(0,1.2fr)}',
    '.tm-trow:hover:not(.tm-thead){background:#FCFAF5}',
    '.tm-trow.tm-thead{min-height:44px;border-bottom:1px solid var(--border);border-radius:0}',
    '.tm-trow.tm-thead .tm-cell{font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.2px}',
    '.tm-trow .tm-cell{padding:0 8px;min-width:0;display:flex;align-items:center;justify-content:center}',
    '.tm-trow+.tm-trow{border-top:1px solid #F1EDE1}',
    '.tm-trow.tm-thead+.tm-trow{border-top:none}',
    '.tm-trow .tm-cell.tm-c-title{flex-direction:column;align-items:flex-start;justify-content:center;position:relative}',
    '.tm-trow.tm-thead .tm-cell.tm-c-title{align-items:center}',
    '.tm-trow .tm-cell.tm-c-op{justify-content:flex-end;gap:12px;flex-wrap:wrap;position:relative}',
    '.tm-caret{font-size:9px;opacity:.7;margin-left:2px}',
    '.tm-opmore{position:absolute;top:calc(100% + 8px);right:0;min-width:136px;padding:5px;background:#fff;border:1px solid var(--border);',
    '  border-radius:12px;box-shadow:var(--shadow-md);display:none;z-index:30;text-align:left}',
    '.tm-opmore.on{display:block}',
    '.tm-opmore button{display:block;width:100%;padding:8px 11px;border:none;border-radius:9px;background:none;font-family:inherit;',
    '  font-size:12.5px;font-weight:600;color:var(--ink2);text-align:left;cursor:pointer;white-space:nowrap}',
    '.tm-opmore button:hover{background:var(--bg);color:var(--ink)}',
    '.tm-opmore button.tm-danger{color:var(--red)}',
    '.tm-opmore button.tm-danger:hover{background:var(--red-tint);color:var(--red)}',
    '.tm-empty{padding:40px 0;text-align:center;color:var(--muted);font-size:13px}',
    '.tm-ttl{font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tm-ttl.tm-feat{color:#B07E00}',
    '.tm-ttl[data-tm-open]{cursor:pointer}',
    '.tm-ttl[data-tm-open]:hover{text-decoration:underline;text-underline-offset:3px}',
    '.tm-sub{font-size:11.5px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tm-who{display:flex;align-items:center;gap:8px}',
    '.tm-ava{width:24px;height:24px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:11px;font-weight:800;color:#fff}',
    '.tm-who .tm-nm{font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer;border-bottom:1px dashed transparent}',
    '.tm-who .tm-nm:hover{color:var(--primary);border-bottom-color:var(--primary)}',
    '.tm-money{font-size:13px;font-weight:800;color:var(--gold)}',
    '.tm-money small{font-size:11px;font-weight:700;color:var(--muted);margin-left:2px}',
    '.tm-time{font-size:12px;color:var(--muted)}',
    '.tm-type{font-size:12px;color:var(--ink2)}',
    '.tm-tag{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:11px;font-weight:600;white-space:nowrap}',
    '.tm-tag-orange{background:var(--orange-tint);color:var(--orange)}',
    '.tm-tag-green{background:var(--green-tint);color:var(--green)}',
    '.tm-tag-lilac{background:var(--lilac-tint);color:var(--lilac)}',
    '.tm-tag-red{background:var(--red-tint);color:var(--red)}',
    '.tm-tag-gold{background:var(--gold-tint);color:#B07E00}',
    '.tm-tag-gray{background:#EDF2F7;color:var(--ink2)}',
    '.tm-tag-mint{background:var(--mint-tint);color:#2A8C84}',
    '.tm-op{font-size:12px;font-weight:600;color:var(--primary);cursor:pointer;background:none;border:none;padding:0;white-space:nowrap}',
    '.tm-op:hover{text-decoration:underline}',
    '.tm-op.tm-danger{color:var(--red)}',
    '.tm-op.tm-warn{color:var(--orange)}',
    '.tm-op.tm-off{color:var(--muted)}',
    '.tm-op-done{font-size:12px;color:var(--faint);white-space:nowrap}',
    '.tm-is-hidden{background:#FAF8F2}',
    '.tm-is-hidden .tm-ttl,.tm-is-hidden .tm-money,.tm-is-hidden .tm-type{color:var(--muted);text-decoration:line-through}',
    '.tm-is-hidden .tm-ava{filter:grayscale(1);opacity:.55}',
    '.tm-is-deleted{background:#F7F5F0}',
    '.tm-is-deleted .tm-ttl,.tm-is-deleted .tm-money,.tm-is-deleted .tm-type,.tm-is-deleted .tm-nm{color:var(--faint);text-decoration:line-through}',
    '.tm-is-deleted .tm-ava{filter:grayscale(1);opacity:.4}',
    '.tm-pager{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--muted);padding:0 4px}',
    '.tm-pager .tm-pbtn{padding:6px 14px;border-radius:10px;border:1px solid var(--border);background:#fff;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer}',
    '.tm-pager .tm-pbtn:hover:not([disabled]){border-color:var(--primary);color:var(--primary)}',
    '.tm-pager .tm-pbtn[disabled]{opacity:.5;cursor:not-allowed}',
    '.tm-pager-btns{display:flex;gap:8px}',
    '.tm-loglist{display:flex;flex-direction:column;margin-top:14px}',
    '.tm-logitem{display:flex;gap:12px;padding:11px 0;border-top:1px solid #F1EDE1;font-size:12.5px;align-items:baseline}',
    '.tm-logitem:first-child{border-top:none}',
    '.tm-logitem time{color:var(--muted);font-size:11.5px;flex:0 1 auto;min-width:92px}',
    '.tm-logitem .tm-what{color:var(--ink2);min-width:0}',
    '.tm-logitem .tm-what b{color:var(--ink);font-weight:700}',
    '.tm-logitem .tm-why{color:var(--muted);margin-left:6px}',
    '.tm-logitem .tm-by{color:var(--faint);margin-left:auto;flex:none;font-size:11.5px}',
    '.tm-mask{position:fixed;inset:0;background:rgba(27,42,74,.34);z-index:80;opacity:0;pointer-events:none;transition:opacity .2s}',
    '.tm-mask.on{opacity:1;pointer-events:auto}',
    '.tm-drawer{position:fixed;top:0;right:0;bottom:0;width:min(520px,92vw);background:#FBF8F1;z-index:90;',
    '  box-shadow:-10px 0 30px rgba(27,58,91,.16);transform:translateX(100%);transition:transform .26s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}',
    '.tm-drawer.on{transform:none}',
    '.tm-dr-head{padding:20px 22px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;background:#fff}',
    '.tm-dr-head .tm-ava{width:40px;height:40px;font-size:15px}',
    '.tm-dr-head .tm-info{flex:1;min-width:0}',
    '.tm-dr-head .tm-info b{font-size:16px;font-weight:800}',
    '.tm-dr-head .tm-info span{display:block;font-size:12px;color:var(--muted);margin-top:3px}',
    '.tm-x{width:32px;height:32px;border-radius:10px;border:none;background:var(--bg);color:var(--muted);font-size:18px;cursor:pointer;line-height:1}',
    '.tm-x:hover{background:var(--bg-tint);color:#FF6B6B}',
    '.tm-dr-body{padding:16px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}',
    '.tm-dr-sec-t{font-size:12px;font-weight:800;color:var(--muted);letter-spacing:.5px;margin-top:4px}',
    '.tm-mini-task{background:#fff;border:1px solid var(--border);border-radius:14px;padding:13px 14px;display:flex;flex-direction:column;gap:9px}',
    '.tm-mini-task .tm-row1{display:flex;align-items:center;gap:8px}',
    '.tm-mini-task .tm-row1 .tm-ttl{flex:1}',
    '.tm-mini-task .tm-row2{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--muted)}',
    '.tm-mini-task .tm-row2 .tm-money{font-size:12px}',
    '.tm-mini-task .tm-acts{display:flex;gap:14px;padding-top:9px;border-top:1px dashed var(--border)}',
    '.tm-info-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.tm-info-head h4{font-size:16px;font-weight:800;line-height:1.45}',
    '.tm-info-list{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 18px;margin-top:16px;font-size:13px}',
    '.tm-info-list dt{color:var(--muted);font-weight:600;white-space:nowrap}',
    '.tm-info-list dd{color:var(--ink);font-weight:600;overflow-wrap:anywhere;margin:0}',
    '.tm-info-reason{margin-top:16px;padding:13px 14px;border-radius:12px;background:var(--red-tint);border:1px solid #F6CFC4}',
    '.tm-info-reason-t{font-size:12px;font-weight:800;color:var(--red);margin-bottom:6px}',
    '.tm-info-reason p{font-size:13px;color:var(--ink);line-height:1.65;font-weight:600}',
    '.tm-info-reason .tm-meta{margin-top:8px;font-size:11.5px;color:var(--muted);font-weight:500}',
    '.tm-modal{position:fixed;inset:0;display:grid;place-items:center;z-index:100;opacity:0;pointer-events:none;transition:opacity .18s}',
    '.tm-modal.on{opacity:1;pointer-events:auto}',
    '.tm-modal .tm-card{width:min(440px,92vw);background:#fff;border-radius:18px;box-shadow:var(--shadow-lg);padding:22px;',
    '  transform:translateY(8px) scale(.98);transition:transform .2s var(--bounce)}',
    '.tm-modal .tm-card.tm-lg{width:min(620px,92vw);max-height:86vh;overflow-y:auto}',
    '.tm-modal.on .tm-card{transform:none}',
    '.tm-modal h4{font-size:16px;font-weight:800}',
    '.tm-modal .tm-hint{font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.6}',
    '.tm-modal .tm-target{background:var(--bg);border-radius:12px;padding:11px 13px;font-size:12.5px;color:var(--ink2);margin-top:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tm-modal label{display:block;font-size:12px;font-weight:700;color:var(--ink2);margin:16px 0 7px}',
    '.tm-modal label em{font-style:normal;color:var(--red)}',
    '.tm-modal textarea{width:100%;min-height:84px;padding:12px;border:2px solid var(--border);border-radius:12px;font:inherit;font-size:13px;color:var(--ink);',
    '  background:#FDFBF6;resize:vertical;outline:none;transition:all .2s}',
    '.tm-modal textarea:focus{border-color:var(--primary);background:#fff}',
    '.tm-modal .tm-quick{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}',
    '.tm-modal .tm-quick span{padding:5px 11px;border-radius:100px;background:var(--bg);border:1px solid var(--border);font-size:11.5px;color:var(--ink2);cursor:pointer}',
    '.tm-modal .tm-quick span:hover{border-color:var(--primary);color:var(--primary)}',
    '.tm-modal .tm-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}',
    '.tm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 18px;border-radius:14px;font-size:13.5px;font-weight:700;cursor:pointer;border:none;transition:all .22s var(--bounce)}',
    '.tm-btn-ghost{background:var(--bg);color:var(--ink2)}',
    '.tm-btn-ghost:hover{background:var(--primary-tint);color:var(--primary)}',
    '.tm-btn-primary{background:var(--primary);color:#fff}',
    '.tm-btn-primary:hover{background:var(--primary-dark)}',
    '.tm-btn-danger{background:var(--red);color:#fff}',
    '.tm-btn-danger:hover{background:#B93A26}',
    '.tm-btn[disabled]{opacity:.45;cursor:not-allowed}',
    '@media(max-width:768px){',
    '  .tm-root{gap:16px}',
    '  .tm-title-row{flex-direction:column;align-items:flex-start;gap:10px}',
    '  .tm-title-row h2{font-size:19px}',
    '  .tm-title-row p{font-size:12.5px}',
    '  .tm-filter-bar{padding:10px 12px;gap:8px}',
    '  .tm-fsel{flex:0 1 auto;height:34px;padding:0 10px}',
    '  .tm-chip{padding:7px 12px}',
    '  .tm-filter-bar .tm-search{flex:1 1 100%;max-width:none;min-width:0;margin:0;height:36px}',
    '  .tm-fcount{flex:1 1 100%;margin-left:0;text-align:right}',
    '  .tm-table{background:none;box-shadow:none;padding:0}',
    '  .tm-trow.tm-thead{display:none}',
    '  #tmRows{display:flex;flex-direction:column;gap:10px}',
    '  .tm-trow{display:flex;flex-wrap:wrap;align-items:center;min-height:0;gap:8px 10px;padding:14px;border-radius:16px;',
    '    border:1px solid var(--border);background:#fff;box-shadow:var(--shadow)}',
    '  .tm-trow+.tm-trow{border-top:1px solid var(--border)}',
    '  .tm-trow .tm-cell{padding:0;justify-content:flex-start}',
    '  .tm-trow .tm-cell.tm-c-op{justify-content:flex-start}',
    '  .tm-c-status{order:1;flex:0 0 auto}',
    '  .tm-c-title{order:2;flex:1 1 100%}',
    '  .tm-c-who{order:3;flex:0 0 auto}',
    '  .tm-c-type{order:4;flex:0 0 auto}',
    '  .tm-c-reward{order:5;flex:0 0 auto}',
    '  .tm-c-time{order:6;flex:0 0 auto}',
    '  .tm-c-op{order:7;flex:1 1 100%;flex-wrap:wrap;gap:10px 16px;padding-top:10px;border-top:1px dashed var(--border)}',
    '  .tm-ttl{font-size:14px;white-space:normal}',
    '  .tm-sub{white-space:normal}',
    '  .tm-pager{font-size:12px}',
    '  .tm-logitem{flex-wrap:wrap;gap:4px 10px;padding:10px 0}',
    '  .tm-logitem time{width:auto}',
    '  .tm-logitem .tm-by{margin-left:0;flex-basis:100%}',
    '  .tm-drawer{width:100%;max-width:100%}',
    '  .tm-dr-head{padding:16px 16px 13px}',
    '  .tm-dr-body{padding:14px 16px}',
    '  .tm-modal .tm-card{padding:18px}',
    '  .tm-modal .tm-foot{flex-direction:column-reverse}',
    '  .tm-modal .tm-foot .tm-btn{width:100%}',
    '  .tm-op{padding:2px 0}',
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
      + '<div class="tm-root" id="tmRoot">'
      + '  <div class="tm-topbar"><span class="tm-crumb">蛋蛋世界 / 任务管理</span></div>'
      + '  <div class="tm-title-row">'
      + '    <div><h2>任务管理</h2>'
      + '      <p>全站任务的统一处置入口：屏蔽下架、删除、退回审核中心重审、加精。所有处置都会记入处置流水。</p></div>'
      + '    <button class="tm-rec-btn" id="tmLogBtn" type="button">'
      + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9L20 9.5v9A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z"/><path d="M14 4v5.5h5.5M8.5 13.5h7M8.5 16.8h4.5"/></svg>'
      + '      处置记录 <b id="tmLogCount">0</b>'
      + '    </button>'
      + '  </div>'
      + '  <div class="tm-filter-bar" id="tmFilters">'
      + '    <span class="tm-chip active" id="tmResetBtn">全部 <b id="tmNall">0</b></span>'
      + '    <label class="tm-fsel"><span>分类</span><select id="tmTypeSel">'
      + '      <option value="all">全部</option><option value="teach">教学型</option><option value="help">求助型</option>'
      + '      <option value="team">组队型</option><option value="reward">奖励型</option>'
      + '    </select></label>'
      + '    <label class="tm-fsel"><span>状态</span><select id="tmStatusSel">'
      + '      <option value="all">全部</option><option value="pending">待审核</option><option value="approved">待认领</option>'
      + '      <option value="in_progress">进行中</option><option value="submitted">待确认</option><option value="completed">已完成</option>'
      + '      <option value="suspended">已屏蔽 / 已删除</option><option value="featured">仅看加精</option>'
      + '    </select></label>'
      + '    <div class="tm-search">'
      + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="M20 20L16.5 16.5" stroke-linecap="round"/></svg>'
      + '      <input id="tmQ" placeholder="搜索任务标题 / 发布者 / 任务 ID">'
      + '    </div>'
      + '    <span class="tm-fcount">当前筛选出 <b id="tmFcount">0</b> 条</span>'
      + '  </div>'
      + '  <div class="tm-table">'
      + '    <div class="tm-trow tm-thead">'
      + '      <div class="tm-cell tm-c-title">任务</div>'
      + '      <div class="tm-cell tm-c-who">发布者</div>'
      + '      <div class="tm-cell tm-c-type">类型</div>'
      + '      <div class="tm-cell tm-c-reward">赏金</div>'
      + '      <div class="tm-cell tm-c-status">状态</div>'
      + '      <div class="tm-cell tm-c-time">发布时间</div>'
      + '      <div class="tm-cell tm-c-op">操作</div>'
      + '    </div>'
      + '    <div id="tmRows"></div>'
      + '  </div>'
      + '  <div class="tm-pager">'
      + '    <span>共 <b id="tmPagerTotal">0</b> 条 · 第 <span id="tmPagerCur">1</span> / <span id="tmPagerMax">1</span> 页</span>'
      + '    <span class="tm-pager-btns">'
      + '      <button class="tm-pbtn" id="tmPrev" type="button" disabled>上一页</button>'
      + '      <button class="tm-pbtn" id="tmNext" type="button" disabled>下一页</button>'
      + '    </span>'
      + '  </div>'
      + '</div>'
      /* 抽屉：某用户全部任务 */
      + '<div class="tm-mask" id="tmMask"></div>'
      + '<aside class="tm-drawer" id="tmDrawer" aria-label="用户任务视图">'
      + '  <div class="tm-dr-head">'
      + '    <div class="tm-ava" id="tmDrAva">·</div>'
      + '    <div class="tm-info"><b id="tmDrName">用户</b><span id="tmDrMeta"></span></div>'
      + '    <button class="tm-x" id="tmDrClose" type="button" aria-label="关闭">×</button>'
      + '  </div>'
      + '  <div class="tm-dr-body" id="tmDrBody"></div>'
      + '</aside>'
      /* 处置原因弹窗 */
      + '<div class="tm-modal" id="tmModal">'
      + '  <div class="tm-card">'
      + '    <h4 id="tmMTitle">屏蔽任务</h4>'
      + '    <p class="tm-hint" id="tmMHint"></p>'
      + '    <div class="tm-target" id="tmMTarget"></div>'
      + '    <label id="tmMLabel">处置原因 <em>*必填</em></label>'
      + '    <textarea id="tmMReason" placeholder="写清为什么处置，会展示给发布者并留档"></textarea>'
      + '    <div class="tm-quick" id="tmMQuick"></div>'
      + '    <div class="tm-foot">'
      + '      <button class="tm-btn tm-btn-ghost" id="tmMCancel" type="button">取消</button>'
      + '      <button class="tm-btn tm-btn-primary" id="tmMOk" type="button">确认</button>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      /* 处置记录弹窗 */
      + '<div class="tm-modal" id="tmLogModal">'
      + '  <div class="tm-card tm-lg">'
      + '    <h4>处置记录</h4>'
      + '    <p class="tm-hint">所有处置（屏蔽 / 恢复 / 删除 / 退回审核 / 加精）都会留档，记录操作人、时间与原因。</p>'
      + '    <div class="tm-loglist" id="tmLogList"></div>'
      + '    <div class="tm-foot"><button class="tm-btn tm-btn-ghost" id="tmLogClose" type="button">关闭</button></div>'
      + '  </div>'
      + '</div>'
      /* 任务信息弹窗：只读，无任何处置操作 */
      + '<div class="tm-modal" id="tmInfoModal">'
      + '  <div class="tm-card tm-lg">'
      + '    <div class="tm-info-head"><span class="tm-tag" id="tmInfoStatus"></span><h4 id="tmInfoTitle"></h4></div>'
      + '    <p class="tm-hint" id="tmInfoIntro"></p>'
      + '    <dl class="tm-info-list" id="tmInfoList"></dl>'
      + '    <div class="tm-info-reason" id="tmInfoReasonBox" hidden>'
      + '      <div class="tm-info-reason-t">处置原因</div>'
      + '      <p id="tmInfoReason"></p>'
      + '      <div class="tm-meta" id="tmInfoReasonMeta"></div>'
      + '    </div>'
      + '    <div class="tm-foot"><button class="tm-btn tm-btn-ghost" id="tmInfoClose" type="button">关闭</button></div>'
      + '  </div>'
      + '</div>';
  }

  /* ---------------- 入口 ---------------- */
  async function renderAdminTaskManage() {
    ensureStyle();
    var host = byId('taskManageHost');
    if (!host) return;
    if (!host.dataset.built) {
      host.innerHTML = skeleton();
      host.dataset.built = '1';
      bindStatic();
    }
    closeModal();
    closeLogModal();
    closeInfo();
    state.page = 1;
    loadLogTotal();
    await loadTasks();
  }

  function bindStatic() {
    byId('tmTypeSel').addEventListener('change', function () { state.type = this.value; state.page = 1; loadTasks(); });
    byId('tmStatusSel').addEventListener('change', function () { state.status = this.value; state.page = 1; loadTasks(); });
    byId('tmResetBtn').addEventListener('click', function () {
      state.type = 'all'; state.status = 'all'; state.page = 1;
      byId('tmTypeSel').value = 'all'; byId('tmStatusSel').value = 'all';
      loadTasks();
    });
    byId('tmQ').addEventListener('input', function () {
      var v = this.value.trim();
      if (state.searchTimer) clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(function () { state.keyword = v; state.page = 1; loadTasks(); }, 300);
    });
    byId('tmPrev').addEventListener('click', function () { if (state.page > 1) { state.page--; loadTasks(); } });
    byId('tmNext').addEventListener('click', function () { state.page++; loadTasks(); });

    byId('tmLogBtn').addEventListener('click', openLogModal);
    byId('tmRows').addEventListener('click', onRowClick);
    byId('tmDrBody').addEventListener('click', onDrawerClick);

    /* 处置弹窗 */
    byId('tmMCancel').addEventListener('click', closeModal);
    byId('tmModal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    byId('tmMOk').addEventListener('click', onModalOk);
    byId('tmMQuick').addEventListener('click', function (e) {
      if (e.target.tagName !== 'SPAN') return;
      var ta = byId('tmMReason');
      ta.value = ta.value ? (ta.value.replace(/[；;]\s*$/, '') + '；' + e.target.textContent) : e.target.textContent;
      ta.focus();
    });

    /* 处置记录弹窗 */
    byId('tmLogClose').addEventListener('click', closeLogModal);
    byId('tmLogModal').addEventListener('click', function (e) { if (e.target === this) closeLogModal(); });

    /* 任务信息弹窗 */
    byId('tmInfoClose').addEventListener('click', closeInfo);
    byId('tmInfoModal').addEventListener('click', function (e) { if (e.target === this) closeInfo(); });

    /* 抽屉 */
    byId('tmDrClose').addEventListener('click', closeDrawer);
    byId('tmMask').addEventListener('click', closeDrawer);

    document.addEventListener('click', function (e) {
      if (e.target.closest('.tm-more-btn') || e.target.closest('.tm-opmore')) return;
      closeMores();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); closeLogModal(); closeInfo(); closeDrawer(); closeMores(); }
    });
  }

  /* ---------------- 列表加载 ---------------- */
  /* 「已屏蔽 / 已删除」由后端 status=suspended 单次返回（服务端已支持），前端不再并发两请求合并 */
  function buildQuery(page) {
    var q = MANAGE_API + '?page=' + page + '&size=' + state.size;
    if (state.type && state.type !== 'all') q += '&type=' + encodeURIComponent(state.type);
    if (state.status && state.status !== 'all') q += '&status=' + encodeURIComponent(state.status);
    if (state.keyword) q += '&keyword=' + encodeURIComponent(state.keyword);
    return q;
  }

  async function loadTasks() {
    byId('tmRows').innerHTML = '<div class="tm-empty">加载中…</div>';
    var res = await window.apiGet(buildQuery(state.page));
    if (!res || res.code !== 200) { renderError(res); return; }
    var d = res.data || {};
    state.records = (d.records || []).map(norm);
    state.total = Number(d.total || 0);
    if (state.status === 'all' && state.type === 'all' && !state.keyword) state.allTotal = state.total;
    paintRows();
  }

  function renderError(res) {
    var msg = (res && res.code === 403)
      ? '仅主管理员可访问任务管理'
      : ((res && res.msg) || '加载失败，请稍后重试');
    byId('tmRows').innerHTML = '<div class="tm-empty">' + esc(msg) + '</div>';
    byId('tmFcount').textContent = '0';
    byId('tmPagerTotal').textContent = '0';
    byId('tmPagerCur').textContent = '1';
    byId('tmPagerMax').textContent = '1';
    byId('tmPrev').disabled = true;
    byId('tmNext').disabled = true;
  }

  async function loadLogTotal() {
    var res = await window.apiGet(LOGS_API + '?page=1&size=1');
    if (res && res.code === 200 && res.data) state.logTotal = Number(res.data.total || 0);
    byId('tmLogCount').textContent = state.logTotal;
  }

  /* ---------------- 列表渲染 ---------------- */
  function rowHtml(n) {
    var st = effStatus(n);
    var cls = (st === 'deleted') ? ' tm-is-deleted' : (st === 'hidden' ? ' tm-is-hidden' : '');
    var ops;
    if (st === 'deleted') {
      ops = '<span class="tm-op-done">已删除（仅留痕）</span>';
    } else {
      var primary = (st === 'hidden')
        ? '<button class="tm-op" data-tm-act="restore" data-tm-id="' + n.id + '" type="button">恢复</button>'
        : '<button class="tm-op tm-danger" data-tm-act="hide" data-tm-id="' + n.id + '" type="button">屏蔽</button>';
      ops = primary
        + '<button class="tm-op tm-more-btn" data-tm-more="' + n.id + '" type="button">更多<span class="tm-caret">▾</span></button>'
        + '<div class="tm-opmore" data-tm-menu="' + n.id + '">'
        + '  <button data-tm-act="back" data-tm-id="' + n.id + '" type="button">退回审核</button>'
        + '  <button class="tm-danger" data-tm-act="del" data-tm-id="' + n.id + '" type="button">删除</button>'
        + '  <button data-tm-act="feat" data-tm-id="' + n.id + '" type="button">' + (n.featured ? '取消加精' : '加精') + '</button>'
        + '</div>';
    }
    var parts = ['#' + n.id];
    var cat = catText(n.skillCategory);
    if (cat) parts.push(cat);
    if (n.skillSub) parts.push(n.skillSub);
    var sub = parts.join(' · ');
    if (n.reason) sub += ' · 处置原因：' + n.reason;

    return '<div class="tm-trow' + cls + '" data-tm-id="' + n.id + '">'
      + '<div class="tm-cell tm-c-title"><div class="tm-ttl' + (n.featured ? ' tm-feat' : '') + '" data-tm-open="' + n.id + '">' + esc(cut(n.title, TITLE_MAX)) + '</div>'
      + '<div class="tm-sub">' + esc(cut(sub, SUB_MAX)) + '</div></div>'
      + '<div class="tm-cell tm-c-who"><div class="tm-who"><span class="tm-ava" style="background:' + avaColor(n.uid) + '">' + esc(String(n.who).charAt(0)) + '</span>'
      + '<span class="tm-nm" data-tm-user="' + esc(n.uid) + '" data-tm-uname="' + esc(n.who) + '">' + esc(n.who) + '</span></div></div>'
      + '<div class="tm-cell tm-c-type"><span class="tm-type">' + esc(TYPE_TEXT[n.type] || n.type || '—') + '</span></div>'
      + '<div class="tm-cell tm-c-reward">' + (n.reward > 0 ? '<span class="tm-money">' + n.reward + '<small>蛋币</small></span>' : '<span class="tm-time">—</span>') + '</div>'
      + '<div class="tm-cell tm-c-status">' + statusTag(st) + '</div>'
      + '<div class="tm-cell tm-c-time"><span class="tm-time">' + esc(n.time) + '</span></div>'
      + '<div class="tm-cell tm-c-op">' + ops + '</div>'
      + '</div>';
  }

  function paintRows() {
    var recs = state.records;
    byId('tmRows').innerHTML = recs.length
      ? recs.map(function (n) { return rowHtml(n); }).join('')
      : '<div class="tm-empty">没有符合条件的任务</div>';
    byId('tmNall').textContent = state.allTotal || 0;
    byId('tmFcount').textContent = state.total;
    byId('tmResetBtn').classList.toggle('active', state.status === 'all' && state.type === 'all');
    paintPager();
  }

  function paintPager() {
    var pages = Math.max(1, Math.ceil(state.total / state.size));
    byId('tmPagerTotal').textContent = state.total;
    byId('tmPagerCur').textContent = state.page;
    byId('tmPagerMax').textContent = pages;
    byId('tmPrev').disabled = state.page <= 1;
    byId('tmNext').disabled = state.page >= pages;
  }

  /* ---------------- 行内交互 ---------------- */
  function onRowClick(e) {
    var open = e.target.closest('[data-tm-open]');
    if (open) { openInfo(Number(open.getAttribute('data-tm-open'))); return; }
    var more = e.target.closest('[data-tm-more]');
    if (more) { toggleMore(more.getAttribute('data-tm-more')); return; }
    var user = e.target.closest('[data-tm-user]');
    if (user) { openDrawer(user.getAttribute('data-tm-user'), user.getAttribute('data-tm-uname')); return; }
    var act = e.target.closest('[data-tm-act]');
    if (act) { closeMores(); runAction(Number(act.getAttribute('data-tm-id')), act.getAttribute('data-tm-act'), null); }
  }

  function closeMores() {
    Array.prototype.forEach.call(document.querySelectorAll('.tm-opmore.on'), function (m) { m.classList.remove('on'); });
  }

  function toggleMore(id) {
    var box = document.querySelector('.tm-opmore[data-tm-menu="' + id + '"]');
    var wasOn = !!(box && box.classList.contains('on'));
    closeMores();
    if (box && !wasOn) box.classList.add('on');
  }

  /* ---------------- 处置 ---------------- */
  function runAction(id, act, who) {
    var n = findNorm(id);
    var title = n ? n.title : '';
    var target = '#' + id + ' ' + title;
    if (act === 'feat') {
      doSubmit(id, 'feature', '').then(function (ok) { if (ok && who) refreshDrawer(who); });
      return;
    }
    var cfg = ACTIONS[act];
    if (!cfg) return;
    openModal({
      title: cfg.title, hint: cfg.hint, target: target,
      label: cfg.label, required: cfg.required, quick: cfg.quick || [],
      placeholder: cfg.placeholder, okText: cfg.okText, danger: cfg.danger,
      onOk: function (reason) { doSubmit(id, cfg.api, reason).then(function (ok) { if (ok && who) refreshDrawer(who); }); }
    });
  }

  var ACTIONS = {
    hide: {
      title: '屏蔽任务',
      hint: '屏蔽后该任务从任务广场与搜索结果中移除，不能被认领；发布者仍可在「我的发布」看到被屏蔽及原因，可恢复。',
      label: '屏蔽原因', required: true, quick: QUICK.hide,
      placeholder: '写清为什么屏蔽，会展示给发布者并留档', okText: '确认屏蔽', danger: true, api: 'hide'
    },
    del: {
      title: '删除任务',
      hint: '删除为逻辑删除：任务及发布者均不再可见，数据保留以便追溯，不可在前台恢复。认领记录与蛋蛋币流水不受影响。',
      label: '删除原因', required: true, quick: QUICK.del,
      placeholder: '写清删除依据，会留档', okText: '确认删除', danger: true, api: 'delete'
    },
    back: {
      title: '退回审核中心',
      hint: '任务状态将重置为「待审核」，重新进入审核中心等待审核。已产生的认领记录不会清除。',
      label: '退回说明', required: false, quick: QUICK.back,
      placeholder: '可写清需要发布者补充什么（选填）', okText: '确认退回', danger: false, api: 'return-review'
    },
    restore: {
      title: '恢复任务',
      hint: '任务恢复为正常状态，重新出现在任务广场。',
      label: '恢复说明', required: false, quick: [],
      placeholder: '可留空', okText: '确认恢复', danger: false, api: 'restore'
    }
  };

  async function doSubmit(id, apiName, reason) {
    var res;
    if (apiName === 'feature') {
      res = await window.apiPost('/api/admin/tasks/' + id + '/feature');
    } else {
      res = await window.apiPost('/api/admin/tasks/' + id + '/' + apiName, { reason: reason || '' });
    }
    if (!res || res.code !== 200) {
      toast((res && res.msg) || '操作失败，请稍后重试');
      return false;
    }
    closeModal();
    closeMores();
    await loadTasks();
    loadLogTotal();
    return true;
  }

  function refreshDrawer(who) {
    if (state.drawer && String(state.drawer.name) === String(who)) {
      openDrawer(state.drawer.uid, state.drawer.name);
    }
  }

  /* ---------------- 处置原因弹窗 ---------------- */
  function openModal(cfg) {
    byId('tmMTitle').textContent = cfg.title;
    byId('tmMHint').textContent = cfg.hint || '';
    byId('tmMTarget').textContent = cfg.target || '';
    byId('tmMLabel').innerHTML = cfg.label
      + (cfg.required ? ' <em>*必填</em>' : ' <span style="color:var(--muted);font-weight:500">选填</span>');
    var ta = byId('tmMReason');
    ta.value = ''; ta.placeholder = cfg.placeholder || ''; ta.style.borderColor = '';
    byId('tmMQuick').innerHTML = (cfg.quick || []).map(function (q) { return '<span>' + esc(q) + '</span>'; }).join('');
    byId('tmMQuick').style.display = (cfg.quick && cfg.quick.length) ? 'flex' : 'none';
    var ok = byId('tmMOk');
    ok.textContent = cfg.okText || '确认';
    ok.className = 'tm-btn ' + (cfg.danger ? 'tm-btn-danger' : 'tm-btn-primary');
    state.pending = cfg;
    byId('tmModal').classList.add('on');
    setTimeout(function () { ta.focus(); }, 60);
  }

  function closeModal() {
    byId('tmModal').classList.remove('on');
    state.pending = null;
  }

  function onModalOk() {
    var cfg = state.pending;
    if (!cfg) return;
    var ta = byId('tmMReason');
    var reason = ta.value.trim();
    if (cfg.required && !reason) { ta.style.borderColor = 'var(--red)'; ta.focus(); return; }
    ta.style.borderColor = '';
    cfg.onOk(reason);
    closeModal();
  }

  /* ---------------- 处置记录弹窗 ---------------- */
  async function openLogModal() {
    byId('tmLogModal').classList.add('on');
    byId('tmLogList').innerHTML = '<div class="tm-empty">加载中…</div>';
    var res = await window.apiGet(LOGS_API + '?page=1&size=20');
    if (!res || res.code !== 200) {
      var msg = (res && res.code === 403) ? '仅主管理员可访问任务管理' : ((res && res.msg) || '加载失败，请稍后重试');
      byId('tmLogList').innerHTML = '<div class="tm-empty">' + esc(msg) + '</div>';
      return;
    }
    var d = res.data || {};
    var rows = d.records || [];
    state.logTotal = Number(d.total || rows.length);
    byId('tmLogCount').textContent = state.logTotal;
    byId('tmLogList').innerHTML = rows.length ? rows.map(function (l) {
      return '<div class="tm-logitem"><time>' + esc(fmtTime(l.createdAt)) + '</time>'
        + '<span class="tm-what"><b>' + esc(ACTION_TEXT[l.action] || l.action) + '</b> · #' + esc(l.taskId) + ' ' + esc(l.taskTitle || '')
        + (l.reason ? '<span class="tm-why">原因：' + esc(l.reason) + '</span>' : '')
        + '</span><span class="tm-by">' + esc(l.operatorName || ('#' + l.operatorId)) + '</span></div>';
    }).join('') : '<div class="tm-empty">暂无处置记录</div>';
  }

  function closeLogModal() { byId('tmLogModal').classList.remove('on'); }

  /* ---------------- 任务信息弹窗（只读） ---------------- */
  async function openInfo(id) {
    var n = findNorm(id);
    if (!n) return;
    var st = effStatus(n);
    var stEl = byId('tmInfoStatus');
    stEl.className = 'tm-tag ' + (STATUS_TAG[st] || 'tm-tag-gray');
    stEl.textContent = STATUS_TEXT[st] || st;
    byId('tmInfoTitle').textContent = n.title;

    var rows = [
      ['任务编号', '#' + n.id],
      ['发布者', n.who],
      ['任务类型', TYPE_TEXT[n.type] || n.type || '—'],
      ['赏金', n.reward > 0 ? n.reward + ' 蛋蛋币' : '—'],
      ['当前状态', STATUS_TEXT[st] || st],
      ['发布时间', n.time],
      ['任务描述', n.desc || '—']
    ];
    byId('tmInfoList').innerHTML = rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('');

    var disposed = (st === 'hidden' || st === 'deleted');
    byId('tmInfoIntro').textContent = disposed
      ? (st === 'hidden'
        ? '该任务已被屏蔽：前台任务广场与搜索中不再出现、不可被认领；数据保留，可恢复。'
        : '该任务已被删除：任务与发布者均不可见，数据保留以便追溯，前台不可恢复。')
      : '任务简要信息（只读展示，不提供处置操作）。';

    var box = byId('tmInfoReasonBox');
    box.hidden = !disposed;
    byId('tmInfoReasonMeta').textContent = '';
    if (disposed) {
      byId('tmInfoReason').textContent = n.reason || '未填写原因';
      byId('tmInfoModal').classList.add('on');
      /* 用流水接口补全处置人 / 处置时间，拿不到则静默（已有 governanceReason 兜底） */
      var res = await window.apiGet(LOGS_API + '?taskId=' + n.id + '&page=1&size=1');
      var rec = (res && res.code === 200 && res.data && res.data.records && res.data.records[0]) || null;
      if (rec) {
        var by = rec.operatorName || ('#' + rec.operatorId);
        byId('tmInfoReasonMeta').textContent = '处置人：' + by + ' · 处置时间：' + fmtTime(rec.createdAt);
        if (rec.reason) byId('tmInfoReason').textContent = rec.reason;
      }
      return;
    }
    byId('tmInfoModal').classList.add('on');
  }

  function closeInfo() { byId('tmInfoModal').classList.remove('on'); }

  /* ---------------- 用户下钻抽屉 ---------------- */
  async function openDrawer(uid, name) {
    state.drawer = { uid: uid, name: name };
    var ava = byId('tmDrAva');
    ava.style.background = avaColor(uid);
    ava.textContent = String(name || '·').charAt(0);
    byId('tmDrName').textContent = name || ('用户#' + uid);
    byId('tmDrMeta').textContent = '';
    byId('tmDrBody').innerHTML = '<div class="tm-empty">加载中…</div>';
    byId('tmDrawer').classList.add('on');
    byId('tmMask').classList.add('on');

    var res = await window.apiGet('/api/admin/users/' + uid + '/tasks?page=1&size=50');
    if (!res || res.code !== 200) {
      var msg = (res && res.code === 403) ? '仅主管理员可访问任务管理' : ((res && res.msg) || '加载失败，请稍后重试');
      byId('tmDrBody').innerHTML = '<div class="tm-empty">' + esc(msg) + '</div>';
      return;
    }
    var list = ((res.data && res.data.records) || []).map(norm);
    var disposed = list.filter(function (n) { return effStatus(n) === 'hidden' || effStatus(n) === 'deleted'; }).length;
    byId('tmDrMeta').textContent = '共 ' + list.length + ' 条任务 · ' + (list.length - disposed) + ' 条正常 · ' + disposed + ' 条已处置';

    var body = '<div class="tm-dr-sec-t">该用户的全部任务（' + list.length + '）</div>';
    body += list.length ? list.map(miniTaskHtml).join('') : '<div class="tm-empty">该用户暂无任务</div>';
    byId('tmDrBody').innerHTML = body;
  }

  function miniTaskHtml(n) {
    var st = effStatus(n);
    var acts;
    if (st === 'deleted') {
      acts = '<span class="tm-op-done">已删除</span>';
    } else {
      acts = '<button class="tm-op tm-warn" data-tm-dact="back" data-tm-id="' + n.id + '" type="button">退回审核</button>'
        + (st === 'hidden'
          ? '<button class="tm-op" data-tm-dact="restore" data-tm-id="' + n.id + '" type="button">恢复</button>'
          : '<button class="tm-op tm-danger" data-tm-dact="hide" data-tm-id="' + n.id + '" type="button">屏蔽</button>')
        + '<button class="tm-op tm-danger" data-tm-dact="del" data-tm-id="' + n.id + '" type="button">删除</button>'
        + '<button class="tm-op" data-tm-dact="feat" data-tm-id="' + n.id + '" type="button">' + (n.featured ? '取消加精' : '加精') + '</button>';
    }
    return '<div class="tm-mini-task">'
      + '<div class="tm-row1">' + statusTag(st) + '<span class="tm-ttl' + (n.featured ? ' tm-feat' : '') + '">' + esc(n.title) + '</span></div>'
      + '<div class="tm-row2"><span>#' + n.id + '</span><span>' + esc(TYPE_TEXT[n.type] || n.type || '—') + '</span>'
      + (n.reward > 0 ? '<span class="tm-money">' + n.reward + '<small>蛋币</small></span>' : '')
      + '<span>' + esc(n.time) + '</span></div>'
      + (n.reason ? '<div class="tm-row2" style="color:var(--red)">处置原因：' + esc(n.reason) + '</div>' : '')
      + '<div class="tm-acts">' + acts + '</div>'
      + '</div>';
  }

  function onDrawerClick(e) {
    var act = e.target.closest('[data-tm-dact]');
    if (!act) return;
    var id = Number(act.getAttribute('data-tm-id'));
    var name = act.getAttribute('data-tm-dact');
    /* 抽屉里的任务未必在当前列表页，先兜底找同 id；找不到也能处置（标题留空） */
    runAction(id, name, state.drawer ? state.drawer.name : null);
  }

  function closeDrawer() {
    byId('tmDrawer').classList.remove('on');
    byId('tmMask').classList.remove('on');
    state.drawer = null;
  }

  window.renderAdminTaskManage = renderAdminTaskManage;
})();
