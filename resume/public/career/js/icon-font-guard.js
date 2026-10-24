/* 图标字体防闪烁：Material Symbols 未就绪时会把 ligature 名字显示成英文
   （arrow_back、rocket_launch…）。配合 career.css 里
   html:not(.icons-ready) .material-symbols-outlined { visibility:hidden } 使用。
   字体加载完（或 1.5s 兜底）再显示，避免刷新时闪英文。 */
(function () {
  'use strict';
  var root = document.documentElement;
  var done = false;

  function show() {
    if (done) return;
    done = true;
    root.classList.add('icons-ready');
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(show);
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', show);
    }
  } else {
    show();
  }
})();
