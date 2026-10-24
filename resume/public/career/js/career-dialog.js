/* 职业测评通用的主题化提示框：替代原生 alert。
   用法：careerAlert('文案', { title, actionLabel, onAction }) */
(function () {
  'use strict';

  var host = null;
  var pendingAction = null;

  function ensure() {
    if (host) return host;
    host = document.createElement('div');
    host.className = 'cr-dialog';
    host.setAttribute('role', 'alertdialog');
    host.setAttribute('aria-modal', 'true');
    host.innerHTML = ''
      + '<div class="cr-dialog-mask" data-close></div>'
      + '<div class="cr-dialog-panel">'
      + '  <p class="cr-dialog-kicker">NOTICE</p>'
      + '  <h3 class="cr-dialog-title"></h3>'
      + '  <p class="cr-dialog-msg"></p>'
      + '  <div class="cr-dialog-actions">'
      + '    <button type="button" class="cr-dialog-btn" data-close>知道了</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(host);
    host.addEventListener('click', function (ev) {
      if (!ev.target.closest('[data-close]')) return;
      var action = pendingAction;
      close();
      if (action) action();
    });
    return host;
  }

  function close() {
    if (!host) return;
    host.classList.remove('is-open');
    document.body.style.overflow = '';
    pendingAction = null;
  }

  function careerAlert(message, options) {
    options = options || {};
    var el = ensure();
    el.querySelector('.cr-dialog-title').textContent = options.title || '提示';
    el.querySelector('.cr-dialog-msg').textContent = message || '';
    var btn = el.querySelector('[data-close].cr-dialog-btn');
    btn.textContent = options.actionLabel || '知道了';
    btn.classList.toggle('is-primary', !!options.actionLabel);
    pendingAction = options.onAction || null;
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    btn.focus();
  }

  window.careerAlert = careerAlert;
  window.careerPromptClose = close;
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') close();
  });
})();
