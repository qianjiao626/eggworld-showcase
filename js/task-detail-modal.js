/* ============================================================
   蛋蛋世界 · 任务详情弹窗（点击任务卡片后弹出的 #taskDetailModal）
   ------------------------------------------------------------
   为什么单独一个文件：主文件已经很挤，按协作约定把「移动端支持 + 本次重做的展示构件」
   外置；配套样式见 js/task-detail-modal.css，设计依据 TODO/任务详情弹窗原型.html。

   这里提供三类东西：
     1) 生成构件（主文件 showTaskDetail() / showMyTaskDetail() 调用，返回 innerHTML 片段）
        · taskDetailFactsHtml()     —— 窄屏关键事实一行（认领模式 · 人数 / 截止倒计时）
        · taskDetailProofHtml()     —— 技能证明图片（选填，发布任务时上传；渲染在「任务描述」之前）
        · taskDetailPubCardHtml()   —— 发布者名片（桌面端与窄屏共用）
        · taskDetailFoldMoreHtml()  —— 窄屏「展开全文」按钮
     2) 交互：toggleTaskFold()（由生成的 onclick 调用）、
             afterTaskDetailOpen() / taskDetailAfterClose()（由主文件在开关详情时调用）
     3) 依赖（都是主文件内联脚本里的全局，只在运行时调用，不在加载时调用）：
        escapeHtml、jsArgAttr、getLevel、RARITY_COLORS、showUserEggModal

   设计要点：发布者名片只回答「这个人靠不靠谱」——只留 评分 + 点赞 + 擅长标签；
   五维属性与其他资料不在这里展开，点右侧「TA 的主页」看（那里本来就有四维进度条 + 口碑徽章）。
   ============================================================ */
(function () {
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s)) : String(s); }
  function jsArg(s) { return (typeof jsArgAttr === 'function') ? jsArgAttr(s) : String(s).replace(/'/g, "\\'"); }
  function rarityColor(r) { var m = window.RARITY_COLORS || {}; return m[r] || '#C0C0C0'; }

  /* 截止文案：『⏰ 截止 10-08 · 还剩 5 天』；长期有效不加倒计时 */
  function deadlineText(text, raw) {
    var t = (text && text !== '长期有效') ? ('截止 ' + text) : '长期有效';
    if (raw) {
      var ms = new Date(String(raw).replace('T', ' ').replace(/-/g, '/')).getTime() - Date.now();
      if (ms > 0) {
        var d = Math.ceil(ms / 86400000);
        t += (d <= 1) ? ' · 今天截止' : ' · 还剩 ' + d + ' 天';
      }
    }
    return '⏰ ' + t;
  }

  /* ---------- 窄屏关键事实：认领模式 · 人数（左）+ 截止（右贴边） ----------
     钱不在这里重复 —— 吸底操作条上已经有一次 */
  function factsHtml(o) {
    return '<div class="td-facts">' +
      '<span>' + esc(o.mode) + ' · ' + esc(o.count) + '</span>' +
      '<span class="dl">' + deadlineText(o.deadlineText, o.deadlineRaw) + '</span>' +
    '</div>';
  }

  /* ---------- 窄屏「展开全文」：按钮必须紧跟在 .td-foldable 块后面 ---------- */
  function foldMoreHtml() {
    return '<button class="td-fold-more" onclick="toggleTaskFold(this)">展开全文 ▾</button>';
  }

  /* ---------- 钱规则 / 吸底金额摘要 ----------
     口径按后端资金规则分型写（docs/backend-handoff.md 5.1 蛋蛋币流转，2026-09-17 核对）：
       reward 官方奖励：发布不冻结、平台发币，确认完成时给认领者
       help  求助：发布时发布者冻结，确认完成后发放给被选中的认领者
       teach 教学：发布不冻结，认领者提交完成时付给发布者
       team  组队：发布者与入选搭子各自冻结 10，双方确认完成后 3 天互评期，到期退还每人 80%
     高亮里的详情只在窄屏出现（桌面端信息网格里已有「蛋蛋币」一行，不重复）。 */
  var MONEY = {
    reward: { unit: '蛋蛋币', note: '确认完成后到账',
      rule: '💰 官方奖励任务：{n} 蛋蛋币由平台发放，确认完成时给到认领者。' },
    help: { unit: '蛋蛋币', note: '确认完成后发放',
      rule: '💰 发布者已把 {n} 蛋蛋币冻结在平台，确认完成后发放给被选中的认领者。' },
    teach: { unit: '蛋蛋币', note: '提交完成时支付',
      rule: '💰 发布时不预扣；认领者提交完成时向发布者支付 {n} 蛋蛋币。' },
    team: { unit: '蛋蛋币 / 人', note: '互评期后退还 80%',
      rule: '💰 每人 {n} 蛋蛋币：发布者与入选搭子各自冻结，双方确认完成后进入 3 天互评期，到期退还每人 80%（{r} 币）。' }
  };
  function moneyOf(type, reward) {
    var m = MONEY[type] || MONEY.reward;
    var n = Number(reward) || 0;
    /* {r} = 退还金额（80%，与后端的 TEAM_REFUND 口径一致），避免写死 8 币与真实金额打架 */
    return { unit: m.unit, note: m.note, rule: m.rule.replace('{n}', n).replace('{r}', Math.round(n * 0.8)) };
  }
  /* 钱规则提示条（窄屏） */
  function ruleHtml(type, reward) {
    return '<div class="td-rule">' + esc(moneyOf(type, reward).rule) + '</div>';
  }
  /* 吸底金额摘要：大号金额 + 一行说明（原型②的 foot 形态） */
  function statusAmountHtml(type, reward) {
    var m = moneyOf(type, reward);
    return '<div class="td-status-amount"><b>' + esc(Number(reward) || 0) + '</b> ' + esc(m.unit) +
      '<span>' + esc(m.note) + '</span></div>';
  }

  /* ---------- 发布者名片 ---------- */
  /* 等级徽章：官方蛋显示身份，其余用 exp 换算等级（取不到就不显示） */
  function levelBadge(pubData, isAdmin) {
    if (isAdmin) return '<span class="td-pub-lv">👑 官方</span>';
    if (!pubData || pubData.exp == null || typeof getLevel !== 'function') return '';
    return '<span class="td-pub-lv">⚡ ' + esc(getLevel(Number(pubData.exp) || 0).name) + '</span>';
  }
  /* 评分 + 点赞：来自 /api/users/by-nickname，取不到就整行不显示（不编数据）。
     评分带上评价人数，避免「1 个人给了 5 星」被当成好口碑 */
  function trustLine(pubData) {
    if (!pubData) return '';
    var parts = [];
    var repVal = parseFloat(pubData.reputation);
    if (pubData.reputation != null && !isNaN(repVal)) {
      var repCnt = pubData.ratingCount || 0;
      parts.push('<span>⭐ <b>' + repVal.toFixed(1) + '</b> <span class="m">' +
        (repCnt > 0 ? repCnt + ' 人评' : '暂无评价') + '</span></span>');
    }
    if (pubData.likes != null) {
      parts.push('<span>👍 <b>' + (Number(pubData.likes) || 0) + '</b> <span class="m">获赞</span></span>');
    }
    return parts.length ? '<div class="td-pub-line">' + parts.join('<span class="sep">|</span>') + '</div>' : '';
  }
  /* 擅长标签：最多显示 3 个，其余收成「+N」（skills 最多 7 条，窄屏别堆成三行） */
  function skillsLine(pubData) {
    var list = (pubData && pubData.skills) ? pubData.skills : [];
    if (!list.length) return '';
    var show = list.slice(0, 3), rest = list.length - show.length;
    return '<div class="td-pub-line"><span class="lbl">擅长</span>' +
      show.map(function (k) { return esc(k); }).join('<span class="sep">·</span>') +
      (rest > 0 ? '<span class="m">+' + rest + '</span>' : '') + '</div>';
  }
  /* 默认头像：蛋图 + 稀有度光环 + 稀有度角标（官方蛋用金色光环、不可点） */
  function defaultAvatarHtml(o) {
    var rc = o.ringColor || rarityColor(o.rarity);
    var click = o.isAdmin ? '' : ' onclick="event.stopPropagation();showUserEggModal(\'' + jsArg(o.nickname) + '\')"';
    return '<div class="td-pub-avatar-wrap pub-egg-wrap large"' + (o.isAdmin ? ' style="cursor:default"' : click) + '>' +
      '<div class="pub-egg-ring" style="border-color:' + rc + (o.isAdmin ? ';box-shadow:0 0 16px ' + rc + '80' : '') + '"></div>' +
      '<img class="pub-egg" src="' + esc(o.eggImg || '') + '">' +
      '<span class="pub-egg-r-tag" style="background:' + rc + '">' + esc(o.rarity || '') + '</span>' +
    '</div>';
  }

  /* o = { nickname, school, category, grade, pubData, isAdmin,
            avatarHtml(可选，我的任务视角带装扮时传入) / eggImg+rarity+ringColor(可选) } */
  function pubCardHtml(o) {
    var avatar = o.avatarHtml || defaultAvatarHtml(o);
    var rest = [];
    if (o.grade) rest.push(o.grade);
    if (o.category) rest.push(o.category);
    var sub = (o.school || rest.length)
      ? '<span class="td-pub-sub">' +
          (o.school ? '<span class="td-pub-school">' + esc(o.school) + '</span>' : '') +
          (rest.length ? (o.school ? ' · ' : '') + esc(rest.join(' · ')) : '') +
        '</span>'
      : '';
    var click = o.isAdmin ? '' : ' onclick="event.stopPropagation();showUserEggModal(\'' + jsArg(o.nickname) + '\')"';
    var go = o.isAdmin ? '' : '<span class="td-pub-go"' + click + '>TA 的主页 ›</span>';
    return '<div class="td-section-title" style="margin-top:14px">发布者</div><div class="td-pub">' +
      '<div class="td-pub-row">' + avatar +
        '<span class="td-pub-main">' +
          '<span class="td-pub-name"' + (o.isAdmin ? ' style="cursor:default"' : click) + '>' +
            esc(o.nickname) + levelBadge(o.pubData, o.isAdmin) +
          '</span>' + sub +
        '</span>' + go +
      '</div>' +
      trustLine(o.pubData) + skillsLine(o.pubData) +
    '</div>';
  }

  /* ---------- 技能证明图片（选填）----------
     发布任务时上传的「技能/信息证明」图，认领者据此核实发布者，审核员据此判断要不要放行。
     渲染位置固定在「任务描述」之前（详情页）；审核中心用 compact:true 渲染成一行缩略图 + 查看按钮，
     避免待审列表被大图撑开。
     三点刻意设计：
       · 没有图就返回空串（整块不渲染），不为占位留白；
       · 图挂了只留一行灰字，不显示破图图标（后端图被清理时任务详情必须照常可读）；
       · 只有 1 张图（每任务 1 张），所以不需要轮播/多图逻辑。 */
  function proofHtmlOf(o) {
    var compact = !!(o && o.compact);
    var id = (o && o.imageId != null) ? String(o.imageId).trim() : '';
    var title = (o && o.title) ? String(o.title) : '';
    if (!/^\d+$/.test(id)) {
      /* 没有图：详情页整块不渲染；审核中心要显式写出来 —— 「有没有上传证明」本身就是审核信息 */
      return compact ? '<div class="td-proof-none">未上传证明图片</div>' : '';
    }
    var src = (typeof API_BASE === 'string' ? API_BASE : '') + '/api/tasks/proof-images/' + id;
    var alt = '发布者上传的技能证明图片' + (title ? '：' + esc(title) : '');
    if (compact) {
      /* 审核中心：缩略图 + 「查看证明图」按钮（点击看原图，仍走公开读图接口） */
      return '<div class="td-proof-inline">' +
        '<img src="' + esc(src) + '" alt="' + alt + '" loading="lazy" data-proof-image-id="' + id + '"' +
          ' title="点击查看原图" onclick="openTaskProofImage(\'' + jsArg(id) + '\')"' +
          ' onerror="onTaskProofImageError(this)">' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="openTaskProofImage(\'' + jsArg(id) + '\')"' +
          '>查看证明图</button>' +
      '</div>';
    }
    return '<div class="td-section-title">技能证明图片</div>' +
      '<div class="td-proof">' +
        '<img src="' + esc(src) + '" alt="' + alt + '"' +
          ' loading="lazy" data-proof-image-id="' + id + '" title="点击查看原图"' +
          ' onclick="openTaskProofImage(\'' + jsArg(id) + '\')"' +
          ' onerror="onTaskProofImageError(this)">' +
      '</div>' +
      '<div class="td-proof-note">发布者上传，用于证明相关技能或信息</div>';
  }
  /* 点击看原图：接口公开可读（见 JwtInterceptor 白名单），直接新窗口打开 */
  function openTaskProofImage(id) {
    var url = (typeof API_BASE === 'string' ? API_BASE : '') + '/api/tasks/proof-images/' + id;
    if (typeof window.open === 'function') window.open(url, '_blank', 'noopener');
  }
  /* 图取不到（被清理 / 落盘文件丢失）时不显示破图：换成一行说明，详情其余部分照常可读 */
  function onTaskProofImageError(img) {
    var box = img && img.parentElement;
    if (!box) return;
    var note = document.createElement('div');
    note.className = 'td-proof-miss';
    note.textContent = '证明图片已不可用';
    box.replaceWith(note);
  }

  /* ---------- 交互 ---------- */
  /* 长文展开/收起：按钮紧跟在 .td-foldable 块后面 */
  function toggleTaskFold(btn) {
    var blk = btn.previousElementSibling;
    if (!blk) return;
    var open = blk.classList.toggle('fold-open');
    btn.textContent = open ? '收起 ▴' : '展开全文 ▾';
  }
  /* 详情渲染完、弹窗已显示后的统一收尾（主文件在两个生成函数末尾调用） */
  function afterTaskDetailOpen() {
    var narrow = window.matchMedia('(max-width:600px)').matches;
    var cardEl = document.getElementById('taskDetailCard');
    if (!cardEl) return;
    /* 窄屏样式以 .td-sheet 为作用域，这里补标记类 */
    cardEl.classList.add('td-sheet');
    /* 没被截断的长文不显示「展开全文」（只有窄屏会截断，所以只在窄屏判断） */
    cardEl.querySelectorAll('.td-fold-more').forEach(function (btn) {
      var blk = btn.previousElementSibling;
      btn.style.display = (narrow && blk && blk.scrollHeight > blk.clientHeight + 1) ? '' : 'none';
    });
    /* 窄屏弹窗打开时锁住背景滚动，避免滚到底带动页面 */
    if (narrow) document.body.style.overflow = 'hidden';
  }
  /* closeTaskDetail() 调用：窄屏打开时锁过背景滚动，这里一律恢复 */
  function afterTaskDetailClose() {
    document.body.style.overflow = '';
  }

  window.taskDetailFactsHtml = factsHtml;
  window.taskDetailProofHtml = proofHtmlOf;
  window.openTaskProofImage = openTaskProofImage;
  window.onTaskProofImageError = onTaskProofImageError;
  window.taskDetailPubCardHtml = pubCardHtml;
  window.taskDetailFoldMoreHtml = foldMoreHtml;
  window.taskDetailRuleHtml = ruleHtml;
  window.taskDetailStatusAmountHtml = statusAmountHtml;
  window.toggleTaskFold = toggleTaskFold;
  window.afterTaskDetailOpen = afterTaskDetailOpen;
  window.taskDetailAfterClose = afterTaskDetailClose;
})();
