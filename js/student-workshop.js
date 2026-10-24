/* ============================================================
   学生工坊 · 功能入口注册表（移动端「任务广场」第 4 个 tab）
   ------------------------------------------------------------
   新增学生开发的游戏/软件入口：只需往 FEATURES 数组加一项——
     id     唯一标识（同时作为排序配置里的键）
     icon   展示图标（emoji）
     tint   图标底色（浅色系，与全站 tag-tint 语言一致）
     name   功能名
     desc   一句话介绍（≤ 22 字，卡片内两行内放下）
     open   点击行为（通常是 go('xxx') 进子页）

   排序：管理员在后台「系统设置 → 学生工坊排序」调整，存在 app_settings.workshop.order；
   前端进入工坊时拉一次 /api/workshop/order，按保存的顺序渲染，未配置则用本文件的默认顺序。
   ============================================================ */
(function () {
  var FEATURES = [
    {
      id: 'catcabin',
      icon: '🐱',
      tint: '#FFEBD6',
      name: '猫咪小屋',
      desc: '领养蛋喵养成品，签到陪伴赚蛋蛋币',
      open: function () { go('catcabin'); }
    },
    {
      id: 'resumestudio',
      icon: '📄',
      tint: '#E4EEFF',
      name: '大师兄简历',
      desc: 'AI 对标岗位改简历，3 分钟出稿',
      /* 独立整页应用（静态导出在 rs/）。同标签跳转：同源同标签，登录态直接带过去，
         站点里有「返回蛋蛋世界」；不在蛋蛋世界内做嵌入适配。 */
      open: function () { window.location.href = 'rs/?v=20261021'; }
    },
    {
      id: 'careerquiz',
      icon: '🧭',
      tint: '#E8F7EF',
      name: '大师兄找方向',
      desc: '19 题测出适合你的职业方向',
      /* 与「大师兄简历」同一个静态站点（rs/career/），同样整页跳转 */
      open: function () { window.location.href = 'rs/career/?v=20261021'; }
    }
    /* 后续入口照此追加，例如：
    { id:'xxx', icon:'🎮', tint:'#E0F7F4', name:'…', desc:'…', open:function(){ go('xxx'); } }
    */
  ];

  var API_BASE = (window.EGGWORLD_API_BASE !== undefined)
    ? window.EGGWORLD_API_BASE
    : ((location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8080' : '');

  var order = [];   // 后台保存的 id 顺序
  var loading = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** 按后台顺序排列；后台没配过的（新增功能）排在默认顺序里它原来的位置之后 */
  function orderedFeatures() {
    if (!order.length) return FEATURES.slice();
    var byId = {};
    FEATURES.forEach(function (f) { byId[f.id] = f; });
    var out = [];
    order.forEach(function (id) {
      if (byId[id] && out.indexOf(byId[id]) < 0) out.push(byId[id]);
    });
    FEATURES.forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); });
    return out;
  }

  function render() {
    var grid = document.getElementById('workshopGrid');
    if (!grid) return;
    grid.innerHTML = orderedFeatures().map(function (f) {
      return '<div class="workshop-card" data-ws="' + esc(f.id) + '" role="button" tabindex="0" aria-label="' + esc(f.name) + '">'
        + '<span class="ws-icon" style="background:' + esc(f.tint) + '">' + f.icon + '</span>'
        + '<span class="ws-info">'
        +   '<span class="ws-name">' + esc(f.name) + '</span>'
        +   '<span class="ws-desc">' + esc(f.desc) + '</span>'
        + '</span>'
        + '<span class="ws-go" aria-hidden="true">›</span>'
        + '</div>';
    }).join('');

    var cards = grid.querySelectorAll('.workshop-card');
    Array.prototype.forEach.call(cards, function (card) {
      var f = FEATURES.filter(function (x) { return x.id === card.getAttribute('data-ws'); })[0];
      if (!f) return;
      card.addEventListener('click', function () { f.open(); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.open(); }
      });
    });
  }

  function loadOrder() {
    if (loading || typeof fetch !== 'function') return;
    loading = true;
    fetch(API_BASE + '/api/workshop/order')
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.code === 200 && json.data && Array.isArray(json.data.order)) {
          order = json.data.order;
          render();
        }
      })
      .catch(function () { /* 读取失败按默认顺序，不影响入口 */ })
      .then(function () { loading = false; });
  }

  /* 每次进工坊都拉一次顺序：管理员改完后学生下次进入即刻生效 */
  function renderAndLoad() {
    render();
    loadOrder();
  }

  window.renderStudentWorkshop = renderAndLoad;

  /* 后台「学生工坊排序」用：功能清单（名称/图标）以本文件为准，避免两处维护 */
  window.getStudentWorkshopFeatures = function () {
    return FEATURES.map(function (f) {
      return { id: f.id, name: f.name, icon: f.icon };
    });
  };
})();
