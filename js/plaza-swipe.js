/* ============================================================
   任务广场 tab：移动端左右滑动，在「技能变现 / 组队共创 / 求助中心」之间切换
   ------------------------------------------------------------
   为什么单独一个文件：这是纯移动端交互，按协作约定（主文件已经很挤）移动端支持尽量外置。
   引入位置：growth-schoolv3.html 里与其它外联脚本同区（<script src="js/plaza-swipe.js">）。

   做法：
     · 只在 ≤768px 生效（与吸顶二级切换、底栏同一个断点）；
     · 用 Pointer Events：pointerdown 记起点、pointerup 判方向；全程 passive，
       不 preventDefault，所以不影响页面纵向滚动，也不影响横滑控件本身；
     · 触发后的动作就是调用页面原有的 go()——和点吸顶 tab 走完全同一条路径
       （切页 / 底栏选中态 / 回到顶部 / 拉取该页任务都由 go() 负责）；
     · 两端不循环：在「技能变现」向右滑、在「求助中心」向左滑都不动。

   不参与切换的手势（起手落在这些控件上就直接放行）：
     · .chip-group / .banner-tasks / .filter-eggs —— 它们自己横向可滚动，滑动该滚它们；
     · .cat-select —— 分类下拉（含展开后的菜单）；
     · input / textarea / select —— 正在输入时横滑是移动光标；
     · 起手不在 .page.active 内的（任务详情弹窗、登录弹窗等浮层）。
   ============================================================ */
(function(){
  var ORDER = ['plaza', 'teamplaza', 'helpplaza', 'workshop'];   /* 顺序 = 吸顶二级切换里的顺序（猫咪小屋是工坊子页，不参与滑动切换） */
  var MIN_DX = 60;                                   /* 触发切换的最小水平位移(px) */
  var RATIO = 1.4;                                   /* |dx| 至少是 |dy| 的这么多倍，斜着滑不算 */
  var BLOCK_SEL = '.chip-group,.banner-tasks,.filter-eggs,.cat-select,input,textarea,select';
  var down = null;

  function isMobile(){ return window.matchMedia('(max-width:768px)').matches; }
  function activeIndex(){
    for(var i = 0; i < ORDER.length; i++){
      var el = document.getElementById('page-' + ORDER[i]);
      if(el && el.classList.contains('active')) return i;
    }
    return -1;
  }
  function skip(target){
    if(!target || !target.closest) return true;
    if(target.closest(BLOCK_SEL)) return true;      /* 交给横滑控件 / 输入框自己处理 */
    return !target.closest('.page.active');         /* 浮层里起手的不切页 */
  }
  /* 换页后给新页面一个轻微的滑入，让「滑过去」有反馈（样式在 js/plaza-mobile.css） */
  function slideIn(dir){
    var el = document.querySelector('.page.active');
    if(!el) return;
    var cls = 'plaza-swipe-' + dir;
    el.classList.remove('plaza-swipe-l', 'plaza-swipe-r');
    el.classList.add(cls);
    setTimeout(function(){ el.classList.remove(cls); }, 260);
  }

  document.addEventListener('pointerdown', function(e){
    down = null;
    if(e.pointerType === 'mouse') return;           /* 鼠标拖拽不切页，只有触屏/触控笔 */
    if(!isMobile() || activeIndex() < 0) return;
    if(skip(e.target)) return;
    down = { x: e.clientX, y: e.clientY };
  }, { passive: true });

  document.addEventListener('pointerup', function(e){
    if(!down) return;
    var dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    if(Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO) return;
    var idx = activeIndex();
    if(idx < 0) return;
    var next = dx < 0 ? idx + 1 : idx - 1;          /* 左滑 = 下一页，右滑 = 上一页 */
    if(next < 0 || next >= ORDER.length) return;    /* 两端不循环 */
    go(ORDER[next]);
    slideIn(dx < 0 ? 'l' : 'r');
  }, { passive: true });
})();
