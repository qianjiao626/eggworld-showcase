/* ============================================================
   「我的」页-我的任务 Tab · 移动端改版 · 逻辑（仅在 ≤768px 生效）
   ------------------------------------------------------------
   为什么单独一个文件：主文件已经很挤，移动端支持尽量外置
   （与 js/plaza-mobile.css、js/publish-mobile.css 同一约定）。
   引入位置：growth-schoolv3.html 里与其它外联脚本同区（<script src="js/mytasks-mobile.js"></script>）。
   样式：js/mytasks-mobile.css。

   这个脚本只干一件事：把标题 h2「我的任务」从标题行搬进顶栏
   （就是原来面包屑「蛋蛋世界 / 我的任务」那一行的位置）。
   面包屑、发布按钮的隐藏是纯 CSS；状态栏拆两行也是纯 CSS（6 列网格）。

   为什么用脚本搬而不是纯 CSS：h2 在 .title-row 里、面包屑在 .topbar 里，是两个容器，
   只靠 CSS 的 order / 绝对定位去「换位」会把 DOM 语义弄乱，也会在以后改版式时留下坑。
   这里只移动节点本身（不重建、不改 id / 不碰 onclick），并在 >768px 时搬回原位。
   ============================================================ */
(function(){
  'use strict';

  var MQ = '(max-width:768px)';
  var stash = null;                 /* 记住 h2 的原始父节点与后继节点，切回 web 端要还原 */

  function isMobile(){ return window.matchMedia(MQ).matches; }
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function apply(){
    var page = document.getElementById('page-mine');
    var panel = document.getElementById('mine-panel-tasks');
    if(!page || !panel) return;
    var topbar = page.querySelector('.topbar');
    var titleRow = panel.querySelector('.title-row');
    var h2 = titleRow && titleRow.querySelector('h2');
    if(!topbar || !h2) return;

    if(isMobile()){
      if(h2.parentNode === topbar) return;                       /* 已经在顶栏里，别重复搬 */
      stash = { parent:h2.parentNode, next:h2.nextSibling };
      h2.classList.add('mt-title');
      topbar.insertBefore(h2, topbar.firstChild);                /* 顶栏左侧 = 原面包屑的位置 */
    } else if(stash && h2.parentNode === topbar){
      h2.classList.remove('mt-title');
      try{ stash.parent.insertBefore(h2, stash.next); }
      catch(err){ stash.parent.appendChild(h2); }                /* 原后继节点没了就放到末尾 */
      stash = null;
    }
  }

  ready(function(){
    apply();
    var mq = window.matchMedia(MQ);
    var onChange = function(){ apply(); };
    if(mq.addEventListener) mq.addEventListener('change', onChange);
    else if(mq.addListener) mq.addListener(onChange);            /* 老 Safari */
  });
})();
