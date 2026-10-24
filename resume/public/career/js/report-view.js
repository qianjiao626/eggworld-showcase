/* 历史测评报告查看页：/rs/career/report.html?id=<记录 id>
   报告 HTML 是生成时的快照，直接插进 #main；鉴权走同源 sessionStorage.token。 */
(function () {
  'use strict';

  var API_BASE = (window.EGGWORLD_API_BASE !== undefined)
    ? window.EGGWORLD_API_BASE
    : ((location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8080' : '');

  function token() {
    try { return sessionStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function errorBox(message) {
    return '<div class="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">'
      + '<p class="text-lg font-bold text-red-600">' + esc(message) + '</p>'
      + '<a href="/rs/career/reports.html" class="mt-4 inline-block rounded-xl bg-primary px-6 py-3 font-bold text-white">返回报告记录</a></div>';
  }

  var main = document.getElementById('main');
  var id = new URLSearchParams(location.search).get('id');

  if (!id) {
    main.innerHTML = errorBox('缺少报告编号');
    return;
  }
  if (!token()) {
    main.innerHTML = errorBox('请先从蛋蛋世界登录后再查看报告');
    return;
  }

  fetch(API_BASE + '/api/resume/career/reports/' + encodeURIComponent(id), {
    headers: { Authorization: 'Bearer ' + token() }
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (!json || json.code !== 200) throw new Error((json && json.msg) || '报告加载失败');
      var d = json.data || {};
      var banner = '<div class="cd-banner">'
        + '<span>历史报告 · 生成于 ' + esc(d.createdAt || '') + '</span>'
        + '<span>' + (Number(d.cost) > 0 ? '消耗 ' + d.cost + ' 蛋蛋币' : '免费') + '</span></div>';
      main.innerHTML = banner + (d.html || '');
      if (window.CareerReportShare) window.CareerReportShare.mount(d.id || id);
    })
    .catch(function (err) {
      main.innerHTML = errorBox(err && err.message ? err.message : '报告加载失败');
    });
})();
