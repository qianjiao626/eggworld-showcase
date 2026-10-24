/* ============================================================
   移动端「发布任务」入口 + 发布页改版 · 逻辑（仅在 ≤768px 生效）
   ------------------------------------------------------------
   为什么单独一个文件：主文件已经很挤，移动端支持尽量外置
   （与 js/plaza-mobile.css、js/plaza-swipe.js 同一约定）。
   引入位置：growth-schoolv3.html 里与其它外联脚本同区（<script src="js/publish-mobile.js"></script>）。
   样式：js/publish-mobile.css。

   这个脚本干三件事，全部只在 ≤768px 生效：
     ① 在底栏「吐槽/黑榜」与「我的任务」之间插一格「发布」（54px 圆钮，不切页，只弹面板）
     ② 注入「选任务类型」底部面板，点某项 → 调主文件原有的 goPublish(type, null, 对应广场页)
     ③ 把发布页 #page-publish 重排成移动端版式：
          去卡片（表单铺在页面底色上）· 吸顶行「‹ 返回广场 + 发布XX任务」
          · 技能分类改两个下拉 · 认领模式与金额并排一行 · 低频项与须知折进 details · 提交吸底

   不改主文件的一行结构：③ 的做法是「把原节点搬个位置」，不是重建 ——
     · 控件本身（#publishName / #publishReward / #publishSkillRow / #publishContact …）都是原节点搬过去，
       主文件按 id 取值、按 id 写值的逻辑（updatePublishRewardHint、submitPublish 等）完全不受影响；
     · 类型选择器（原来的「任务类型」三项 chip + 说明）在移动端整块不搬 —— 入口已经选过类型，
       由吸顶行右侧的标题体现；主文件写这两处的代码（toggleTaskType 找 chip）找不到节点也不会报错；
     · 页面原样 innerHTML 留了一份快照，web 端（>768px）与断点切回来时原样还原。

   不碰的东西：字段、校验、提交逻辑、蛋蛋币规则、后端接口。
   ============================================================ */
(function(){
  'use strict';

  var MQ = '(max-width:768px)';
  var PLAZA_FROM = { plaza:1, teamplaza:1, helpplaza:1 };      /* 从广场页进来的，返回文案才写「返回广场」 */
  var TITLE_OF = { teach:'发布教学任务', help:'发布求助任务', team:'发布组队任务' };

  /* emoji 写成码点转义，避免文件在多次编辑中被写坏成替换字符 */
  var ICON = {
    plus:'<path d="M12 5v14M5 12h14" stroke-linecap="round"/>',
    caret:'<path d="M6 9L12 15L18 9" stroke-linecap="round" stroke-linejoin="round"/>',
    arrow:'<path d="M9 6L15 12L9 18" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function svg(k, sw, cls){
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="' + (sw || 1.7) + '">' + ICON[k] + '</svg>';
  }

  /* 面板三项；fromPage 用与该类型对应的广场页 —— goPublish 会把它写进 publishFromPage，
     决定发布页「返回」的去向与文案（传别的页面 id 会出现「返回undefined」） */
  var OPTS = [
    { type:'teach', page:'plaza',     emoji:'\u{1F393}', tint:'#FFF6E5',
      t:'发布教学任务', d:'收徒 / 技能变现：把你的拿手技能教给别人', m:'学员支付蛋蛋币给你' },
    { type:'team',  page:'teamplaza', emoji:'\u{1F91D}', tint:'#E6F7F2',
      t:'发布组队任务', d:'组队共创：比赛、求职、兴趣搭子一起做', m:'你与每位入选搭子各出资 10 蛋蛋币' },
    { type:'help',  page:'helpplaza', emoji:'\u{1F198}', tint:'#E8F1FB',
      t:'发布求助任务', d:'求助中心：代取快递、答疑、跑腿等生活互助', m:'悬赏蛋蛋币，完成后转给帮忙的人' }
  ];

  function isMobile(){ return window.matchMedia(MQ).matches; }
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function toggleClass(el, on){ if(el) el.classList.toggle('on', !!on); }

  /* ================= ① 底栏那一格 ================= */
  function injectEntry(){
    var nav = document.getElementById('studentNav');
    if(!nav || nav.querySelector('.nav-publish')) return;
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'nav-publish';
    el.setAttribute('aria-label', '发布任务');
    el.innerHTML = '<span class="np-fab">' + svg('plus', 2.2) + '<span class="np-t">发布</span></span>';
    el.addEventListener('click', function(e){ e.stopPropagation(); openSheet(true); });
    var after = nav.querySelector('.discover-nav');            /* 插在「吐槽/黑榜」之后 */
    if(after && after.nextSibling) nav.insertBefore(el, after.nextSibling);
    else nav.appendChild(el);
  }

  /* ================= ② 选任务类型面板 ================= */
  function injectSheet(){
    if(document.getElementById('npSheet')) return;
    var mask = document.createElement('div');
    mask.id = 'npMask'; mask.className = 'np-mask';
    var sheet = document.createElement('div');
    sheet.id = 'npSheet'; sheet.className = 'np-sheet';
    sheet.innerHTML = '<div class="np-grip"></div>'
      + '<div class="np-head"><h3>发布任务</h3><div class="s">选一种类型，进入发布表单</div></div>'
      + OPTS.map(function(o){
          return '<button type="button" class="np-row" data-np-type="' + o.type + '" data-np-page="' + o.page + '">'
            + '<span class="np-ic" style="background:' + o.tint + '">' + o.emoji + '</span>'
            + '<span class="np-tx"><span class="t">' + o.t + '</span><span class="d">' + o.d + '</span>'
            + '<span class="m">' + o.m + '</span></span>' + svg('arrow', 2, 'np-arrow') + '</button>';
        }).join('')
      + '<button type="button" class="np-cancel" data-np-close="1">取消</button>';
    document.body.appendChild(mask);
    document.body.appendChild(sheet);
    mask.addEventListener('click', function(){ openSheet(false); });
    sheet.addEventListener('click', function(e){
      var row = e.target.closest('[data-np-type]');
      if(row){
        openSheet(false);
        /* 走页面原有的 goPublish：切页 / 选中该类型 / 更新返回按钮都由它负责；
           未登录时 go('publish') 本来就会拦下来弹注册引导，这里不重复处理 */
        var type = row.getAttribute('data-np-type');
        if(typeof goPublish === 'function') goPublish(type, null, row.getAttribute('data-np-page'));
        /* goPublish 内部要等 200ms 才调 toggleTaskType，这里先把吸顶标题写上，免得空一拍 */
        var t = document.querySelector('#page-publish .pm-title');
        if(t) t.textContent = TITLE_OF[type] || '发布任务';
        return;
      }
      if(e.target.closest('[data-np-close]')) openSheet(false);
    });
  }
  function openSheet(on){
    toggleClass(document.getElementById('npSheet'), on);
    toggleClass(document.getElementById('npMask'), on);
  }

  /* ================= ③ 发布页重排 ================= */
  var SNAPSHOT_DESKTOP = null;      /* 页面原样（web 端 / 断点切回来时还原） */
  var SNAPSHOT_MOBILE = null;       /* 重排后的移动端版式 */
  var selEls = {};                  /* 两个下拉的节点引用（每次装版式后重新指向在线节点） */

  function applyLayout(){
    var page = document.getElementById('page-publish');
    if(!page || !SNAPSHOT_DESKTOP) return;
    var mobile = isMobile() && !!SNAPSHOT_MOBILE;
    var want = mobile ? SNAPSHOT_MOBILE : SNAPSHOT_DESKTOP;
    if(page.innerHTML !== want) page.innerHTML = want;
    /* innerHTML 换过之后：技能 chip 行由主文件 JS 渲染，需要重画一次；
       #publishSkillRow 在两个版式里都在（移动端只是被 CSS 隐藏），所以这句两边都安全 */
    if(typeof renderPublishSkillRow === 'function') renderPublishSkillRow();
    if(mobile){
      mountSelects(page);     /* 下拉必须挂在「在线」的节点上，快照里只留占位 */
      watchBack();            /* 主文件 goPublish 会重写返回按钮的文案，要盯着改回来 */
      syncPublish();          /* 下面这几处「只显示一份」的改写只在移动端做，web 端保持原样 */
    } else {
      selEls = {};
    }
  }

  function fld(node, extra){
    var w = document.createElement('div');
    w.className = 'pm-fld' + (extra ? ' ' + extra : '');
    if(node) w.appendChild(node);
    return w;
  }
  function sec(text){
    var d = document.createElement('div');
    d.className = 'pm-sec';
    d.textContent = text;
    return d;
  }
  function childDivs(el){
    return Array.prototype.filter.call(el.children, function(x){ return x.tagName === 'DIV'; });
  }
  /* 按「里面有没有这个 id」找字段块，比按位置索引稳。
     ⚠️ querySelector 只匹配**后代**、不匹配元素自身，所以必须先看 el.id：
     有些字段块自己就是那个 id（如 `#publishProofWrap`），只查后代会让它在移动端重建版式时
     被整块丢掉 —— 2026-10-08 的真实缺陷：手机上发布任务「看不到技能证明图片取图区」。 */
  function fieldOf(kids, id){
    return kids.filter(function(el){ return el.id === id || el.querySelector('#' + id); })[0] || null;
  }

  function buildMobile(html){
    var box = document.createElement('div');
    box.innerHTML = html;

    /* 吸顶行：去掉面包屑，右侧补一个标题位（文案由 syncPublish 按当前类型写）；
       返回按钮保留（左尖角 svg 是它自带的），文案同样由 syncPublish 负责 */
    var topbar = box.querySelector('.topbar');
    if(topbar){
      var crumb = topbar.querySelector('.crumb');
      if(crumb) crumb.parentNode.removeChild(crumb);
      var t = document.createElement('span');
      t.className = 'pm-title';
      topbar.appendChild(t);
    }

    var cards = box.querySelectorAll('.card');
    var formCard = cards[0], knowCard = cards[1];
    if(!formCard) throw new Error('publish-mobile: 找不到发布表单卡片');
    var kids = childDivs(formCard);

    var nameFld = fieldOf(kids, 'publishName');
    var skillFld = fieldOf(kids, 'publishSkillRow');
    var descFld = fieldOf(kids, 'publishDesc');
    var reqFld = fieldOf(kids, 'publishRequirements');
    /* 技能证明图片（选填）：主文件里排在报名/金额那行之后；这个重排是「重建」而不是「挪动」，
       下面必须显式搬一次，否则手机上发布任务就看不到这个入口了 */
    var proofFld = fieldOf(kids, 'publishProofWrap');
    var typeRow = fieldOf(kids, 'taskTypeHint');                /* 任务类型那一行（3 chip + 说明） */
    var claimRow = fieldOf(kids, 'maxClaimersWrap');
    var dlRow = fieldOf(kids, 'signupDlDays');
    var contactFld = fieldOf(kids, 'publishContact');
    var foot = formCard.querySelector('.foot-bar');

    var body = document.createElement('div');
    body.className = 'pm-body';

    /* 标题行只留那句说明（h2「发布任务」在桌面版式里，移动端由吸顶行右侧标题承担） */
    var sub = box.querySelector('.title-row .t p');
    if(sub){ sub.className = 'pm-sub'; body.appendChild(sub); }

    body.appendChild(sec('基本信息'));
    body.appendChild(fld(nameFld));

    /* 技能分类：原来的两级 chip 行留着（CSS 隐藏）当数据源，界面上换成两个下拉。
       下拉节点不能写进快照（快照是字符串，节点引用会失效），这里只放个占位，
       装版式时由 mountSelects() 往在线节点里建。 */
    var skillFldNew = fld(skillFld);
    var selRow = document.createElement('div');
    selRow.className = 'pm-selrow';
    skillFldNew.appendChild(selRow);
    body.appendChild(skillFldNew);

    body.appendChild(fld(descFld));
    body.appendChild(fld(reqFld));
    /* 证明图片：选填，固定放在「任务描述/参与要求」之后、「认领模式与金额」之前 */
    if(proofFld) body.appendChild(fld(proofFld));

    /* 认领模式（含「最多可选人数」，它的显隐由主文件切）与金额并排一行；
       金额口径那句话（#publishRewardHint）整行跟在下面 */
    var claimKids = childDivs(claimRow);
    var claimFld = fld(claimKids[0]);
    if(claimKids[1]) claimFld.appendChild(claimKids[1]);

    var moneyKids = childDivs(dlRow);
    var moneyWrap = moneyKids[2];
    var moneyInput = moneyWrap.querySelector('#publishReward');
    var moneyRow = document.createElement('div');
    moneyRow.className = 'pm-money';
    moneyWrap.insertBefore(moneyRow, moneyInput);
    moneyRow.appendChild(moneyInput);
    var unit = document.createElement('span');
    unit.className = 'pm-unit';
    unit.textContent = '蛋蛋币';
    moneyRow.appendChild(unit);
    var rewardHint = moneyWrap.querySelector('#publishRewardHint');
    moneyWrap.className = 'pm-fld pm-money-fld';

    var cm = document.createElement('div');
    cm.className = 'pm-claim-money';
    cm.appendChild(claimFld);
    cm.appendChild(moneyWrap);
    body.appendChild(cm);
    if(rewardHint){ rewardHint.className = 'pm-hint'; body.appendChild(rewardHint); }

    body.appendChild(sec('联系方式'));
    body.appendChild(fld(contactFld));

    /* 更多设置：报名截止 + 完成截止（低频项，折起来） */
    var more = document.createElement('details');
    more.className = 'pm-fold';
    more.innerHTML = '<summary>' + svg('arrow', 2, 'chev') + '<span class="st">更多设置</span>'
      + '<span class="ss"></span></summary>';
    var moreBody = document.createElement('div');
    moreBody.className = 'pm-foldbody';
    moreBody.appendChild(fld(moneyKids[0]));                    /* 报名截止 */
    moreBody.appendChild(fld(moneyKids[1]));                    /* 任务完成截止日期 */
    more.appendChild(moreBody);
    body.appendChild(more);

    /* 发布须知：原文整段搬进折叠条（一字不改） */
    var know = document.createElement('details');
    know.className = 'pm-fold mint';
    know.innerHTML = '<summary>' + svg('arrow', 2, 'chev') + '<span class="st">发布须知</span>'
      + '<span class="ss">审核 +5 经验值<br>蛋蛋币按类型流通</span></summary>';
    var knowBody = document.createElement('div');
    knowBody.className = 'pm-foldbody pm-know';
    if(knowCard){
      var kn = knowCard.children;
      for(var i = 1; i < kn.length; i++) knowBody.appendChild(kn[i]);
    }
    know.appendChild(knowBody);
    body.appendChild(know);

    /* 提交：吸底在底栏上沿（内联的 padding/box-shadow 会打架，清掉） */
    if(foot){ foot.removeAttribute('style'); body.appendChild(foot); }

    /* 任务类型那一行在移动端不显示（入口已经选过类型），但**必须留在 DOM 里**：
       submitPublish() 是读 document.querySelector('[data-group="taskType"].active') 得到类型的
       （growth-schoolv3.html L10615），删掉它会让手机上发布组队/求助任务被当成「教学型」提交、
       蛋蛋币口径也跟着错；toggleTaskType() 也要靠这几个 chip 维持选中态。
       所以做法是「搬到隐藏容器里」，不是删除。 */
    if(typeRow){
      var hidden = document.createElement('div');
      hidden.className = 'pm-hidden-type';
      hidden.appendChild(typeRow);
      body.appendChild(hidden);
    }

    var out = document.createElement('div');
    if(topbar) out.appendChild(topbar);
    out.appendChild(body);
    return out.innerHTML;
  }

  /* ---------- 两个下拉（分类 / 子分类）---------- */
  /* 装版式后把下拉建到在线节点里：快照是字符串，节点引用不能跨 innerHTML 存 */
  function mountSelects(page){
    selEls = {};
    var row = page.querySelector('.pm-selrow');
    if(!row) return;
    row.innerHTML = '';
    row.appendChild(makeSel('cat'));
    row.appendChild(makeSel('sub'));
  }
  function cats(){
    return (typeof TASK_CATEGORIES !== 'undefined' && TASK_CATEGORIES) ? TASK_CATEGORIES : [];
  }
  function currentCat(){
    var n = (typeof selectedSkillCat === 'string') ? selectedSkillCat : '';
    return cats().filter(function(c){ return c.name === n; })[0] || cats()[0] || null;
  }
  function makeSel(kind){
    var box = document.createElement('div');
    box.className = 'np-sel';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'np-selb';
    btn.innerHTML = '<span class="e"></span><span class="n"></span>' + svg('caret', 2, 'c');
    var menu = document.createElement('div');
    menu.className = 'np-menu';
    box.appendChild(btn);
    box.appendChild(menu);
    btn.addEventListener('click', function(e){ e.stopPropagation(); toggleSel(kind); });
    menu.addEventListener('click', function(e){
      var it = e.target.closest('.np-item');
      if(!it) return;
      closeSel();
      var name = it.getAttribute('data-name');
      /* 复用主文件的两个函数：分类换了子分类会回到第一项，与网页端 chip 的行为一致 */
      if(kind === 'cat' && typeof selectPubCat === 'function') selectPubCat(null, name);
      if(kind === 'sub' && typeof selectPubSub === 'function') selectPubSub(null, name);
      syncPublish();
    });
    selEls[kind] = { box:box, menu:menu };
    return box;
  }
  function closeSel(){
    Object.keys(selEls).forEach(function(k){ selEls[k].box.classList.remove('on'); });
  }
  function toggleSel(kind){
    var el = selEls[kind];
    if(!el) return;
    var wasOn = el.box.classList.contains('on');
    closeSel();
    if(wasOn) return;
    fillSel(kind);
    el.box.classList.add('on');
  }
  function fillSel(kind){
    var el = selEls[kind];
    if(!el) return;
    var list = [];
    if(kind === 'cat'){
      list = cats().map(function(c){ return { name:c.name, emoji:c.icon, color:c.color }; });
    } else {
      var c = currentCat();
      if(c) list = (c.subs || []).map(function(s){ return { name:s.name || String(s), emoji:'', color:c.color }; });
    }
    var cur = (kind === 'cat')
      ? ((typeof selectedSkillCat === 'string') ? selectedSkillCat : '')
      : ((typeof selectedSkillSub === 'string') ? selectedSkillSub : '');
    el.menu.innerHTML = list.map(function(x){
      return '<div class="np-item' + (x.name === cur ? ' active' : '') + '" data-name="' + x.name + '"'
        + ' style="--ec:' + x.color + '"><span class="dot"></span><span>'
        + (x.emoji ? x.emoji + ' ' : '') + x.name + '</span></div>';
    }).join('');
  }
  function syncSelBtn(kind){
    var el = selEls[kind];
    if(!el) return;
    var e = el.box.querySelector('.e'), n = el.box.querySelector('.n');
    if(kind === 'cat'){
      var c = currentCat();
      if(e) e.textContent = c ? c.icon : '';
      if(n) n.textContent = c ? c.name : '选择分类';
    } else {
      var sub = (typeof selectedSkillSub === 'string') ? selectedSkillSub : '';
      if(e) e.textContent = '';
      if(n) n.textContent = sub || '选择子分类';
    }
  }

  /* ---------- 吸顶行：右侧标题 + 左侧返回文案 ---------- */
  function syncTitle(){
    var t = document.querySelector('#page-publish .pm-title');
    if(!t) return;
    var ty = (typeof publishTaskType === 'string') ? publishTaskType : 'teach';
    t.textContent = TITLE_OF[ty] || '发布任务';
  }
  function syncBack(){
    var back = document.querySelector('#page-publish .back-btn');
    if(!back) return;
    var from = (typeof publishFromPage === 'string') ? publishFromPage : '';
    if(!PLAZA_FROM[from]) return;                 /* 从「我的任务」等处进来的，保持主文件的「返回我的任务」 */
    if((back.textContent || '').indexOf('返回广场') >= 0) return;
    var ic = back.querySelector('svg');
    back.innerHTML = (ic ? ic.outerHTML : '') + '返回广场';
  }
  /* 主文件的 goPublish() 会在 200ms 后重写返回按钮的文案，所以这里盯住它 */
  function watchBack(){
    var back = document.querySelector('#page-publish .back-btn');
    if(!back || back.__pmWatched) return;
    back.__pmWatched = true;
    if(typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(syncBack);
    mo.observe(back, { childList:true, subtree:true, characterData:true });
  }

  /* ---------- 每次交互后把「只显示一份」的东西对齐 ---------- */
  function syncPublish(){
    /* 只有移动端版式装好了才改写这几处（selEls 由 mountSelects 填），
       web 端与重排失败时一律原样不动 */
    if(!isMobile() || !selEls.cat) return;
    syncSelBtn('cat');
    syncSelBtn('sub');
    syncTitle();
    syncBack();

    /* 金额右侧单位：组队型会被主文件锁成 10（readOnly） */
    var money = document.getElementById('publishReward');
    var unit = document.querySelector('#page-publish .pm-unit');
    if(money && unit) unit.textContent = money.readOnly ? '固定' : '蛋蛋币';

    /* 「更多设置」条右侧直接写出当前取值，不展开也知道默认是什么 */
    var ss = document.querySelector('#page-publish .pm-fold:not(.mint) .ss');
    if(ss){
      var daysEl = document.getElementById('signupDlDays');
      var dueEl = document.getElementById('publishDeadline');
      var maxEl = document.getElementById('maxClaimersWrap');
      var claim = (maxEl && maxEl.style.display !== 'none') ? '多人认领' : '单人认领';
      ss.innerHTML = '报名 ' + ((daysEl && daysEl.value) || '30') + ' 天后截止<br>完成日期'
        + ((dueEl && dueEl.value) || '未设') + ' · ' + claim;
    }
  }

  /* ================= 启动 ================= */
  /* 主文件里改「状态」的两个函数包一层：它们跑完就同步一次显示。
     这么做是为了不依赖时序 —— goPublish() 内部是用 setTimeout(…, 200) 再调 toggleTaskType 的，
     靠定时器去追很容易错拍。只加一层转发，不改变原函数行为。 */
  function wrapGlobal(name){
    if(typeof window[name] !== 'function' || window[name].__pmWrapped) return;
    var orig = window[name];
    var wrapped = function(){ var r = orig.apply(this, arguments); syncPublish(); return r; };
    wrapped.__pmWrapped = true;
    window[name] = wrapped;
  }

  function boot(){
    try{
      injectEntry();
      injectSheet();
      wrapGlobal('toggleTaskType');          /* 切类型：吸顶标题 + 金额单位 */
      wrapGlobal('updatePublishRewardHint'); /* 金额口径 / 组队锁定 */
      var page = document.getElementById('page-publish');
      if(page){
        SNAPSHOT_DESKTOP = page.innerHTML;                       /* 原样留一份，随时可还原 */
        try{ SNAPSHOT_MOBILE = buildMobile(SNAPSHOT_DESKTOP); }
        catch(err){ SNAPSHOT_MOBILE = null; }                    /* 重排失败就退回原样，不影响发布 */
        applyLayout();
        var mq = window.matchMedia(MQ);
        var onChange = function(){ applyLayout(); };
        if(mq.addEventListener) mq.addEventListener('change', onChange);
        else if(mq.addListener) mq.addListener(onChange);        /* 老 Safari */
      }
      /* 页面内点击：收起下拉 + 对齐显示（认领模式是内联 onclick 先跑，这里跑在后面） */
      document.addEventListener('click', function(e){
        if(!e.target.closest('#page-publish')){ closeSel(); return; }
        closeSel();
        syncPublish();
      });
      /* 报名截止天数 / 完成截止日期改了 → 「更多设置」条右侧的取值跟着变 */
      document.addEventListener('input', function(e){
        if(e.target.closest && e.target.closest('#page-publish')) syncPublish();
      });
      document.addEventListener('change', function(e){
        if(e.target.closest && e.target.closest('#page-publish')) syncPublish();
      });
    }catch(err){
      /* 外置脚本出问题不能影响发布流程：这里只留一条提示，不抛出去 */
      if(window.console && console.warn) console.warn('publish-mobile init failed:', err);
    }
  }
  ready(boot);
})();
