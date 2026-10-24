/* ============================================================
 * 蛋蛋世界 · 装扮渲染助手
 * 唯一入口：所有出现昵称/头像的地方都必须调用 applyDeco，
 * 禁止各页面自行拼接装饰 HTML（避免 XSS 面扩散）。
 * ============================================================ */

/* key 白名单正则：前缀 a-/cl-/of-/f-/ch-/sk- 与 t-，须与后端白名单及 deco.css 三方一致 */
var DECO_KEY_RE = /^(?:(?:a|cl|of|f|ch|sk)-[a-z]{2,14}|t-[a-z]{2,14})$/;
var DECO_EFF_SLOTS = ['aura', 'cloak', 'outfit', 'frame', 'charm', 'skin'];

/* 生成装扮容器内部结构。light=true 时跳过高开销节点（光束/冲击波/星轨） */
function decoMarkup(imgSrc, light) {
  var h = '<span class="fx-core"></span>';
  if (!light) {
    h += '<span class="fx-rays"></span>'
       + '<span class="fx-wave w1"></span><span class="fx-wave w2"></span>'
       + '<span class="r-orbit o1"><i></i><i></i><i></i><i></i></span>'
       + '<span class="r-orbit o2"><i></i><i></i><i></i><i></i></span>';
  }
  h += '<span class="fx-cloak"></span>'
     + '<span class="r-ring r1"></span><span class="r-ring r2"></span><span class="r-ring r3"></span>'
     + '<img class="egg-img" src="' + encodeURI(imgSrc) + '" alt="">'
     + '<span class="fx-outfit"></span><span class="fx-frame"></span><span class="fx-charm"></span>';
  return h;
}

/* 把装扮 key 挂到容器上。安全要求：
   只用 classList.add + 白名单正则，禁止 innerHTML 拼接 deco 字段值 */
function applyDeco(wrapEl, deco, light) {
  if (!wrapEl) return;
  Array.prototype.slice.call(wrapEl.classList).forEach(function (c) {
    if (DECO_KEY_RE.test(c)) wrapEl.classList.remove(c);
  });
  wrapEl.classList.add('egg-deco');
  if (light) wrapEl.classList.add('deco-light');
  if (!deco) return;

  DECO_EFF_SLOTS.forEach(function (slot) {
    var k = deco[slot];
    if (k && DECO_KEY_RE.test(k)) wrapEl.classList.add(k);
  });

  var host = wrapEl.parentNode;
  var nameEl = host && host.querySelector('.deco-title');
  if (nameEl) {
    nameEl.classList.remove('title-plain','title-gold','title-neon','title-flame','title-holo');
    var st = deco.titleStyle;
    nameEl.classList.add(st && /^title-[a-z]+$/.test(st) ? st : 'title-plain');
  }
}

/* 用户级特效降级开关（「我的信息」页勾选，存 localStorage） */
var DECO_FX_KEY = 'egg_deco_fx_off';
function decoFxEnabled() {
  try { return localStorage.getItem(DECO_FX_KEY) !== '1'; } catch (e) { return true; }
}
function setDecoFx(on) {
  try { localStorage.setItem(DECO_FX_KEY, on ? '0' : '1'); } catch (e) {}
  document.body.classList.toggle('fx-off', !on);
}
document.addEventListener('DOMContentLoaded', function () {
  if (!decoFxEnabled()) document.body.classList.add('fx-off');
});
