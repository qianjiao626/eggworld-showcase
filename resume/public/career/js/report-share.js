/* 职业测评报告 · 分享
   两种方式：公开链接（后端存令牌，可撤销） / 长图（前端渲染，预览后复制或下载）。
   样式见 css/career-report.css 的 .cd-modal / .cd-share-* / .cd-preview 区块。 */
(function () {
  'use strict';

  var API_BASE = (window.EGGWORLD_API_BASE !== undefined)
    ? window.EGGWORLD_API_BASE
    : ((location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8080' : '');

  var LONG_IMAGE_LIB = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  var recordId = null;
  var modal = null;
  var lastImageBlob = null;
  var previewUrl = '';
  var toastTimer = null;

  function token() {
    try { return sessionStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  /* ---------- 弹窗骨架：选项视图 + 长图预览视图 ---------- */
  function buildModal() {
    var el = document.createElement('div');
    el.className = 'cd-modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '分享这份报告');
    el.innerHTML = ''
      + '<div class="cd-modal-mask" data-close></div>'
      + '<div class="cd-modal-panel">'
      + '  <button type="button" class="cd-modal-close" data-close aria-label="关闭">'
      + '    <span class="material-symbols-outlined">close</span>'
      + '  </button>'
      + '  <div class="cd-toast" data-toast hidden></div>'
      + '  <div class="cd-share-view" data-view="options">'
      + '    <div class="cd-modal-head">'
      + '      <div>'
      + '        <p class="cd-kicker">SHARE</p>'
      + '        <h3>分享这份报告</h3>'
      + '      </div>'
      + '    </div>'
      + '    <p class="cd-modal-desc">选一种方式带走它。分享链接只包含报告本身，不含你的答题明细。</p>'
      + '    <div class="cd-share-options">'
      + '      <button type="button" class="cd-share-option" data-share="link">'
      + '        <span class="material-symbols-outlined">link</span>'
      + '        <span class="cd-share-option-title">生成分享链接</span>'
      + '        <span class="cd-share-option-desc">生成后自动复制，任何人打开都能看</span>'
      + '      </button>'
      + '      <button type="button" class="cd-share-option" data-share="image">'
      + '        <span class="material-symbols-outlined">image</span>'
      + '        <span class="cd-share-option-title">保存为长图</span>'
      + '        <span class="cd-share-option-desc">生成后自动复制，直接发微信 / QQ</span>'
      + '      </button>'
      + '    </div>'
      + '    <div class="cd-share-result" hidden>'
      + '      <label class="cd-share-label" for="cdShareUrl">公开链接</label>'
      + '      <div class="cd-share-field">'
      + '        <input id="cdShareUrl" class="cd-share-input" type="text" readonly />'
      + '        <button type="button" class="cd-btn cd-btn--primary" data-copy>复制链接</button>'
      + '      </div>'
      + '      <p class="cd-share-hint">浏览器不允许自动复制时，可在这里手动复制。</p>'
      + '    </div>'
      + '    <button type="button" class="cd-share-revoke" data-revoke hidden>撤销分享</button>'
      + '  </div>'
      + '  <div class="cd-share-view" data-view="preview" hidden>'
      + '    <div class="cd-modal-head">'
      + '      <div>'
      + '        <p class="cd-kicker">PREVIEW</p>'
      + '        <h3>长图预览</h3>'
      + '      </div>'
      + '    </div>'
      + '    <p class="cd-modal-desc">长图较长，在窗口内上下滑动预览；确认后可直接粘贴发送。</p>'
      + '    <div class="cd-preview"><img data-preview alt="职业测评报告长图" /></div>'
      + '    <p class="cd-preview-hint" data-preview-hint></p>'
      + '    <div class="cd-share-image-actions">'
      + '      <button type="button" class="cd-btn cd-btn--primary" data-copy-image>复制图片</button>'
      + '      <button type="button" class="cd-btn" data-download-image>下载 PNG</button>'
      + '    </div>'
      + '    <button type="button" class="cd-share-back" data-back>← 返回分享方式</button>'
      + '  </div>'
      + '  <p class="cd-share-status" data-status hidden></p>'
      + '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close]')) return close();
      if (ev.target.closest('[data-back]')) return showView('options');
    });
    el.querySelector('[data-share="link"]').addEventListener('click', onShareLink);
    el.querySelector('[data-share="image"]').addEventListener('click', onShareImage);
    el.querySelector('[data-copy]').addEventListener('click', onCopy);
    el.querySelector('[data-copy-image]').addEventListener('click', onCopyImage);
    el.querySelector('[data-download-image]').addEventListener('click', onDownloadImage);
    el.querySelector('[data-revoke]').addEventListener('click', onRevoke);
    return el;
  }

  function showView(name) {
    if (!modal) return;
    modal.querySelectorAll('.cd-share-view').forEach(function (view) {
      view.hidden = view.getAttribute('data-view') !== name;
    });
    status('');
    var closeBtn = modal.querySelector('.cd-modal-close');
    if (closeBtn) closeBtn.focus();
  }

  function status(text, isError) {
    if (!modal) return;
    var el = modal.querySelector('[data-status]');
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  /* 轻提示：不占位，2.4s 自动消失 */
  function toast(text) {
    if (!modal) return;
    var el = modal.querySelector('[data-toast]');
    el.textContent = text;
    el.hidden = false;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-show');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 2400);
  }

  function open() {
    if (!modal) modal = buildModal();
    showView('options');
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    status('');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      var img = modal.querySelector('[data-preview]');
      if (img) img.removeAttribute('src');
    }
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') close();
  });

  /* ---------- 公开链接 ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      } finally {
        ta.remove();
      }
    });
  }

  function onShareLink() {
    if (!recordId) return status('这份报告还没有保存，刷新后再试', true);
    if (!token()) return status('请先从蛋蛋世界登录后再分享', true);
    status('正在生成链接…');
    fetch(API_BASE + '/api/resume/career/reports/' + encodeURIComponent(recordId) + '/share', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token() }
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || json.code !== 200) throw new Error((json && json.msg) || '生成分享链接失败');
        var t = (json.data || {}).token;
        if (!t) throw new Error('生成分享链接失败');
        var url = location.origin + '/rs/career/share.html?t=' + encodeURIComponent(t);
        modal.querySelector('[data-revoke]').hidden = false;
        status('');
        /* 默认不展示链接，只提示已复制；被浏览器拒绝时才露出输入框兜底 */
        copyText(url).then(
          function () { toast('已复制分享链接'); },
          function () {
            var box = modal.querySelector('.cd-share-result');
            box.hidden = false;
            var input = modal.querySelector('.cd-share-input');
            input.value = url;
            input.focus();
            input.select();
            status('浏览器不允许自动复制，请手动复制上面的链接', true);
          }
        );
      })
      .catch(function (err) { status(err.message || '生成分享链接失败', true); });
  }

  function onCopy() {
    var input = modal.querySelector('.cd-share-input');
    if (!input || !input.value) return;
    copyText(input.value).then(
      function () { toast('已复制分享链接'); },
      function () { input.select(); status('复制失败，请手动选中复制', true); }
    );
  }

  function onRevoke() {
    if (!recordId) return;
    status('正在撤销…');
    fetch(API_BASE + '/api/resume/career/reports/' + encodeURIComponent(recordId) + '/share', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() }
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || json.code !== 200) throw new Error((json && json.msg) || '撤销失败');
        modal.querySelector('.cd-share-result').hidden = true;
        modal.querySelector('[data-revoke]').hidden = true;
        toast('已撤销分享');
        status('');
      })
      .catch(function (err) { status(err.message || '撤销失败', true); });
  }

  /* ---------- 长图 ---------- */
  function loadLib() {
    return new Promise(function (resolve, reject) {
      if (window.html2canvas) return resolve(window.html2canvas);
      var s = document.createElement('script');
      s.src = LONG_IMAGE_LIB;
      s.async = true;
      s.onload = function () { window.html2canvas ? resolve(window.html2canvas) : reject(new Error('长图组件不可用')); };
      s.onerror = function () { reject(new Error('长图组件加载失败，请检查网络或改用分享链接')); };
      document.head.appendChild(s);
    });
  }

  /* html2canvas 对 mask / 多层渐变支持不好，捕获期间换成纯色底，避免 canvas 尺寸为 0 */
  function renderCanvas(html2canvas, dossier) {
    var width = dossier.scrollWidth;
    var scale = width > 900 ? 1.6 : 2;
    var cleanup = function () { dossier.classList.remove('is-capturing'); };
    dossier.classList.add('is-capturing');
    return html2canvas(dossier, {
      backgroundColor: '#0a0c11',
      scale: scale,
      useCORS: true,
      logging: false,
      windowWidth: width,
      onclone: function (doc) {
        var clone = doc.querySelector('.career-dossier');
        if (clone) clone.classList.add('is-capturing');
        /* 分享图里不留操作按钮，只留报告本体 */
        doc.querySelectorAll('.cd-actions, .cd-return, .cd-cta').forEach(function (el) {
          el.style.display = 'none';
        });
      }
    }).then(function (canvas) { cleanup(); return canvas; },
      function (err) { cleanup(); throw err; });
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        blob ? resolve(blob) : reject(new Error('长图生成失败'));
      }, 'image/png');
    });
  }

  function copyImage(blob) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return Promise.reject(new Error('当前浏览器不支持复制图片'));
    }
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  function previewHint(text) {
    if (!modal) return;
    modal.querySelector('[data-preview-hint]').textContent = text;
  }

  function downloadImage() {
    if (!lastImageBlob) return;
    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(lastImageBlob);
    a.download = '职业测评报告-' + stamp + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('长图已下载');
  }

  function onCopyImage() {
    if (!lastImageBlob) return previewHint('还没有生成好的长图');
    copyImage(lastImageBlob).then(
      function () { toast('已复制图片，去微信 / QQ 粘贴发送'); },
      function () { previewHint('这个浏览器不允许写图片剪贴板，请点「下载 PNG」'); }
    );
  }

  function onDownloadImage() {
    downloadImage();
  }

  function onShareImage() {
    var dossier = document.querySelector('.career-dossier');
    if (!dossier) return status('报告还没加载完，稍后再试', true);
    status('正在生成长图…');
    loadLib()
      .then(function (html2canvas) { return renderCanvas(html2canvas, dossier); })
      .then(canvasToBlob)
      .then(function (blob) {
        lastImageBlob = blob;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        modal.querySelector('[data-preview]').src = previewUrl;
        status('');
        showView('preview');
        previewHint('已复制图片，请分享到微信 / QQ');
        /* 自动写图片剪贴板；被拒绝时提示改用下载 */
        copyImage(blob).then(
          function () { toast('已复制图片，去微信 / QQ 粘贴发送'); },
          function () { previewHint('长图已生成，点「复制图片」或「下载 PNG」'); }
        );
      })
      .catch(function (err) { status(err.message || '长图生成失败，请改用分享链接', true); });
  }

  /* ---------- 挂载按钮 ---------- */
  function mount(id) {
    recordId = id || null;
    var actions = document.querySelector('.cd-actions');
    if (!actions) return;
    var old = actions.querySelector('[data-share-button]');
    if (old) old.remove();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cd-btn cd-btn--primary';
    btn.setAttribute('data-share-button', '');
    btn.innerHTML = '<span class="material-symbols-outlined">ios_share</span><span>分享报告</span>';
    btn.addEventListener('click', open);
    actions.appendChild(btn);
  }

  window.CareerReportShare = { mount: mount, open: open, close: close };
})();
