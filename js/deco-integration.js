/* 主站模板适配层。工单 deco.js 保持原文；动态 key 永不进入 HTML 字符串。 */
(function () {
  'use strict';
  var pending = new Map(), next = 0;
  var styles = ['title-plain','title-gold','title-neon','title-flame','title-holo'];
  var sizes = ['deco-xs','deco-sm','deco-md','deco-lg'];
  var prefixes = {aura:'a-',cloak:'cl-',outfit:'of-',frame:'f-',charm:'ch-',skin:'sk-'};
  var fallback = 'assets/char-eggy-life-v2.jpg';
  function title(el, deco) {
    deco = deco || {};
    el.textContent = deco.titleName || '';
    el.className = 'deco-title';
    el.classList.add(styles.indexOf(deco.titleStyle) >= 0 ? deco.titleStyle : 'title-plain');
  }
  function safeDeco(input) {
    var output = {};
    Object.keys(prefixes).forEach(function (slot) {
      var key = input && input[slot];
      if (typeof key === 'string' && DECO_KEY_RE.test(key) && key.indexOf(prefixes[slot]) === 0) output[slot] = key;
    });
    output.titleStyle = input && styles.indexOf(input.titleStyle) >= 0 ? input.titleStyle : 'title-plain';
    output.titleName = input && input.titleName;
    return output;
  }
  function make(opts) {
    var host = document.createElement('span'); host.className = 'deco-inline';
    var wrap = document.createElement('span');
    wrap.className = 'egg-deco';
    wrap.classList.add(sizes.indexOf(opts.size) >= 0 ? opts.size : 'deco-xs');
    var canvas = document.createElement('span'); canvas.className = 'deco-canvas';
    // Only local, fixed-format asset paths reach the authoritative static markup function.
    var img = typeof opts.img === 'string' && /^assets\/[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp|svg)$/.test(opts.img) ? opts.img : fallback;
    canvas.innerHTML = decoMarkup(img, !!opts.light);
    if (opts.avatar) {
      var template = document.createElement('template');
      // Existing avatar markup has already been escaped by the original renderer; no deco keys are interpolated.
      template.innerHTML = opts.avatar;
      var avatar = template.content.firstElementChild;
      if (avatar) {
        avatar.classList.add('egg-img');
        avatar.style.width = '150px'; avatar.style.height = '150px';
        avatar.style.margin = '0'; avatar.style.fontSize = '64px';
        canvas.querySelector('.egg-img').replaceWith(avatar);
      }
    }
    if (opts.field && !opts.light) {
      var field = document.createElement('span'); field.className = 'fx-field'; canvas.prepend(field);
    }
    wrap.append(canvas); host.append(wrap);
    var label = document.createElement('span'); title(label, opts.deco); host.append(label);
    applyDeco(wrap, safeDeco(opts.deco), !!opts.light);
    return host;
  }
  function token(opts) {
    var id = String(++next); pending.set(id, opts);
    return '<span data-deco-pending="' + id + '"></span>';
  }
  function hydrate(root) {
    if (!root || root.nodeType !== 1) return;
    var nodes = root.matches('[data-deco-pending]') ? [root] : [];
    nodes = nodes.concat(Array.from(root.querySelectorAll('[data-deco-pending]')));
    nodes.forEach(function (node) {
      var id = node.getAttribute('data-deco-pending'), opts = pending.get(id);
      if (!opts) return;
      queueMicrotask(function(){pending.delete(id);});
      if (opts.titleOnly) { var el = document.createElement('span'); title(el, opts.deco); node.replaceWith(el); }
      else node.replaceWith(make(opts));
    });
  }
  window.decoBuild = function (opts) { return token(opts || {}); };
  window.decoWrap = function (avatar, deco, light, size) { return token({avatar:avatar,deco:deco,light:light !== false,size:size || 'deco-xs'}); };
  window.decoTitleMarkup = function (deco) { return token({titleOnly:true,deco:deco}); };
  window.decoSetTitle = title;
  window.decoMount = function (el, opts) { if (el) el.replaceChildren(make(opts || {})); };
  window.charImg = function (key) {
    var paths = {life:fallback,hermit:'assets/char-eggy-hermit.jpg'};
    return paths[key] || fallback;
  };
  window.decoHydrate = function () { hydrate(document.documentElement); };
  new MutationObserver(function (records) {
    records.forEach(function (r) { r.addedNodes.forEach(hydrate); });
    // Templates overwritten before attachment must not retain user data indefinitely.
    if (pending.size > 1000) { var cutoff = next - 1000; pending.forEach(function (_, id) { if (+id < cutoff) pending.delete(id); }); }
  }).observe(document.documentElement, {childList:true,subtree:true});
})();
