/* ============================================================
   蛋蛋世界 · 猫舍系统 v1（宠物系统外观改造）
   捏猫 → 保存 → 公开展示 → 领养 → 投票 → 榜单 → 审核
   · 部件素材：assets/pet-cat/**（512×512，透明背景，叠图合成）
   · 扣币/发奖走后端 /api/cats/*，余额变动统一由 PointService 负责
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var ASSET_BASE = 'assets/pet-cat/';
  var LAYER_ORDER = ['tail', 'tailPattern', 'body', 'pattern', 'ear', 'eye', 'face', 'blush'];

  /** 部件定义：编号 → 名称。index 从 1 开始，与素材文件名一致。 */
  var PARTS = {
    body: ['奶白色', '纯黑色', '橘色', '灰蓝色', '三花', '奶油色'],
    ear: ['直耳', '折耳', '圆耳', '大耳', '卷耳', '垂耳'],
    eye: ['黑色', '蓝色', '绿色', '琥珀色', '吊梢眼', '异色瞳', '眯眼笑', '星星眼'],
    tail: ['长直尾', '蓬松尾', '短尾', '卷尾', '折角尾'],
    pattern: ['橘色条纹', '狸花斑块', '奶牛斑', '三花斑点', '白手套'],
    face: ['小三角鼻', '包子嘴', '吐舌头']
  };
  var PART_LABEL = { body: '毛色', ear: '耳朵', eye: '眼睛', tail: '尾巴', pattern: '花纹', face: '嘴鼻' };

  var state = {
    tab: 'create',
    look: { body: 1, ear: 1, eye: 1, tail: 1, pattern: 1, face: 1, blush: 0 },
    name: '',
    intro: '',
    editingId: null,
    myRooms: [],
    market: [],
    ranking: [],
    pending: [],
    remaining: 0,
    reputation: 0,
    isReviewer: false,
    loading: false,
    keyword: '',
    marketPage: 0,
    hasMore: false,
    marketLoading: false,
    marketRequest: 0
  };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function toast(m) { if (typeof window.toast === 'function') window.toast(m); else window.alert(m); }
  function api(path, method, body) {
    var headers = {}; var token = sessionStorage.getItem('token');
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body != null) headers['Content-Type'] = 'application/json';
    return fetch((window.API_BASE || '') + path, {
      method: method || 'GET', headers: headers, body: body == null ? undefined : JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return { code: r.status, msg: '请求失败' }; }); })
      .catch(function () { return { code: 0, msg: '网络异常，请稍后重试' }; });
  }
  function needLogin() {
    if (!window.USER || !window.USER.registered) { toast('请先登录'); return true; }
    return false;
  }

  /* ---------- 素材路径：毛色决定耳朵/尾巴用哪套配色件 ---------- */
  function assetUrl(layer, look) {
    var b = look.body || 1;
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    if (layer === 'body') return ASSET_BASE + 'assets/cat_body_' + two(b) + '.png';
    if (layer === 'ear' || layer === 'tail') {
      // 配色适配件：coat_variants/body_XX/cat_<part>_YY.png
      var key = layer === 'ear' ? 'ear' : 'tail';
      return ASSET_BASE + 'coat_variants/body_' + two(b) + '/cat_' + key + '_' + two(look[layer] || 1) + '.png';
    }
    if (layer === 'eye') return ASSET_BASE + 'assets/cat_eye_' + two(look.eye) + '.png';
    if (layer === 'face') return ASSET_BASE + 'assets/cat_face_' + two(look.face) + '.png';
    if (layer === 'pattern') {
      if (!look.pattern) return null;
      return ASSET_BASE + 'assets/cat_pattern_' + two(look.pattern) + '.png';
    }
    if (layer === 'blush') {
      if (!look.blush) return null;
      return ASSET_BASE + 'assets/cat_face_04.png';
    }
    if (layer === 'tailPattern') {
      // 只给橘色条纹配尾巴花纹，避免悬空
      if (look.pattern !== 1) return null;
      return ASSET_BASE + 'tail_patterns/cat_pattern_01_tail_' + two(look.tail || 1) + '.png';
    }
    return null;
  }

  /** 生成一只猫的叠图 HTML。size 为显示像素宽高。 */
  function catHtml(look, size) {
    var s = size || 128;
    var layers = LAYER_ORDER.map(function (k) {
      var url = assetUrl(k, look || {});
      if (!url) return '';
      return '<img class="cat-layer" src="' + url + '" alt="" draggable="false">';
    }).join('');
    return '<div class="cat-figure" style="width:' + s + 'px;height:' + s + 'px">' + layers + '</div>';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var body = el('catBody');
    if (!body) return;
    var tabs = ['create|捏猫', 'mine|我的猫舍', 'market|猫市集', 'ranking|总榜'];
    if (state.isReviewer) tabs.push('review|审核');
    var tabsHtml = '<div class="cat-tabs">' + tabs.map(function (t) {
      var k = t.split('|')[0];
      return '<button type="button" class="cat-tab' + (state.tab === k ? ' active' : '') + '" onclick="catTab(\'' + k + '\')">' + t.split('|')[1] + '</button>';
    }).join('') + '</div>';

    var content = state.tab === 'mine' ? renderMine()
      : state.tab === 'market' ? renderMarket()
      : state.tab === 'ranking' ? renderRanking()
      : state.tab === 'review' ? renderReview()
      : renderCreate();
    body.innerHTML = tabsHtml + content;
  }

  function lookEquals(a, b) {
    if (!a || !b) return false;
    return ['body', 'ear', 'eye', 'tail', 'pattern', 'face', 'blush'].every(function (k) {
      return Number(a[k] || 0) === Number(b[k] || 0);
    });
  }

  function renderCreate() {
    if (window.USER && !window.USER.registered) return '<div class="cat-empty">登录后就能捏一只自己的猫啦～</div>';
    var parts = Object.keys(PARTS).map(function (key) {
      var opts = PARTS[key].map(function (label, i) {
        var n = i + 1;
        var active = Number(state.look[key]) === n;
        return '<button type="button" class="cat-opt' + (active ? ' active' : '') + '" onclick="catPick(\'' + key + '\',' + n + ')">' +
          catHtml(Object.assign({}, state.look, objFrom(key, n)), 44) +
          '<span>' + esc(label) + '</span></button>';
      }).join('');
      return '<div class="cat-part"><div class="cat-part-title">' + PART_LABEL[key] + '</div><div class="cat-opt-row">' + opts + '</div></div>';
    }).join('');

    var blush = '<button type="button" class="cat-opt' + (state.look.blush ? ' active' : '') + '" onclick="catToggleBlush()">' +
      '<span class="cat-opt-ico">' + (state.look.blush ? '🌸' : '🚫') + '</span><span>' + (state.look.blush ? '有腮红' : '无腮红') + '</span></button>';

    var editing = state.editingId != null;
    return '' +
      '<div class="cat-create">' +
      '  <div class="cat-preview-col">' +
      '    <div class="cat-preview-box">' + catHtml(state.look, 220) + '</div>' +
      '    <div class="cat-preview-name">' + (state.name ? esc(state.name) : '未命名的小猫') + '</div>' +
      '    <div class="cat-preview-actions">' +
      '      <button type="button" class="btn btn-ghost" onclick="catRandom()">🎲 随机一只</button>' +
      '      <button type="button" class="btn btn-ghost" onclick="catReset()">↺ 重置</button>' +
      '    </div>' +
      '    <label class="cat-field"><span>名字 <i>必填</i></span>' +
      '      <input type="text" id="catName" maxlength="30" placeholder="给猫咪起个名字" value="' + esc(state.name) + '" oninput="catName(this.value)">' +
      '    </label>' +
      '    <label class="cat-field"><span>介绍 <i>选填 · 200 字以内</i></span>' +
      '      <textarea id="catIntro" maxlength="200" rows="3" placeholder="说说它的性格、来历…" oninput="catIntro(this.value)">' + esc(state.intro) + '</textarea>' +
      '    </label>' +
      '    <button type="button" class="btn btn-primary cat-save" onclick="catSave()">' + (editing ? '保存修改' : '保存这只猫') + '</button>' +
      '    <p class="cat-save-hint">保存后会进入待审核，审核通过才会出现在猫市集和总榜。</p>' +
      '  </div>' +
      '  <div class="cat-parts-col">' + parts +
      '    <div class="cat-part"><div class="cat-part-title">腮红</div><div class="cat-opt-row">' + blush + '</div></div>' +
      '  </div>' +
      '</div>';
  }

  function objFrom(key, n) { var o = {}; o[key] = n; return o; }

  function renderMine() {
    if (window.USER && !window.USER.registered) return '<div class="cat-empty">登录后查看你的猫舍～</div>';
    var head = '<p class="cat-reputation">我的猫舍声望：<b>' + state.reputation + '</b></p>';
    if (!state.myRooms.length) return head + '<div class="cat-empty">你还没有猫。去「捏猫」做一只吧～</div>';
    return head + '<div class="cat-grid">' + state.myRooms.map(function (r) {
      var statusText = ['草稿', '待审核', '已通过', '已驳回', '已下架'][r.status] || '未知';
      var statusCls = ['draft', 'pending', 'ok', 'reject', 'off'][r.status] || '';
      return '<div class="cat-card">' +
        '<div class="cat-card-fig">' + catHtml(r.look, 120) + '</div>' +
        '<div class="cat-card-name">' + esc(r.name) + '</div>' +
        '<div class="cat-card-meta"><span class="cat-status ' + statusCls + '">' + statusText + '</span>' +
        (r.isPublic ? '<span class="cat-card-stat">👍 ' + r.votes + '</span><span class="cat-card-stat">🏠 ' + r.adopts + '</span>' : '') + '</div>' +
        (r.status === 3 && r.rejectReason ? '<div class="cat-reject">驳回原因：' + esc(r.rejectReason) + '</div>' : '') +
        '<div class="cat-card-actions">' +
        '<button type="button" class="btn btn-ghost" onclick="catEdit(' + r.id + ')">编辑</button>' +
        (r.status === 0 || r.status === 3 || r.status === 4 ? '<button type="button" class="btn btn-primary" onclick="catSubmit(' + r.id + ')">提交审核</button>' : '') +
        '<button type="button" class="btn btn-ghost cat-danger" onclick="catDelete(' + r.id + ')">删除</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  function renderMarket() {
    var head = '<div class="cat-market-head">' +
      '<input type="text" id="catKeyword" placeholder="搜索猫咪名字…" value="' + esc(state.keyword) + '" oninput="catKeyword(this.value)" onkeydown="if(event.key===\'Enter\')catSearch()">' +
      '<button type="button" class="btn btn-primary" onclick="catSearch()">搜索</button>' +
      '<span class="cat-vote-left">今天还剩 <b id="catRemaining">' + state.remaining + '</b> 票</span>' +
      '</div>';
    if (!state.market.length) return head + '<div class="cat-empty">' +
      (state.marketLoading ? '正在加载…' : state.keyword ? '没有找到匹配的猫。' : '还没有公开的猫。去捏一只，审核通过后就会出现在这里～') + '</div>';
    return head + '<div class="cat-grid">' + state.market.map(function (r) {
      return '<div class="cat-card">' +
        '<div class="cat-card-fig">' + catHtml(r.look, 130) + '</div>' +
        '<div class="cat-card-name">' + esc(r.name) + '</div>' +
        '<div class="cat-card-owner">by ' + esc(r.ownerName || '神秘蛋蛋') + '</div>' +
        (r.intro ? '<div class="cat-card-intro">' + esc(r.intro) + '</div>' : '') +
        '<div class="cat-card-meta"><span class="cat-card-stat">👍 ' + r.votes + '</span><span class="cat-card-stat">🏠 ' + r.adopts + '</span></div>' +
        '<div class="cat-card-actions">' +
        (r.mine ? '<span class="cat-mine-tag">这是你的猫</span>'
          : '<button type="button" class="btn ' + (r.voted ? 'btn-ghost' : 'btn-primary') + '"' + (r.voted ? ' disabled' : '') + ' onclick="catVote(' + r.id + ')">' + (r.voted ? '已投票' : '👍 投一票') + '</button>' +
            '<button type="button" class="btn btn-ghost"' + (r.adopted ? ' disabled' : '') + ' onclick="catAdopt(' + r.id + ')">' + (r.adopted ? '已领养' : '🏠 领养') + '</button>') +
        '</div></div>';
    }).join('') + '</div>' + (state.hasMore ? '<button type="button" class="btn btn-ghost cat-more" onclick="catLoadMore()"' +
      (state.marketLoading ? ' disabled' : '') + '>' + (state.marketLoading ? '加载中…' : '加载更多猫咪') + '</button>' : '');
  }

  function renderRanking() {
    if (!state.ranking.length) return '<div class="cat-empty">榜单还空着。等第一批猫通过审核就有啦～</div>';
    return '<div class="cat-rank-list">' + state.ranking.map(function (r) {
      var medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ('#' + r.rank);
      return '<div class="cat-rank-item' + (r.rank <= 3 ? ' top' : '') + '">' +
        '<span class="cat-rank-no">' + medal + '</span>' +
        '<span class="cat-rank-fig">' + catHtml(r.look, 64) + '</span>' +
        '<span class="cat-rank-info"><b>' + esc(r.name) + '</b><small>by ' + esc(r.ownerName || '神秘蛋蛋') + '</small></span>' +
        '<span class="cat-rank-votes">👍 ' + r.votes + '</span>' +
        (r.rewarded ? '<span class="cat-rewarded">已发奖</span>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function renderReview() {
    var head = '<div class="cat-review-head">' +
      '<span>待审核 <b>' + state.pending.length + '</b> 只</span>' +
      '<button type="button" class="btn btn-primary" onclick="catGrantReward()">🏆 发放总榜奖励</button>' +
      '</div>' +
      '<p class="cat-review-hint">发放总榜奖励：给当前第一名 100 蛋蛋币 + 50 声望，同一赛季仅发一次。</p>';
    if (!state.pending.length) return head + '<div class="cat-empty">没有待审核的猫。</div>';
    return head + '<div class="cat-grid">' + state.pending.map(function (r) {
      return '<div class="cat-card">' +
        '<div class="cat-card-fig">' + catHtml(r.look, 120) + '</div>' +
        '<div class="cat-card-name">' + esc(r.name) + '</div>' +
        '<div class="cat-card-owner">by ' + esc(r.ownerName || '神秘蛋蛋') + '</div>' +
        (r.intro ? '<div class="cat-card-intro">' + esc(r.intro) + '</div>' : '') +
        '<div class="cat-card-actions">' +
        '<button type="button" class="btn btn-primary" onclick="catApprove(' + r.id + ')">通过</button>' +
        '<button type="button" class="btn btn-ghost cat-danger" onclick="catReject(' + r.id + ')">驳回</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------- 交互 ---------- */
  function load() {
    state.tab = 'create';
    state.editingId = null;
    refreshRemaining();
    loadReviewerFlag();
    render();
  }

  function loadReviewerFlag() {
    // 管理员身份由「待审核接口」是否 403 推断，避免额外接口
    api('/api/cats/review/pending').then(function (r) {
      if (r && r.code === 200) {
        state.isReviewer = true;
        state.pending = r.data || [];
        render();
      }
    });
  }

  function refreshRemaining() {
    if (!window.USER || !window.USER.registered) { state.remaining = 0; return; }
    api('/api/cats/votes/remaining').then(function (r) {
      if (r && r.code === 200) { state.remaining = r.data || 0; var count = el('catRemaining'); if (count) count.textContent = state.remaining; }
    });
  }

  function tab(k) {
    state.tab = k;
    if (k === 'mine') loadMine();
    else if (k === 'market') loadMarket(true);
    else if (k === 'ranking') loadRanking();
    else if (k === 'review') loadPending();
    else render();
  }

  function pick(key, n) { state.look[key] = n; render(); }
  function toggleBlush() { state.look.blush = state.look.blush ? 0 : 1; render(); }
  function random() {
    state.look = {
      body: 1 + Math.floor(Math.random() * 6),
      ear: 1 + Math.floor(Math.random() * 6),
      eye: 1 + Math.floor(Math.random() * 8),
      tail: 1 + Math.floor(Math.random() * 5),
      pattern: 1 + Math.floor(Math.random() * 5),
      face: 1 + Math.floor(Math.random() * 3),
      blush: Math.random() < 0.5 ? 1 : 0
    };
    render();
  }
  function reset() {
    state.look = { body: 1, ear: 1, eye: 1, tail: 1, pattern: 1, face: 1, blush: 0 };
    render();
  }
  function name(v) { state.name = v; var n = document.querySelector('.cat-preview-name'); if (n) n.textContent = v || '未命名的小猫'; }
  function intro(v) { state.intro = v; }

  function save() {
    if (needLogin()) return;
    if (!state.name || !state.name.trim()) { toast('请给猫咪起个名字'); var i = el('catName'); if (i) i.focus(); return; }
    var payload = { name: state.name.trim(), look: state.look, intro: state.intro };
    var editing = state.editingId != null;
    var req = editing
      ? api('/api/cats/' + state.editingId, 'PUT', payload)
      : api('/api/cats', 'POST', payload);
    req.then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '保存失败'); return; }
      toast(editing ? '已保存修改，请到「我的猫舍」检查审核状态' : '已保存，去「我的猫舍」提交审核吧');
      state.editingId = null;
      state.name = ''; state.intro = '';
      reset();
      tab('mine');
    });
  }

  function edit(id) {
    var r = state.myRooms.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    state.editingId = id;
    state.look = Object.assign({ body: 1, ear: 1, eye: 1, tail: 1, pattern: 1, face: 1, blush: 0 }, r.look || {});
    state.name = r.name || '';
    state.intro = r.intro || '';
    state.tab = 'create';
    render();
  }

  function submit(id) {
    if (needLogin()) return;
    api('/api/cats/' + id + '/submit', 'POST', {}).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '提交失败'); return; }
      toast('已提交审核，通过后会出现在猫市集');
      loadMine();
    });
  }

  function del(id) {
    if (!window.confirm('确定删除这只猫吗？删除后无法恢复。')) return;
    api('/api/cats/' + id, 'DELETE').then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '删除失败'); return; }
      toast('已删除');
      loadMine();
    });
  }

  function loadMine() {
    api('/api/cats/reputation').then(function (r) {
      if (r && r.code === 200) { state.reputation = r.data || 0; if (state.tab === 'mine') render(); }
    });
    api('/api/cats/mine').then(function (r) {
      if (r && r.code === 200) { state.myRooms = r.data || []; render(); }
      else { toast((r && r.msg) || '加载猫舍失败'); }
    });
  }

  function loadMarket(reset) {
    if (!reset && (state.marketLoading || !state.hasMore)) return;
    if (reset) { state.marketPage = 0; state.hasMore = false; state.market = []; }
    var request = ++state.marketRequest;
    var nextPage = state.marketPage + 1;
    var kw = state.keyword ? '&keyword=' + encodeURIComponent(state.keyword) : '';
    state.marketLoading = true;
    render();
    api('/api/cats/market?page=' + nextPage + '&size=48' + kw).then(function (r) {
      if (request !== state.marketRequest) return;
      state.marketLoading = false;
      if (r && r.code === 200) {
        var rows = r.data || [];
        state.market = nextPage === 1 ? rows : state.market.concat(rows);
        state.marketPage = nextPage;
        state.hasMore = rows.length === 48;
        render();
      } else { toast((r && r.msg) || '加载猫市集失败'); render(); }
    });
    if (reset) refreshRemaining();
  }
  function loadMore() { loadMarket(false); }

  function keyword(v) { state.keyword = v; }
  function search() { loadMarket(true); }

  function vote(id) {
    if (needLogin()) return;
    api('/api/cats/' + id + '/vote', 'POST', {}).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '投票失败'); return; }
      state.remaining = r.data && r.data.remaining != null ? r.data.remaining : state.remaining;
      toast('投票成功，今天还剩 ' + state.remaining + ' 票');
      loadMarket(true);
    });
  }

  function adopt(id) {
    if (needLogin()) return;
    if (!window.confirm('领养会复制一只同款猫到你的猫舍，确定吗？')) return;
    api('/api/cats/' + id + '/adopt', 'POST', {}).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '领养失败'); return; }
      toast('领养成功，已经放到你的猫舍啦');
      loadMarket(true);
    });
  }

  function loadRanking() {
    api('/api/cats/ranking?limit=50').then(function (r) {
      if (r && r.code === 200) { state.ranking = r.data || []; render(); }
      else toast((r && r.msg) || '加载榜单失败');
    });
  }

  function loadPending() {
    api('/api/cats/review/pending').then(function (r) {
      if (r && r.code === 200) { state.isReviewer = true; state.pending = r.data || []; render(); }
      else if (r && r.code === 403) { state.isReviewer = false; toast('你没有审核权限'); tab('market'); }
      else { toast((r && r.msg) || '加载失败'); }
    });
  }

  function approve(id) {
    api('/api/cats/review/' + id + '/approve', 'POST', {}).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '操作失败'); return; }
      toast('已通过审核，猫咪已公开');
      loadPending();
    });
  }

  function reject(id) {
    var reason = window.prompt('驳回原因（可留空）：', '');
    if (reason === null) return;
    api('/api/cats/review/' + id + '/reject', 'POST', { reason: reason }).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '操作失败'); return; }
      toast('已驳回');
      loadPending();
    });
  }

  function grantReward() {
    var season = window.prompt('赛季标识（留空 = total）：', 'total');
    if (season === null) return;
    api('/api/cats/review/grant-reward', 'POST', { season: season }).then(function (r) {
      if (!r || r.code !== 200) { toast((r && r.msg) || '发放失败'); return; }
      var d = r.data || {};
      toast('已给「' + d.ownerName + '」发放 ' + d.points + ' 蛋蛋币 + ' + d.reputation + ' 声望');
    });
  }

  window.catSystemLoad = load;
  window.catTab = tab;
  window.catPick = pick;
  window.catToggleBlush = toggleBlush;
  window.catRandom = random;
  window.catReset = reset;
  window.catName = name;
  window.catIntro = intro;
  window.catSave = save;
  window.catEdit = edit;
  window.catSubmit = submit;
  window.catDelete = del;
  window.catKeyword = keyword;
  window.catSearch = search;
  window.catLoadMore = loadMore;
  window.catVote = vote;
  window.catAdopt = adopt;
  window.catApprove = approve;
  window.catReject = reject;
  window.catGrantReward = grantReward;
})();