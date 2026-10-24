/* 测评报告列表：/rs/career/reports.html
   读 /api/resume/career/reports，点卡片进 report.html?id=N 回看。 */
(function () {
  'use strict';

  var API_BASE = (window.EGGWORLD_API_BASE !== undefined)
    ? window.EGGWORLD_API_BASE
    : ((location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8080' : '');

  var list = document.getElementById('report-list');

  function token() {
    try { return sessionStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function empty(title, desc, withCta) {
    list.innerHTML = '<div class="flex flex-col items-center gap-3 py-16 text-center">'
      + '<div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">'
      + '<span class="material-symbols-outlined text-3xl">assignment</span></div>'
      + '<p class="mt-2 text-sm font-black text-[#111418] dark:text-white">' + esc(title) + '</p>'
      + '<p class="text-sm text-gray-500">' + esc(desc) + '</p>'
      + (withCta
        ? '<a href="index.html" class="mt-3 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white">去做第一次测评</a>'
        : '')
      + '</div>';
  }

  if (!token()) {
    empty('还没登录蛋蛋世界', '从蛋蛋世界的「学生工坊」进入，才能看到自己的测评报告。', false);
    return;
  }

  fetch(API_BASE + '/api/resume/career/reports', {
    headers: { Authorization: 'Bearer ' + token() }
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (!json || json.code !== 200) throw new Error((json && json.msg) || '报告记录读取失败');
      var rows = Array.isArray(json.data) ? json.data : [];
      if (!rows.length) {
        empty('还没有测评报告', '19 道题，3 分钟测出适合你的职业方向。', true);
        return;
      }
      list.innerHTML = rows.map(function (row) {
        var cost = Number(row.cost) > 0 ? '消耗 ' + row.cost + ' 蛋蛋币' : '免费';
        return '<a href="report.html?id=' + encodeURIComponent(row.id) + '"'
          + ' class="group flex items-center gap-5 rounded-2xl border border-[#e7e5e4] bg-white px-6 py-4 shadow-sm transition-all hover:border-[#111418] hover:shadow-lg">'
          + '<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">'
          + '<span class="material-symbols-outlined">assignment</span></span>'
          + '<span class="min-w-0 flex-1">'
          + '<span class="block truncate text-sm font-bold text-[#111418]">' + esc(row.headline || '职业测评报告') + '</span>'
          + '<span class="mt-1 block text-xs text-gray-400">' + esc(row.createdAt || '') + ' · ' + cost + '</span>'
          + '</span>'
          + '<span class="material-symbols-outlined text-gray-300 transition-colors group-hover:text-[#111418]">chevron_right</span>'
          + '</a>';
      }).join('');
    })
    .catch(function (err) {
      empty('报告记录读取失败', (err && err.message) || '请稍后再试', false);
    });
})();
