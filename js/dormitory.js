(function (global) {
  'use strict';

  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_FILES = 5;
  var selectedSchool = '';
  var profileGeneration = 0;
  var mineGeneration = 0;
  var uploadBusy = false;
  var noteBusy = false;
  var searchTimer = null;
  var visibleSchoolCount = 80;
  var reviewImageUrls = [];

  function revokeReviewImageUrls() {
    reviewImageUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    reviewImageUrls = [];
  }

  function loadReviewImage(image) {
    var token = sessionStorage.getItem('token');
    var headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    return global.fetch((global.API_BASE || '') + '/api/dormitories/review/images/' + encodeURIComponent(image.id), { headers: headers })
      .then(function (response) {
        if (!response.ok) throw new Error('无法读取待审核图片');
        return response.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        reviewImageUrls.push(url);
        var target = document.querySelector('[data-review-image-id="' + image.id + '"]');
        if (target) target.src = url;
        else URL.revokeObjectURL(url);
      })
      .catch(function () {
        var target = document.querySelector('[data-review-image-id="' + image.id + '"]');
        if (target) target.alt = '待审核图片加载失败';
      });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  // 资料来源由后台维护，渲染前只允许 http/https，避免把 javascript: 等协议写入 href。
  function safeHttpUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!/^https?:\/\//i.test(raw) || typeof global.URL !== 'function') return '';
    try {
      var parsed = new global.URL(raw, global.location && global.location.href ? global.location.href : 'http://localhost/');
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }
  function coverMarkup(school, compact) {
    var label = escapeHtml(displayName(school));
    return '<div class="dormitory-cover' + (compact ? ' dormitory-cover-small' : '') + '" role="img" aria-label="' + label + ' 原创封面，非宿舍实拍">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" aria-hidden="true" focusable="false"><defs><linearGradient id="dcg" x2="1" y2="1"><stop stop-color="#d8e8f1"/><stop offset="1" stop-color="#efdfef"/></linearGradient></defs><rect width="480" height="240" fill="url(#dcg)"/><circle cx="390" cy="65" r="66" fill="#fff" opacity=".3"/><path d="M0 180 Q150 120 275 180 T480 175 V240 H0Z" fill="#aac9cf" opacity=".6"/><path d="M92 166V99l145-65 145 65v67M125 165v-54h224v54" fill="none" stroke="#738ba1" stroke-width="8" stroke-linejoin="round"/><path d="M180 165v-34h55v34m36 0v-34h55v34" fill="none" stroke="#738ba1" stroke-width="6"/></svg>' +
      '<span class="dormitory-cover-caption"><strong>' + label + '</strong><small>原创封面 · 非宿舍实拍</small></span></div>';
  }

  /* BL_SCHOOLS 里有 40 个重复校名（2361 条 / 2321 所），不去重会让目录里
     同一所学校出现两次、且对外统计数字虚高。这里只在渲染层去重，
     不动共享的 bl-schools.js（黑榜页与注册联想也用它）。 */
  var uniqueSchoolCache = null;
  function schools() {
    if (!Array.isArray(global.BL_SCHOOLS)) return [];
    if (uniqueSchoolCache && uniqueSchoolCache.source === global.BL_SCHOOLS) return uniqueSchoolCache.list;
    var seen = {};
    var list = [];
    global.BL_SCHOOLS.forEach(function (name) {
      if (!name || seen[name]) return;
      seen[name] = true;
      list.push(name);
    });
    uniqueSchoolCache = { source: global.BL_SCHOOLS, list: list };
    return list;
  }

  function displayName(name) {
    return '蛋蛋世界的 ' + name;
  }

  /* 宿舍事实数据（js/dormitory-facts.js，gzip 后约 143KB）改为进入宿舍页时才加载。
     它原本在 <head> 里同步引入，而数据只有宿舍页用得上，却会把全站首屏一起拖慢
     （实测 1.5Mbps 弱网：首屏 FCP 4.54s → 按需加载后 3.04s）。 */
  var FACTS_URL = 'js/dormitory-facts.js?v=20261003';
  var factsState = 'idle';   /* idle | loading | ready | error */
  var factsWaiters = [];
  var directoryQuery = '';

  /* 能否真的去按需拉脚本：真实浏览器总是满足；
     无 document 的模拟环境（单元测试沙箱）则不尝试加载，退回原有行为。 */
  function canLazyLoad() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function' &&
      !!(document.head || document.documentElement);
  }

  function factsReady() {
    return factsState === 'ready' || !!global.DORMITORY_FACTS || !canLazyLoad();
  }

  function settleFacts(ok) {
    factsState = ok ? 'ready' : 'error';
    var waiters = factsWaiters;
    factsWaiters = [];
    waiters.forEach(function (callback) { callback(ok); });
  }

  /* 按需加载：并发调用只插一次 script；失败后允许重试，不会永久卡在错误态。 */
  function loadFacts(callback) {
    if (factsReady()) { callback(true); return; }
    if (!canLazyLoad()) { callback(false); return; }
    if (factsState === 'error') factsState = 'idle';
    factsWaiters.push(callback);
    if (factsState === 'loading') return;
    factsState = 'loading';
    var script = document.createElement('script');
    script.src = FACTS_URL;
    script.async = true;
    script.onload = function () { settleFacts(!!global.DORMITORY_FACTS); };
    script.onerror = function () { settleFacts(false); };
    (document.head || document.documentElement).appendChild(script);
  }

  function factsPlaceholder(list) {
    if (factsState === 'error') {
      list.innerHTML = '<div class="dormitory-empty">宿舍资料数据加载失败。<button type="button" id="dormitoryFactsRetry">重新加载</button></div>';
      return;
    }
    list.innerHTML = '<div class="dormitory-empty">正在加载宿舍资料…</div>';
  }

  function sourcedFacts(school) {
    var directory = global.DORMITORY_FACTS || {};
    return Array.isArray(directory[school]) ? directory[school] : [];
  }

  function concreteFacts(school) {
    return sourcedFacts(school).filter(function (row) { return row.sourceType !== 'research_notice'; });
  }

  function hasResearchNotice(school) {
    return sourcedFacts(school).some(function (row) { return row.sourceType === 'research_notice'; });
  }

  function sourceLabel(row) {
    if (row.sourceType === 'official_public') return '校方公开资料·待核实';
    if (row.sourceType === 'third_party') return '第三方资料·待核实';
    if (row.sourceType === 'public_search_lead') return '公开搜索线索·待核实';
    if (row.sourceType === 'community_lead') return '社区线索·低可信';
    if (row.sourceType === 'catalog_profile') return '目录预置说明·待补证据';
    if (row.sourceType === 'research_notice') return '公开检索记录·待补';
    return '校方资料';
  }

  /* 把「房型线索：…；床型线索：…」这类分段描述拆成可扫描的标签，
     信息原本就在 description 里，只是被埋在长句里无法快速提取。 */
  var CLUE_LABELS = ['房型线索', '床型线索', '卫浴线索', '校区线索', '楼栋线索', '配套线索', '公开数据库标注', '宿舍楼名称线索', '公开搜索线索', '宿舍线索'];
  var CLUE_TAILS = ['以上为已有公开记录的结构化摘要', '未列明的配置不作推断', '当前分配与具体楼栋待核实',
    '这不是学校实际配置结论', '来源为公开宿舍信息库', '来源为第三方公开页面', '以上为第三方页面线索',
    '本条仅用于提示待补', '不代表学校实际住宿配置', '欢迎用户提交文字和图片', '经审核后补充',
    '该学校公开资料暂缺可核验宿舍参数', '已登记一条社区/检索线索入口', '低可信线索', '不据此推断房型',
    '目录沿用旧校名', '当前配置待核实'];

  function clueTail(text) {
    return CLUE_TAILS.some(function (tail) { return text.indexOf(tail) >= 0; });
  }

  function factClues(row) {
    var description = String(row.description == null ? '' : row.description);
    if (!description) return [];
    return description.split(/[；;]/).map(function (part) { return part.trim(); }).filter(function (part) {
      if (!part) return false;
      if (clueTail(part)) return false;
      var match = part.match(/^([^：:]{2,10})[：:]([\s\S]+)$/);
      if (!match) return false;
      return CLUE_LABELS.indexOf(match[1]) >= 0 && match[2].trim().length > 0;
    }).map(function (part) {
      var match = part.match(/^([^：:]{2,10})[：:]([\s\S]+)$/);
      return { label: match[1], text: match[2].trim() };
    });
  }

  /* 一条记录是否含可直接使用的住宿配置（房型/床型/卫浴），用于列表徽标与排序。 */
  function factHasConfig(row) {
    var values = [row.occupancy, row.bedType, row.bathroom];
    for (var i = 0; i < values.length; i++) {
      if (values[i] && String(values[i]).trim()) return true;
    }
    return factClues(row).some(function (clue) {
      return clue.label === '房型线索' || clue.label === '床型线索' || clue.label === '卫浴线索';
    });
  }

  function schoolHasConfig(school) {
    return concreteFacts(school).some(factHasConfig);
  }

  var SOURCE_ORDER = ['official_public', 'official', 'third_party', 'public_search_lead', 'community_lead', 'catalog_profile', 'research_notice'];

  function sourceRank(row) {
    var index = SOURCE_ORDER.indexOf(row.sourceType || 'official');
    return index < 0 ? SOURCE_ORDER.length : index;
  }

  /* 列表排序：先按「有没有房型/床型/卫浴」把能直接用的排前面，
     再按可信度（校方 > 第三方 > 线索 > 待补），最后按校区楼栋稳定排序。
     同一所学校原来的顺序是录入顺序，读者要逐条读完才知道哪条有用。 */
  function orderedFacts(school) {
    return concreteFacts(school).slice().sort(function (a, b) {
      var config = (factHasConfig(b) ? 1 : 0) - (factHasConfig(a) ? 1 : 0);
      if (config) return config;
      var rank = sourceRank(a) - sourceRank(b);
      if (rank) return rank;
      var keyA = String(a.campus || '') + '|' + String(a.building || '');
      var keyB = String(b.campus || '') + '|' + String(b.building || '');
      return keyA < keyB ? -1 : (keyA > keyB ? 1 : 0);
    });
  }

  /* 证据概览：把原来塞在一句话里、读者根本无法扫读的来源统计做成徽标。 */
  function evidenceOverview(school) {
    var rows = sourcedFacts(school);
    var concrete = concreteFacts(school);
    var counts = {};
    rows.forEach(function (row) { var key = row.sourceType || 'official'; counts[key] = (counts[key] || 0) + 1; });
    var badges = [];
    function push(label, n, cls) {
      if (n > 0) badges.push('<span class="dormitory-glance-badge ' + cls + '">' + escapeHtml(label) + ' ' + n + '</span>');
    }
    push('房型/床型/卫浴', concrete.filter(factHasConfig).length, 'is-ok');
    push('第三方待核实', counts.third_party || 0, 'is-warn');
    push('校方公开', (counts.official_public || 0) + (counts.official || 0), 'is-warn');
    push('公开搜索线索', counts.public_search_lead || 0, 'is-warn');
    push('社区线索·低可信', counts.community_lead || 0, 'is-warn');
    push('目录预置说明', counts.catalog_profile || 0, 'is-muted');
    push('公开检索记录', counts.research_notice || 0, 'is-muted');
    if (!badges.length) badges.push('<span class="dormitory-glance-badge is-muted">暂无预置记录</span>');
    return '<section class="dormitory-glance"><p class="dormitory-glance-title">证据概览（数字=记录条数，均可点开溯源）</p>' +
      '<div class="dormitory-glance-badges">' + badges.join('') + '</div></section>';
  }

  function buildingCard(row, index) {
    var link = safeHttpUrl(row.sourceUrl);
    var source = link ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">查看原始来源（新窗口）</a>' : '';
    var paragraphs = Array.isArray(row.sourceContent) ? row.sourceContent.filter(function (text) { return typeof text === 'string' && text.trim(); }) : [];
    var content = paragraphs.length ? '<section class="dormitory-source-content"><h5>信源内容（页内阅读）</h5>' +
      paragraphs.map(function (text) { return '<p>' + escapeHtml(text) + '</p>'; }).join('') +
      '<p class="dormitory-source">依据历史记录转述的要点，不是原站全文；当前情况仍需核实。</p></section>' : '';
    var clues = factClues(row).filter(function (clue) {
      /* 校区/楼栋已在卡片标题展示；字段有值时不再重复出现在线索条里，
         只有字段为空、信息只存在于描述中时才用线索补充。 */
      if (clue.label === '校区线索' && String(row.campus || '').trim()) return false;
      if (clue.label === '楼栋线索' && String(row.building || '').trim()) return false;
      return true;
    }).map(function (clue) {
      return '<span class="dormitory-clue"><b>' + escapeHtml(clue.label.replace('线索', '')) + '</b>' + escapeHtml(clue.text) + '</span>';
    }).join('');
    var location = [row.campus || '校区待核实', row.building || '楼号待核实'].join(' · ');
    return '<article class="dormitory-building' + (factHasConfig(row) ? ' dormitory-building--config' : '') + '">' +
      '<h4><span class="dormitory-building-index">' + (index + 1) + '</span>' + escapeHtml(location) + '</h4>' +
      '<p class="dormitory-building-scope">适用范围：' + escapeHtml(row.scope || '待核实') + '</p>' +
      '<div class="dormitory-building-attributes">' +
      '<span class="dormitory-attr' + (row.occupancy ? ' dormitory-attr-set' : ' dormitory-attr-unknown') + '">几人间：' + escapeHtml(row.occupancy || '待核实') + '</span>' +
      '<span class="dormitory-attr' + (row.bedType ? ' dormitory-attr-set' : ' dormitory-attr-unknown') + '">床型' + (row.bedType ? '：' + escapeHtml(row.bedType) : '待核实') + '</span>' +
      '<span class="dormitory-attr' + (row.bathroom ? ' dormitory-attr-set' : ' dormitory-attr-unknown') + '">卫浴' + (row.bathroom ? '：' + escapeHtml(row.bathroom) : '待核实') + '</span></div>' +
      (clues ? '<div class="dormitory-clues">' + clues + '</div>' : '') +
      content +
      (row.description ? '<details class="dormitory-building-details"><summary>资料摘要（点击展开原文）</summary><p class="dormitory-building-description">' + escapeHtml(row.description) + '</p></details>' : '') +
      '<p class="dormitory-source">' + sourceLabel(row) + ' · ' + escapeHtml(row.sourceTitle || '来源未注明') + ' · ' + escapeHtml(row.sourceYearLabel || row.sourceYear || '发表年份未注明') + (row.accessedAt ? ' · ' + escapeHtml(row.accessedAt) + '查阅' : '') + '</p>' +
      (source ? '<details class="dormitory-source-details"><summary>查看来源与溯源链接（可选）</summary><p>' + source + '</p></details>' : '') + '</article>';
  }

  function curatedFactsMarkup(school) {
    var rows = sourcedFacts(school);
    if (!rows.length) return '';
    var ordered = orderedFacts(school);
    var notice = rows.some(function (row) { return row.sourceType === 'research_notice'; });
    var configCount = ordered.filter(factHasConfig).length;
    var summary = '<p class="dormitory-building-disclaimer">以下 ' + ordered.length + ' 条记录中，' + configCount +
      ' 条含房型/床型/卫浴线索已排在最前；其余为校方公开、第三方或线索类记录，均可能尚未逐楼核实。' +
      '点击「资料摘要」可展开原文，来源与年份见每条末尾。</p>';
    var cards = ordered.map(buildingCard).join('');
    var noticeBlock = notice ? '<p class="dormitory-notice-record">另有 1 条公开检索记录：截至检索日暂未找到该校可直接核验的房型、床型、卫浴或楼栋说明，仅用于提示待补，不代表学校实际住宿配置。欢迎你补充文字或图片。</p>' : '';
    var emptyBlock = ordered.length ? '' : '<div class="dormitory-empty">该校暂无具体房型记录，欢迎投稿补充。</div>';
    return '<section class="dormitory-building-section"><h3>宿舍资料（按可用性排序）</h3>' + summary + cards + emptyBlock + noticeBlock + '</section>';
  }

  function openDirectory() {
    if (typeof global.go === 'function') global.go('dormitories');
  }

  function openReview() {
    if (typeof global.go === 'function') global.go('dormitory-review');
  }

  function schoolStateLabel(school) {
    var rows = concreteFacts(school);
    if (!rows.length) return hasResearchNotice(school) ? '公开资料待补' : '暂无资料·欢迎投稿';
    if (rows.some(function (row) { return row.sourceType === 'third_party'; })) return '有第三方资料·待核实';
    if (rows.some(function (row) { return row.sourceType === 'official_public'; })) return '有校方公开资料·待核实';
    if (rows.some(function (row) { return row.sourceType === 'public_search_lead'; })) return '有公开搜索线索·待核实';
    if (rows.some(function (row) { return row.sourceType === 'community_lead'; })) return '有社区线索·低可信';
    if (rows.some(function (row) { return row.sourceType === 'catalog_profile'; })) return '已预置宿舍说明·待补证据';
    return '有校方资料';
  }

  /* 卡片上直接给出「具体写了什么」，而不是只给一句来源标签：
     房型/床型/卫浴任一项有值就摘要展示，让读者不点开也能提取信息。 */
  function schoolPreview(school) {
    var rows = orderedFacts(school);
    var bits = [];
    function take(value, label) {
      if (value && String(value).trim() && bits.length < 3) {
        bits.push('<span class="dormitory-school-bit"><b>' + escapeHtml(label) + '</b>' + escapeHtml(String(value)) + '</span>');
      }
    }
    for (var i = 0; i < rows.length && bits.length < 3; i++) {
      take(rows[i].occupancy, '房型');
      take(rows[i].bedType, '床型');
      take(rows[i].bathroom, '卫浴');
    }
    if (!bits.length) {
      var clues = [];
      for (var j = 0; j < rows.length && clues.length < 3; j++) {
        factClues(rows[j]).forEach(function (clue) {
          if (clues.length < 3 && ['房型线索', '床型线索', '卫浴线索'].indexOf(clue.label) >= 0) {
            clues.push('<span class="dormitory-school-bit"><b>' + escapeHtml(clue.label.replace('线索', '')) + '</b>' + escapeHtml(clue.text) + '</span>');
          }
        });
      }
      bits = clues;
    }
    return bits.join('');
  }

  /* 目录筛选与排序：原来只能按校名搜，且 2321 所里 1941 所只有 1 条记录，
     读者无法把「真的写了房型」的学校挑出来。 */
  var directoryFilter = 'all';
  var directorySort = 'useful';
  var DIRECTORY_FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'config', label: '含房型/床型/卫浴' },
    { id: 'third_party', label: '第三方资料' },
    { id: 'official', label: '校方公开资料' },
    { id: 'lead', label: '仅线索/待补' }
  ];

  function matchesDirectoryFilter(school) {
    var rows = concreteFacts(school);
    if (directoryFilter === 'config') return rows.some(factHasConfig);
    if (directoryFilter === 'third_party') return rows.some(function (row) { return row.sourceType === 'third_party'; });
    if (directoryFilter === 'official') return rows.some(function (row) { return row.sourceType === 'official_public' || row.sourceType === 'official' || !row.sourceType; });
    if (directoryFilter === 'lead') return rows.length > 0 && !rows.some(factHasConfig);
    return true;
  }

  function directoryFilterMarkup() {
    return '<div class="dormitory-toolbar" role="group" aria-label="目录筛选">' +
      DIRECTORY_FILTERS.map(function (item) {
        return '<button type="button" class="dormitory-filter' + (directoryFilter === item.id ? ' active' : '') +
          '" data-dormitory-filter="' + item.id + '">' + escapeHtml(item.label) + '</button>';
      }).join('') +
      '<button type="button" class="dormitory-sort" data-dormitory-sort="1">排序：' + (directorySort === 'useful' ? '有信息优先' : '目录原序') + '</button>' +
      '<span class="dormitory-result-count" id="dormitoryResultCount" role="status"></span></div>';
  }

  function renderSearch(query) {
    directoryQuery = String(query == null ? '' : query);
    var list = document.getElementById('dormitorySchoolResults');
    var count = document.getElementById('dormitoryDirectoryCount');
    var toolbar = document.getElementById('dormitoryToolbar');
    if (!list) return;
    if (!factsReady()) {
      factsPlaceholder(list);
      if (factsState !== 'error') loadFacts(function () { renderSearch(directoryQuery); });
      return;
    }
    var q = directoryQuery.trim().replace(/^蛋蛋世界的\s*/, '');
    var matched = schools().filter(function (school) {
      return (!q || school.indexOf(q) >= 0) && matchesDirectoryFilter(school);
    });
    if (directorySort === 'useful') {
      matched = matched.slice().sort(function (a, b) {
        var gap = (schoolHasConfig(b) ? 1 : 0) - (schoolHasConfig(a) ? 1 : 0);
        if (gap) return gap;
        var countGap = concreteFacts(b).length - concreteFacts(a).length;
        if (countGap) return countGap;
        return 0;
      });
    }
    if (toolbar) toolbar.innerHTML = directoryFilterMarkup();
    if (count) {
      var entries = schools().filter(function (school) { return concreteFacts(school).length; });
      var configSchools = entries.filter(schoolHasConfig).length;
      count.textContent = '中国大陆高校目录 · 共 ' + schools().length + ' 所 · 已收录资料 ' + entries.length +
        ' 所 · 其中 ' + configSchools + ' 所写了房型/床型/卫浴';
    }
    var resultCount = document.getElementById('dormitoryResultCount');
    if (resultCount) resultCount.textContent = '匹配 ' + matched.length + ' 所' + (q ? '（关键词：' + q + '）' : '');
    list.innerHTML = matched.length ? matched.slice(0, visibleSchoolCount).map(function (school) {
      var preview = schoolPreview(school);
      var rows = concreteFacts(school).length;
      return '<button type="button" class="dormitory-school-card" data-school="' + escapeHtml(school) + '">' +
        '<span class="dormitory-school-name">' + escapeHtml(displayName(school)) + '</span>' +
        (preview ? '<span class="dormitory-school-bits">' + preview + '</span>' : '<span class="dormitory-school-bits dormitory-school-bits-empty">暂无可提取的房型信息</span>') +
        '<span class="dormitory-school-state">' + schoolStateLabel(school) + ' · ' + rows + ' 条记录 →</span></button>';
    }).join('') + (matched.length > visibleSchoolCount ? '<button type="button" id="dormitoryShowMore">加载更多学校（剩余 ' + (matched.length - visibleSchoolCount) + ' 所）</button>' : '') : '<div class="dormitory-empty">没有找到匹配的高校，换个关键词或切回「全部」试试。</div>';
  }

  function loadProfile(school) {
    selectedSchool = school;
    var generation = ++profileGeneration;
    /* 宿舍事实数据还在按需加载时：先渲染动态资料与封面，
       数据到达后再补一次渲染，避免点了学校却什么都不显示。 */
    if (!factsReady()) {
      loadFacts(function () {
        if (selectedSchool === school) loadProfile(school);
      });
    }
    var title = document.getElementById('dormitoryDetailTitle');
    var body = document.getElementById('dormitoryDetailBody');
    if (!body) return;
    if (title) title.textContent = displayName(school);
    var curated = curatedFactsMarkup(school);
    body.innerHTML = '<h3 class="dormitory-detail-school">' + escapeHtml(school) + '</h3>' + evidenceOverview(school) + curated + '<div class="dormitory-empty">正在载入用户投稿资料…</div>';
    global.fetch((global.API_BASE || '') + '/api/dormitories?school=' + encodeURIComponent(school), {
      headers: (function () {
        var headers = {};
        var token = sessionStorage.getItem('token');
        if (token) headers.Authorization = 'Bearer ' + token;
        return headers;
      })()
    }).then(function (response) {
      if (httpFailed(response)) throw new Error('读取资料失败');
      return response.json();
    }).then(function (result) {
      if (!result || result.code !== 200 || !result.data) throw new Error(result && result.msg || '读取资料失败');
      if (selectedSchool !== school || profileGeneration !== generation) return;
      var item = result.data;
      var hasInfo = item.occupancy || item.roomConfiguration || item.facilities || item.accommodationCost;
      var details = hasInfo ? '<div class="dormitory-facts">' + [
        ['住宿人数', item.occupancy], ['床位与房间配置', item.roomConfiguration],
        ['设施', item.facilities], ['住宿费', item.accommodationCost]
      ].filter(function (row) { return row[1]; }).map(function (row) {
        return '<div class="dormitory-fact"><b>' + row[0] + '</b><span>' + escapeHtml(row[1]) + '</span></div>';
      }).join('') + '</div>' : '<div class="dormitory-empty">暂无动态资料，欢迎提交宿舍照片或文字说明。</div>';
      var sourceUrl = safeHttpUrl(item.sourceUrl);
      var source = sourceUrl ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看资料来源</a>' : '';
      var verification = item.verificationStatus === 'verified' ? '已核实' : (item.verificationStatus === 'partial' ? '部分核实' : (item.verificationStatus === 'unavailable' ? '暂无资料' : '待核实'));
      var images = (Array.isArray(item.images) ? item.images : []).map(function (image) {
        return '<figure class="dormitory-image"><img class="dormitory-public-image" loading="lazy" src="' + escapeHtml(image.imageUrl) + '" alt="' + escapeHtml(displayName(school)) + ' 宿舍照片"><figcaption>' + escapeHtml(image.campus || '校区未提供') + ' · ' + escapeHtml(image.building || '楼号未提供') + ' · 用户上传 · 已审核</figcaption></figure>';
      }).join('');
      body.innerHTML = '<h3 class="dormitory-detail-school">' + escapeHtml(school) + '</h3>' + evidenceOverview(school) + curated + details + '<p class="dormitory-source">' + verification + (item.sourceYear ? ' · 来源年份 ' + escapeHtml(item.sourceYear) : '') + (source ? ' · ' + source : '') + '</p>' + (item.note ? '<p class="dormitory-note">' + escapeHtml(item.note) + '</p>' : '') +
        (images ? '<p class="dormitory-source">以下为已审核的用户照片；照片是否为房间内部及具体楼栋仍需以图片和说明核对。</p><div class="dormitory-images">' + images + '</div>' : '<p class="dormitory-empty">暂无已核实的宿舍内部实拍</p>') +
        '<details class="dormitory-cover-details"><summary>查看本校占位封面说明</summary>' + coverMarkup(school, false) + '</details>';
      renderApprovedNotes(school, generation);
    }).catch(function (error) {
      if (selectedSchool !== school || profileGeneration !== generation) return;
      body.innerHTML = '<h3 class="dormitory-detail-school">' + escapeHtml(school) + '</h3>' + evidenceOverview(school) + curated + (curated ? '' : '<div class="dormitory-empty">该校暂无预置宿舍描述，欢迎投稿补充。</div>') + '<div class="dormitory-empty">暂时无法读取资料（动态内容），请稍后重试。</div>' +
        '<details class="dormitory-cover-details"><summary>查看本校占位封面说明</summary>' + coverMarkup(school, false) + '</details>';
      renderApprovedNotes(school, generation);
    });
  }

  function renderApprovedNotes(school, generation) {
    if (typeof global.apiGet !== 'function') return;
    global.apiGet('/api/dormitories/notes?school=' + encodeURIComponent(school)).then(function (result) {
      if (selectedSchool !== school || profileGeneration !== generation) return;
      var body = document.getElementById('dormitoryDetailBody');
      if (!body) return;
      if (!result || result.code !== 200 || !Array.isArray(result.data)) throw new Error('文字资料读取失败');
      var rows = result.data;
      var list = rows.map(function (item) {
        var link = safeHttpUrl(item.sourceUrl);
        return '<article class="dormitory-note-entry"><strong>' + escapeHtml(item.campus || '校区未提供') + ' · ' + escapeHtml(item.building || '楼号未提供') + '</strong><p>' + escapeHtml(item.content) + '</p>' + (link ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">资料来源</a>' : '') + '</article>';
      }).join('');
      body.insertAdjacentHTML('beforeend', '<section class="dormitory-notes"><h3>已审核的宿舍文字</h3>' + (list || '<p>暂无已审核文字</p>') + '</section>');
    }).catch(function () {
      if (selectedSchool !== school || profileGeneration !== generation) return;
      var body = document.getElementById('dormitoryDetailBody');
      if (body) body.insertAdjacentHTML('beforeend', '<section class="dormitory-notes"><h3>已审核的宿舍文字</h3><p>文字资料读取失败，请稍后重试。</p></section>');
    });
  }

  // 个人记录读取不通过会清理登录态的共享封装；旧 GET 不能使新会话退出。
  function readMine(path, token) {
    return global.fetch((global.API_BASE || '') + path, {
      method: 'GET', headers: { Authorization: 'Bearer ' + token }
    }).then(function (response) {
      if (httpFailed(response)) throw new Error('记录读取失败');
      return response.json();
    });
  }

  function renderMine() {
    var generation = ++mineGeneration;
    var token = sessionStorage.getItem('token');
    var uploads = document.getElementById('dormitoryMyUploads');
    var notes = document.getElementById('dormitoryMyNotes');
    if (!uploads && !notes) return;
    if (!global.USER || !global.USER.registered || !token) {
      if (uploads) uploads.textContent = '请先登录后查看上传记录。';
      if (notes) notes.textContent = '请先登录后查看文字投稿记录。';
      return;
    }
    function isCurrent() {
      return generation === mineGeneration && sessionStorage.getItem('token') === token &&
        global.USER && global.USER.registered;
    }
    // 换账号或重试时先移除上次内容，防止旧账号记录残留。
    if (uploads) uploads.textContent = '正在读取上传记录…';
    if (notes) notes.textContent = '正在读取文字投稿记录…';
    readMine('/api/dormitories/mine', token).then(function (result) {
      if (!isCurrent()) return;
      var el = document.getElementById('dormitoryMyUploads');
      if (!el) return;
      if (!result || result.code !== 200 || !Array.isArray(result.data)) throw new Error('记录读取失败');
      var rows = result.data;
      el.innerHTML = rows.length ? rows.map(function (item) {
        return '<div class="dormitory-upload-row"><b>' + escapeHtml(displayName(item.schoolName)) + '</b><span>' +
          escapeHtml({ pending: '待审核', approved: '已通过', rejected: '已驳回' }[item.status] || item.status) + '</span>' +
          (item.reviewReason ? '<small>驳回原因：' + escapeHtml(item.reviewReason) + '</small>' : '') + '</div>';
      }).join('') : '<div class="dormitory-empty">你还没有上传记录。</div>';
    }).catch(function () {
      if (!isCurrent()) return;
      var el = document.getElementById('dormitoryMyUploads');
      if (el) el.textContent = '上传记录读取失败，请稍后重试或重新登录。';
    });
    readMine('/api/dormitories/mine/notes', token).then(function (result) {
      if (!isCurrent()) return;
      var el = document.getElementById('dormitoryMyNotes');
      if (!el) return;
      if (!result || result.code !== 200 || !Array.isArray(result.data)) throw new Error('记录读取失败');
      var rows = result.data;
      el.innerHTML = rows.length ? rows.map(function (item) {
        return '<div class="dormitory-upload-row"><b>' + escapeHtml(displayName(item.schoolName)) + '</b><span>' + escapeHtml(item.content) + '</span><small>' + escapeHtml(({ pending: '待审核', approved: '已通过', rejected: '已驳回' }[item.status] || item.status)) + '</small>' + (item.reviewReason ? '<small>驳回原因：' + escapeHtml(item.reviewReason) + '</small>' : '') + '</div>';
      }).join('') : '<div class="dormitory-empty">你还没有文字投稿。</div>';
    }).catch(function () {
      if (!isCurrent()) return;
      var el = document.getElementById('dormitoryMyNotes');
      if (el) el.textContent = '文字投稿记录读取失败，请稍后重试或重新登录。';
    });
  }

  function renderReview() {
    if (typeof global.apiGet !== 'function') return;
    global.apiGet('/api/dormitories/review/pending').then(function (result) {
      var el = document.getElementById('dormitoryReviewList');
      if (!el) return;
      if (result.code !== 200) {
        el.innerHTML = '<div class="dormitory-empty">' + escapeHtml(result.msg || '暂无审核权限') + '</div>';
        return;
      }
      var rows = Array.isArray(result.data) ? result.data : [];
      revokeReviewImageUrls();
      el.innerHTML = rows.length ? rows.map(function (item) {
        return '<article class="dormitory-review-card"><h3>' + escapeHtml(displayName(item.schoolName)) + '</h3>' +
          '<img class="dormitory-review-image" data-review-image-id="' + encodeURIComponent(item.id) + '" alt="待审核的宿舍照片" loading="lazy">' +
          '<p>' + escapeHtml(item.campus || '校区未提供') + ' · ' + escapeHtml(item.building || '楼号未提供') + '</p><p>提交时间：' + escapeHtml(item.createdAt || '') + '</p>' +
          '<div class="dormitory-review-actions"><button type="button" data-review="approve" data-id="' + item.id + '">通过</button>' +
          '<button type="button" data-review="reject" data-id="' + item.id + '">驳回</button></div></article>';
      }).join('') : '<div class="dormitory-empty">当前没有待审核图片。</div>';
      rows.forEach(loadReviewImage);
    });
    global.apiGet('/api/dormitories/review/notes/pending').then(function (result) {
      var el = document.getElementById('dormitoryReviewNotes');
      if (!el) return;
      if (result.code !== 200) { el.textContent = result.msg || '暂无审核权限'; return; }
      var rows = Array.isArray(result.data) ? result.data : [];
      el.innerHTML = rows.length ? rows.map(function (item) {
        return '<article class="dormitory-review-card"><h3>' + escapeHtml(displayName(item.schoolName)) + '</h3><p>' + escapeHtml(item.campus || '校区未提供') + ' · ' + escapeHtml(item.building || '楼号未提供') + '</p><p>' + escapeHtml(item.content) + '</p><div class="dormitory-review-actions"><button type="button" data-review-note="approve" data-id="' + encodeURIComponent(item.id) + '">通过</button><button type="button" data-review-note="reject" data-id="' + encodeURIComponent(item.id) + '">驳回</button></div></article>';
      }).join('') : '<div class="dormitory-empty">当前没有待审核文字。</div>';
    });
  }

  function reviewImage(id, approve) {
    var reason = approve ? '' : window.prompt('驳回原因（可留空）');
    if (reason === null) return;
    global.apiPost('/api/dormitories/review/' + encodeURIComponent(id), { approve: approve, reason: reason }).then(function (result) {
      if (result.code === 200) renderReview();
      else if (typeof global.toast === 'function') global.toast(result.msg || '审核失败');
    });
  }

  function fieldValue(element) {
    return element ? element.value : '';
  }

  function lockControls(controls) {
    var previous = controls.map(function (control) { return control && control.disabled; });
    controls.forEach(function (control) { if (control) control.disabled = true; });
    return function () {
      controls.forEach(function (control, index) { if (control) control.disabled = previous[index]; });
    };
  }

  function httpFailed(response) {
    return !response || response.ok === false ||
      (typeof response.status === 'number' && (response.status < 200 || response.status >= 300));
  }

  async function submitNote() {
    if (noteBusy) return;
    var status = document.getElementById('dormitoryNoteStatus');
    var content = document.getElementById('dormitoryNoteContent');
    var source = document.getElementById('dormitoryNoteSource');
    var campus = document.getElementById('dormitoryNoteCampus');
    var building = document.getElementById('dormitoryNoteBuilding');
    var button = document.getElementById('dormitoryNoteSubmit');
    if (!global.USER || !global.USER.registered) { if (status) status.textContent = '请先登录'; return; }
    var snapshot = { school: selectedSchool, generation: profileGeneration, content: fieldValue(content), source: fieldValue(source), campus: fieldValue(campus), building: fieldValue(building) };
    if (!snapshot.school || !snapshot.content.trim() || snapshot.content.trim().length > 200) { if (status) status.textContent = '请先选学校并填写 1–200 字内容'; return; }
    if (snapshot.campus.trim().length > 100 || snapshot.building.trim().length > 100) { if (status) status.textContent = '校区和楼号分别不能超过 100 字'; return; }
    if (snapshot.source.trim().length > 1000) { if (status) status.textContent = '来源链接不能超过 1000 字'; return; }
    if (snapshot.source.trim() && !safeHttpUrl(snapshot.source)) { if (status) status.textContent = '来源链接仅支持 HTTP(S)'; return; }
    noteBusy = true;
    var unlock = lockControls([button, content, source, campus, building]);
    if (status) status.textContent = '正在提交 ' + snapshot.school + ' 的文字资料…';
    try {
      var headers = { 'Content-Type': 'application/json' };
      var token = sessionStorage.getItem('token');
      if (token) headers.Authorization = 'Bearer ' + token;
      var response = await global.fetch((global.API_BASE || '') + '/api/dormitories/notes', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ school: snapshot.school, campus: snapshot.campus.trim(), building: snapshot.building.trim(), content: snapshot.content.trim(), sourceUrl: snapshot.source.trim() })
      });
      if (response && response.status === 401) {
        // 请求返回前可能已经重新登录；不能让旧请求清掉新会话的 token。
        if (sessionStorage && typeof sessionStorage.getItem === 'function' && sessionStorage.getItem('token') === token && typeof sessionStorage.removeItem === 'function') sessionStorage.removeItem('token');
        throw new Error('登录已失效，请重新登录后再提交');
      }
      if (response && response.status === 403) throw new Error('没有投稿权限，请确认账号状态');
      if (httpFailed(response)) throw new Error('服务器返回异常（HTTP ' + (response && response.status || '未知') + '）');
      var result;
      try { result = JSON.parse(await response.text()); }
      catch (error) { throw new Error('服务器响应格式异常'); }
      if (!result || result.code !== 200) throw new Error(result && result.msg || '提交结果异常');
      if (status) status.textContent = snapshot.school + '的文字资料已提交，审核通过后公开，并奖励 5 个蛋蛋币。';
      // 返回前可能已切换学校或草稿；只清理这次实际提交的内容。
      if (selectedSchool === snapshot.school && profileGeneration === snapshot.generation &&
          fieldValue(content) === snapshot.content && fieldValue(source) === snapshot.source &&
          fieldValue(campus) === snapshot.campus && fieldValue(building) === snapshot.building && content) content.value = '';
      renderMine();
    } catch (error) {
      if (status) status.textContent = snapshot.school + '的文字提交未确认成功：' + (error && error.message || '网络异常') + '。草稿已保留，请先查看投稿记录，再决定是否手动重试。';
      renderMine();
    } finally {
      unlock();
      noteBusy = false;
    }
  }

  async function upload() {
    if (uploadBusy) return;
    var input = document.getElementById('dormitoryPhotoInput');
    var status = document.getElementById('dormitoryUploadStatus');
    var campus = document.getElementById('dormitoryPhotoCampus');
    var building = document.getElementById('dormitoryPhotoBuilding');
    var button = document.getElementById('dormitoryUploadButton');
    if (!global.USER || !global.USER.registered) {
      if (status) status.textContent = '请先登录后再上传';
      if (typeof global.toast === 'function') global.toast('请先登录后再上传');
      return;
    }
    var files = Array.prototype.slice.call((input && input.files) || []);
    if (files.length > MAX_FILES) { if (status) status.textContent = '每次最多选择 5 张图片。'; return; }
    if (!selectedSchool || !files.length) { if (status) status.textContent = '请先选择学校并添加图片。'; return; }
    if (files.some(function (file) { return file.size <= 0; })) { if (status) status.textContent = '不能上传空图片，请重新选择未损坏的图片。'; return; }
    var allowed = ['image/jpeg', 'image/png', 'image/webp'];
    var invalid = files.find(function (file) { return file.size > MAX_FILE_BYTES || allowed.indexOf(file.type) < 0; });
    if (invalid) { if (status) status.textContent = '仅支持 JPG、PNG、WebP；单张图片不能超过 5 MB。'; return; }
    var snapshot = { school: selectedSchool, generation: profileGeneration, campus: fieldValue(campus), building: fieldValue(building), files: files };
    if (snapshot.campus.trim().length > 100 || snapshot.building.trim().length > 100) { if (status) status.textContent = '校区和楼号分别不能超过 100 字'; return; }
    uploadBusy = true;
    var unlock = lockControls([button, input, campus, building]);
    if (status) status.textContent = '正在上传 ' + snapshot.school + ' 的照片…';
    try {
      var data = new FormData();
      data.append('school', snapshot.school);
      data.append('campus', snapshot.campus.trim());
      data.append('building', snapshot.building.trim());
      files.forEach(function (file) { data.append('files', file); });
      var headers = {};
      var token = sessionStorage.getItem('token');
      if (token) headers.Authorization = 'Bearer ' + token;
      var response = await global.fetch((global.API_BASE || '') + '/api/dormitories', { method: 'POST', headers: headers, body: data });
      // HTTP 错误不能被 JSON 中的成功码掩盖；代理可能返回 HTML 错误页。
      if (response.status === 413) throw new Error('图片过大或数量过多，服务器拒绝了这次上传（单张不超过 5 MB、最多 5 张）');
      if (response.status === 401) {
        // 请求返回前可能已经重新登录；不能让旧上传清掉新会话的 token。
        if (sessionStorage && typeof sessionStorage.getItem === 'function' && sessionStorage.getItem('token') === token && typeof sessionStorage.removeItem === 'function') sessionStorage.removeItem('token');
        throw new Error('登录已失效，请重新登录后再上传');
      }
      if (response.status === 403) throw new Error('没有上传权限，请确认账号状态');
      if (httpFailed(response)) throw new Error('服务器返回异常（HTTP ' + response.status + '）');
      var result;
      try { result = JSON.parse(await response.text()); }
      catch (error) { throw new Error('服务器响应格式异常'); }
      if (!result || result.code !== 200) throw new Error(result && result.msg || '上传结果异常');
      if (status) status.textContent = snapshot.school + '的照片已提交，审核通过后会公开展示。';
      var currentFiles = Array.prototype.slice.call((input && input.files) || []);
      if (selectedSchool === snapshot.school && profileGeneration === snapshot.generation &&
          fieldValue(campus) === snapshot.campus && fieldValue(building) === snapshot.building &&
          currentFiles.length === snapshot.files.length && currentFiles.every(function (file, index) { return file === snapshot.files[index]; }) && input) input.value = '';
      renderMine();
    } catch (error) {
      if (status) status.textContent = snapshot.school + '的照片上传未确认成功：' + (error && error.message || '网络异常') + '。已保留所选图片，请先查看上传记录，再决定是否手动重试。';
      renderMine();
    } finally {
      unlock();
      uploadBusy = false;
    }
  }

  document.addEventListener('error', function (event) {
    var image = event.target;
    if (image && image.classList && image.classList.contains('dormitory-public-image')) {
      var figure = image.closest('figure');
      if (figure) figure.innerHTML = '<span class="dormitory-image-failed">照片暂时不可用</span>';
    }
  }, true);

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'dormitorySchoolSearch') { visibleSchoolCount = 80; renderSearch(event.target.value); }
  });
  document.addEventListener('click', function (event) {
    var schoolCard = event.target.closest && event.target.closest('.dormitory-school-card');
    if (schoolCard) {
      loadProfile(schoolCard.getAttribute('data-school'));
      var detail = document.getElementById('dormitoryDetail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (event.target.id === 'dormitoryFactsRetry') { factsState = 'idle'; renderSearch(directoryQuery); return; }
    if (event.target.id === 'dormitoryShowMore') { visibleSchoolCount += 80; renderSearch(document.getElementById('dormitorySchoolSearch').value); }
    var filterButton = event.target.closest && event.target.closest('[data-dormitory-filter]');
    if (filterButton) {
      directoryFilter = filterButton.getAttribute('data-dormitory-filter') || 'all';
      visibleSchoolCount = 80;
      renderSearch(document.getElementById('dormitorySchoolSearch').value);
      return;
    }
    if (event.target.closest && event.target.closest('[data-dormitory-sort]')) {
      directorySort = directorySort === 'useful' ? 'original' : 'useful';
      visibleSchoolCount = 80;
      renderSearch(document.getElementById('dormitorySchoolSearch').value);
      return;
    }
    if (event.target.id === 'dormitoryUploadButton') upload();
    if (event.target.id === 'dormitoryNoteSubmit') submitNote();
    /* 文字投稿审核按钮同样要求「data-review-note + data-id」同时存在：
       与下面的照片审核同一个道理 —— 只匹配属性名时，任何带同名布尔属性的元素
       （别处再撞名、或渲染异常没带 id）都会被接走，拿 null 去请求审核接口。 */
    var noteButton = event.target.closest && event.target.closest('[data-review-note][data-id]');
    if (noteButton) {
      var noteId = noteButton.getAttribute('data-id');
      if (noteId) {
        var approveNote = noteButton.getAttribute('data-review-note') === 'approve';
        var reasonNote = approveNote ? '' : window.prompt('驳回原因（可留空）');
        if (reasonNote !== null) global.apiPost('/api/dormitories/review/notes/' + encodeURIComponent(noteId), { approve: approveNote, reason: reasonNote }).then(function (result) {
          if (result.code === 200) renderReview(); else if (typeof global.toast === 'function') global.toast(result.msg || '审核失败');
        });
      }
    }
    /* 只认宿舍审核卡自己的按钮：必须同时带 data-review 与 data-id。
       任务审核卡（审核中心）上也有一个布尔属性 data-review，若这里只匹配 [data-review]，
       点审核中心的卡片会被误当成宿舍「驳回」、拿 null 去请求宿舍接口（2026-09-25 线上 500）。 */
    var reviewButton = event.target.closest && event.target.closest('[data-review][data-id]');
    if (reviewButton) {
      var reviewId = reviewButton.getAttribute('data-id');
      if (reviewId) reviewImage(reviewId, reviewButton.getAttribute('data-review') === 'approve');
    }
  });

  function setReviewer(active) {
    var input = document.getElementById('dormitoryReviewerUserId');
    var status = document.getElementById('dormitoryReviewerStatus');
    var userId = input && input.value;
    if (!userId) { if (status) status.textContent = '请填写用户 ID。'; return; }
    global.apiPut('/api/dormitories/reviewers/' + encodeURIComponent(userId) + '?active=' + active).then(function (result) {
      if (status) status.textContent = result.code === 200 ? (active ? '已指定审核员。' : '已撤销审核权限。') : (result.msg || '操作失败');
    });
  }

  global.setDormitoryReviewer = setReviewer;
  global.openDormitoryDirectory = openDirectory;
  global.enterDormitoryPage = function () {
    loadFacts(function () {
      renderSearch(directoryQuery);
      renderMine();
    });
  };

  /* 首屏可交互后空闲时预取事实数据：首屏渲染不再被它拖慢，
     而用户真点进宿舍页时数据已在缓存里，避免「首屏快了、宿舍页反而慢」的拆东墙。
     实测（1.5Mbps）：不预取时点开宿舍页要等 1808ms；预取后恢复到首屏即数据就绪的体验。 */
  function prefetchFactsWhenIdle() {
    if (!canLazyLoad() || factsReady()) return;
    var start = function () {
      /* 延后一点，避开首屏自己的紧张竞争阶段 */
      setTimeout(function () {
        if (factsReady()) return;
        loadFacts(function () {});
      }, 1200);
    };
    if (typeof global.requestIdleCallback === 'function') {
      global.requestIdleCallback(start, { timeout: 4000 });
    } else {
      global.addEventListener('load', start, { once: true });
    }
  }
  prefetchFactsWhenIdle();
  global.openDormitoryReview = openReview;
  global.loadDormitoryProfile = loadProfile;
  global.renderDormitoryReview = renderReview;
  global.renderDormitoryMine = renderMine;
  global.renderDormitorySearch = renderSearch;
  global.MAX_DORMITORY_IMAGE_BYTES = MAX_FILE_BYTES;
  global.MAX_DORMITORY_IMAGE_COUNT = MAX_FILES;
})(window);
