/* ============================================================
   蛋蛋世界 - 「我的信息 → 个人资料」里的 MBTI（外联 JS）
   背景：注册表单已不再收集 MBTI（注册页只问昵称/邮箱/密码/验证码 + 学校等选填项），
         而 MBTI 原本只能在「我的信息」的角色卡弹窗里改，个人资料里既看不到也补不了。
   本文件做三件事：
     · 在个人资料展示区补一行「MBTI」（没填时显示「未填写」，与学校/城市等一致）
     · 在个人资料的「编辑」态里补一套「气质 → 具体类型」选择器，数据复用主站的
       MBTI_GROUPS / MBTI_TYPES / MBTI_NICKNAMES（与角色卡弹窗同一份），
       选择结果写进隐藏域 #editMbti，由主站 saveProfile() 随资料一起提交
     · 没填 MBTI 时，角色卡底栏徽章不再冒充 INFJ，改显示「MBTI 未填写」，点它就地补填
   不新增后端字段：PUT /api/users/me 早已支持 mbtiType（后端自动推导 mbtiGroup）。
   挂载方式与 js/complaint-edit.js 一致：只包装主站函数，不改主站逻辑。
   ============================================================ */
(function () {
  'use strict';

  var GROUPS = ['NT', 'NF', 'SJ', 'SP'];   // 与角色卡弹窗一致的气质顺序
  var draft = { group: '', type: '' };     // 编辑态草稿；保存前不写回 USER

  /* ---------- 样式（只加弹窗/资料卡自身需要的那几条） ---------- */
  var CSS = `
.char-mbti-badge.is-empty{cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}
.char-mbti-badge.is-empty:focus-visible{outline:2px solid #fff;outline-offset:2px}
#pmMbtiHint{line-height:1.6}
`;

  function injectStyle() {
    if (document.getElementById('profileMbtiStyle')) return;
    var s = document.createElement('style');
    s.id = 'profileMbtiStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- 数据：从主站取的全局常量 ---------- */
  function mbtiTables() {
    if (!window.MBTI_GROUPS || !window.MBTI_TYPES || !window.MBTI_NICKNAMES) return null;
    return { groups: window.MBTI_GROUPS, types: window.MBTI_TYPES, nicks: window.MBTI_NICKNAMES };
  }
  /* 由 4 字母类型反查气质（不回读 USER.mbtiGroup，避免历史数据里两者不一致时显示打架） */
  function groupOfType(type) {
    var t = mbtiTables();
    if (!t || !type) return '';
    for (var i = 0; i < GROUPS.length; i++) {
      if ((t.types[GROUPS[i]] || []).indexOf(type) >= 0) return GROUPS[i];
    }
    return '';
  }
  function nickOf(type) {
    var t = mbtiTables();
    return (t && t.nicks[type]) || '';
  }
  /* 展示文案：已填 → 「INFJ · 绿老头」；未填 → 「未填写」 */
  function displayText() {
    var type = (window.USER && window.USER.mbtiType) || '';
    if (!type) return '未填写';
    var nick = nickOf(type);
    return nick ? (type + ' · ' + nick) : type;
  }

  /* ---------- 展示行：插在「年龄」之前（保持最后一行无下边距的原样式） ---------- */
  function injectDisplayRow() {
    if (document.getElementById('infoMbti')) return;
    var host = document.getElementById('profileDisplay');
    if (!host) return;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;margin-bottom:12px';
    row.innerHTML = '<span style="width:90px;color:var(--muted);font-size:13px">MBTI</span>' +
      '<span style="font-size:13px" id="infoMbti"></span>';
    var last = host.lastElementChild;         // 年龄那一行
    if (last) host.insertBefore(row, last); else host.appendChild(row);
    refreshDisplayRow();
  }

  function refreshDisplayRow() {
    var el = document.getElementById('infoMbti');
    if (!el) return;
    var type = (window.USER && window.USER.mbtiType) || '';
    el.textContent = displayText();
    el.style.color = type ? '' : 'var(--muted)';
  }

  /* ---------- 编辑态：气质 + 类型选择器 ---------- */
  function injectEditPicker() {
    if (document.getElementById('pmMbtiEditRow')) return;
    var box = document.getElementById('profileEditBox');
    if (!box) return;
    var row = document.createElement('div');
    row.id = 'pmMbtiEditRow';
    row.style.cssText = 'display:flex;align-items:flex-start;margin-bottom:12px';
    row.innerHTML =
      '<span style="width:90px;color:var(--muted);font-size:13px;padding-top:8px;flex:none">MBTI</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="mbti-pick-row" id="pmGroupRow"></div>' +
        '<div class="mbti-sub-pick-row" id="pmTypeRow"></div>' +
        '<div id="pmMbtiHint" style="font-size:12px;color:var(--muted);margin-top:2px"></div>' +
        '<input type="hidden" id="editMbti" value="">' +
      '</div>';
    /* 插在「取消 / 保存」按钮行之前 */
    var btns = null;
    for (var i = 0; i < box.children.length; i++) {
      if (box.children[i].querySelector && box.children[i].querySelector('button')) { btns = box.children[i]; break; }
    }
    if (btns) box.insertBefore(row, btns); else box.appendChild(row);
  }

  /* 打开编辑态时把草稿同步成用户当前值（用户点了取消再进来应回到原值） */
  function syncDraftFromUser() {
    var type = (window.USER && window.USER.mbtiType) || '';
    draft.type = type;
    draft.group = groupOfType(type);
    renderPickers();
  }

  function renderPickers() {
    var t = mbtiTables();
    if (!t) return;
    var groupRow = document.getElementById('pmGroupRow');
    var typeRow = document.getElementById('pmTypeRow');
    var hint = document.getElementById('pmMbtiHint');
    var hidden = document.getElementById('editMbti');
    if (!groupRow || !typeRow) return;

    /* 气质：4 选 1 */
    groupRow.innerHTML = GROUPS.map(function (g) {
      var d = t.groups[g] || {};
      var name = (d.name || '').split(' · ')[1] || '';
      return '<span class="mbti-pick ' + g.toLowerCase() + (draft.group === g ? ' selected' : '') + '"' +
        ' data-group="' + g + '">' + g + ' · ' + name + '</span>';
    }).join('');
    groupRow.querySelectorAll('.mbti-pick').forEach(function (p) {
      p.addEventListener('click', function () {
        var g = this.getAttribute('data-group');
        /* 换气质后类型作废（原来的类型不属于新气质） */
        if (g !== draft.group) { draft.group = g; draft.type = ''; }
        renderPickers();
      });
    });

    /* 类型：选中气质后才能选 */
    if (!draft.group) {
      typeRow.innerHTML = '<span style="font-size:12px;color:var(--muted)">先选一个气质 ↑</span>';
    } else {
      var color = (t.groups[draft.group] || {}).color || '#999';
      typeRow.innerHTML = (t.types[draft.group] || []).map(function (ty) {
        var isSel = ty === draft.type;
        return '<span class="mbti-sub-pick' + (isSel ? ' selected' : '') + '" data-type="' + ty + '"' +
          (isSel ? ' style="background:' + color + '"' : '') + '>' +
          '<span>' + ty + '</span><span class="sub-nick">' + (t.nicks[ty] || '') + '</span></span>';
      }).join('');
      typeRow.querySelectorAll('.mbti-sub-pick').forEach(function (c) {
        c.addEventListener('click', function () {
          draft.type = this.getAttribute('data-type');
          renderPickers();
        });
      });
    }

    if (hidden) hidden.value = draft.type || '';
    if (hint) {
      hint.textContent = draft.type
        ? '已选：' + draft.type + (nickOf(draft.type) ? ' · ' + nickOf(draft.type) : '') + '，点「保存」生效'
        : '选填；不选就保持原样（可稍后再补）';
    }
  }

  /* ---------- 角色卡：没填 MBTI 时不再冒充 INFJ ---------- */
  function isMbtiEmpty() {
    return !((window.USER && window.USER.mbtiType) || '');
  }

  function patchCharMbti() {
    var badge = document.getElementById('charMbtiBadge');
    var sub = document.getElementById('charSub');
    if (!badge) return;
    if (!isMbtiEmpty()) {
      badge.classList.remove('is-empty');
      badge.removeAttribute('role');
      badge.removeAttribute('tabindex');
      badge.removeAttribute('title');
      return;
    }
    /* 主站 renderChar() 会写成「INFJ · 绿老头」这类兜底值，这里覆盖成未填写 */
    badge.textContent = 'MBTI 未填写';
    badge.classList.add('is-empty');
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('title', '点击补填你的 MBTI');
    if (sub) sub.textContent = 'MBTI 未填写 · 点左侧徽章补上';
  }

  /* 点徽章（或回车）→ 打开个人资料的编辑态并把 MBTI 选择器滚到视野中间 */
  function openEditAtMbti() {
    var box = document.getElementById('profileEditBox');
    if (box && box.style.display === 'none' && typeof window.toggleProfileEdit === 'function') {
      window.toggleProfileEdit();
    }
    var row = document.getElementById('pmMbtiEditRow');
    if (!row) return;
    if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function bindCharBadge() {
    var badge = document.getElementById('charMbtiBadge');
    if (!badge || badge.__pmBound) return;
    badge.addEventListener('click', openEditAtMbti);
    badge.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditAtMbti(); }
    });
    badge.__pmBound = true;
  }

  /* ---------- 包装工具：原函数执行完（含 async）后回调 ---------- */
  function wrapAfter(name, after) {
    var original = window[name];
    if (typeof original !== 'function' || original.__pmWrapped) return;
    var wrapped = function () {
      var ret = original.apply(this, arguments);
      var run = function () { try { after(); } catch (e) {} };
      if (ret && typeof ret.then === 'function') return ret.then(function (v) { run(); return v; });
      run();
      return ret;
    };
    wrapped.__pmWrapped = true;
    window[name] = wrapped;
  }

  function mountAll() {
    injectDisplayRow();
    injectEditPicker();
    bindCharBadge();
    patchCharMbti();
  }

  function setup() {
    if (!mbtiTables()) return;      // 主站常量没就绪就别动手，避免半截 UI
    injectStyle();
    mountAll();
    /* 角色卡每次重渲染都会把兜底值写回来，渲染完再覆盖一次；
       顺带刷展示行 —— 在角色卡弹窗里改完 MBTI 只走 renderChar()，不经过 refreshProfile() */
    wrapAfter('renderChar', function () { mountAll(); refreshDisplayRow(); });
    /* 资料刷新（登录 / 切页 / 保存后）都重算一次展示行 */
    wrapAfter('refreshProfile', function () { mountAll(); refreshDisplayRow(); });
    /* 打开编辑态时把选择器同步成当前值；顺带把没注入成功的行补上（页面结构变了也能自愈） */
    wrapAfter('toggleProfileEdit', function () {
      mountAll();
      var box = document.getElementById('profileEditBox');
      if (box && box.style.display !== 'none') syncDraftFromUser();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
