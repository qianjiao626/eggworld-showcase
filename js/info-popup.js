/* ============================================================
   蛋蛋世界 - 开屏信息弹窗（外联 JS）
   作用：用户「首次登录」时弹出一次，讲清楚平台的态度与核心玩法。
   触发：包装全局 doStudentLogin() / doRegister()（用户"主动登录/注册"这两个动作），
        成功后若该账号在本机没看过，则弹出并记录标记 ddsj_info_popup_seen_<userId>。
        特意不挂 applyUserData —— 它在刷新页面恢复会话时也会执行，
        会导致"刷新就弹一下"的现象。
   布局：移动端 = 三张玩法卡横向滑动 + 底部常驻 CTA；
        桌面端 = 三列并排 + 愿景三列 + 底部常驻 CTA。
        内容超高时由 .info-popup-body 内部滚动，不撑破页面。
   注意：只搬运 .info-popup-* / .ip-* 相关样式，
        不含原型页里的 * 和 body 全局样式，也不依赖 Tailwind（主站未引入），
        避免污染主站布局。
   ============================================================ */
(function () {
  'use strict';

  var SEEN_PREFIX = 'ddsj_info_popup_seen_';   // 每账号一个"已看过"标记
  var SHOW_DELAY = 700;                        // 登录成功到弹出之间的缓冲

  /* ---------- 样式（仅弹窗自身作用域） ---------- */
  var CSS = `
.info-popup-overlay {
  --ip-card: #13131f;
  --ip-sunken: #1a1a2e;
  --ip-muted: #9aa1b8;
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(6, 6, 12, .82);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: ipFadeIn .3s ease;
}
@keyframes ipFadeIn { from { opacity: 0 } to { opacity: 1 } }

.info-popup-box {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 1000px;
  max-width: 100%;
  max-height: calc(100dvh - 32px);
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 24px;
  overflow: hidden;
  background-color: #0b0b12;
  background-image: radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0b0b12 70%);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .7);
  color: #fff;
  animation: ipSlideUp .42s cubic-bezier(.22, 1, .36, 1);
}
@keyframes ipSlideUp {
  from { opacity: 0; transform: translateY(28px) scale(.97) }
  to { opacity: 1; transform: none }
}

/* 关闭按钮 */
.info-popup-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, .08);
  border: 1px solid rgba(255, 255, 255, .15);
  color: rgba(255, 255, 255, .65);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: all .25s;
}
.info-popup-close:hover {
  background: rgba(236, 72, 153, .22);
  border-color: rgba(236, 72, 153, .45);
  color: #fff;
  transform: rotate(90deg);
}

/* 可滚动内容区：内容超高时内部滚动，不撑破弹窗 */
.info-popup-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, .18) transparent;
}
.info-popup-body::-webkit-scrollbar { width: 6px }
.info-popup-body::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .16); border-radius: 3px }
.ip-scroll { padding: 26px 18px 22px }

/* 顶部态度标签 */
.ip-tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 18px }
.ip-tag {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--ip-sunken);
  border: 1px solid transparent;
}
.ip-tag-red { color: #f87171; border-color: rgba(239, 68, 68, .3); box-shadow: 0 0 10px rgba(239, 68, 68, .18) }
.ip-tag-orange { color: #fb923c; border-color: rgba(249, 115, 22, .3); box-shadow: 0 0 10px rgba(249, 115, 22, .18) }
.ip-tag-green { color: #34d399; border-color: rgba(16, 185, 129, .3); box-shadow: 0 0 10px rgba(16, 185, 129, .18) }
.ip-tag-blue { color: #60a5fa; border-color: rgba(59, 130, 246, .3); box-shadow: 0 0 10px rgba(59, 130, 246, .18) }

/* 主标题与金句 */
.ip-hero-title {
  margin: 0 0 12px;
  text-align: center;
  font-size: 24px;
  font-weight: 900;
  line-height: 1.35;
  letter-spacing: .5px;
  color: #fff;
}
.ip-grad {
  background: linear-gradient(90deg, #fbbf24, #ec4899, #3b82f6, #f97316);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.ip-hero-sub {
  margin: 0 auto;
  max-width: 660px;
  text-align: center;
  font-size: 13px;
  line-height: 1.75;
  color: #c3c8d8;
}
.ip-br-desk { display: none }

/* 移动端滑动提示 / 桌面端域名行 */
.ip-swipe-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 14px 0 0;
  font-size: 12px;
  color: #7c8399;
  animation: ipBlink 1.8s ease-in-out infinite;
}
@keyframes ipBlink { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
.ip-domain { display: none }

/* 核心玩法卡片：移动端横向滑动 */
.ip-steps {
  display: flex;
  gap: 12px;
  margin: 14px 0 0;
  padding: 2px 0 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.ip-steps::-webkit-scrollbar { display: none }
.ip-step {
  flex: 0 0 84%;
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  padding: 18px;
  border-radius: 18px;
  background: var(--ip-card);
  border: 1px solid rgba(255, 255, 255, .1);
}
.ip-step-yellow { border-color: rgba(250, 204, 21, .3); box-shadow: 0 0 20px rgba(250, 204, 21, .14) }
.ip-step-blue { border-color: rgba(59, 130, 246, .3); box-shadow: 0 0 20px rgba(59, 130, 246, .14) }
.ip-step-orange { border-color: rgba(249, 115, 22, .3); box-shadow: 0 0 20px rgba(249, 115, 22, .14) }
.ip-step-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px }
.ip-step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
}
.ip-step-yellow .ip-step-num { background: rgba(250, 204, 21, .2); border: 1px solid #facc15; color: #facc15 }
.ip-step-blue .ip-step-num { background: rgba(59, 130, 246, .2); border: 1px solid #60a5fa; color: #60a5fa }
.ip-step-orange .ip-step-num { background: rgba(249, 115, 22, .2); border: 1px solid #fb923c; color: #fb923c }
.ip-step-emoji { font-size: 26px }
.ip-step-title { margin: 0 0 6px; font-size: 18px; font-weight: 800; color: #fff }
.ip-step-sub { margin: 0 0 14px; font-size: 12px; line-height: 1.6; color: var(--ip-muted) }
.ip-step-rows { display: flex; flex-direction: column; gap: 8px; margin-top: auto }
.ip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ip-sunken);
  border: 1px solid rgba(255, 255, 255, .05);
}
.ip-row-ico { font-size: 16px; flex-shrink: 0 }
.ip-row-txt { font-size: 12.5px; line-height: 1.5; color: #cdd2e0 }
.ip-step-tag { display: none }

/* 移动端互助循环提示 */
.ip-loop {
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
  color: #c3c8d8;
  background: linear-gradient(90deg, rgba(250, 204, 21, .1), rgba(59, 130, 246, .1), rgba(249, 115, 22, .1));
  border: 1px solid rgba(255, 255, 255, .1);
}
.ip-loop b { color: #fff }

/* 愿景板块 */
.ip-vision {
  margin-top: 20px;
  padding: 20px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, .1);
  background: linear-gradient(160deg, #13131f, #0b0b12);
}
.ip-vision-title { margin: 0 0 14px; font-size: 18px; font-weight: 800; color: #fff }
.ip-vision-grid { display: grid; grid-template-columns: 1fr; gap: 12px }
.ip-vision-item {
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .05);
  border: 1px solid rgba(255, 255, 255, .06);
}
.ip-vision-item h4 { margin: 0 0 6px; font-size: 14px; font-weight: 800; color: #fff }
.ip-vision-item p { margin: 0; font-size: 12.5px; line-height: 1.65; color: var(--ip-muted) }
.ip-vision-quote {
  margin: 16px 0 0;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #e8eaf2;
}

/* 底部常驻 CTA（不随内容滚动） */
.ip-footer {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 20px 16px;
  border-top: 1px solid rgba(255, 255, 255, .08);
  background: linear-gradient(180deg, rgba(11, 11, 18, .85), #0b0b12);
}
.ip-cta {
  width: 100%;
  max-width: 460px;
  padding: 14px 24px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #ec4899 0%, #f97316 100%);
  box-shadow: 0 0 20px rgba(236, 72, 153, .4);
  color: #fff;
  font-family: inherit;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: .5px;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .2s ease;
  -webkit-appearance: none;
  appearance: none;
}
.ip-cta:hover { box-shadow: 0 0 28px rgba(236, 72, 153, .55) }
.ip-cta:active { transform: scale(.97) }
.ip-cta-note { margin: 0; font-size: 11px; color: rgba(255, 255, 255, .45) }

/* ---------- 桌面端 / 大屏：三列并排 ---------- */
@media (min-width: 768px) {
  .ip-scroll { padding: 32px 36px 26px }
  .ip-tags { gap: 10px; margin-bottom: 22px }
  .ip-hero-title { font-size: 34px; margin-bottom: 14px }
  .ip-hero-sub { font-size: 14px }
  .ip-br-desk { display: block }
  .ip-swipe-hint { display: none }
  .ip-domain { display: block; margin: 16px 0 0; text-align: center; font-size: 12px; color: #7c8399 }

  .ip-steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    margin-top: 20px;
    padding: 0;
    overflow: visible;
  }
  .ip-step { flex: 1 1 auto; padding: 22px 20px; position: relative; overflow: hidden }
  .ip-step-head { margin-bottom: 14px }
  .ip-step-tag {
    display: block;
    position: absolute;
    top: 0;
    right: 0;
    padding: 5px 12px;
    border-left: 1px solid;
    border-bottom: 1px solid;
    border-bottom-left-radius: 12px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .5px;
  }
  .ip-step-yellow .ip-step-tag { background: rgba(250, 204, 21, .2); color: #facc15; border-color: rgba(250, 204, 21, .3) }
  .ip-step-blue .ip-step-tag { background: rgba(59, 130, 246, .2); color: #60a5fa; border-color: rgba(59, 130, 246, .3) }
  .ip-step-orange .ip-step-tag { background: rgba(249, 115, 22, .2); color: #fb923c; border-color: rgba(249, 115, 22, .3) }

  .ip-loop { display: none }
  .ip-vision { padding: 26px 28px; margin-top: 22px }
  .ip-vision-title { font-size: 20px }
  .ip-vision-grid { grid-template-columns: repeat(3, 1fr); gap: 18px }
  .ip-cta { max-width: 520px }
}

/* ---------- 窄屏兜底：卡片略窄一点，露出下一张的边缘提示可滑 ---------- */
@media (max-width: 380px) {
  .ip-step { flex-basis: 88% }
  .ip-hero-title { font-size: 22px }
}
`;

  /* ---------- 弹窗 DOM ---------- */
  var HTML = `
<div class="info-popup-overlay" id="infoPopupOverlay" style="display:none" onclick="if(event.target===this)closeInfoPopup()">
  <div class="info-popup-box">
    <div class="info-popup-close" onclick="closeInfoPopup()">×</div>
    <div class="info-popup-body">
      <div class="ip-scroll">

        <div class="ip-tags">
          <span class="ip-tag ip-tag-red">🚫 拒绝制造焦虑</span>
          <span class="ip-tag ip-tag-orange">🚫 拒绝割韭菜</span>
          <span class="ip-tag ip-tag-green">🤝 抱团取暖</span>
          <span class="ip-tag ip-tag-blue">🚀 聚沙成塔</span>
        </div>

        <h2 class="ip-hero-title">在这个到处制造焦虑的时代<br><span class="ip-grad">我们选择抱团取暖</span></h2>
        <p class="ip-hero-sub">
          如果年轻人过得不好，失去了对未来的希望，那么没有人可以过得好。<br class="ip-br-desk">
          在这里，师兄师姐带你少踩点坑，少走点弯路，少花点冤枉钱。
        </p>

        <div class="ip-swipe-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          左右滑动查看互助指南
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <p class="ip-domain">dsxnb.com 大学生互助交友 · 技能变现 · 组队求助内部平台</p>

        <div class="ip-steps">
          <div class="ip-step ip-step-yellow">
            <span class="ip-step-tag">STEP 1</span>
            <div class="ip-step-head">
              <span class="ip-step-num">1</span>
              <span class="ip-step-emoji">🪙</span>
            </div>
            <h3 class="ip-step-title">互助赚金币</h3>
            <p class="ip-step-sub">只要你敢求助，就有同学敢应答</p>
            <div class="ip-step-rows">
              <div class="ip-row"><span class="ip-row-ico">🤫</span><span class="ip-row-txt">匿名吐槽（只要你吐槽，我们就匿名）</span></div>
              <div class="ip-row"><span class="ip-row-ico">🏫</span><span class="ip-row-txt">避坑打听（知无不言，少踩坑）</span></div>
              <div class="ip-row"><span class="ip-row-ico">🤝</span><span class="ip-row-txt">组队搭子（前行的路上不孤单）</span></div>
            </div>
          </div>

          <div class="ip-step ip-step-blue">
            <span class="ip-step-tag">STEP 2</span>
            <div class="ip-step-head">
              <span class="ip-step-num">2</span>
              <span class="ip-step-emoji">📚</span>
            </div>
            <h3 class="ip-step-title">花金币提技能</h3>
            <p class="ip-step-sub">学长学姐定期分享，带你横扫学业与就业难关</p>
            <div class="ip-step-rows">
              <div class="ip-row"><span class="ip-row-ico">🎓</span><span class="ip-row-txt">学业分享（保研考研、比赛项目）</span></div>
              <div class="ip-row"><span class="ip-row-ico">💼</span><span class="ip-row-txt">就业指导（实习/就业/工作经验）</span></div>
              <div class="ip-row"><span class="ip-row-ico">🎮</span><span class="ip-row-txt">兴趣减压（游戏娱乐、爱好分享）</span></div>
            </div>
          </div>

          <div class="ip-step ip-step-orange">
            <span class="ip-step-tag">STEP 3</span>
            <div class="ip-step-head">
              <span class="ip-step-num">3</span>
              <span class="ip-step-emoji">💰</span>
            </div>
            <h3 class="ip-step-title">教学赚外快</h3>
            <p class="ip-step-sub">只要你会些什么，都可以教给其他同学</p>
            <div class="ip-step-rows">
              <div class="ip-row"><span class="ip-row-ico">🏷️</span><span class="ip-row-txt">技能变现（副业外快路径分享）</span></div>
              <div class="ip-row"><span class="ip-row-ico">🛡️</span><span class="ip-row-txt">反向评价（就读体验/企业避雷）</span></div>
              <div class="ip-row"><span class="ip-row-ico">🚀</span><span class="ip-row-txt">项目经验（参与共建，丰富履历）</span></div>
            </div>
          </div>
        </div>

        <div class="ip-loop">
          🔁 <b>互助循环：</b>敢求助 ➡️ 学经验 ➡️ 教别人 ➡️ <b>一起聚沙成塔</b>
        </div>

        <div class="ip-vision">
          <h3 class="ip-vision-title"><span>🌟</span> 我们要去哪？</h3>
          <div class="ip-vision-grid">
            <div class="ip-vision-item">
              <h4>🚫 拒绝白嫖</h4>
              <p>团结在一起，让企业在平台给我们发布付费任务，而不是白嫖我们的时间。</p>
            </div>
            <div class="ip-vision-item">
              <h4>⚖️ 反向评价</h4>
              <p>别的平台收广告费，我们收实习名额、校招岗位；反向评价学校就读与企业就业体验。</p>
            </div>
            <div class="ip-vision-item">
              <h4>💼 项目经验</h4>
              <p>参与网站（后续小程序/App）共建，这可以直接变成你的项目经验，用于投递实习就业。</p>
            </div>
          </div>
          <p class="ip-vision-quote">「 团结在一起，就能聚沙成塔 」</p>
        </div>

      </div>
    </div>
    <div class="ip-footer">
      <button type="button" class="ip-cta" onclick="infoPopupGoComplaint()">👉 进入蛋蛋世界 · 一起聚沙成塔</button>
      <p class="ip-cta-note">随时欢迎新的伙伴加入，给网站注入新功能</p>
    </div>
  </div>
</div>
`;

  function injectCss() {
    if (document.getElementById('infoPopupStyle')) return;
    var style = document.createElement('style');
    style.id = 'infoPopupStyle';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* DOM 延迟到真正要显示时才注入。
     页面加载/刷新时弹窗节点根本不存在于 DOM 中，
     从源头上杜绝"刷新时弹窗一闪而过"（也顺带减小首屏 DOM）。 */
  function ensureDom() {
    if (document.getElementById('infoPopupOverlay')) return true;
    if (!document.body) return false;
    var wrap = document.createElement('div');
    wrap.innerHTML = HTML;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    return !!document.getElementById('infoPopupOverlay');
  }

  /* ---------- 首次登录标记（每账号一份） ---------- */
  function seenKey(uid) { return SEEN_PREFIX + uid; }
  function hasSeen(uid) {
    try { return !!localStorage.getItem(seenKey(uid)); } catch (e) { return false; }
  }
  function markSeen(uid) {
    try { localStorage.setItem(seenKey(uid), '1'); } catch (e) {}
  }

  /* ---------- 打开 / 关闭（挂到 window 供内联 onclick 调用） ---------- */
  window.openInfoPopup = function () {
    if (!ensureDom()) return;              // 首次打开时才创建节点
    var overlay = document.getElementById('infoPopupOverlay');
    overlay.style.display = 'flex';
    var body = overlay.querySelector('.info-popup-body');
    if (body) body.scrollTop = 0;          // 每次从顶部开始（移动端滑到中间过再打开也能复位）
  };

  window.closeInfoPopup = function () {
    var overlay = document.getElementById('infoPopupOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  /* 底部 CTA：关掉弹窗并进入「蛋蛋大学吐槽榜」（页面 id = blacklist，即学生端的吐槽页）。
     go() 由主站提供，理论上弹窗只在登录成功后出现、主站脚本已就绪；
     仍做一次存在性判断，避免主站脚本异常时点了没反应还留个打不开的弹窗。 */
  window.infoPopupGoComplaint = function () {
    window.closeInfoPopup();
    if (typeof window.go === 'function') window.go('blacklist');
  };

  /* 首次登录弹一次：以 userId 为粒度，避免同机换账号时漏弹/重复弹 */
  function maybeShowForFirstLogin() {
    var u = window.USER || {};
    var uid = u.id || 0;
    if (!uid) return;                     // 未登录（或登录失败）
    /* 管理角色（主管理员 / 副管理员）不需要学生向的新手引导，且全屏遮罩会拦住
       管理台内的点击操作，故直接不弹、也不写入"已看过"标记 */
    if (u.isAdmin || u.isSubAdmin) return;
    if (hasSeen(uid)) return;             // 该账号在本机已看过
    markSeen(uid);                        // 打开即标记，避免刷新反复弹
    setTimeout(window.openInfoPopup, SHOW_DELAY);
  }

  /* 只在「用户主动登录 / 注册」时判断，不要挂在 applyUserData 上：
     applyUserData 在页面加载恢复会话时也会执行，那样刷新页面就等于又"登录"了一次，
     会出现在刷新时弹窗一闪的现象。 */
  function wrapLoginActions() {
    ['doStudentLogin', 'doRegister'].forEach(function (name) {
      var original = window[name];
      if (typeof original !== 'function' || original.__ipWrapped) return;
      var wrapped = function () {
        var ret = original.apply(this, arguments);
        var after = function () { try { maybeShowForFirstLogin(); } catch (e) {} };
        if (ret && typeof ret.then === 'function') return ret.then(function (v) { after(); return v; });
        after();
        return ret;
      };
      wrapped.__ipWrapped = true;
      window[name] = wrapped;
    });
  }

  function setup() {
    injectCss();          // 样式先就位（作用域限 .info-popup-* / .ip-*，不影响主站）
    wrapLoginActions();   // DOM 等真正弹的时候再建（见 ensureDom）

    /* ESC 关闭 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var overlay = document.getElementById('infoPopupOverlay');
        if (overlay && overlay.style.display === 'flex') window.closeInfoPopup();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
