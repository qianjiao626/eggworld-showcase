/* 公开分享的职业测评报告：/rs/career/share.html?t=<token>
   免登录只读；后端只返回标题与 HTML 快照，不含答题明细。 */
(function () {
  'use strict';

  var API_BASE = (window.EGGWORLD_API_BASE !== undefined)
    ? window.EGGWORLD_API_BASE
    : ((location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8080' : '');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 报告快照里带「保存为 PDF」按钮，分享页同样可用 */
  window.downloadPDF = function () { window.print(); };

  function errorBox(message) {
    return '<div class="cd-share-error">'
      + '<p class="cd-kicker">LINK EXPIRED</p>'
      + '<h2>' + esc(message) + '</h2>'
      + '<p>分享可能已被作者撤销。你可以自己测一份，或者去蛋蛋世界看看。</p>'
      + '<div class="cd-share-error-actions">'
      + '<a class="cd-cta" href="index.html">我也要测一份<span class="material-symbols-outlined">arrow_forward</span></a>'
      + '<a class="cd-share-revoke" href="/">返回蛋蛋世界</a>'
      + '</div></div>';
  }

  var main = document.getElementById('main');
  var token = new URLSearchParams(location.search).get('t');

  if (!token) {
    main.innerHTML = errorBox('缺少分享令牌');
    return;
  }

  fetch(API_BASE + '/api/resume/career/shared/' + encodeURIComponent(token))
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (!json || json.code !== 200) throw new Error((json && json.msg) || '分享链接已失效');
      var d = json.data || {};
      if (d.headline) document.title = d.headline + ' · 职业测评报告';
      var banner = '<div class="cd-banner">'
        + '<span>公开分享 · 只读 · 生成于 ' + esc(d.createdAt || '') + '</span>'
        + '<a href="index.html">我也要测一份 →</a></div>';
      main.innerHTML = banner + (d.html || '');
    })
    .catch(function (err) {
      main.innerHTML = errorBox(err && err.message ? err.message : '分享链接已失效');
    });
})();
