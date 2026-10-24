// ============================================
// 猫咪UI控制器
// 领养中心、猫咪状态、专注模式、商店
// ============================================

window.PET_UI = (function() {
  const { CATS, FOODS, TOYS, ITEMS, FOCUS_REWARDS } = window.PET_DATA;
  // 迁移到蛋蛋世界：素材改放仓库正式目录 assets/cat-cabin/（脚本在 js/ 下，../ 到根）
  const ASSET_BASE = new URL('../assets/cat-cabin/', document.currentScript.src);

  let modalEl = null;
  let canvasEl = null;
  let currentTab = 'cat'; // cat | park | home | focus | shop (向后兼容)
  let currentPage = 'map'; // map | cat | park | home | focus (新页面路由)
  let currentHomeSubTab = 'market'; // probability | market | myListings
  let pageTransitionDirection = 'forward'; // forward | back (动画方向)
  let animationFrameId = null;
  let focusTimerInterval = null;
  let onCoinsChange = null;
  let pageVisible = true;

  // ===== 页面可见性变化监听（性能优化）=====
  // 页面不可见时停止所有动画，节省CPU和电池
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pageVisible = false;
      // 停止猫咪主渲染动画
      if (renderLoopCtrl) {
        renderLoopCtrl.stop();
      }
      // 停止公园动画
      if (parkAnimFrameId) {
        stopParkAnimation();
      }
      // 停止公园场景猫轮询（回前台切回公园 tab 时重新起）
      if (parkSceneTimerId) {
        clearInterval(parkSceneTimerId);
        parkSceneTimerId = null;
      }
      // 停止状态栏更新定时器
      if (statusUpdateTimer) {
        clearInterval(statusUpdateTimer);
        statusUpdateTimer = null;
      }
      // 停止专注模式定时器
      if (focusTimerInterval) {
        clearInterval(focusTimerInterval);
        focusTimerInterval = null;
      }
    } else {
      pageVisible = true;
      // 恢复当前标签页的动画
      if (modalEl && modalEl.style.display !== 'none') {
        if (currentTab === 'cat') {
          startAnimation();
        } else if (currentTab === 'park') {
          startParkAnimation();
          // 场景猫轮询在隐藏时已停，回到公园页重新起
          if (document.getElementById('parkSceneCanvas')) startParkScenePolling();
        }
      }
    }
  });

  // ===== 创建弹窗 =====
  function createModal() {
    if (modalEl) return;

    modalEl = document.createElement('div');
    modalEl.className = 'pet-modal-mask';
    modalEl.innerHTML = `
      <div class="pet-modal cat-modal" onclick="event.stopPropagation()">
        <!-- 顶部栏 -->
        <div class="pet-header cat-header">
          <h3>🐱 猫咪小屋</h3>
          <button class="pet-close-btn" id="petCloseBtn">✕</button>
        </div>

        <!-- 内容区 -->
        <div class="pet-content" id="petContent">
          <!-- 地图主页 -->
          <div class="map-home" id="mapHome">
            <!-- 左侧栏 - 游乐园门票亭 -->
            <div class="side-menu">
              <div class="side-menu-header">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="20" r="12" fill="#FF8A4C"/>
                  <circle cx="18" cy="20" r="10" fill="#FFB088"/>
                  <path d="M9 12 L7 4 L14 8 Z" fill="#FF8A4C"/>
                  <path d="M10 11 L9 6 L13 8 Z" fill="#FFB088"/>
                  <path d="M27 12 L29 4 L22 8 Z" fill="#FF8A4C"/>
                  <path d="M26 11 L27 6 L23 8 Z" fill="#FFB088"/>
                  <circle cx="14" cy="19" r="2.5" fill="#3E2723"/>
                  <circle cx="22" cy="19" r="2.5" fill="#3E2723"/>
                  <circle cx="14.8" cy="18.2" r="0.8" fill="white"/>
                  <circle cx="22.8" cy="18.2" r="0.8" fill="white"/>
                  <path d="M16.5 23 L19.5 23 L18 24.5 Z" fill="#FF6B6B"/>
                  <path d="M18 24.5 Q16 27 14 26" fill="none" stroke="#3E2723" stroke-width="1.2" stroke-linecap="round"/>
                  <path d="M18 24.5 Q20 27 22 26" fill="none" stroke="#3E2723" stroke-width="1.2" stroke-linecap="round"/>
                  <circle cx="11" cy="22" r="2" fill="#FF6B6B" opacity="0.3"/>
                  <circle cx="25" cy="22" r="2" fill="#FF6B6B" opacity="0.3"/>
                  <line x1="5" y1="21" x2="10" y2="22" stroke="#3E2723" stroke-width="0.8" stroke-linecap="round"/>
                  <line x1="5" y1="24" x2="10" y2="24" stroke="#3E2723" stroke-width="0.8" stroke-linecap="round"/>
                  <line x1="31" y1="21" x2="26" y2="22" stroke="#3E2723" stroke-width="0.8" stroke-linecap="round"/>
                  <line x1="31" y1="24" x2="26" y2="24" stroke="#3E2723" stroke-width="0.8" stroke-linecap="round"/>
                </svg>
              </div>
              <button class="side-menu-btn" id="sideCheckinBtn" title="每日签到">
                <div class="side-menu-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="16" rx="3" fill="#FFF8F0" stroke="#E8945A" stroke-width="1.5"/>
                    <path d="M3 10h18" stroke="#E8945A" stroke-width="1.5"/>
                    <path d="M8 3v4M16 3v4" stroke="#E8945A" stroke-width="1.5" stroke-linecap="round"/>
                    <rect x="7" y="13" width="10" height="5" rx="1.5" fill="#FF8A4C" opacity="0.85"/>
                    <path d="M9.5 15.5l1.8 1.8 3.4-3.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <span class="side-menu-text">每日签到</span>
              </button>
              <button class="side-menu-btn" id="sideDailyTasksBtn" title="每日任务">
                <div class="side-menu-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="16" rx="3" fill="#FFF8F0" stroke="#E8945A" stroke-width="1.5"/>
                    <path d="M3 10h18" stroke="#E8945A" stroke-width="1.5"/>
                    <path d="M8 3v4M16 3v4" stroke="#E8945A" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M8 14l2 2 4-4" stroke="#4CAF50" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M8 19h9" stroke="#E8945A" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <span class="side-menu-text">每日任务</span>
              </button>
              <button class="side-menu-btn" id="sideNewbieTasksBtn" title="新手任务">
                <div class="side-menu-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 6v5c0 5.5 4 10 9 11 5-1 9-5.5 9-11V6l-9-4z" fill="#FFD700" stroke="#E8945A" stroke-width="1.5"/>
                    <path d="M8 21h8M10 21v2M14 21v2" stroke="#8B4513" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M12 7l1.3 2.7 3 .4-2.2 2.1.6 3-2.7-1.4-2.7 1.4.6-3L7.7 10.1l3-.4z" fill="#FF6B6B"/>
                  </svg>
                </div>
                <span class="side-menu-text">新手任务</span>
              </button>
              <button class="side-menu-btn" id="sideShopBtn" title="商店">
                <div class="side-menu-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M4 9l8-5 8 5v11H4V9z" fill="#FFF8F0" stroke="#E8945A" stroke-width="1.5"/>
                    <path d="M2 9h20" stroke="#E8945A" stroke-width="1.5"/>
                    <rect x="10" y="13" width="4" height="7" fill="#8B4513" rx="1"/>
                    <circle cx="13" cy="16.5" r="0.5" fill="#FFD700"/>
                    <rect x="5" y="12" width="4" height="4" rx="1" fill="#87CEEB" stroke="#E8945A" stroke-width="1"/>
                    <rect x="15" y="12" width="4" height="4" rx="1" fill="#87CEEB" stroke="#E8945A" stroke-width="1"/>
                    <rect x="8" y="10" width="8" height="2.5" rx="0.5" fill="#FF6B6B"/>
                  </svg>
                </div>
                <span class="side-menu-text">商店</span>
              </button>
              <button class="side-menu-btn" id="sideCollectionBtn" title="猫咪图鉴">
                <div class="side-menu-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="#FFF8F0" stroke="#E8945A" stroke-width="1.5"/>
                    <path d="M3 9h18M9 3v18" stroke="#E8945A" stroke-width="1.5"/>
                    <circle cx="6" cy="6" r="1.2" fill="#FF8A4C"/>
                    <circle cx="12" cy="6" r="1.2" fill="#FF8A4C"/>
                    <circle cx="18" cy="6" r="1.2" fill="#FF8A4C"/>
                    <path d="M15 14c0-1.5 1.5-2 1.5-2s1.5.5 1.5 2c0 1.2-1 2-1.5 2s-1.5-.8-1.5-2z" fill="#FFD93D" opacity="0.6"/>
                  </svg>
                </div>
                <span class="side-menu-text">图鉴</span>
              </button>
              <!-- 蛋蛋币余额（从顶部头栏挪到侧栏图鉴下方；id 保持 petCoinCount，
                   updateCoinDisplay() 照常刷新）。纯展示元素：无按钮壳/边框/阴影/交互态 -->
              <div class="side-coin-badge" title="蛋蛋币余额">
                <span class="side-coin-icon">💰</span>
                <span class="side-coin-value" id="petCoinCount">0</span>
              </div>
            </div>
            <!-- 地图区域 - 游乐园绘本风格 -->
            <div class="map-area">
              <!-- 远景山丘 -->
              <div class="map-hills">
                <div class="deco-hill hill-1"></div>
                <div class="deco-hill hill-2"></div>
                <div class="deco-hill hill-3"></div>
              </div>
              <!-- 天空装饰层 -->
              <div class="map-sky">
                <!-- 太阳 -->
                <svg class="deco-sun" viewBox="0 0 60 60">
                  <defs>
                    <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" style="stop-color:#FFF9C4"/>
                      <stop offset="60%" style="stop-color:#FFD54F"/>
                      <stop offset="100%" style="stop-color:#FFA726"/>
                    </radialGradient>
                  </defs>
                  <circle cx="30" cy="30" r="18" fill="url(#sunGrad)"/>
                  <line x1="30" y1="4" x2="30" y2="10" stroke="#FFD54F" stroke-width="2.5" stroke-linecap="round"/>
                  <line x1="30" y1="50" x2="30" y2="56" stroke="#FFD54F" stroke-width="2.5" stroke-linecap="round"/>
                  <line x1="4" y1="30" x2="10" y2="30" stroke="#FFD54F" stroke-width="2.5" stroke-linecap="round"/>
                  <line x1="50" y1="30" x2="56" y2="30" stroke="#FFD54F" stroke-width="2.5" stroke-linecap="round"/>
                  <line x1="11" y1="11" x2="15" y2="15" stroke="#FFD54F" stroke-width="2" stroke-linecap="round"/>
                  <line x1="45" y1="45" x2="49" y2="49" stroke="#FFD54F" stroke-width="2" stroke-linecap="round"/>
                  <line x1="49" y1="11" x2="45" y2="15" stroke="#FFD54F" stroke-width="2" stroke-linecap="round"/>
                  <line x1="15" y1="45" x2="11" y2="49" stroke="#FFD54F" stroke-width="2" stroke-linecap="round"/>
                  <circle cx="25" cy="28" r="2" fill="#FF8A4C"/>
                  <circle cx="35" cy="28" r="2" fill="#FF8A4C"/>
                  <path d="M25 34 Q30 38 35 34" fill="none" stroke="#FF8A4C" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <!-- 彩虹 -->
                <svg class="deco-rainbow" viewBox="0 0 120 60">
                  <path d="M8 58 Q60 -10 112 58" fill="none" stroke="#FF6B6B" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
                  <path d="M16 58 Q60 -2 104 58" fill="none" stroke="#FF9F43" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
                  <path d="M24 58 Q60 6 96 58" fill="none" stroke="#FECA57" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
                  <path d="M32 58 Q60 14 88 58" fill="none" stroke="#48DBFB" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
                  <path d="M40 58 Q60 22 80 58" fill="none" stroke="#54A0FF" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
                  <path d="M48 58 Q60 30 72 58" fill="none" stroke="#A29BFE" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
                </svg>
                <!-- 云朵1 -->
                <svg class="deco-cloud cloud-1" viewBox="0 0 90 45">
                  <ellipse cx="28" cy="28" rx="20" ry="15" fill="white"/>
                  <ellipse cx="50" cy="22" rx="25" ry="20" fill="white"/>
                  <ellipse cx="68" cy="28" rx="18" ry="14" fill="white"/>
                  <ellipse cx="40" cy="34" rx="22" ry="11" fill="white" opacity="0.6"/>
                  <ellipse cx="45" cy="16" rx="12" ry="6" fill="#F8F9FA" opacity="0.8"/>
                </svg>
                <!-- 云朵2 -->
                <svg class="deco-cloud cloud-2" viewBox="0 0 70 35">
                  <ellipse cx="20" cy="22" rx="16" ry="12" fill="white"/>
                  <ellipse cx="40" cy="18" rx="20" ry="15" fill="white"/>
                  <ellipse cx="55" cy="23" rx="14" ry="11" fill="white"/>
                  <ellipse cx="32" cy="27" rx="18" ry="8" fill="white" opacity="0.5"/>
                </svg>
                <!-- 云朵3 -->
                <svg class="deco-cloud cloud-3" viewBox="0 0 55 30">
                  <ellipse cx="16" cy="19" rx="13" ry="10" fill="white"/>
                  <ellipse cx="32" cy="15" rx="16" ry="12" fill="white"/>
                  <ellipse cx="45" cy="20" rx="11" ry="9" fill="white"/>
                </svg>
                <!-- 云朵4 -->
                <svg class="deco-cloud cloud-4" viewBox="0 0 45 25">
                  <ellipse cx="13" cy="15" rx="10" ry="8" fill="white"/>
                  <ellipse cx="26" cy="12" rx="13" ry="10" fill="white"/>
                  <ellipse cx="36" cy="16" rx="9" ry="7" fill="white"/>
                </svg>
                <!-- 热气球1 -->
                <svg class="deco-hot-air-balloon balloon-1" viewBox="0 0 35 60">
                  <defs>
                    <linearGradient id="balloonGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" style="stop-color:#FF6B6B"/>
                      <stop offset="33%" style="stop-color:#FFE66D"/>
                      <stop offset="66%" style="stop-color:#48DBFB"/>
                      <stop offset="100%" style="stop-color:#A29BFE"/>
                    </linearGradient>
                  </defs>
                  <ellipse cx="17.5" cy="18" rx="15" ry="18" fill="url(#balloonGrad1)"/>
                  <line x1="10" y1="5" x2="10" y2="32" stroke="white" stroke-width="1" opacity="0.4"/>
                  <line x1="17.5" y1="2" x2="17.5" y2="34" stroke="white" stroke-width="1" opacity="0.4"/>
                  <line x1="25" y1="5" x2="25" y2="32" stroke="white" stroke-width="1" opacity="0.4"/>
                  <path d="M10 34 L17.5 40 L25 34" fill="#E8945A"/>
                  <path d="M12 44 L12 54 Q12 57 17.5 57 Q23 57 23 54 L23 44 Z" fill="#D2691E"/>
                  <rect x="12" y="44" width="11" height="3" fill="#FFD700"/>
                  <line x1="12" y1="40" x2="13" y2="44" stroke="#8B4513" stroke-width="0.8"/>
                  <line x1="23" y1="40" x2="22" y2="44" stroke="#8B4513" stroke-width="0.8"/>
                  <line x1="17.5" y1="40" x2="17.5" y2="44" stroke="#8B4513" stroke-width="0.8"/>
                </svg>
                <!-- 热气球2 -->
                <svg class="deco-hot-air-balloon balloon-2" viewBox="0 0 28 48">
                  <ellipse cx="14" cy="14" rx="12" ry="14" fill="#FFB6C1"/>
                  <ellipse cx="11" cy="10" rx="4" ry="5" fill="white" opacity="0.3"/>
                  <path d="M7 27 L14 32 L21 27" fill="#E8945A"/>
                  <path d="M9 35 L9 43 Q9 46 14 46 Q19 46 19 43 L19 35 Z" fill="#D2691E"/>
                  <rect x="9" y="35" width="10" height="2.5" fill="#FFD700"/>
                </svg>
                <!-- 风筝 -->
                <svg class="deco-kite" viewBox="0 0 30 40">
                  <path d="M15 2 L28 18 L15 28 L2 18 Z" fill="#FF6B6B"/>
                  <path d="M15 2 L28 18 L15 18 Z" fill="#FF8A4C" opacity="0.5"/>
                  <path d="M15 2 L2 18 L15 18 Z" fill="#FFE66D" opacity="0.5"/>
                  <circle cx="15" cy="15" r="4" fill="white" opacity="0.6"/>
                  <path d="M13 14 L17 14 M15 12 L15 16" stroke="#FF6B6B" stroke-width="1"/>
                  <path d="M15 28 Q10 34 15 40 Q20 36 15 28" fill="none" stroke="#8B4513" stroke-width="0.8" stroke-dasharray="2 2"/>
                </svg>
              </div>
              <!-- 路径层 - 鹅卵石路 -->
              <svg class="map-path-svg" viewBox="0 0 400 500" preserveAspectRatio="none">
                <defs>
                  <filter id="pathShadow">
                    <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#6B4423" flood-opacity="0.25"/>
                  </filter>
                </defs>
                <path d="M50 90 Q130 60 200 100 T360 120 Q390 200 320 270 T130 380 Q80 430 110 470" 
                      fill="none" stroke="#E8D4A8" stroke-width="18" stroke-linecap="round" filter="url(#pathShadow)"/>
                <path d="M50 90 Q130 60 200 100 T360 120 Q390 200 320 270 T130 380 Q80 430 110 470" 
                      fill="none" stroke="#F5E6C8" stroke-width="10" stroke-linecap="round"/>
                <path d="M50 90 Q130 60 200 100 T360 120 Q390 200 320 270 T130 380 Q80 430 110 470" 
                      fill="none" stroke="#C9A96E" stroke-width="18" stroke-linecap="round" stroke-dasharray="2 18" opacity="0.5"/>
              </svg>
              <!-- 蝴蝶装饰 -->
              <svg class="deco-butterfly butterfly-1" viewBox="0 0 20 20">
                <ellipse cx="10" cy="10" rx="2" ry="6" fill="#5D4037"/>
                <ellipse cx="6" cy="7" rx="5" ry="6" fill="#FF6B6B"/>
                <ellipse cx="14" cy="7" rx="5" ry="6" fill="#FF6B6B"/>
                <ellipse cx="6" cy="13" rx="4" ry="5" fill="#FFB6C1"/>
                <ellipse cx="14" cy="13" rx="4" ry="5" fill="#FFB6C1"/>
                <circle cx="6" cy="7" r="1.5" fill="white" opacity="0.5"/>
                <circle cx="14" cy="7" r="1.5" fill="white" opacity="0.5"/>
                <line x1="9" y1="5" x2="7" y2="2" stroke="#5D4037" stroke-width="0.8" stroke-linecap="round"/>
                <line x1="11" y1="5" x2="13" y2="2" stroke="#5D4037" stroke-width="0.8" stroke-linecap="round"/>
                <circle cx="7" cy="2" r="0.8" fill="#5D4037"/>
                <circle cx="13" cy="2" r="0.8" fill="#5D4037"/>
              </svg>
              <svg class="deco-butterfly butterfly-2" viewBox="0 0 16 16">
                <ellipse cx="8" cy="8" rx="1.5" ry="5" fill="#5D4037"/>
                <ellipse cx="4.5" cy="5.5" rx="4" ry="5" fill="#D4A5FF"/>
                <ellipse cx="11.5" cy="5.5" rx="4" ry="5" fill="#D4A5FF"/>
                <ellipse cx="4.5" cy="10.5" rx="3" ry="4" fill="#E8D5FF"/>
                <ellipse cx="11.5" cy="10.5" rx="3" ry="4" fill="#E8D5FF"/>
              </svg>
              <!-- 建筑1: 我的猫窝 - 温馨小屋 -->
              <div class="map-icon map-icon-cat" data-page="cat">
                <svg class="building-svg building-cat" viewBox="0 0 110 100">
                  <defs>
                    <linearGradient id="roofGradNew1" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color:#FF6B6B"/>
                      <stop offset="50%" style="stop-color:#FF8A4C"/>
                      <stop offset="100%" style="stop-color:#FFA726"/>
                    </linearGradient>
                    <linearGradient id="wallGradNew1" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color:#FFF8F0"/>
                      <stop offset="100%" style="stop-color:#FFE8D6"/>
                    </linearGradient>
                  </defs>
                  <!-- 左侧小树 -->
                  <rect x="5" y="55" width="6" height="30" rx="2" fill="#8B4513"/>
                  <circle cx="8" cy="50" r="14" fill="#66BB6A"/>
                  <circle cx="3" cy="55" r="9" fill="#81C784"/>
                  <circle cx="13" cy="55" r="9" fill="#81C784"/>
                  <circle cx="8" cy="42" r="8" fill="#A5D6A7"/>
                  <circle cx="5" cy="48" r="2" fill="#FF6B6B"/>
                  <circle cx="12" cy="45" r="2" fill="#FF6B6B"/>
                  <circle cx="8" cy="55" r="2" fill="#FFD54F"/>
                  <!-- 地基阴影 -->
                  <ellipse cx="55" cy="88" rx="40" ry="5" fill="#8B7355" opacity="0.3"/>
                  <!-- 墙身 -->
                  <rect x="25" y="48" width="60" height="40" rx="4" fill="url(#wallGradNew1)" stroke="#E8945A" stroke-width="2"/>
                  <!-- 木板纹理 -->
                  <line x1="25" y1="58" x2="85" y2="58" stroke="#FFD4B2" stroke-width="0.8" opacity="0.5"/>
                  <line x1="25" y1="68" x2="85" y2="68" stroke="#FFD4B2" stroke-width="0.8" opacity="0.5"/>
                  <line x1="25" y1="78" x2="85" y2="78" stroke="#FFD4B2" stroke-width="0.8" opacity="0.5"/>
                  <!-- 门 -->
                  <rect x="48" y="62" width="14" height="26" rx="3" fill="#8B4513"/>
                  <rect x="50" y="64" width="10" height="22" rx="2" fill="#A0522D"/>
                  <circle cx="55" cy="75" r="1.5" fill="#FFD700"/>
                  <circle cx="55" cy="69" r="2" fill="#D2691E"/>
                  <circle cx="52" cy="66" r="1" fill="#D2691E"/>
                  <circle cx="58" cy="66" r="1" fill="#D2691E"/>
                  <!-- 左窗 - 圆拱形 -->
                  <path d="M33 58 Q33 50 40 50 Q47 50 47 58 L47 72 L33 72 Z" fill="#87CEEB" stroke="#E8945A" stroke-width="1.5"/>
                  <line x1="40" y1="50" x2="40" y2="72" stroke="#E8945A" stroke-width="1"/>
                  <line x1="33" y1="61" x2="47" y2="61" stroke="#E8945A" stroke-width="1"/>
                  <path d="M33 52 L36 52 L36 60 L33 62 Z" fill="#FFB6C1" opacity="0.6"/>
                  <path d="M47 52 L44 52 L44 60 L47 62 Z" fill="#FFB6C1" opacity="0.6"/>
                  <!-- 右窗 -->
                  <path d="M63 58 Q63 50 70 50 Q77 50 77 58 L77 72 L63 72 Z" fill="#87CEEB" stroke="#E8945A" stroke-width="1.5"/>
                  <line x1="70" y1="50" x2="70" y2="72" stroke="#E8945A" stroke-width="1"/>
                  <line x1="63" y1="61" x2="77" y2="61" stroke="#E8945A" stroke-width="1"/>
                  <path d="M63 52 L66 52 L66 60 L63 62 Z" fill="#FFB6C1" opacity="0.6"/>
                  <path d="M77 52 L74 52 L74 60 L77 62 Z" fill="#FFB6C1" opacity="0.6"/>
                  <!-- 屋顶 -->
                  <path d="M18 48 L55 8 L92 48 Z" fill="url(#roofGradNew1)" stroke="#E64A19" stroke-width="2"/>
                  <!-- 屋顶波浪边 -->
                  <path d="M22 48 Q26 44 30 48 Q34 52 38 48 Q42 44 46 48 Q50 52 54 48 Q58 44 62 48 Q66 52 70 48 Q74 44 78 48 Q82 52 86 48" fill="none" stroke="#E64A19" stroke-width="1.5" stroke-linecap="round"/>
                  <!-- 猫耳屋顶 -->
                  <path d="M32 22 L38 6 L48 16 Z" fill="url(#roofGradNew1)" stroke="#E64A19" stroke-width="1.5"/>
                  <path d="M62 16 L72 6 L78 22 Z" fill="url(#roofGradNew1)" stroke="#E64A19" stroke-width="1.5"/>
                  <path d="M35 18 L38 10 L44 16 Z" fill="#FFB6C1" opacity="0.5"/>
                  <path d="M66 16 L72 10 L75 18 Z" fill="#FFB6C1" opacity="0.5"/>
                  <!-- 烟囱 -->
                  <rect x="70" y="18" width="12" height="22" rx="2" fill="#8B4513"/>
                  <rect x="72" y="20" width="3" height="18" rx="1" fill="#A0522D" opacity="0.5"/>
                  <circle cx="76" cy="15" r="4" fill="#E0E0E0" opacity="0.6"/>
                  <circle cx="82" cy="10" r="3" fill="#E0E0E0" opacity="0.4"/>
                  <circle cx="70" cy="8" r="2.5" fill="#E0E0E0" opacity="0.3"/>
                  <!-- 门前小花 -->
                  <circle cx="30" cy="85" r="2.5" fill="#FF6B6B"/>
                  <circle cx="30" cy="85" r="1" fill="#FFD54F"/>
                  <rect x="29" y="87" width="1" height="4" fill="#66BB6A"/>
                  <circle cx="80" cy="85" r="2.5" fill="#FFE66D"/>
                  <circle cx="80" cy="85" r="1" fill="#FF8A4C"/>
                  <rect x="79" y="87" width="1" height="4" fill="#66BB6A"/>
                  <!-- 欢迎牌 -->
                  <rect x="49" y="90" width="12" height="5" rx="1" fill="#8B4513"/>
                  <rect x="54" y="93" width="2" height="5" fill="#5D4037"/>
                </svg>
                <div class="map-icon-label">我的猫窝</div>
              </div>
              <!-- 建筑2: 猫咪公园 - 大树乐园 -->
              <div class="map-icon map-icon-park" data-page="park">
                <svg class="building-svg building-park" viewBox="0 0 120 115">
                  <defs>
                    <linearGradient id="treeGradNew" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color:#81C784"/>
                      <stop offset="50%" style="stop-color:#66BB6A"/>
                      <stop offset="100%" style="stop-color:#4CAF50"/>
                    </linearGradient>
                  </defs>
                  <!-- 地面花草 -->
                  <circle cx="15" cy="105" r="5" fill="#FFB6C1"/>
                  <circle cx="15" cy="105" r="2" fill="#FFD54F"/>
                  <circle cx="30" cy="108" r="4" fill="#FFE66D"/>
                  <circle cx="30" cy="108" r="1.5" fill="#FF8A4C"/>
                  <circle cx="90" cy="107" r="5" fill="#D4A5FF"/>
                  <circle cx="90" cy="107" r="2" fill="#FFD54F"/>
                  <circle cx="105" cy="105" r="4" fill="#FF6B6B"/>
                  <circle cx="105" cy="105" r="1.5" fill="#FFD54F"/>
                  <!-- 蘑菇 -->
                  <ellipse cx="22" cy="100" rx="6" ry="4" fill="#FF6B6B"/>
                  <rect x="19" y="100" width="6" height="7" rx="1" fill="#FFF8F0"/>
                  <circle cx="19" cy="98" r="1" fill="white"/>
                  <circle cx="23" cy="97" r="1.2" fill="white"/>
                  <circle cx="25" cy="99" r="0.8" fill="white"/>
                  <!-- 树干 -->
                  <rect x="48" y="55" width="24" height="50" rx="5" fill="#8B4513"/>
                  <rect x="50" y="57" width="7" height="46" rx="2" fill="#A0522D" opacity="0.4"/>
                  <!-- 树屋平台 -->
                  <ellipse cx="60" cy="55" rx="35" ry="6" fill="#A0522D"/>
                  <ellipse cx="60" cy="53" rx="32" ry="5" fill="#8B4513"/>
                  <!-- 树屋栏杆 -->
                  <rect x="32" y="47" width="2" height="8" fill="#D2691E"/>
                  <rect x="40" y="47" width="2" height="8" fill="#D2691E"/>
                  <rect x="48" y="47" width="2" height="8" fill="#D2691E"/>
                  <rect x="70" y="47" width="2" height="8" fill="#D2691E"/>
                  <rect x="78" y="47" width="2" height="8" fill="#D2691E"/>
                  <rect x="86" y="47" width="2" height="8" fill="#D2691E"/>
                  <rect x="30" y="46" width="60" height="2" rx="1" fill="#8B4513"/>
                  <!-- 树洞门 -->
                  <path d="M52 72 Q52 60 60 60 Q68 60 68 72 L68 92 Q68 97 60 97 Q52 97 52 92 Z" fill="#4E342E"/>
                  <!-- 探出头的猫 -->
                  <circle cx="60" cy="68" r="9" fill="#FFB347"/>
                  <path d="M52 63 L50 56 L57 59 Z" fill="#FFB347"/>
                  <path d="M68 63 L70 56 L63 59 Z" fill="#FFB347"/>
                  <path d="M53 62 L52 57 L56 59 Z" fill="#FFB6C1"/>
                  <path d="M67 62 L68 57 L64 59 Z" fill="#FFB6C1"/>
                  <circle cx="56.5" cy="67" r="1.5" fill="#3E2723"/>
                  <circle cx="63.5" cy="67" r="1.5" fill="#3E2723"/>
                  <circle cx="57" cy="66" r="0.5" fill="white"/>
                  <circle cx="64" cy="66" r="0.5" fill="white"/>
                  <path d="M58.5 71 L61.5 71 L60 72.5 Z" fill="#FF6B6B"/>
                  <path d="M60 72.5 Q58.5 75 57 74" fill="none" stroke="#3E2723" stroke-width="0.8" stroke-linecap="round"/>
                  <path d="M60 72.5 Q61.5 75 63 74" fill="none" stroke="#3E2723" stroke-width="0.8" stroke-linecap="round"/>
                  <!-- 树冠 -->
                  <circle cx="60" cy="28" r="32" fill="url(#treeGradNew)"/>
                  <circle cx="30" cy="38" r="20" fill="#66BB6A"/>
                  <circle cx="90" cy="38" r="20" fill="#66BB6A"/>
                  <circle cx="60" cy="12" r="18" fill="#81C784"/>
                  <circle cx="40" cy="20" r="14" fill="#81C784"/>
                  <circle cx="80" cy="20" r="14" fill="#81C784"/>
                  <circle cx="22" cy="32" r="10" fill="#A5D6A7"/>
                  <circle cx="98" cy="32" r="10" fill="#A5D6A7"/>
                  <!-- 树叶高光 -->
                  <circle cx="50" cy="18" r="7" fill="#C8E6C9" opacity="0.6"/>
                  <circle cx="72" cy="25" r="5" fill="#C8E6C9" opacity="0.5"/>
                  <circle cx="35" cy="30" r="4" fill="#C8E6C9" opacity="0.4"/>
                  <!-- 秋千 -->
                  <line x1="35" y1="42" x2="32" y2="55" stroke="#8B4513" stroke-width="1.5"/>
                  <line x1="45" y1="42" x2="48" y2="55" stroke="#8B4513" stroke-width="1.5"/>
                  <rect x="30" y="55" width="20" height="4" rx="2" fill="#D2691E"/>
                  <!-- 小松鼠 -->
                  <circle cx="95" cy="25" r="5" fill="#A0522D"/>
                  <ellipse cx="98" cy="22" rx="3" ry="5" fill="#8B4513" transform="rotate(30 98 22)"/>
                  <circle cx="93" cy="23" r="1" fill="#3E2723"/>
                  <path d="M92 21 L91 19 L94 20 Z" fill="#A0522D"/>
                  <!-- 鸟窝 -->
                  <ellipse cx="50" cy="10" rx="6" ry="4" fill="#8B7355"/>
                  <path d="M45 10 Q50 6 55 10" fill="#6D4C41"/>
                </svg>
                <div class="map-icon-label">猫咪公园</div>
              </div>
              <!-- 建筑3: 猫咪家园 - 旋转木马 -->
              <div class="map-icon map-icon-home" data-page="home">
                <svg class="building-svg building-home" viewBox="0 0 110 125">
                  <defs>
                    <linearGradient id="carouselRoofGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color:#E91E63"/>
                      <stop offset="30%" style="stop-color:#FF5722"/>
                      <stop offset="70%" style="stop-color:#FF9800"/>
                      <stop offset="100%" style="stop-color:#FFC107"/>
                    </linearGradient>
                  </defs>
                  <!-- 底座 -->
                  <ellipse cx="55" cy="115" rx="42" ry="7" fill="#8B7355" opacity="0.4"/>
                  <ellipse cx="55" cy="112" rx="38" ry="6" fill="#DEB887"/>
                  <ellipse cx="55" cy="110" rx="35" ry="5" fill="#F5DEB3"/>
                  <!-- 中心柱 -->
                  <rect x="52" y="40" width="6" height="70" fill="#D2B48C"/>
                  <rect x="53" y="42" width="2" height="66" fill="#C9A96E" opacity="0.5"/>
                  <!-- 顶部装饰盘 -->
                  <circle cx="55" cy="40" r="16" fill="#FFD700" stroke="#FF8A4C" stroke-width="2"/>
                  <circle cx="55" cy="40" r="12" fill="#FFF8F0"/>
                  <!-- 中心猫脸 -->
                  <circle cx="55" cy="40" r="8" fill="#FFB347"/>
                  <path d="M49 36 L47 30 L53 33 Z" fill="#FFB347"/>
                  <path d="M61 36 L63 30 L57 33 Z" fill="#FFB347"/>
                  <circle cx="52" cy="39" r="1.2" fill="#3E2723"/>
                  <circle cx="58" cy="39" r="1.2" fill="#3E2723"/>
                  <path d="M53.5 42 L56.5 42 L55 43.5 Z" fill="#FF6B6B"/>
                  <!-- 顶棚 -->
                  <path d="M18 48 Q55 5 92 48 Z" fill="url(#carouselRoofGrad)"/>
                  <!-- 条纹 -->
                  <path d="M28 47 L55 12 L58 47 Z" fill="white" opacity="0.25"/>
                  <path d="M48 47 L55 8 L62 47 Z" fill="#E91E63" opacity="0.3"/>
                  <path d="M68 47 L55 12 L82 47 Z" fill="white" opacity="0.25"/>
                  <!-- 顶棚波浪边 -->
                  <path d="M18 48 Q22 52 26 48 Q30 44 34 48 Q38 52 42 48 Q46 44 50 48 Q54 52 58 48 Q62 44 66 48 Q70 52 74 48 Q78 44 82 48 Q86 52 90 48" fill="none" stroke="#E64A19" stroke-width="2" stroke-linecap="round"/>
                  <!-- 彩球装饰 -->
                  <circle cx="22" cy="50" r="2" fill="#FFD700"/>
                  <circle cx="34" cy="46" r="2" fill="#FF6B6B"/>
                  <circle cx="46" cy="50" r="2" fill="#48DBFB"/>
                  <circle cx="58" cy="46" r="2" fill="#D4A5FF"/>
                  <circle cx="70" cy="50" r="2" fill="#FFE66D"/>
                  <circle cx="82" cy="46" r="2" fill="#FF6B6B"/>
                  <!-- 顶部尖顶+旗帜 -->
                  <path d="M55 5 L58 -2 L52 -2 Z" fill="#FFD700"/>
                  <rect x="54.5" y="-10" width="1.5" height="10" fill="#8B4513"/>
                  <path d="M56 -10 L68 -6 L56 -2 Z" fill="#FF6B6B"/>
                  <circle cx="62" cy="-6" r="1.5" fill="white"/>
                  <!-- 座舱 -->
                  <rect x="8" y="70" width="18" height="16" rx="4" fill="#FF6B6B" stroke="#E64A19" stroke-width="1.5"/>
                  <path d="M17 70 L17 52 L8 70 Z" fill="#FF8A4C" opacity="0.5"/>
                  <rect x="10" y="73" width="14" height="10" rx="2" fill="#FFE0B2" opacity="0.5"/>
                  <rect x="84" y="70" width="18" height="16" rx="4" fill="#48DBFB" stroke="#00BCD4" stroke-width="1.5"/>
                  <path d="M93 70 L93 52 L102 70 Z" fill="#FF8A4C" opacity="0.5"/>
                  <rect x="86" y="73" width="14" height="10" rx="2" fill="#E0F7FA" opacity="0.5"/>
                  <rect x="22" y="85" width="16" height="14" rx="3" fill="#D4A5FF" stroke="#9C27B0" stroke-width="1.5"/>
                  <rect x="24" y="88" width="12" height="8" rx="2" fill="#F3E5F5" opacity="0.6"/>
                  <rect x="72" y="85" width="16" height="14" rx="3" fill="#FFE66D" stroke="#FFA000" stroke-width="1.5"/>
                  <rect x="74" y="88" width="12" height="8" rx="2" fill="#FFF9C4" opacity="0.6"/>
                  <!-- 绳索 -->
                  <line x1="17" y1="52" x2="48" y2="38" stroke="#8B4513" stroke-width="0.8" opacity="0.6"/>
                  <line x1="93" y1="52" x2="62" y2="38" stroke="#8B4513" stroke-width="0.8" opacity="0.6"/>
                  <line x1="30" y1="70" x2="50" y2="45" stroke="#8B4513" stroke-width="0.8" opacity="0.6"/>
                  <line x1="80" y1="70" x2="60" y2="45" stroke="#8B4513" stroke-width="0.8" opacity="0.6"/>
                  <!-- 台阶 -->
                  <rect x="48" y="105" width="14" height="3" rx="1" fill="#A0522D"/>
                  <rect x="45" y="108" width="20" height="3" rx="1" fill="#8B4513"/>
                </svg>
                <div class="map-icon-label">猫咪家园</div>
              </div>
              <!-- 建筑4: 陪伴中心 - 钟楼图书馆 -->
              <div class="map-icon map-icon-focus" data-page="focus">
                <svg class="building-svg building-focus" viewBox="0 0 100 115">
                  <defs>
                    <linearGradient id="clockTowerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color:#FFB74D"/>
                      <stop offset="50%" style="stop-color:#FF9800"/>
                      <stop offset="100%" style="stop-color:#F57C00"/>
                    </linearGradient>
                    <linearGradient id="libraryWallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color:#FFF8F0"/>
                      <stop offset="100%" style="stop-color:#FFE8D6"/>
                    </linearGradient>
                  </defs>
                  <!-- 底座阴影 -->
                  <ellipse cx="50" cy="108" rx="38" ry="5" fill="#8B7355" opacity="0.3"/>
                  <!-- 旁边的书堆 -->
                  <rect x="5" y="75" width="22" height="6" rx="1" fill="#E91E63" transform="rotate(-5 16 78)"/>
                  <rect x="7" y="70" width="20" height="6" rx="1" fill="#2196F3" transform="rotate(-5 17 73)"/>
                  <rect x="6" y="65" width="18" height="6" rx="1" fill="#4CAF50" transform="rotate(-5 15 68)"/>
                  <rect x="8" y="60" width="15" height="6" rx="1" fill="#FF9800" transform="rotate(-5 15.5 63)"/>
                  <!-- 小茶杯 -->
                  <ellipse cx="12" cy="88" rx="5" ry="2" fill="#FF5722"/>
                  <rect x="7" y="83" width="10" height="5" rx="1" fill="#FFCCBC"/>
                  <path d="M17 84 Q20 84 20 86 Q20 88 17 88" fill="none" stroke="#FF5722" stroke-width="1.5"/>
                  <path d="M9 80 Q8 77 10 75" fill="none" stroke="#BDBDBD" stroke-width="1" opacity="0.6"/>
                  <path d="M13 80 Q12 76 14 73" fill="none" stroke="#BDBDBD" stroke-width="1" opacity="0.6"/>
                  <!-- 主建筑底座 -->
                  <rect x="30" y="75" width="40" height="30" rx="4" fill="url(#libraryWallGrad)" stroke="#E8945A" stroke-width="2"/>
                  <!-- 书架窗1 -->
                  <rect x="36" y="82" width="10" height="16" rx="1" fill="#8B4513"/>
                  <line x1="41" y1="82" x2="41" y2="98" stroke="#6D4C41" stroke-width="0.8"/>
                  <line x1="36" y1="87" x2="46" y2="87" stroke="#6D4C41" stroke-width="0.8"/>
                  <line x1="36" y1="93" x2="46" y2="93" stroke="#6D4C41" stroke-width="0.8"/>
                  <rect x="37" y="83" width="3" height="3" fill="#E91E63"/>
                  <rect x="42" y="83" width="3" height="3" fill="#2196F3"/>
                  <rect x="37" y="88" width="3" height="4" fill="#4CAF50"/>
                  <rect x="42" y="88" width="3" height="4" fill="#FF9800"/>
                  <rect x="37" y="94" width="3" height="3" fill="#9C27B0"/>
                  <rect x="42" y="94" width="3" height="3" fill="#FF5722"/>
                  <!-- 书架窗2 -->
                  <rect x="54" y="82" width="10" height="16" rx="1" fill="#8B4513"/>
                  <line x1="59" y1="82" x2="59" y2="98" stroke="#6D4C41" stroke-width="0.8"/>
                  <line x1="54" y1="87" x2="64" y2="87" stroke="#6D4C41" stroke-width="0.8"/>
                  <line x1="54" y1="93" x2="64" y2="93" stroke="#6D4C41" stroke-width="0.8"/>
                  <rect x="55" y="83" width="3" height="3" fill="#00BCD4"/>
                  <rect x="60" y="83" width="3" height="3" fill="#FFEB3B"/>
                  <rect x="55" y="88" width="3" height="4" fill="#8BC34A"/>
                  <rect x="60" y="88" width="3" height="4" fill="#F44336"/>
                  <rect x="55" y="94" width="3" height="3" fill="#3F51B5"/>
                  <rect x="60" y="94" width="3" height="3" fill="#FF9800"/>
                  <!-- 门 -->
                  <rect x="46" y="90" width="8" height="15" rx="2" fill="#8B4513"/>
                  <circle cx="52" cy="98" r="0.8" fill="#FFD700"/>
                  <!-- 钟楼层 -->
                  <rect x="34" y="35" width="32" height="42" rx="6" fill="url(#clockTowerGrad)" stroke="#E65100" stroke-width="2"/>
                  <!-- 装饰线 -->
                  <rect x="32" y="40" width="36" height="3" rx="1" fill="#FFD54F"/>
                  <rect x="32" y="70" width="36" height="3" rx="1" fill="#FFD54F"/>
                  <!-- 大钟面 -->
                  <circle cx="50" cy="56" r="15" fill="white" stroke="#E65100" stroke-width="2.5"/>
                  <circle cx="50" cy="56" r="13" fill="#FFF8F0"/>
                  <!-- 刻度 -->
                  <line x1="50" y1="43" x2="50" y2="46" stroke="#5D4037" stroke-width="1.5"/>
                  <line x1="50" y1="66" x2="50" y2="69" stroke="#5D4037" stroke-width="1.5"/>
                  <line x1="37" y1="56" x2="40" y2="56" stroke="#5D4037" stroke-width="1.5"/>
                  <line x1="60" y1="56" x2="63" y2="56" stroke="#5D4037" stroke-width="1.5"/>
                  <!-- 指针 -->
                  <line x1="50" y1="56" x2="50" y2="47" stroke="#E65100" stroke-width="2.5" stroke-linecap="round"/>
                  <line x1="50" y1="56" x2="58" y2="60" stroke="#5D4037" stroke-width="1.5" stroke-linecap="round"/>
                  <circle cx="50" cy="56" r="2.5" fill="#E65100"/>
                  <circle cx="50" cy="56" r="1" fill="#FFD54F"/>
                  <!-- 顶部圆顶 -->
                  <path d="M34 35 Q34 12 50 8 Q66 12 66 35" fill="url(#clockTowerGrad)" stroke="#E65100" stroke-width="2"/>
                  <path d="M38 22 Q50 15 62 22" fill="none" stroke="#FFD54F" stroke-width="1.5"/>
                  <!-- 铃铛 -->
                  <circle cx="38" cy="18" r="5" fill="#FFD700" stroke="#FFA000" stroke-width="1"/>
                  <circle cx="62" cy="18" r="5" fill="#FFD700" stroke="#FFA000" stroke-width="1"/>
                  <rect x="37" y="12" width="2" height="3" fill="#8B4513"/>
                  <rect x="61" y="12" width="2" height="3" fill="#8B4513"/>
                  <!-- 顶尖星星 -->
                  <path d="M50 2 L51.8 7.5 L57.5 8 L52.8 11.5 L54.5 17 L50 13.5 L45.5 17 L47.2 11.5 L42.5 8 L48.2 7.5 Z" fill="#FFD700" stroke="#FFA000" stroke-width="0.5"/>
                  <!-- 月亮装饰 -->
                  <path d="M25 15 Q28 12 30 15 Q28 18 25 18 Q23 16.5 25 15 Z" fill="#FFF9C4" opacity="0.8"/>
                </svg>
                <div class="map-icon-label">陪伴中心</div>
              </div>
              <!-- 草地装饰层 -->
              <div class="map-grass">
                <svg class="deco-flower flower-1" viewBox="0 0 22 26">
                  <circle cx="11" cy="9" r="4" fill="#FF6B6B"/>
                  <circle cx="7" cy="11" r="3.5" fill="#FF6B6B"/>
                  <circle cx="15" cy="11" r="3.5" fill="#FF6B6B"/>
                  <circle cx="9" cy="6" r="3" fill="#FF6B6B"/>
                  <circle cx="13" cy="6" r="3" fill="#FF6B6B"/>
                  <circle cx="11" cy="9" r="2" fill="#FFD54F"/>
                  <rect x="10" y="13" width="2" height="11" rx="1" fill="#66BB6A"/>
                  <path d="M12 18 Q16 17 15 13" fill="#81C784"/>
                  <ellipse cx="15" cy="14.5" rx="2" ry="1.5" fill="#81C784"/>
                </svg>
                <svg class="deco-flower flower-2" viewBox="0 0 18 22">
                  <circle cx="9" cy="8" r="3.5" fill="#FFE66D"/>
                  <circle cx="5.5" cy="10" r="3" fill="#FFE66D"/>
                  <circle cx="12.5" cy="10" r="3" fill="#FFE66D"/>
                  <circle cx="7.5" cy="5.5" r="2.5" fill="#FFE66D"/>
                  <circle cx="10.5" cy="5.5" r="2.5" fill="#FFE66D"/>
                  <circle cx="9" cy="8" r="1.5" fill="#FF8A4C"/>
                  <rect x="8" y="12" width="2" height="9" rx="1" fill="#66BB6A"/>
                </svg>
                <svg class="deco-flower flower-3" viewBox="0 0 20 24">
                  <circle cx="10" cy="8" r="4" fill="#D4A5FF"/>
                  <circle cx="6" cy="10" r="3.5" fill="#D4A5FF"/>
                  <circle cx="14" cy="10" r="3.5" fill="#D4A5FF"/>
                  <circle cx="8" cy="5" r="3" fill="#D4A5FF"/>
                  <circle cx="12" cy="5" r="3" fill="#D4A5FF"/>
                  <circle cx="10" cy="8" r="2" fill="#FFD54F"/>
                  <rect x="9" y="12" width="2" height="10" rx="1" fill="#66BB6A"/>
                  <path d="M9 16 Q5 15 6 11" fill="#81C784"/>
                  <ellipse cx="6.5" cy="12.5" rx="2" ry="1.5" fill="#81C784"/>
                </svg>
                <svg class="deco-flower flower-4" viewBox="0 0 16 20">
                  <circle cx="8" cy="7" r="3" fill="#48DBFB"/>
                  <circle cx="5" cy="9" r="2.5" fill="#48DBFB"/>
                  <circle cx="11" cy="9" r="2.5" fill="#48DBFB"/>
                  <circle cx="6.5" cy="4.5" r="2" fill="#48DBFB"/>
                  <circle cx="9.5" cy="4.5" r="2" fill="#48DBFB"/>
                  <circle cx="8" cy="7" r="1.2" fill="#FFD54F"/>
                  <rect x="7" y="10" width="2" height="8" rx="1" fill="#66BB6A"/>
                </svg>
                <svg class="deco-flower flower-5" viewBox="0 0 14 18">
                  <circle cx="7" cy="6" r="2.5" fill="#FFB6C1"/>
                  <circle cx="4.5" cy="7.5" r="2" fill="#FFB6C1"/>
                  <circle cx="9.5" cy="7.5" r="2" fill="#FFB6C1"/>
                  <circle cx="5.5" cy="4" r="1.8" fill="#FFB6C1"/>
                  <circle cx="8.5" cy="4" r="1.8" fill="#FFB6C1"/>
                  <circle cx="7" cy="6" r="1" fill="#FFD54F"/>
                  <rect x="6" y="9" width="2" height="7" rx="1" fill="#66BB6A"/>
                </svg>
                <!-- 草丛 -->
                <svg class="deco-bush bush-1" viewBox="0 0 55 30">
                  <ellipse cx="15" cy="22" rx="14" ry="10" fill="#66BB6A"/>
                  <ellipse cx="28" cy="18" rx="16" ry="13" fill="#81C784"/>
                  <ellipse cx="42" cy="23" rx="12" ry="9" fill="#66BB6A"/>
                  <ellipse cx="25" cy="12" rx="8" ry="7" fill="#A5D6A7" opacity="0.7"/>
                  <ellipse cx="35" cy="14" rx="5" ry="4" fill="#A5D6A7" opacity="0.5"/>
                </svg>
                <svg class="deco-bush bush-2" viewBox="0 0 48 26">
                  <ellipse cx="12" cy="20" rx="11" ry="8" fill="#81C784"/>
                  <ellipse cx="24" cy="16" rx="14" ry="11" fill="#66BB6A"/>
                  <ellipse cx="36" cy="19" rx="12" ry="9" fill="#81C784"/>
                  <ellipse cx="30" cy="10" rx="6" ry="5" fill="#A5D6A7" opacity="0.6"/>
                </svg>
                <svg class="deco-bush bush-3" viewBox="0 0 40 22">
                  <ellipse cx="10" cy="16" rx="9" ry="7" fill="#66BB6A"/>
                  <ellipse cx="22" cy="13" rx="12" ry="10" fill="#81C784"/>
                  <ellipse cx="32" cy="16" rx="8" ry="6" fill="#66BB6A"/>
                  <ellipse cx="18" cy="8" rx="5" ry="4" fill="#A5D6A7" opacity="0.5"/>
                </svg>
                <svg class="deco-bush bush-4" viewBox="0 0 35 20">
                  <ellipse cx="9" cy="14" rx="8" ry="6" fill="#81C784"/>
                  <ellipse cx="18" cy="11" rx="10" ry="8" fill="#66BB6A"/>
                  <ellipse cx="27" cy="14" rx="7" ry="5" fill="#81C784"/>
                </svg>
              </div>
              <!-- 摩天轮装饰 -->
              <svg class="deco-ferris-base" viewBox="0 0 28 22">
                <path d="M14 22 L5 5" stroke="#8B4513" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M14 22 L23 5" stroke="#8B4513" stroke-width="2.5" stroke-linecap="round"/>
                <rect x="11" y="19" width="6" height="5" rx="1.5" fill="#D2691E"/>
                <rect x="13" y="21" width="2" height="2" fill="#8B4513"/>
              </svg>
              <svg class="deco-ferris-wheel" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="27" fill="none" stroke="#FF6B6B" stroke-width="2.5"/>
                <circle cx="30" cy="30" r="4" fill="#FFD700" stroke="#FF8A4C" stroke-width="1"/>
                <line x1="30" y1="4" x2="30" y2="26" stroke="#FFB088" stroke-width="1.5"/>
                <line x1="30" y1="34" x2="30" y2="56" stroke="#FFB088" stroke-width="1.5"/>
                <line x1="4" y1="30" x2="26" y2="30" stroke="#FFB088" stroke-width="1.5"/>
                <line x1="34" y1="30" x2="56" y2="30" stroke="#FFB088" stroke-width="1.5"/>
                <line x1="11" y1="11" x2="25" y2="25" stroke="#FFB088" stroke-width="1.5"/>
                <line x1="35" y1="35" x2="49" y2="49" stroke="#FFB088" stroke-width="1.5"/>
                <line x1="49" y1="11" x2="35" y2="25" stroke="#FFB088" stroke-width="1.5"/>
                <line x1="25" y1="35" x2="11" y2="49" stroke="#FFB088" stroke-width="1.5"/>
                <rect x="26" y="1" width="8" height="6" rx="2" fill="#FFB6C1" stroke="#FF6B6B" stroke-width="0.5"/>
                <rect x="26" y="53" width="8" height="6" rx="2" fill="#87CEEB" stroke="#2196F3" stroke-width="0.5"/>
                <rect x="1" y="27" width="6" height="7" rx="2" fill="#FFE66D" stroke="#FFC107" stroke-width="0.5"/>
                <rect x="53" y="27" width="6" height="7" rx="2" fill="#D4A5FF" stroke="#9C27B0" stroke-width="0.5"/>
                <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#81C784" stroke="#4CAF50" stroke-width="0.5"/>
                <rect x="45" y="9" width="6" height="6" rx="1.5" fill="#FFB088" stroke="#FF8A4C" stroke-width="0.5"/>
                <rect x="45" y="45" width="6" height="6" rx="1.5" fill="#FFB6C1" stroke="#FF6B6B" stroke-width="0.5"/>
                <rect x="9" y="45" width="6" height="6" rx="1.5" fill="#87CEEB" stroke="#2196F3" stroke-width="0.5"/>
              </svg>
            </div>
          </div>
          <!-- 全屏页面容器 -->
          <div class="page-container" id="pageContainer">
            <!-- 我的猫页面 -->
            <div class="full-page page-cat" id="pageCat">
              <div class="page-header">
                <button class="page-back-btn" data-page-back>←</button>
                <span class="page-title">🐾 我的猫</span>
                <span class="page-header-spacer"></span>
              </div>
              <div class="page-content cat-tab-content" id="pageCatContent"></div>
            </div>
            <!-- 猫咪公园页面 -->
            <div class="full-page page-park" id="pagePark">
              <div class="page-header">
                <button class="page-back-btn" data-page-back>←</button>
                <span class="page-title">🌳 猫咪公园</span>
                <span class="page-header-spacer"></span>
              </div>
              <div class="page-content park-tab-content" id="pageParkContent"></div>
            </div>
            <!-- 猫咪家园页面 -->
            <div class="full-page page-home" id="pageHome">
              <div class="page-header">
                <button class="page-back-btn" data-page-back>←</button>
                <span class="page-title">🏠 猫咪家园</span>
                <span class="page-header-spacer"></span>
              </div>
              <div class="page-content home-tab-content" id="pageHomeContent"></div>
            </div>
            <!-- 专注模式页面 -->
            <div class="full-page page-focus" id="pageFocus">
              <div class="page-header">
                <button class="page-back-btn" data-page-back>←</button>
                <span class="page-title">⏱️ 专注模式</span>
                <span class="page-header-spacer"></span>
              </div>
              <div class="page-content focus-tab-content" id="pageFocusContent"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    // 盲盒弹窗
    const blindBoxEl = document.createElement('div');
    blindBoxEl.id = 'blindBoxModal';
    blindBoxEl.className = 'blind-box-modal';
    blindBoxEl.style.display = 'none';
    blindBoxEl.innerHTML = `
      <div class="blind-box-content" onclick="event.stopPropagation()">
        <div class="blind-box-title" id="blindBoxTitle">🎁 专注完成！获得盲盒</div>
        <div class="blind-box-stage">
          <div class="blind-box-wrapper" id="blindBoxWrapper">
            <div class="blind-box-icon" id="blindBoxIcon">📦</div>
            <div class="blind-box-shine"></div>
          </div>
        </div>
        <div class="blind-box-result" id="blindBoxResult" style="display:none;">
          <div class="blind-box-tier" id="blindBoxTier"></div>
          <div class="blind-box-rewards" id="blindBoxRewards"></div>
        </div>
        <button class="blind-box-btn" id="blindBoxOpenBtn">👆 点击开启</button>
        <button class="blind-box-close-btn" id="blindBoxCloseBtn" style="display:none;">太棒了！</button>
      </div>
    `;
    document.body.appendChild(blindBoxEl);

    // 升级提示弹窗
    const levelUpToastEl = document.createElement('div');
    levelUpToastEl.id = 'levelUpToast';
    levelUpToastEl.className = 'level-up-toast';
    levelUpToastEl.style.display = 'none';
    levelUpToastEl.innerHTML = `
      <div class="level-up-content">
        <div class="level-up-icon">⬆️</div>
        <div class="level-up-text">
          <div class="level-up-title">成长啦！</div>
          <div class="level-up-detail" id="levelUpDetail">小奶猫 → 幼猫</div>
          <div class="level-up-bonus" id="levelUpBonus">猫咪又长大了一些~</div>
        </div>
      </div>
    `;
    document.body.appendChild(levelUpToastEl);

    // 每日任务弹窗（签到已拆分为独立弹窗，见 checkinModal）
    const dailyTasksModalEl = document.createElement('div');
    dailyTasksModalEl.id = 'dailyTasksModal';
    dailyTasksModalEl.className = 'daily-tasks-modal';
    dailyTasksModalEl.style.display = 'none';
    dailyTasksModalEl.innerHTML = `
      <div class="modal-content daily-tasks-modal-content" onclick="event.stopPropagation()">
        <button class="modal-close-btn" id="dailyTasksCloseBtn">✕</button>
        <div class="modal-title">📋 每日任务</div>
        <div class="daily-tasks-refresh modal-subtitle">每日0点刷新</div>
        <div class="daily-tasks-list" id="modalDailyTasksList"></div>
      </div>
    `;
    document.body.appendChild(dailyTasksModalEl);

    // 每日签到弹窗（独立入口：侧栏「每日签到」）
    const checkinModalEl = document.createElement('div');
    checkinModalEl.id = 'checkinModal';
    checkinModalEl.className = 'checkin-modal';
    checkinModalEl.style.display = 'none';
    checkinModalEl.innerHTML = `
      <div class="checkin-content" onclick="event.stopPropagation()">
        <button class="checkin-close-btn" id="checkinCloseBtn">✕</button>
        <div class="checkin-head">
          <div class="checkin-title">📅 每日签到</div>
          <div class="checkin-streak-chip">已连续 <b id="checkinStreakNum">0</b> 天</div>
        </div>
        <div class="checkin-week" id="checkinWeek"></div>
        <div class="checkin-today-reward" id="checkinTodayReward"></div>
        <button class="checkin-btn" id="checkinDoBtn">🎁 立即签到</button>
        <div class="checkin-result" id="checkinResult" style="display:none;">
          <div class="checkin-result-title" id="checkinResultTitle">签到成功！</div>
          <div class="checkin-result-items" id="checkinResultItems"></div>
        </div>
      </div>
    `;
    document.body.appendChild(checkinModalEl);

    // 新手任务弹窗
    const newbieTasksModalEl = document.createElement('div');
    newbieTasksModalEl.id = 'newbieTasksModal';
    newbieTasksModalEl.className = 'newbie-tasks-modal';
    newbieTasksModalEl.style.display = 'none';
    newbieTasksModalEl.innerHTML = `
      <div class="modal-content newbie-tasks-modal-content" onclick="event.stopPropagation()">
        <button class="modal-close-btn" id="newbieTasksCloseBtn">✕</button>
        <div class="modal-title">🎯 新手任务</div>
        <div class="modal-subtitle">完成新手任务获取丰厚奖励</div>
        <div class="newbie-tasks-list" id="modalNewbieTasksList"></div>
      </div>
    `;
    document.body.appendChild(newbieTasksModalEl);

    // 商店弹窗
    const shopModalEl = document.createElement('div');
    shopModalEl.id = 'shopModal';
    shopModalEl.className = 'shop-modal';
    shopModalEl.style.display = 'none';
    shopModalEl.innerHTML = `
      <div class="modal-content shop-modal-content" onclick="event.stopPropagation()">
        <button class="modal-close-btn" id="shopModalCloseBtn">✕</button>
        <div class="modal-title">🛒 商店</div>
        <div class="shop-tabs">
          <div class="shop-tab active" data-shop="food">🥫 食物</div>
          <div class="shop-tab" data-shop="toy">🧸 玩具</div>
          <div class="shop-tab" data-shop="item">🎁 道具</div>
        </div>
        <div class="shop-grid" id="modalShopGrid"></div>
      </div>
    `;
    document.body.appendChild(shopModalEl);

    // 图鉴弹窗
    const collectionModalEl = document.createElement('div');
    collectionModalEl.id = 'collectionModal';
    collectionModalEl.className = 'collection-modal';
    collectionModalEl.style.display = 'none';
    collectionModalEl.innerHTML = `
      <div class="modal-content collection-modal-content" onclick="event.stopPropagation()">
        <button class="modal-close-btn" id="collectionModalCloseBtn">✕</button>
        <div class="modal-title">📖 猫咪图鉴</div>
        <div class="collection-progress" id="collectionProgress"></div>
        <div class="collection-tabs" role="tablist">
          <div class="collection-tab active" data-collection="common" role="tab" tabindex="0" aria-selected="true">🐾 普通</div>
          <div class="collection-tab" data-collection="rare" role="tab" tabindex="0" aria-selected="false">✨ 稀有</div>
          <div class="collection-tab" data-collection="all" role="tab" tabindex="0" aria-selected="false">📚 全部</div>
        </div>
        <div class="collection-grid" id="collectionGrid"></div>
        <div class="collection-hint">💡 收集不同品种的猫咪，稀有品种需要通过繁育获得哦~</div>
      </div>
    `;
    document.body.appendChild(collectionModalEl);

    // 绑定关闭
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });
    document.getElementById('petCloseBtn').addEventListener('click', close);

    // 地图图标点击 - 进入对应全屏页面
    document.querySelectorAll('.map-icon').forEach(icon => {
      icon.addEventListener('click', () => {
        navigateTo(icon.dataset.page);
      });
    });

    // 返回按钮点击
    document.querySelectorAll('[data-page-back]').forEach(btn => {
      btn.addEventListener('click', () => {
        goBack();
      });
    });

    // 左侧栏按钮
    const sideCheckinBtn = document.getElementById('sideCheckinBtn');
    if (sideCheckinBtn) sideCheckinBtn.addEventListener('click', openCheckinModal);
    const sideDailyBtn = document.getElementById('sideDailyTasksBtn');
    if (sideDailyBtn) sideDailyBtn.addEventListener('click', openDailyTasksModal);
    const sideNewbieBtn = document.getElementById('sideNewbieTasksBtn');
    if (sideNewbieBtn) sideNewbieBtn.addEventListener('click', openNewbieTasksModal);
    const sideShopBtn = document.getElementById('sideShopBtn');
    if (sideShopBtn) sideShopBtn.addEventListener('click', openShopModal);
    const sideCollectionBtn = document.getElementById('sideCollectionBtn');
    if (sideCollectionBtn) sideCollectionBtn.addEventListener('click', openCollectionModal);

    // 每日任务弹窗关闭
    const dailyTasksCloseBtn = document.getElementById('dailyTasksCloseBtn');
    if (dailyTasksCloseBtn) dailyTasksCloseBtn.addEventListener('click', closeDailyTasksModal);
    const dailyTasksModal = document.getElementById('dailyTasksModal');
    if (dailyTasksModal) {
      dailyTasksModal.addEventListener('click', (e) => {
        if (e.target === dailyTasksModal) closeDailyTasksModal();
      });
    }

    // 每日签到弹窗关闭
    const checkinCloseBtn = document.getElementById('checkinCloseBtn');
    if (checkinCloseBtn) checkinCloseBtn.addEventListener('click', closeCheckinModal);
    const checkinModalEl2 = document.getElementById('checkinModal');
    if (checkinModalEl2) {
      checkinModalEl2.addEventListener('click', (e) => {
        if (e.target === checkinModalEl2) closeCheckinModal();
      });
    }

    // 新手任务弹窗关闭
    const newbieTasksCloseBtn = document.getElementById('newbieTasksCloseBtn');
    if (newbieTasksCloseBtn) newbieTasksCloseBtn.addEventListener('click', closeNewbieTasksModal);
    const newbieTasksModal = document.getElementById('newbieTasksModal');
    if (newbieTasksModal) {
      newbieTasksModal.addEventListener('click', (e) => {
        if (e.target === newbieTasksModal) closeNewbieTasksModal();
      });
    }

    // 商店弹窗关闭及标签切换
    const shopModalCloseBtn = document.getElementById('shopModalCloseBtn');
    if (shopModalCloseBtn) shopModalCloseBtn.addEventListener('click', closeShopModal);
    const shopModal = document.getElementById('shopModal');
    if (shopModal) {
      shopModal.addEventListener('click', (e) => {
        if (e.target === shopModal) closeShopModal();
      });
      // 商店子标签
      shopModal.querySelectorAll('.shop-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          shopModal.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          renderModalShopGrid(tab.dataset.shop);
        });
      });
    }

    // 图鉴弹窗关闭及标签切换
    const collectionModalCloseBtn = document.getElementById('collectionModalCloseBtn');
    if (collectionModalCloseBtn) collectionModalCloseBtn.addEventListener('click', closeCollectionModal);
    const collectionModal = document.getElementById('collectionModal');
    if (collectionModal) {
      collectionModal.addEventListener('click', (e) => {
        if (e.target === collectionModal) closeCollectionModal();
      });
      // 图鉴子标签（点击 + 键盘 Enter/空格 双通道，role=tab 需可键盘激活）
      collectionModal.querySelectorAll('.collection-tab').forEach(tab => {
        const activate = () => {
          collectionModal.querySelectorAll('.collection-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          renderCollectionGrid(tab.dataset.collection);
        };
        tab.addEventListener('click', activate);
        tab.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
      });
    }

    // 签到按钮（在每日任务弹窗的签到标签页中）
    const checkinDoBtn = document.getElementById('checkinDoBtn');
    if (checkinDoBtn) {
      checkinDoBtn.addEventListener('click', doCheckinAction);
    }
  }

  // ===== 打开/关闭 =====
  function open(options = {}) {
    if (options.onCoinsChange) onCoinsChange = options.onCoinsChange;
    createModal();
    modalEl.style.display = 'flex';
    // 默认显示地图主页
    currentPage = 'map';
    updatePageVisibility();
    window.PET_RENDERER.loadSprites();
    updateCheckinEntry();
  }

  function close() {
    if (modalEl) modalEl.style.display = 'none';
    stopAnimation();
    stopParkAnimation();
  }

  // ===== 页面导航 =====
  function navigateTo(page) {
    if (page === 'shop') {
      // 商店是弹窗，特殊处理
      openShopModal();
      return;
    }
    if (currentPage === page) return;

    // 离开公园页面时停止公园动画
    if (currentPage === 'park' && page !== 'park') {
      stopParkAnimation();
      hideCatBubble();
    }
    // 离开猫咪页面时停止猫咪渲染动画
    if (currentPage === 'cat' && page !== 'cat') {
      stopAnimation();
    }

    pageTransitionDirection = 'forward';
    const oldPage = currentPage;
    currentPage = page;
    currentTab = page; // 向后兼容

    updatePageVisibility();
    renderPage(page);

    // 切回猫咪页面时重新启动动画
    if (page === 'cat') {
      startAnimation();
    }
    if (page === 'park') {
      startParkAnimation();
    }
  }

  function goBack() {
    if (currentPage === 'map') return;

    // 离开当前页面时停止对应动画
    if (currentPage === 'park') {
      stopParkAnimation();
      hideCatBubble();
    }
    if (currentPage === 'cat') {
      stopAnimation();
    }

    pageTransitionDirection = 'back';
    currentPage = 'map';
    currentTab = 'cat'; // 向后兼容默认值

    updatePageVisibility();
  }

  function updatePageVisibility() {
    const mapHome = document.getElementById('mapHome');
    const pageContainer = document.getElementById('pageContainer');
    if (!mapHome || !pageContainer) return;

    // 显示/隐藏地图主页
    if (currentPage === 'map') {
      mapHome.style.display = 'flex';
      pageContainer.style.display = 'none';
    } else {
      mapHome.style.display = 'none';
      pageContainer.style.display = 'block';
    }

    // 显示对应全屏页面
    const pages = ['cat', 'park', 'home', 'focus'];
    pages.forEach(p => {
      const pageEl = document.getElementById('page' + p.charAt(0).toUpperCase() + p.slice(1));
      if (pageEl) {
        if (p === currentPage) {
          pageEl.classList.add('active');
          pageEl.classList.remove('slide-out-left', 'slide-out-right');
          if (pageTransitionDirection === 'forward') {
            pageEl.classList.add('slide-in-right');
          } else {
            pageEl.classList.add('slide-in-left');
          }
          // 清理动画类
          setTimeout(() => {
            pageEl.classList.remove('slide-in-right', 'slide-in-left');
          }, 300);
        } else {
          pageEl.classList.remove('active');
        }
      }
    });
  }

  // ===== 向后兼容：switchTab =====
  function switchTab(tab) {
    if (tab === 'shop') {
      openShopModal();
    } else {
      navigateTo(tab);
    }
  }

  // ===== 渲染 =====
  function render() {
    updateCoinDisplay();
    if (currentPage === 'map') {
      // 地图主页不需要额外渲染
      return;
    }
    renderPage(currentPage);
  }

  function renderPage(page) {
    updateCoinDisplay();
    let contentId, contentEl;
    switch (page) {
      case 'cat':
        contentEl = document.getElementById('pageCatContent');
        if (contentEl) renderCatTab(contentEl);
        break;
      case 'park':
        contentEl = document.getElementById('pageParkContent');
        if (contentEl) renderParkTab(contentEl);
        // 猫咪公园社交区（服务端权威：5 只目录猫 + 好感度 + 繁育申请）由 bridge 注入渲染
        if (window.catPark && typeof window.catPark.renderSection === 'function') {
          window.catPark.renderSection(contentEl);
        }
        break;
      case 'home':
        contentEl = document.getElementById('pageHomeContent');
        if (contentEl) renderHomeTab(contentEl);
        break;
      case 'focus':
        contentEl = document.getElementById('pageFocusContent');
        if (contentEl) renderFocusTab(contentEl);
        break;
    }
  }

  function updateCoinDisplay() {
    const el = document.getElementById('petCoinCount');
    if (el) el.textContent = Math.floor(window.PET_ENGINE.getState().coins);
  }

  // ===== 每日任务弹窗 =====
  function openDailyTasksModal() {
    const modal = document.getElementById('dailyTasksModal');
    if (!modal) return;
    modal.style.display = 'flex';
    renderModalDailyTasks();
  }

  function closeDailyTasksModal() {
    const modal = document.getElementById('dailyTasksModal');
    if (modal) modal.style.display = 'none';
  }

  function renderModalDailyTasks() {
    const listEl = document.getElementById('modalDailyTasksList');
    if (!listEl) return;
    try {
      const tasks = window.PET_ENGINE.getDailyTasks();
      listEl.innerHTML = '';
      tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'daily-task-item' + (task.completed ? ' completed' : '') + (task.claimed ? ' claimed' : '');
        const progress = Math.min(100, (task.progress / task.target) * 100);
        const taskIconMap = {
          'daily_invite': '👥',
          'daily_gossip': '💬',
          'daily_post_task': '📝',
          'daily_claim_task': '🤝'
        };
        const taskIcon = task.icon || taskIconMap[task.id] || '📋';
        item.innerHTML = `
          <div class="daily-task-icon">${taskIcon}</div>
          <div class="daily-task-info">
            <div class="daily-task-name">${task.name}</div>
            <div class="daily-task-desc">${task.desc || ''}</div>
            <div class="daily-task-progress-bar">
              <div class="daily-task-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="daily-task-progress-text">${task.progress || 0}/${task.target || 1}</div>
          </div>
          <div class="daily-task-reward-col">
            <div class="daily-task-reward">
              <span class="daily-task-reward-icon">${task.rewardIcon || '🎁'}</span>
              <span class="daily-task-reward-text">${task.rewardText || '奖励'}</span>
            </div>
            ${task.canClaim 
              ? `<button class="daily-task-claim-btn" data-taskid="${task.id}">领取</button>`
              : task.claimed 
                ? '<span class="daily-task-claimed-tag">已领取</span>'
                : '<span class="daily-task-go-btn">去完成</span>'
            }
          </div>
        `;
        listEl.appendChild(item);
      });
      // 绑定领取按钮
      listEl.querySelectorAll('.daily-task-claim-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskid;
          const result = window.PET_ENGINE.claimDailyTask(taskId);
          if (result.success) {
            toast('🎉 领取成功！' + (result.reward ? ' 获得 ' + result.reward : ''));
            updateCoinDisplay();
            renderModalDailyTasks();
          } else {
            toast(result.msg || '领取失败');
          }
        };
      });
    } catch (e) {
      listEl.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">加载失败</div>';
    }
  }

  // ===== 新手任务弹窗 =====
  function openNewbieTasksModal() {
    const modal = document.getElementById('newbieTasksModal');
    if (!modal) return;
    modal.style.display = 'flex';
    renderModalNewbieTasks();
  }

  function closeNewbieTasksModal() {
    const modal = document.getElementById('newbieTasksModal');
    if (modal) modal.style.display = 'none';
  }

  function renderModalNewbieTasks() {
    const listEl = document.getElementById('modalNewbieTasksList');
    if (!listEl) return;
    try {
      const tasks = window.PET_ENGINE.getNewbieTasks();
      listEl.innerHTML = '';
      tasks.forEach((task, idx) => {
        const progress = task.target > 0 ? Math.min(100, (task.progress / task.target) * 100) : 0;
        const item = document.createElement('div');
        item.className = 'newbie-task-item' + (task.completed ? ' completed' : '');
        item.innerHTML = `
          <div class="newbie-task-num">${idx + 1}</div>
          <div class="newbie-task-info">
            <div class="newbie-task-name">${task.name}</div>
            <div class="newbie-task-desc">${task.desc || ''}</div>
            ${task.completed 
              ? '<div class="newbie-task-done">已完成</div>' 
              : `<div class="daily-task-progress-bar" style="margin-top:4px;">
                  <div class="daily-task-progress-fill" style="width:${progress}%"></div>
                </div>
                <div class="daily-task-progress-text">${task.progress || 0}/${task.target || 1}</div>`
            }
          </div>
          <div class="newbie-task-reward">
            ${task.rewardText || '🎁'}
          </div>
        `;
        listEl.appendChild(item);
      });
    } catch (e) {
      listEl.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">加载失败</div>';
    }
  }

  // ===== 商店弹窗 =====
  function openShopModal() {
    const modal = document.getElementById('shopModal');
    if (!modal) return;
    modal.style.display = 'flex';
    renderModalShopGrid('food');
  }

  function closeShopModal() {
    const modal = document.getElementById('shopModal');
    if (modal) modal.style.display = 'none';
  }

  function renderModalShopGrid(type) {
    const grid = document.getElementById('modalShopGrid');
    if (!grid) return;

    let items;
    let buyFn;
    let invKey;

    switch(type) {
      case 'food':
        items = FOODS;
        buyFn = (id) => window.PET_ENGINE.buyFood(id, 1);
        invKey = 'foods';
        break;
      case 'toy':
        items = TOYS;
        buyFn = (id) => window.PET_ENGINE.buyToy(id, 1);
        invKey = 'toys';
        break;
      case 'item':
        items = ITEMS;
        buyFn = (id) => window.PET_ENGINE.buyItem(id);
        invKey = 'items';
        break;
    }

    const state = window.PET_ENGINE.getState();
    const inv = state.inventory[invKey] || {};

    grid.innerHTML = '';
    items.forEach(item => {
      const owned = inv[item.id] || 0;
      const canAfford = state.coins >= item.price;
      const card = document.createElement('div');
      card.className = 'shop-item-card' + (!canAfford ? ' disabled' : '');
      card.innerHTML = `
        <div class="shop-item-icon">${item.icon || item.emoji || '📦'}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc || ''}</div>
        <div class="shop-item-owned">拥有: ${owned}</div>
        <button class="shop-item-buy-btn" data-id="${item.id}">
          💰 ${item.price}
        </button>
      `;
      grid.appendChild(card);
    });

    // 绑定购买按钮
    grid.querySelectorAll('.shop-item-buy-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const result = buyFn(id);
        if (result.success) {
          toast('🛒 购买成功！');
          updateCoinDisplay();
          renderModalShopGrid(type);
        } else {
          toast(result.msg || '购买失败');
        }
      };
    });
  }

  // ===== 图鉴功能 =====
  function openCollectionModal() {
    const modal = document.getElementById('collectionModal');
    if (!modal) return;
    modal.style.display = 'flex';
    renderCollectionGrid('common');
    updateCollectionProgress();
  }

  function closeCollectionModal() {
    const modal = document.getElementById('collectionModal');
    if (modal) modal.style.display = 'none';
  }

  function updateCollectionProgress() {
    const progressEl = document.getElementById('collectionProgress');
    if (!progressEl) return;
    const allBreeds = window.PET_DATA.CATS;
    const state = window.PET_ENGINE.getState();
    const ownedBreedIds = new Set(state.cats.map(c => c.catId));
    const ownedCount = allBreeds.filter(b => ownedBreedIds.has(b.id)).length;
    const totalCount = allBreeds.length;
    const percent = Math.round((ownedCount / totalCount) * 100);
    
    progressEl.innerHTML = `
      <div class="collection-progress-bar">
        <div class="collection-progress-fill" style="width: ${percent}%"></div>
      </div>
      <div class="collection-progress-text">已收集 ${ownedCount} / ${totalCount} 种 (${percent}%)</div>
    `;
  }

  function renderCollectionGrid(tab) {
    const grid = document.getElementById('collectionGrid');
    if (!grid) return;
    
    const allBreeds = window.PET_DATA.CATS;
    const state = window.PET_ENGINE.getState();
    const ownedBreedIds = new Set(state.cats.map(c => c.catId));
    
    // 按标签筛选
    let breeds = allBreeds;
    if (tab === 'common') {
      breeds = allBreeds.filter(b => b.rarity === 'common');
    } else if (tab === 'rare') {
      breeds = allBreeds.filter(b => b.rarity === 'rare');
    }

    grid.innerHTML = '';
    breeds.forEach(breed => {
      const owned = ownedBreedIds.has(breed.id);
      const rarityLabel = breed.rarity === 'common' ? '普通' : 
        (breed.rarityLevel === 3 ? '稀有Ⅲ' : breed.rarityLevel === 4 ? '稀有Ⅳ' : '稀有Ⅴ');
      const rarityClass = breed.rarity === 'common' ? 'common' : 
        (breed.rarityLevel === 3 ? 'rare3' : breed.rarityLevel === 4 ? 'rare4' : 'rare5');
      
      const card = document.createElement('div');
      card.className = `collection-card rarity-${rarityClass} ${owned ? 'owned' : 'locked'}`;
      card.innerHTML = `
        <div class="collection-card-inner">
          <div class="collection-cat-icon">
            ${owned 
              ? `<canvas class="collection-cat-canvas" data-breed="${breed.id}" role="img" aria-label="${breed.name}" width="108" height="108"></canvas>` 
              : '<span class="locked-icon" aria-hidden="true">❓</span>'}
          </div>
          <div class="collection-cat-name">${owned ? breed.name : '???'}</div>
          <div class="collection-cat-rarity rarity-tag-${rarityClass}">${rarityLabel}</div>
          ${owned ? `
            <div class="collection-cat-desc">${breed.desc || ''}</div>
            <div class="collection-cat-count">已拥有 ×${state.cats.filter(c => c.catId === breed.id).length}</div>
          ` : `
            <div class="collection-cat-hint">
              ${breed.onlyFromBreeding ? '通过繁育获得' : '可在商店购买'}
            </div>
          `}
        </div>
      `;
      grid.appendChild(card);
    });
    
    // 绘制已拥有猫咪的坐姿图
    if (ownedBreedIds.size > 0 && window.PET_RENDERER && window.PET_RENDERER.drawCat) {
      // 确保sprite加载完成后绘制
      const drawCollectionCats = () => {
        grid.querySelectorAll('.collection-cat-canvas').forEach(canvas => {
          const breedId = canvas.dataset.breed;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // drawCat 的 y 为图片垂直中心锚点（精灵内部自带脚底留白），
          // 必须画在几何中心；旧 +4 下移使图鉴照片整体偏下（2026-10-12 修复）。
          // 大小约72
          window.PET_RENDERER.drawCat(ctx, breedId, canvas.width / 2, canvas.height / 2, 88, {
            frame: 'idle',
            flip: false
          });
        });
      };
      
      if (window.PET_RENDERER.isLoaded()) {
        drawCollectionCats();
      } else {
        // 等待加载：loadSprites 回调（基础精灵就绪）先画一次，
        // 再两次兜底重绘，覆盖各品种静态 idle 图异步到达的时序，
        // 避免首屏未加载完时下方猫咪留白（图片加载体验优化）。
        window.PET_RENDERER.loadSprites(drawCollectionCats);
        setTimeout(drawCollectionCats, 800);
        setTimeout(drawCollectionCats, 1800);
      }
    }
  }

  // ===== 猫咪标签页 =====
  function renderCatTab(container) {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    const catData = cat ? window.PET_ENGINE.getCatData(cat.catId) : null;

    if (!cat) {
      container.innerHTML = `
        <div class="cat-empty-state">
          <div class="empty-icon">🐱</div>
          <div class="empty-title">还没有猫咪呢~</div>
          <div class="empty-desc">去猫咪公园领养一只流浪小猫咪吧！</div>
          <button class="cat-primary-btn" onclick="window.PET_UI.switchTab('park')">
              🌳 去公园领养
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <!-- 专注中悬浮条 -->
      <div class="focus-floating-bar" id="focusFloatingBar" style="display:none;">
        <div class="focus-float-info">
          <span class="focus-float-icon">⏱️</span>
          <span class="focus-float-time" id="focusFloatTime">25:00</span>
          <span class="focus-float-coin">💕 <span id="focusFloatIntimacy">0</span></span>
        </div>
        <button class="focus-float-stop" id="focusFloatStop">结束</button>
      </div>

      <!-- 栏位状态条 -->
      <div class="cat-pen-status" id="catPenStatus">
        <span class="pen-status-label">🏠 栏位</span>
        <span class="pen-status-count" id="penStatusCount">0/0</span>
      </div>

      <!-- 猫咪切换器 -->
      <div class="cat-switcher" id="catSwitcher"></div>

      <!-- 猫咪展示区 -->
      <div class="cat-display-box">
        <canvas class="pet-canvas cat-canvas" id="petCanvas"></canvas>
        <!-- 事件气泡入口 -->
        <button class="cat-event-bubble" id="catEventBubble" title="看看猫在想什么">
          <span class="event-emoji">💭</span>
          <span class="event-tail"></span>
        </button>
        <div class="cat-name-tag" id="catNameTag" onclick="openBondModal()" title="点击查看好感度详情">
          <div class="cat-name-row">
            <span class="cat-name" id="catNameDisplay">${catData?.name || cat.name}</span>
            <span class="cat-profile-gender cat-gender-tag cat-gender-${cat.gender === 'female' ? 'female' : 'male'}" id="catGenderBadge" aria-label="性别：${window.PET_ENGINE.getGenderLabel(cat.gender)}">${window.PET_ENGINE.getGenderLabel(cat.gender)}</span>
            <button type="button" class="cat-name-edit" onclick="event.stopPropagation(); openRenameModal()" title="修改名字" aria-label="修改猫咪名字">✏️</button>
          </div>
          <div class="cat-profile-level">
            <span class="cat-profile-heart" aria-hidden="true">♥</span>
            <span class="cat-profile-level-label">好感度</span>
            <span class="cat-level-badge" id="catLevelBadge">Lv.1</span>
          </div>
        </div>
        <!-- 清洁按钮（有便便时出现在右上角） -->
        <button class="cat-clean-fab ${cat.poopCount > 0 && !cat.isSleeping ? 'show' : ''}" id="btnCleanFab" ${cat.isSleeping ? 'disabled' : ''}>
          <span class="clean-fab-icon">🧹</span>
          ${cat.poopCount > 0 ? `<span class="clean-fab-badge">${cat.poopCount}</span>` : ''}
        </button>
        <!-- 族谱按钮（右下角） -->
        <button class="cat-family-btn" id="btnFamilyTree" title="查看族谱">
          <span class="family-btn-icon">🌳</span>
          <span class="family-btn-text">族谱</span>
        </button>
        <!-- 家园操作按钮 -->
        <button class="cat-home-btn" id="btnHomeActions" title="家园操作">
          <span class="home-btn-icon">🏠</span>
          <span class="home-btn-text">家园</span>
        </button>
      </div>

      <!-- 状态条 -->
      <div class="cat-stats-bar">
        <div class="cat-stat-item">
          <div class="cat-stat-label">🍖 饱食度</div>
          <div class="cat-stat-bar-bg">
            <div class="cat-stat-bar-fill hunger" id="barHunger" style="width:0%"></div>
          </div>
          <div class="cat-stat-value" id="valHunger">0</div>
        </div>
        <div class="cat-stat-item">
          <div class="cat-stat-label">😊 心情</div>
          <div class="cat-stat-bar-bg">
            <div class="cat-stat-bar-fill happy" id="barHappy" style="width:0%"></div>
          </div>
          <div class="cat-stat-value" id="valHappy">0</div>
        </div>
        <div class="cat-stat-item">
          <div class="cat-stat-label">⚡ 活力 <span class="energy-status-tag" id="energyStatusTag"></span></div>
          <div class="cat-stat-bar-bg">
            <div class="cat-stat-bar-fill energy" id="barEnergy" style="width:0%"></div>
          </div>
          <div class="cat-stat-value" id="valEnergy">0</div>
        </div>
      </div>

      <!-- 便便提醒 -->
      <div id="poopTipBox" style="display:none; margin-top:10px;">
        <div class="cat-poop-tip">
          <span class="tip-icon">💩</span>
          <span class="tip-text" id="poopTipText">有便便需要清理~</span>
          <span class="tip-action" id="poopTipAction">去清理</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="cat-actions">
        <button class="cat-action-btn ${cat.isSleeping ? 'disabled' : ''}" id="btnFeed" ${cat.isSleeping ? 'disabled' : ''}>
          <span class="icon">🍽️</span>
          <span>喂食</span>
        </button>
        <button class="cat-action-btn ${cat.isSleeping ? 'disabled' : ''}" id="btnPlay" ${cat.isSleeping ? 'disabled' : ''}>
          <span class="icon">🎾</span>
          <span>玩耍</span>
        </button>
        <button class="cat-action-btn ${cat.isSleeping ? 'disabled' : ''}" id="btnAdventure" ${cat.isSleeping ? 'disabled' : ''}>
          <span class="icon">🗺️</span>
          <span>冒险</span>
        </button>
        <button class="cat-action-btn ${cat.isSleeping ? 'sleep-mode' : ''}" id="btnSleep">
          <span class="icon">${cat.isSleeping ? '☀️' : '💤'}</span>
          <span>${cat.isSleeping ? '叫醒' : '睡觉'}</span>
        </button>
        <button class="cat-action-btn" id="btnItems">
          <span class="icon">🎁</span>
          <span>道具</span>
        </button>
      </div>

      <!-- 自繁育入口 -->
      <div class="self-breed-entry" id="selfBreedEntry">
        <div class="breed-entry-buttons">
          <button class="self-breed-btn" id="btnSelfBreed">
            <div class="self-breed-btn-main">
              <span class="self-breed-btn-icon">🐱🐱</span>
              <span class="self-breed-btn-text">自繁育</span>
            </div>
            <div class="self-breed-btn-sub">选择两只猫咪繁育后代</div>
          </button>
        </div>
      </div>
    `;

    // 确保底部面板容器存在
    if (!document.getElementById('itemPanel')) {
      const panel = document.createElement('div');
      panel.id = 'itemPanel';
      panel.className = 'item-panel';
      panel.innerHTML = `
        <div class="item-panel-mask"></div>
        <div class="item-panel-content">
          <div class="item-panel-header">
            <span class="item-panel-title" id="itemPanelTitle">选择物品</span>
            <span class="item-panel-close" id="itemPanelClose">✕</span>
          </div>
          <div class="item-panel-body" id="itemPanelBody"></div>
        </div>
      `;
      container.appendChild(panel);

      panel.querySelector('.item-panel-mask').onclick = () => hideItemPanel();
      panel.querySelector('#itemPanelClose').onclick = () => hideItemPanel();
    }

    // 渲染切换器
    renderCatSwitcher();

    // 更新栏位状态
    updatePenStatus();

    // 测试模式按钮已移除（P2 金币合并后 🧪 等于白拿解锁/空投蛋蛋币）

    // 初始化Canvas
    canvasEl = document.getElementById('petCanvas');
    if (canvasEl && cat) {
      const rect = canvasEl.getBoundingClientRect();
      canvasEl.width = rect.width * 2;
      canvasEl.height = rect.height * 2;
      // 重置渲染循环（如果已存在则停止重建）
      if (renderLoopCtrl) {
        renderLoopCtrl.stop();
        renderLoopCtrl = null;
      }
      
      // 点击猫咪切换动作
      canvasEl.style.cursor = 'pointer';
      canvasEl.onclick = () => {
        if (cat.isSleeping) {
          toast('💤 猫咪在睡觉呢，别打扰它~');
          return;
        }
        doTapCat();
      };
    }

    // 绑定操作按钮
    document.getElementById('btnFeed').onclick = () => showItemMenu('food');
    document.getElementById('btnPlay').onclick = () => showItemMenu('toy');
    document.getElementById('btnAdventure').onclick = () => openAdventureModal();
    document.getElementById('btnSleep').onclick = () => doToggleSleep();
    document.getElementById('btnItems').onclick = () => showItemMenu('item');
    
    // 族谱按钮
    const familyBtn = document.getElementById('btnFamilyTree');
    if (familyBtn) {
      familyBtn.onclick = () => showFamilyTree();
    }

    // 家园操作按钮
    const homeBtn = document.getElementById('btnHomeActions');
    if (homeBtn) {
      homeBtn.onclick = () => showHomeActionMenu();
    }

    // 自繁育按钮
    const selfBreedBtn = document.getElementById('btnSelfBreed');
    if (selfBreedBtn) {
      selfBreedBtn.onclick = () => showSelfBreedingModal();
    }

    // 右上角清洁按钮
    const cleanFab = document.getElementById('btnCleanFab');
    if (cleanFab) {
      cleanFab.onclick = () => doClean();
    }

    // 事件气泡按钮（故事事件入口）——「看看猫咪在想什么」每 6 小时仅可执行一次：
    // 本地时间戳先拦一道（即时反馈），服务端 /cat-cabin/thought 权威裁决（防改本地时间刷好感度）。
    const eventBubble = document.getElementById('catEventBubble');
    if (eventBubble) {
      eventBubble.onclick = () => {
        if (!window.CAT_CHAT) return;
        const st = window.PET_ENGINE.getState();
        if (!st.thought) st.thought = { lastAt: 0 };
        const COOLDOWN_MS = 6 * 60 * 60 * 1000;
        const now = Date.now();
        if (st.thought.lastAt && now - st.thought.lastAt < COOLDOWN_MS) {
          toastThoughtCooldown(COOLDOWN_MS - (now - st.thought.lastAt));
          return;
        }
        const claim = window.catCabinClaimThought;
        if (typeof claim !== 'function') {   // 桥未加载（调试场景）：仅本地冷却兜底
          st.thought.lastAt = now;
          window.PET_ENGINE.save();
          refreshThoughtBubble();
          openCatThought();
          return;
        }
        claim().then(function (res) {
          if (res && res.code === 200 && res.data && res.data.allowed) {
            st.thought.lastAt = Date.now();
            window.PET_ENGINE.save();
            refreshThoughtBubble();
            openCatThought();
          } else if (res && res.code === 200 && res.data) {
            // 服务端冷却中：按剩余毫秒校正本地时间戳（改本地时间无效）
            const remainMs = res.data.cooldownMs || 0;
            st.thought.lastAt = Math.max(st.thought.lastAt || 0, Date.now() + remainMs - COOLDOWN_MS);
            window.PET_ENGINE.save();
            refreshThoughtBubble();
            toastThoughtCooldown(remainMs);
          } else {
            toast((res && res.msg) || '网络异常，稍后再试~');
          }
        });
      };
      refreshThoughtBubble();   // 渲染时按存档时间戳恢复「已点过/冷却中」外观
    }

    // 专注悬浮条
    const focusStopBtn = document.getElementById('focusFloatStop');
    if (focusStopBtn) {
      focusStopBtn.onclick = () => {
        petConfirm({ title: '结束本次专注？', desc: '已专注的时长将不再计入奖励', okText: '结束', danger: true }, () => {
          stopFocusMode(false);
        });
      };
    }
    // 如果正在专注中，显示悬浮条
    const state_now = window.PET_ENGINE.getState();
    if (state_now.focus.isActive) {
      const bar = document.getElementById('focusFloatingBar');
      if (bar) bar.style.display = 'flex';
    }

    // 便便提醒点击
    const tipAction = document.getElementById('poopTipAction');
    if (tipAction) tipAction.onclick = () => doClean();

    // 更新状态显示
    updateStatusBars();

    // 默认显示食物
    renderItemGrid('food');

    // 确保Canvas渲染循环启动（防止重建DOM后白屏）
    if (canvasEl && cat) {
      // 延迟启动，确保DOM布局完成，canvas有正确尺寸
      setTimeout(() => {
        if (renderLoopCtrl) {
          renderLoopCtrl.stop();
          renderLoopCtrl = null;
        }
        const canvas = document.getElementById('petCanvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            canvas.width = rect.width * 2;
            canvas.height = rect.height * 2;
          }
          window.PET_RENDERER.loadSprites(() => {
            if (!renderLoopCtrl) {
              renderLoopCtrl = window.PET_RENDERER.startRenderLoop(canvas, cat);
            }
          });
        }
      }, 20);
    }

    // 猫咪问候（进入页面时触发，3分钟内不重复）
    if (window.CAT_CHAT && !cat.isSleeping) {
      const now = Date.now();
      if (!window._lastGreetingTime || now - window._lastGreetingTime > 3 * 60 * 1000) {
        window._lastGreetingTime = now;
        setTimeout(() => {
          window.CAT_CHAT.triggerGreeting();
        }, 1200);
      }
    }
  }

  // 猫咪切换器
  function renderCatSwitcher() {
    const state = window.PET_ENGINE.getState();
    const switcher = document.getElementById('catSwitcher');
    if (!switcher) return;

    switcher.innerHTML = '';

    state.cats.forEach((cat, idx) => {
      const catData = window.PET_ENGINE.getCatData(cat.catId);
      const item = document.createElement('div');
      item.className = 'cat-switcher-item' + (idx === state.currentCatIndex ? ' active' : '');
      
      const hasPoop = cat.poopCount > 0 && !cat.isSleeping;
      const statusIcon = cat.isSleeping ? '💤' : (hasPoop ? '💩' : '');
      
      item.innerHTML = `
        <span class="cat-switcher-name">${catData?.name || cat.name}</span>
        ${statusIcon ? `<span class="cat-switcher-status">${statusIcon}</span>` : ''}
      `;

      item.onclick = () => {
        if (idx === state.currentCatIndex) return;
        window.PET_ENGINE.selectCat(idx);
        // 切换猫咪时不重建DOM，只更新Canvas和UI数据
        refreshCatDisplay();
      };
      switcher.appendChild(item);
    });

    // 添加领养按钮
    const addItem = document.createElement('div');
    addItem.className = 'cat-switcher-item cat-switcher-add';
    addItem.innerHTML = '<span style="font-size:18px">+ 领养</span>';
    addItem.onclick = () => switchTab('park');
    switcher.appendChild(addItem);
  }

  // 显示物品菜单
  let currentItemType = 'food';

  function showItemMenu(type) {
    const cat = window.PET_ENGINE.getCurrentCat();
    if (!cat) return;
    if (cat.isSleeping && type !== 'item') { toast('猫咪在睡觉呢~'); return; }
    
    currentItemType = type;
    const titles = { food: '🍽️ 选择食物', toy: '🎾 选择玩具', item: '🎁 我的道具' };
    const titleEl = document.getElementById('itemPanelTitle');
    if (titleEl) titleEl.textContent = titles[type] || '选择物品';
    
    // 显示面板
    const panel = document.getElementById('itemPanel');
    if (panel) panel.classList.add('show');
    
    // 猫咪展示区上移，避免被面板挡住
    const displayBox = document.querySelector('.cat-display-box');
    if (displayBox) displayBox.classList.add('panel-open');
    
    renderItemGrid(type);
  }

  function hideItemPanel() {
    const panel = document.getElementById('itemPanel');
    if (panel) panel.classList.remove('show');
    
    // 猫咪展示区恢复原位
    const displayBox = document.querySelector('.cat-display-box');
    if (displayBox) displayBox.classList.remove('panel-open');
  }

  // 渲染物品网格（在底部面板内）
  function renderItemGrid(type) {
    const grid = document.getElementById('itemPanelBody');
    if (!grid) return;

    const state = window.PET_ENGINE.getState();
    const inv = state.inventory;
    const ITEMS = window.PET_DATA.ITEMS;

    let items, invKey;
    if (type === 'food') { items = FOODS; invKey = 'foods'; }
    else if (type === 'toy') { items = TOYS; invKey = 'toys'; }
    else { items = ITEMS; invKey = 'items'; }

    grid.innerHTML = '';

    let hasItems = false;

    // 道具类型：先显示家具（被动），再显示消耗品
    if (type === 'item') {
      // 家具分区标题
      const furnitureItems = items.filter(i => i.type === 'furniture' || i.type === 'bed');
      const consumableItems = items.filter(i => i.type === 'tool' || i.type === 'medicine');

      if (furnitureItems.length > 0) {
        const furnHeader = document.createElement('div');
        furnHeader.className = 'cat-item-section-header';
        furnHeader.innerHTML = '🏠 家具（被动加成，购买后自动生效）';
        grid.appendChild(furnHeader);

        const furnGrid = document.createElement('div');
        furnGrid.className = 'cat-item-grid';
        grid.appendChild(furnGrid);

        furnitureItems.forEach(item => {
          const count = inv[invKey][item.id] || 0;
          const owned = count > 0;
          
          const el = document.createElement('div');
          el.className = 'cat-item-card item-card ' + (owned ? 'owned' : 'not-owned');
          
          let effectDesc = '';
          switch(item.effect) {
            case 'sleepBonus': effectDesc = '睡眠活力恢复+50%<br>睡眠心情恢复+100%'; break;
            case 'happinessBonus': effectDesc = '心情自然衰减-30%<br>玩耍效果+50%'; break;
            case 'healthBonus': effectDesc = '饥饿自然衰减-25%'; break;
          }
          
          el.innerHTML = `
            <div class="cat-item-icon">${item.emoji}</div>
            <div class="cat-item-name">${item.name}</div>
            <div class="cat-item-effect">${effectDesc}</div>
            <div class="cat-item-status">${owned ? '✅ 已生效' : `💰 ${item.price}`}</div>
          `;
          
          if (!owned) {
            el.onclick = () => {
              petConfirm({
                icon: item.emoji,
                title: `购买${item.name}？`,
                desc: `花费 ${item.price} 蛋蛋币\n${effectDesc.replace(/<br>/g, '\n')}`,
                okText: `花 ${item.price} 购买`
              }, () => {
                const result = window.PET_ENGINE.buyItem(item.id);
                if (result.success) {
                  toast(result.msg);
                  updateCoinDisplay();
                  notifyCoinsChange();
                  renderItemGrid(type);
                  if (window.PET_RENDERER && window.PET_RENDERER.refreshFurniture) {
                    window.PET_RENDERER.refreshFurniture();
                  }
                } else {
                  toast(result.msg);
                }
              });
            };
          } else {
            el.onclick = () => {
              toast(`${item.emoji} ${item.name}已生效：${effectDesc.replace(/<br>/g, '，')}`);
            };
          }
          
          furnGrid.appendChild(el);
          hasItems = true;
        });
      }

      // 消耗品分区
      if (consumableItems.length > 0) {
        const consHeader = document.createElement('div');
        consHeader.className = 'cat-item-section-header';
        consHeader.textContent = '🧴 消耗品（点击使用）';
        grid.appendChild(consHeader);

        const consGrid = document.createElement('div');
        consGrid.className = 'cat-item-grid';
        grid.appendChild(consGrid);

        consumableItems.forEach(item => {
          const count = inv[invKey][item.id] || 0;
          
          const el = document.createElement('div');
          el.className = 'cat-item-card item-card ' + (count > 0 ? '' : 'empty');
          
          let effectDesc = '';
          switch(item.effect) {
            case 'grooming': effectDesc = '使用后心情+25'; break;
            case 'energy': effectDesc = '使用后活力+35<br>饥饿+10'; break;
          }
          
          el.innerHTML = `
            <div class="cat-item-icon">${item.emoji}</div>
            <div class="cat-item-name">${item.name}</div>
            <div class="cat-item-effect">${effectDesc}</div>
            <div class="cat-item-count">${count > 0 ? '×' + count : '暂无'}</div>
          `;
          
          if (count > 0) {
            el.onclick = () => {
              const cat = window.PET_ENGINE.getCurrentCat();
              if (cat && cat.isSleeping) {
                toast('猫咪在睡觉呢，别打扰它~');
                return;
              }
              const result = window.PET_ENGINE.useItem(item.id, state.currentCatIndex);
              if (result.success) {
                toast(result.msg);
                updateStatusBars();
                renderItemGrid(type);
              } else {
                toast(result.msg);
              }
            };
            hasItems = true;
          }
          
          consGrid.appendChild(el);
        });
      }

      // 如果什么都没有
      if (!furnitureItems.some(i => (inv[invKey][i.id] || 0) > 0) && 
          !consumableItems.some(i => (inv[invKey][i.id] || 0) > 0)) {
        const tip = document.createElement('div');
        tip.className = 'cat-empty-tip';
        tip.innerHTML = `还没有道具，<span class="link-text" onclick="window.PET_UI.switchTab('shop'); window.PET_UI.hideItemPanel();">去商店看看 →</span>`;
        grid.appendChild(tip);
      }
      return;
    }

    // 食物/玩具网格
    const gridWrap = document.createElement('div');
    gridWrap.className = 'cat-item-grid';
    grid.appendChild(gridWrap);

    items.forEach(item => {
      const count = inv[invKey][item.id] || 0;
      const intimacyVal = item.intimacy || (type === 'food' ? 2 : 3);
      const hungerVal = item.hunger || 0;
      const happyVal = item.happiness || 0;
      const state = window.PET_ENGINE.getState();
      const canAfford = state.coins >= item.price;
      const hasStock = count > 0;
      
      const el = document.createElement('div');
      el.className = 'cat-item-card ' + (hasStock ? 'has-stock' : 'no-stock') + (canAfford ? '' : ' cannot-afford');
      el.innerHTML = `
        <div class="cat-item-icon">${item.emoji}</div>
        <div class="cat-item-name">${item.name}</div>
        <div class="cat-item-bonuses">
          ${hungerVal > 0 ? `<span class="item-bonus item-bonus-hunger">🍖+${hungerVal}</span>` : ''}
          <span class="item-bonus item-bonus-happy">😊+${happyVal}</span>
          <span class="item-bonus item-bonus-intimacy">💕+${intimacyVal}</span>
        </div>
        <div class="cat-item-bottom">
          ${hasStock 
            ? `<span class="item-count-label">×${count}</span>`
            : `<span class="item-price-label">💰 ${item.price}</span>`
          }
        </div>
      `;
      
      // 点击事件
      el.onclick = () => {
        const cat = window.PET_ENGINE.getCurrentCat();
        if (cat && cat.isSleeping) {
          toast('猫咪在睡觉呢，别打扰它~');
          return;
        }
        const actionLabel = type === 'food' ? '喂食' : '玩耍';
        const bonusLine = `🍖+${hungerVal} 😊+${happyVal} 💕+${intimacyVal}`;

        if (hasStock) {
          // 有库存：确认后使用
          petConfirm({
            icon: item.emoji,
            title: `给猫咪${actionLabel}？`,
            desc: `使用 1 个${item.name}（剩 ${count} 个）\n${bonusLine}`,
            okText: actionLabel
          }, () => {
            let result;
            if (type === 'food') {
              result = doFeed(item.id);
            } else {
              result = doPlay(item.id);
            }
            if (result && result.success) {
              showIntimacyFloat(result.intimacyGain || 0, el);
            }
            renderItemGrid(type);
          });
        } else {
          // 没库存：购买并使用
          if (!canAfford) {
            toast('蛋蛋币不够哦~');
            return;
          }
          petConfirm({
            icon: item.emoji,
            title: `购买并${actionLabel}？`,
            desc: `花费 ${item.price} 蛋蛋币购买 1 个${item.name}\n${bonusLine}`,
            okText: `花 ${item.price} ${actionLabel}`
          }, () => {
            // 先购买
            let buyResult;
            if (type === 'food') {
              buyResult = window.PET_ENGINE.buyFood(item.id, 1);
            } else {
              buyResult = window.PET_ENGINE.buyToy(item.id, 1);
            }

            if (!buyResult.success) {
              toast(buyResult.msg);
              return;
            }

            // 再使用
            let useResult;
            if (type === 'food') {
              useResult = doFeed(item.id);
            } else {
              useResult = doPlay(item.id);
            }

            if (useResult && useResult.success) {
              showIntimacyFloat(useResult.intimacyGain || 0, el);
              toast(`✨ 购买并${actionLabel}成功！`);
            }
            updateCoinDisplay();
            notifyCoinsChange();
            renderItemGrid(type);
          });
        }
      };
      
      gridWrap.appendChild(el);
    });

    // 移除空状态提示（因为没库存也能买，不需要空状态了）
    // 保留一个底部说明
    const tip = document.createElement('div');
    tip.className = 'cat-item-footer-tip';
    tip.innerHTML = `💡 没库存的物品点击可直接购买并使用`;
    grid.appendChild(tip);
  }

  // 亲密度加成飘字效果
  function showIntimacyFloat(amount, sourceEl) {
    if (!amount || amount <= 0) return;
    const float = document.createElement('div');
    float.className = 'intimacy-float-text';
    float.textContent = '💕 +' + amount;
    
    // 定位到源元素上方（加到body层级，避免DOM重建被删除）
    const rect = sourceEl.getBoundingClientRect();
    float.style.left = (rect.left + rect.width / 2 - 25) + 'px';
    float.style.top = (rect.top + window.scrollY + 10) + 'px';
    float.style.position = 'fixed';
    float.style.zIndex = '9999';
    document.body.appendChild(float);
    
    // 动画结束后移除
    setTimeout(() => { float.remove(); }, 1000);
  }

  // 更新专注悬浮条
  function updateFocusBar(progress) {
    const bar = document.getElementById('focusFloatingBar');
    if (!bar) return;
    
    if (progress && progress.progress < 1) {
      bar.style.display = 'flex';
      
      const timeEl = document.getElementById('focusFloatTime');
      const intimacyEl = document.getElementById('focusFloatIntimacy');
      
      if (timeEl) {
        const remaining = Math.max(0, Math.floor(progress.remainingSeconds || 0));
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        timeEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }
      if (intimacyEl) intimacyEl.textContent = '+' + (progress.intimacyGain || 0);
    } else {
      bar.style.display = 'none';
    }
  }

  // 切换猫咪时刷新显示（不重建DOM，只更新数据和Canvas）
  function refreshCatDisplay() {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    const catData = cat ? window.PET_ENGINE.getCatData(cat.catId) : null;
    if (!cat) return;

    // 1. 更新猫咪名字
    const nameEl = document.getElementById('catNameDisplay');
    if (nameEl) nameEl.textContent = cat.name;

    // 2. 更新猫咪性别信息
    const genderBadge = document.getElementById('catGenderBadge');
    if (genderBadge) {
      const genderLabel = window.PET_ENGINE.getGenderLabel(cat.gender);
      const genderClass = cat.gender === 'female' ? 'female' : 'male';
      genderBadge.textContent = genderLabel;
      genderBadge.className = 'cat-profile-gender cat-gender-tag cat-gender-' + genderClass;
      genderBadge.setAttribute('aria-label', '性别：' + genderLabel);
    }

    // 3. 重建Canvas渲染循环（确保精灵图加载完成后再启动，避免切换猫时先显示橘猫）
    if (renderLoopCtrl) {
      renderLoopCtrl.stop();
      renderLoopCtrl = null;
    }
    
    const canvasEl = document.getElementById('petCanvas');
    if (canvasEl) {
      // 确保Canvas尺寸正确
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvasEl.width = rect.width * 2;
        canvasEl.height = rect.height * 2;
      }
      // 等待精灵图加载完成后启动渲染循环
      window.PET_RENDERER.loadSprites(() => {
        // 再次检查是否还是这只猫（防止快速切换导致错乱）
        const currentState = window.PET_ENGINE.getState();
        if (currentState.currentCatIndex === state.currentCatIndex) {
          renderLoopCtrl = window.PET_RENDERER.startRenderLoop(canvasEl, cat);
        }
      });
    }

    // 4. 更新切换器高亮状态
    const switcher = document.getElementById('catSwitcher');
    if (switcher) {
      const items = switcher.querySelectorAll('.cat-switcher-item');
      items.forEach((item, idx) => {
        if (idx < state.cats.length) {
          item.classList.toggle('active', idx === state.currentCatIndex);
        }
      });
    }

    // 5. 更新状态条、亲密度、便便提醒
    updateStatusBars();
    // 6. 更新睡觉按钮等UI状态
    updateSleepUIState();
  }

  // 更新状态条
  function updateStatusBars() {
    const cat = window.PET_ENGINE.getCurrentCat();
    if (!cat) return;

    const hungerBar = document.getElementById('barHunger');
    const happyBar = document.getElementById('barHappy');
    const energyBar = document.getElementById('barEnergy');

    if (hungerBar) hungerBar.style.width = Math.max(0, Math.min(100, cat.hunger || 0)) + '%';
    if (happyBar) happyBar.style.width = Math.max(0, Math.min(100, cat.happiness || 0)) + '%';
    if (energyBar) energyBar.style.width = Math.max(0, Math.min(100, cat.energy || 0)) + '%';

    const hungerVal = document.getElementById('valHunger');
    const happyVal = document.getElementById('valHappy');
    const energyVal = document.getElementById('valEnergy');

    if (hungerVal) hungerVal.textContent = Math.floor(cat.hunger || 0);
    if (happyVal) happyVal.textContent = Math.floor(cat.happiness || 0);
    if (energyVal) energyVal.textContent = Math.floor(cat.energy || 0);
    
    // 活力状态标签
    const energyTag = document.getElementById('energyStatusTag');
    if (energyTag) {
      const bonus = window.PET_ENGINE.getEnergyBonus(cat.energy);
      if (bonus >= 1.5) {
        energyTag.textContent = '✨ 活力满满';
        energyTag.className = 'energy-status-tag high';
      } else if (bonus >= 1.0) {
        energyTag.textContent = '状态不错';
        energyTag.className = 'energy-status-tag mid';
      } else {
        energyTag.textContent = '有点累了';
        energyTag.className = 'energy-status-tag low';
      }
    }

    // 更新好感度卡片（告诉用户是什么、有啥用）
    const state = window.PET_ENGINE.getState();
    const levelInfo = window.PET_ENGINE.getLevelInfo(state.currentCatIndex);
    if (levelInfo) {
      const levelBadge = document.getElementById('catLevelBadge');
      if (levelBadge) levelBadge.textContent = 'Lv.' + levelInfo.level;

      // 等级徽章（Lv.X + 称号）
      const bondLevelBadge = document.getElementById('bondLevelBadge');
      if (bondLevelBadge) {
        bondLevelBadge.textContent = 'Lv.' + levelInfo.level + ' ' + (levelInfo.title || '小奶猫');
      }

      // 进度条
      const bondBar = document.getElementById('bondBarFill');
      if (bondBar) {
        const safeProgress = Math.max(0, Math.min(100, levelInfo.progress));
        bondBar.style.width = safeProgress + '%';
      }

      // 经验值文字
      const bondExp = document.getElementById('bondExpText');
      if (bondExp) {
        if (levelInfo.isMaxLevel) {
          bondExp.textContent = 'MAX';
        } else {
          const cur = Math.floor(levelInfo.currentExp || 0);
          const next = Math.floor(levelInfo.nextLevelExp || 0);
          bondExp.textContent = cur + '/' + next;
        }
      }

      // 当前已解锁的好处（用户一眼看懂有啥用）
      const perksEl = document.getElementById('bondPerks');
      if (perksEl) {
        const LEVEL_CONFIG = window.PET_DATA && window.PET_DATA.LEVEL_CONFIG;
        const curLevel = levelInfo.level;
        const perkItems = [];

        if (LEVEL_CONFIG) {
          // 1. 当前专注加成
          const curFocusBonus = LEVEL_CONFIG.focusBonus[curLevel] || 0;
          perkItems.push({
            icon: '🎯',
            text: '专注+' + Math.round(curFocusBonus * 100) + '%',
            locked: false
          });

          // 2. 当前繁育珍稀加成
          const curBreedingBonus = LEVEL_CONFIG.breedingBonus[curLevel] || { rare4: 0, rare5: 0 };
          perkItems.push({
            icon: '🧬',
            text: '珍稀+' + Math.round(curBreedingBonus.rare4 * 100) + '%',
            locked: false
          });

          // 3. 当前繁育传说加成
          perkItems.push({
            icon: '✨',
            text: '传说+' + Math.round(curBreedingBonus.rare5 * 100) + '%',
            locked: false
          });

          // 4. 下一级最核心的提升（珍稀繁育加成），给用户目标感
          if (!levelInfo.isMaxLevel) {
            const nextLevel = curLevel + 1;
            const nextBreedingBonus = LEVEL_CONFIG.breedingBonus[nextLevel];
            if (nextBreedingBonus && nextBreedingBonus.rare4 > curBreedingBonus.rare4) {
              const addRare4 = Math.round((nextBreedingBonus.rare4 - curBreedingBonus.rare4) * 100);
              perkItems.push({
                icon: '🧬',
                text: '珍稀+' + addRare4 + '%',
                locked: true
              });
            }
          }

          // 最多显示4个，保持卡片紧凑
          const showPerks = perkItems.slice(0, 4);

          perksEl.innerHTML = showPerks.map(p => `
            <div class="bond-perk-item ${p.locked ? 'locked' : ''}">
              <span class="perk-icon">${p.icon}</span>
              <span class="perk-text">${p.text}</span>
              ${p.locked ? '<span class="perk-lock">🔒</span>' : ''}
            </div>
          `).join('');
        }
      }
    }

    // 更新便便提醒
    updatePoopTip(cat);

    // 如果好感度弹窗是打开的，刷新内容
    if (typeof refreshBondModalIfOpen === 'function') {
      refreshBondModalIfOpen();
    }
  }

  // ===== 好感度详情弹窗 =====
  let bondModalOpen = false;
  let bondModalRendered = false;

  function openBondModal() {
    // 第一次打开时创建弹窗
    if (!bondModalRendered) {
      createBondModal();
      bondModalRendered = true;
    }
    renderBondModalContent();
    const modal = document.getElementById('bondModalMask');
    if (modal) {
      modal.style.display = 'flex';
      bondModalOpen = true;
    }
  }

  function closeBondModal() {
    const modal = document.getElementById('bondModalMask');
    if (modal) {
      modal.style.display = 'none';
      bondModalOpen = false;
    }
  }

  function createBondModal() {
    const html = `
      <div class="pet-modal-mask bond-modal-mask" id="bondModalMask" onclick="if(event.target===this)closeBondModal()">
        <div class="pet-modal bond-modal">
          <div class="bond-modal-header">
            <span class="bond-modal-title">💕 好感度</span>
            <button class="bond-modal-close" onclick="closeBondModal()">×</button>
          </div>
          <div class="bond-modal-body">
            <!-- 当前等级信息 -->
            <div class="bond-modal-current">
              <div class="bond-modal-level-row">
                <span class="bond-modal-level-badge" id="bondModalLevelBadge">Lv.1 小奶猫</span>
                <span class="bond-modal-exp" id="bondModalExp">0/50</span>
              </div>
              <div class="bond-modal-bar-bg">
                <div class="bond-modal-bar-fill" id="bondModalBarFill" style="width:0%"></div>
              </div>
              <div class="bond-modal-perks" id="bondModalPerks"></div>
            </div>
            <!-- 全部等级奖励 -->
            <div class="bond-modal-section-title">🏆 全部等级奖励</div>
            <div class="bond-level-list bond-modal-level-list" id="bondModalLevelList"></div>
            <!-- 怎么提升 -->
            <div class="bond-howto-section bond-modal-howto">
              <div class="bond-howto-title">💡 怎么提升好感度？</div>
              <div class="bond-howto-list">
                <div class="bond-howto-item">
                  <span class="bond-howto-icon">🍽️</span>
                  <span>给猫咪喂食，每天按时喂饭增加好感</span>
                </div>
                <div class="bond-howto-item">
                  <span class="bond-howto-icon">🎾</span>
                  <span>陪猫咪玩耍，用玩具逗它开心</span>
                </div>
                <div class="bond-howto-item">
                  <span class="bond-howto-icon">🎯</span>
                  <span>开启专注模式，让猫咪陪伴你学习工作</span>
                </div>
                <div class="bond-howto-item">
                  <span class="bond-howto-icon">💬</span>
                  <span>和猫咪互动聊天，回应它的小情绪</span>
                </div>
                <div class="bond-howto-item">
                  <span class="bond-howto-icon">🎁</span>
                  <span>开盲盒也有机会增加好感度哦</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function renderBondModalContent() {
    const state = window.PET_ENGINE.getState();
    const levelInfo = window.PET_ENGINE.getLevelInfo(state.currentCatIndex);
    const LEVEL_CONFIG = window.PET_DATA && window.PET_DATA.LEVEL_CONFIG;
    if (!levelInfo || !LEVEL_CONFIG) return;

    // 当前等级信息
    const levelBadge = document.getElementById('bondModalLevelBadge');
    const expText = document.getElementById('bondModalExp');
    const barFill = document.getElementById('bondModalBarFill');
    const perksEl = document.getElementById('bondModalPerks');

    const curLevel = levelInfo.level;
    const title = LEVEL_CONFIG.titles[curLevel] || ('等级' + curLevel);
    const progress = levelInfo.progress || 0;
    // 当前等级内的经验值
    const curLevelExp = (levelInfo.intimacy || 0) - (levelInfo.currentLevelExp || 0);
    const needLevelExp = (levelInfo.nextLevelExp || 0) - (levelInfo.currentLevelExp || 0);
    const isMax = curLevel >= LEVEL_CONFIG.maxLevel;

    if (levelBadge) levelBadge.textContent = 'Lv.' + curLevel + ' ' + title;
    if (expText) {
      expText.textContent = isMax ? 'MAX' : (Math.floor(curLevelExp) + '/' + Math.floor(needLevelExp));
    }
    if (barFill) barFill.style.width = progress + '%';

    // 当前等级加成
    if (perksEl) {
      const perks = [];
      const focusBonus = LEVEL_CONFIG.focusBonus[curLevel];
      const breedingBonus = LEVEL_CONFIG.breedingBonus[curLevel];
      if (focusBonus) {
        perks.push('<div class="bond-perk-item"><span class="perk-icon">🎯</span><span class="perk-text">专注+' + Math.round(focusBonus * 100) + '%</span></div>');
      }
      if (breedingBonus) {
        if (breedingBonus.rare4 > 0) {
          perks.push('<div class="bond-perk-item"><span class="perk-icon">🧬</span><span class="perk-text">珍稀+' + Math.round(breedingBonus.rare4 * 100) + '%</span></div>');
        }
        if (breedingBonus.rare5 > 0) {
          perks.push('<div class="bond-perk-item"><span class="perk-icon">✨</span><span class="perk-text">传说+' + Math.round(breedingBonus.rare5 * 100) + '%</span></div>');
        }
      }
      perksEl.innerHTML = perks.join('');
    }

    // 等级列表
    const listEl = document.getElementById('bondModalLevelList');
    if (!listEl) return;

    const items = [];
    for (let lvl = 1; lvl <= LEVEL_CONFIG.maxLevel; lvl++) {
      const lvlTitle = LEVEL_CONFIG.titles[lvl] || ('等级' + lvl);
      const rewards = [];

      const focusBonus = LEVEL_CONFIG.focusBonus[lvl];
      if (focusBonus) {
        rewards.push('🎯 专注+' + Math.round(focusBonus * 100) + '%');
      }
      const breedingBonus = LEVEL_CONFIG.breedingBonus[lvl];
      if (breedingBonus) {
        if (breedingBonus.rare4 > 0) {
          rewards.push('🧬 珍稀+' + Math.round(breedingBonus.rare4 * 100) + '%');
        }
        if (breedingBonus.rare5 > 0) {
          rewards.push('✨ 传说+' + Math.round(breedingBonus.rare5 * 100) + '%');
        }
      }

      let statusClass, statusText;
      if (lvl < curLevel) {
        statusClass = 'unlocked';
        statusText = '已达成';
      } else if (lvl === curLevel) {
        statusClass = 'current';
        statusText = '当前';
      } else {
        statusClass = 'locked';
        statusText = '未解锁';
      }

      items.push(`
        <div class="bond-level-item ${statusClass}">
          <div class="bond-level-num">${lvl}</div>
          <div class="bond-level-info">
            <div class="bond-level-name">${lvlTitle}</div>
            <div class="bond-level-rewards">
              ${rewards.length > 0 ? rewards.join(' · ') : '解锁新称号'}
            </div>
          </div>
          <div class="bond-level-status">${statusText}</div>
        </div>
      `);
    }

    listEl.innerHTML = items.join('');
  }

  // 切换猫咪时，如果弹窗是打开的，重新渲染
  function refreshBondModalIfOpen() {
    if (bondModalOpen) {
      renderBondModalContent();
    }
  }

  // 暴露到全局，供HTML onclick调用
  window.openBondModal = openBondModal;
  window.closeBondModal = closeBondModal;

  // ===== 改名弹窗 =====
  let renameModalRendered = false;

  function openRenameModal() {
    if (!renameModalRendered) {
      createRenameModal();
      renameModalRendered = true;
    }
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    const input = document.getElementById('renameInput');
    if (input) {
      input.value = cat?.name || '';
      setTimeout(() => input.focus(), 50);
    }
    const modal = document.getElementById('renameModalMask');
    if (modal) modal.style.display = 'flex';
  }

  function closeRenameModal() {
    const modal = document.getElementById('renameModalMask');
    if (modal) modal.style.display = 'none';
  }

  function createRenameModal() {
    const html = `
      <div class="pet-modal-mask rename-modal-mask" id="renameModalMask" onclick="if(event.target===this)closeRenameModal()">
        <div class="pet-modal rename-modal">
          <div class="rename-modal-title">✏️ 给猫咪改个名字</div>
          <input type="text" class="rename-input" id="renameInput" maxlength="8" placeholder="最多8个字" onkeydown="if(event.key==='Enter')confirmRename();if(event.key==='Escape')closeRenameModal()">
          <div class="rename-modal-hint">名字最多8个字，确定后保存</div>
          <div class="rename-modal-btns">
            <button class="rename-btn cancel" onclick="closeRenameModal()">取消</button>
            <button class="rename-btn confirm" onclick="confirmRename()">确定</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function confirmRename() {
    const input = document.getElementById('renameInput');
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) {
      input.focus();
      return;
    }
    if (newName.length > 8) {
      return;
    }
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    if (cat) {
      cat.name = newName;
      // 更新显示
      const nameDisplay = document.getElementById('catNameDisplay');
      if (nameDisplay) nameDisplay.textContent = newName;
      // 更新切换器里的名字
      const switcher = document.getElementById('catSwitcher');
      if (switcher) {
        const activeItem = switcher.querySelector('.cat-switcher-item.active');
        if (activeItem) {
          const nameEl = activeItem.querySelector('.cat-switcher-name');
          if (nameEl) nameEl.textContent = newName;
        }
      }
      // 保存到localStorage
      if (window.PET_ENGINE.saveState) {
        window.PET_ENGINE.saveState();
      }
    }
    closeRenameModal();
  }

  window.openRenameModal = openRenameModal;
  window.closeRenameModal = closeRenameModal;
  window.confirmRename = confirmRename;

  // ===== 冒险系统 UI =====
  let adventureModalRendered = false;
  let adventureSelectedLocation = null;
  let adventureChoices = {};
  let adventureTimer = null;

  function openAdventureModal() {
    if (!adventureModalRendered) {
      createAdventureModal();
      adventureModalRendered = true;
    }

    const state = window.PET_ENGINE.getState();
    const progress = window.PET_ENGINE.getAdventureProgress(state.currentCatIndex);

    if (progress && progress.active) {
      // 冒险进行中
      renderAdventureProgress(progress);
    } else {
      // 选择冒险地点
      renderAdventureLocations();
    }

    const modal = document.getElementById('adventureModalMask');
    if (modal) modal.style.display = 'flex';

    startAdventureTimer();
  }

  function closeAdventureModal() {
    const modal = document.getElementById('adventureModalMask');
    if (modal) modal.style.display = 'none';
    stopAdventureTimer();
  }

  function createAdventureModal() {
    const html = `
      <div class="pet-modal-mask adventure-modal-mask" id="adventureModalMask" onclick="if(event.target===this)closeAdventureModal()">
        <div class="pet-modal adventure-modal">
          <div class="adventure-modal-header">
            <span class="adventure-modal-title" id="adventureModalTitle">🗺️ 猫咪冒险</span>
            <button class="bond-modal-close" onclick="closeAdventureModal()">×</button>
          </div>
          <div class="adventure-modal-body" id="adventureModalBody">
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function renderAdventureLocations() {
    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    if (!ADVENTURE_CONFIG) return;

    setAdventureTitle('🗺️ 选择冒险地点');
    const body = document.getElementById('adventureModalBody');
    if (!body) return;

    const locations = ADVENTURE_CONFIG.locations;
    body.innerHTML = `
      <div class="adventure-desc">选一个地方让猫咪去探险吧，3小时后回来带奖励~</div>
      <div class="adventure-location-list">
        ${locations.map(loc => `
          <div class="adventure-location-card" onclick="selectAdventureLocation('${loc.id}')">
            <div class="adventure-location-icon">${loc.icon}</div>
            <div class="adventure-location-info">
              <div class="adventure-location-name">${loc.name}</div>
              <div class="adventure-location-desc">${loc.desc}</div>
            </div>
            <div class="adventure-location-arrow">›</div>
          </div>
        `).join('')}
      </div>
      <div class="adventure-tip">⏱️ 每次冒险耗时 3 小时，期间猫咪不在家哦</div>
    `;
  }

  function selectAdventureLocation(locationId) {
    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    const location = ADVENTURE_CONFIG.locations.find(l => l.id === locationId);
    if (!location) return;

    adventureSelectedLocation = locationId;
    adventureChoices = {};
    renderAdventureChoice(0);
  }

  function renderAdventureChoice(choiceIndex) {
    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    const location = ADVENTURE_CONFIG.locations.find(l => l.id === adventureSelectedLocation);
    if (!location) return;

    setAdventureTitle(location.icon + ' ' + location.name);
    const body = document.getElementById('adventureModalBody');
    if (!body) return;

    const choice = location.choices[choiceIndex];
    const total = location.choices.length;

    body.innerHTML = `
      <div class="adventure-intro">${location.intro}</div>
      <div class="adventure-step-indicator">第 ${choiceIndex + 1} / ${total} 个选择</div>
      <div class="adventure-choice-question">${choice.question}</div>
      <div class="adventure-choice-options">
        ${choice.options.map(opt => `
          <div class="adventure-choice-option" onclick="makeAdventureChoice('${choice.id}', '${opt.id}')">
            ${opt.text}
          </div>
        `).join('')}
      </div>
      <div class="adventure-back-btn" onclick="adventureGoBack()">← 返回选地点</div>
    `;
  }

  function makeAdventureChoice(choiceId, optionId) {
    adventureChoices[choiceId] = optionId;

    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    const location = ADVENTURE_CONFIG.locations.find(l => l.id === adventureSelectedLocation);
    if (!location) return;

    const currentIdx = location.choices.findIndex(c => c.id === choiceId);
    const nextIdx = currentIdx + 1;

    if (nextIdx < location.choices.length) {
      // 下一个选择
      renderAdventureChoice(nextIdx);
    } else {
      // 所有选择完成，确认开始
      renderAdventureConfirm();
    }
  }

  function renderAdventureConfirm() {
    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    const location = ADVENTURE_CONFIG.locations.find(l => l.id === adventureSelectedLocation);
    if (!location) return;

    setAdventureTitle('✅ 准备出发！');
    const body = document.getElementById('adventureModalBody');
    if (!body) return;

    const choiceTexts = location.choices.map(c => {
      const opt = c.options.find(o => o.id === adventureChoices[c.id]);
      return opt ? opt.text : '';
    });

    body.innerHTML = `
      <div class="adventure-confirm-icon">${location.icon}</div>
      <div class="adventure-confirm-title">${location.name}</div>
      <div class="adventure-confirm-choices">
        ${choiceTexts.map((t, i) => `
          <div class="adventure-confirm-choice">
            <span class="adventure-confirm-choice-num">${i + 1}</span>
            <span>${t}</span>
          </div>
        `).join('')}
      </div>
      <div class="adventure-confirm-info">
        ⏱️ 冒险时长：约 ${ADVENTURE_CONFIG.durationMinutes / 60} 小时<br>
        🎁 奖励：食物、玩具、好感度（根据选择不同）
      </div>
      <div class="adventure-confirm-btns">
        <button class="rename-btn cancel" onclick="adventureGoBack()">再想想</button>
        <button class="rename-btn confirm" onclick="confirmStartAdventure()">出发！</button>
      </div>
    `;
  }

  function adventureGoBack() {
    adventureSelectedLocation = null;
    adventureChoices = {};
    renderAdventureLocations();
  }

  function confirmStartAdventure() {
    const state = window.PET_ENGINE.getState();
    const result = window.PET_ENGINE.startAdventure(
      state.currentCatIndex,
      adventureSelectedLocation,
      adventureChoices
    );

    if (result.success) {
      const progress = window.PET_ENGINE.getAdventureProgress(state.currentCatIndex);
      renderAdventureProgress(progress);
      startAdventureTimer();
      // 刷新猫咪显示（冒险中状态）
      if (typeof refreshCatDisplay === 'function') {
        refreshCatDisplay();
      }
    } else {
      toast(result.msg);
    }
  }

  function renderAdventureProgress(progress) {
    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    const location = ADVENTURE_CONFIG.locations.find(l => l.id === progress.locationId);

    setAdventureTitle('🏃 冒险中...');
    const body = document.getElementById('adventureModalBody');
    if (!body) return;

    const remaining = progress.remainingMs;
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;

    if (progress.completed) {
      body.innerHTML = `
        <div class="adventure-complete-icon">🎉</div>
        <div class="adventure-complete-title">冒险完成！</div>
        <div class="adventure-complete-desc">你家猫咪从${location?.name || '冒险'}回来了！</div>
        <button class="rename-btn confirm adventure-claim-btn" onclick="claimAdventureReward()">
          🎁 领取奖励
        </button>
      `;
    } else {
      body.innerHTML = `
        <div class="adventure-progress-icon">${location?.icon || '🗺️'}</div>
        <div class="adventure-progress-title">${location?.name || '冒险中'}</div>
        <div class="adventure-progress-time" id="adventureTimeText">${timeStr}后回来</div>
        <div class="adventure-progress-bar-bg">
          <div class="adventure-progress-bar-fill" id="adventureProgressFill" style="width:${progress.progress}%"></div>
        </div>
        <div class="adventure-progress-desc">
          猫咪正在外面探索世界，耐心等它回来吧~
        </div>
        <button class="rename-btn cancel adventure-close-btn" onclick="closeAdventureModal()">知道了</button>
      `;
    }
  }

  function startAdventureTimer() {
    stopAdventureTimer();
    adventureTimer = setInterval(() => {
      const state = window.PET_ENGINE.getState();
      const progress = window.PET_ENGINE.getAdventureProgress(state.currentCatIndex);
      if (!progress) {
        stopAdventureTimer();
        return;
      }

      const remaining = progress.remainingMs;
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;

      const timeEl = document.getElementById('adventureTimeText');
      const barEl = document.getElementById('adventureProgressFill');
      if (timeEl) timeEl.textContent = timeStr + '后回来';
      if (barEl) barEl.style.width = progress.progress + '%';

      // 如果完成了，刷新界面
      if (progress.completed && timeEl) {
        renderAdventureProgress(progress);
        stopAdventureTimer();
      }
    }, 1000);
  }

  function stopAdventureTimer() {
    if (adventureTimer) {
      clearInterval(adventureTimer);
      adventureTimer = null;
    }
  }

  function claimAdventureReward() {
    const state = window.PET_ENGINE.getState();
    const result = window.PET_ENGINE.claimAdventureReward(state.currentCatIndex);

    if (!result.success) {
      toast(result.msg);
      return;
    }

    // 显示奖励结果
    setAdventureTitle('🎁 冒险收获');
    const body = document.getElementById('adventureModalBody');
    if (!body) return;

    const foodList = result.foods.map(f => {
      const foodData = window.PET_DATA.FOODS.find(fd => fd.id === f.id);
      return `<div class="adventure-reward-item">
        <span class="adventure-reward-icon">${foodData?.icon || '🍖'}</span>
        <span class="adventure-reward-name">${foodData?.name || f.id} ×${f.count}</span>
      </div>`;
    }).join('');

    const toyList = result.toys.map(t => {
      const toyData = window.PET_DATA.TOYS.find(td => td.id === t.id);
      return `<div class="adventure-reward-item">
        <span class="adventure-reward-icon">${toyData?.icon || '🧸'}</span>
        <span class="adventure-reward-name">${toyData?.name || t.id} ×${t.count}</span>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="adventure-story">${result.story}</div>
      <div class="adventure-reward-section">
        <div class="adventure-reward-title">获得奖励</div>
        <div class="adventure-reward-list">
          ${foodList}
          ${toyList}
          <div class="adventure-reward-item">
            <span class="adventure-reward-icon">💕</span>
            <span class="adventure-reward-name">好感度 +${result.intimacy}</span>
          </div>
        </div>
      </div>
      <button class="rename-btn confirm adventure-close-btn" onclick="closeAdventureModal(); if(typeof refreshCatDisplay==='function')refreshCatDisplay();">太棒了！</button>
    `;

    stopAdventureTimer();
  }

  function setAdventureTitle(title) {
    const el = document.getElementById('adventureModalTitle');
    if (el) el.textContent = title;
  }

  window.openAdventureModal = openAdventureModal;
  window.closeAdventureModal = closeAdventureModal;
  window.selectAdventureLocation = selectAdventureLocation;
  window.makeAdventureChoice = makeAdventureChoice;
  window.adventureGoBack = adventureGoBack;
  window.confirmStartAdventure = confirmStartAdventure;
  window.claimAdventureReward = claimAdventureReward;

  function updatePoopTip(cat) {
    const tipBox = document.getElementById('poopTipBox');
    const tipText = document.getElementById('poopTipText');
    const cleanFab = document.getElementById('btnCleanFab');
    
    const hasPoop = !cat.isSleeping && cat.poopCount > 0;

    // 更新右上角清洁按钮
    if (cleanFab) {
      if (hasPoop) {
        cleanFab.classList.add('show');
        cleanFab.disabled = false;
        const badge = cleanFab.querySelector('.clean-fab-badge');
        if (badge) badge.textContent = cat.poopCount;
      } else {
        cleanFab.classList.remove('show');
      }
    }

    if (tipBox) {
      if (hasPoop) {
        tipBox.style.display = 'block';
        if (tipText) {
          if (cat.poopCount >= 6) {
            tipText.textContent = '便便堆满啦！快清理一下吧~';
          } else if (cat.poopCount >= 3) {
            tipText.textContent = `有 ${cat.poopCount} 坨便便，该打扫卫生了~`;
          } else {
            tipText.textContent = `有 ${cat.poopCount} 坨便便需要清理哦~`;
          }
        }
      } else {
        tipBox.style.display = 'none';
      }
    }
  }

  // ===== 操作 =====
  function doFeed(foodId) {
    const state = window.PET_ENGINE.getState();
    const result = window.PET_ENGINE.feedCat(state.currentCatIndex, foodId);

    if (result.success) {
      window.PET_RENDERER.triggerAction('eat', 1500);
      toast('🍽️ 吃得好香~');
      // 猫咪对话反馈
      if (window.CAT_CHAT) {
        const cat = state.cats[state.currentCatIndex];
        const isFull = cat && cat.hunger >= 95;
        const isFavorite = result.isFavorite || false;
        setTimeout(() => window.CAT_CHAT.onFeed(isFull, isFavorite), 800);
      }
      renderItemGrid('food');
      updateStatusBars();
      notifyCoinsChange();
      checkLevelUp(result.levelUp);
    } else {
      toast(result.msg);
    }
    return result;
  }

  function doPlay(toyId) {
    const state = window.PET_ENGINE.getState();
    const result = window.PET_ENGINE.playWithCat(state.currentCatIndex, toyId);

    if (result.success) {
      window.PET_RENDERER.triggerAction('play', 2000);
      toast('🎾 玩得好开心！');
      // 猫咪对话反馈
      if (window.CAT_CHAT) {
        const cat = state.cats[state.currentCatIndex];
        const isTired = cat && cat.energy <= 30;
        setTimeout(() => window.CAT_CHAT.onPlay(isTired), 800);
      }
      renderItemGrid('toy');
      updateStatusBars();
      checkLevelUp(result.levelUp);
    } else {
      toast(result.msg);
    }
    return result;
  }

  function doPet() {
    const state = window.PET_ENGINE.getState();
    const result = window.PET_ENGINE.petCat(state.currentCatIndex);
    if (result.success) {
      // 逗猫加权随机触发不同的可爱动作
      const petActions = [
        { action: 'pet',     weight: 20, duration: 1800, msg: '🥰 咕噜咕噜~' },
        { action: 'belly',   weight: 20, duration: 2500, msg: '😍 翻肚肚撒娇~' },
        { action: 'roll',    weight: 18, duration: 2200, msg: '🥳 开心得打滚~' },
        { action: 'tilt',    weight: 15, duration: 1500, msg: '🤔 歪头杀！' },
        { action: 'tailwag', weight: 15, duration: 1800, msg: '😊 摇尾巴~好开心！' },
        { action: 'groom',   weight: 12, duration: 2000, msg: '😌 舒服得舔毛~' },
      ];
      
      const totalWeight = petActions.reduce((sum, a) => sum + a.weight, 0);
      let rand = Math.random() * totalWeight;
      let selected = petActions[0];
      for (const a of petActions) {
        rand -= a.weight;
        if (rand <= 0) { selected = a; break; }
      }
      
      window.PET_RENDERER.triggerAction(selected.action, selected.duration);
      toast(selected.msg);
      // 猫咪对话反馈
      if (window.CAT_CHAT) {
        setTimeout(() => window.CAT_CHAT.onPet(), 800);
      }
      updateStatusBars();
      checkLevelUp(result.levelUp);
    } else {
      toast(result.msg);
    }
  }

  // 点击猫咪切换动作
  let lastTapAction = null;
  function doTapCat() {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    if (!cat || cat.isSleeping) return;

    // 点击猫咪加一点心情
    cat.happiness = Math.min(window.PET_ENGINE.CONFIG.maxHappiness, cat.happiness + 2);
    window.PET_ENGINE.save();

    // 加权随机触发动作（权重越高越常出现，每个动作都有明显视觉差异）
    const actionWeights = [
      { action: 'play',    weight: 18, duration: 2000 },  // 玩耍 - 最活泼
      { action: 'groom',   weight: 15, duration: 2500 },  // 舔毛 - 享受状
      { action: 'stretch', weight: 15, duration: 2000 },  // 伸懒腰 - 舒展
      { action: 'tilt',    weight: 12, duration: 1500 },  // 歪头 - 微侧站姿
      { action: 'tailwag', weight: 12, duration: 1800 },  // 摇尾巴 - 开心玩耍状
      { action: 'belly',   weight: 10, duration: 2200 },  // 翻肚皮 - 撒娇
      { action: 'roll',    weight: 10, duration: 2000 },  // 打滚 - 开心
      { action: 'blink',   weight: 8,  duration: 1200 },  // 眨眼 - 伸懒腰状
    ];
    
    // 排除上次的动作，保证每次点击都有变化
    const available = actionWeights.filter(item => item.action !== lastTapAction);
    const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
    let rand = Math.random() * totalWeight;
    let selected = available[0];
    
    for (const item of available) {
      rand -= item.weight;
      if (rand <= 0) {
        selected = item;
        break;
      }
    }
    
    lastTapAction = selected.action;
    window.PET_RENDERER.triggerAction(selected.action, selected.duration);
    updateStatusBars();
  }

  // ===== 族谱系统 =====
  function showFamilyTree() {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    if (!cat) return;
    
    const tree = window.PET_ENGINE.getFamilyTree(cat.uid, 3);
    
    // 递归渲染族谱节点
    function renderNode(node, isRoot = false) {
      const catData = window.PET_ENGINE.CATS.find(c => c.id === node.catId);
      const rarityLabel = node.rarity === 'rare' ? '稀有' : (node.rarity === 'epic' ? '史诗' : '普通');
      const rarityClass = node.rarity || 'common';
      const isVirtual = node.isVirtual ? 'virtual' : '';
      
      let html = `
        <div class="family-node ${isRoot ? 'root' : ''} ${rarityClass} ${isVirtual}">
          <div class="family-node-avatar">
            <img src="${new URL(`cats/cat_${node.catId}.png`, ASSET_BASE).href}" alt="${node.name}" onerror="this.style.display='none'">
          </div>
          <div class="family-node-info">
            <div class="family-node-name">${node.name}${isVirtual ? ' 🐾' : ''}</div>
            <div class="family-node-rarity rarity-tag-${rarityClass}">${rarityLabel}</div>
            <div class="family-node-owner">${node.ownerName || '我'}</div>
          </div>
        </div>
      `;
      
      if (node.parents && node.parents.length > 0) {
        html += `<div class="family-parents">`;
        node.parents.forEach(parent => {
          html += `<div class="family-parent-branch">${renderNode(parent, false)}</div>`;
        });
        html += `</div>`;
      }
      
      return html;
    }
    
    // 计算代数
    function countGenerations(node) {
      if (!node.parents || node.parents.length === 0) return 1;
      return 1 + Math.max(...node.parents.map(p => countGenerations(p)));
    }
    
    const genCount = tree ? countGenerations(tree) : 1;
    const childrenCount = (cat.childrenUids || []).length;
    
    // 历任主人列表
    const ownerHistory = cat.ownerHistory || [];
    let ownerHistoryHtml = '';
    if (ownerHistory.length > 0) {
      ownerHistoryHtml = `
        <div class="owner-history-section">
          <div class="owner-history-title">
            <span class="owner-history-icon">👥</span>
            <span>历任主人</span>
          </div>
          <div class="owner-history-list">
            ${ownerHistory.map((owner, idx) => `
              <div class="owner-history-item">
                <div class="owner-history-order">第${idx + 1}任</div>
                <div class="owner-history-info">
                  <div class="owner-history-name">${owner.name}</div>
                  <div class="owner-history-time">${formatDate(owner.time)}</div>
                </div>
                <div class="owner-history-type">
                  ${owner.type === 'buy' ? '购买' : owner.type === 'adopt' ? '领养' : '转让'}
                </div>
              </div>
            `).join('')}
            <div class="owner-history-item current">
              <div class="owner-history-order">现任</div>
              <div class="owner-history-info">
                <div class="owner-history-name">${window.PET_ENGINE.getState().userName || '我'}</div>
                <div class="owner-history-time">现在</div>
              </div>
              <div class="owner-history-type">
                <span class="owner-current-badge">当前主人</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    const modalHtml = `
      <div class="family-tree-modal" id="familyTreeModal">
        <div class="family-tree-mask" onclick="window.PET_UI.hideFamilyTree()"></div>
        <div class="family-tree-content">
          <div class="family-tree-header">
            <div class="family-tree-title">🌳 猫咪族谱</div>
            <button class="family-tree-close" onclick="window.PET_UI.hideFamilyTree()">✕</button>
          </div>
          <div class="family-tree-body">
            ${tree ? renderNode(tree, true) : '<div class="family-empty">这只猫没有族谱记录哦~</div>'}
            ${ownerHistoryHtml}
          </div>
          <div class="family-tree-footer">
            <div class="family-stat">
              <span class="family-stat-label">可追溯代数</span>
              <span class="family-stat-value">${genCount} 代</span>
            </div>
            <div class="family-stat">
              <span class="family-stat-label">子女数量</span>
              <span class="family-stat-value">${childrenCount} 只</span>
            </div>
            <div class="family-stat">
              <span class="family-stat-label">繁育次数</span>
              <span class="family-stat-value">${cat.breedingCount || 0} 次</span>
            </div>
          </div>
          <div class="family-tree-tip">
            💡 提示：带🐾标记的是公园猫咪，每一代繁育都可能解锁稀有品种哦~
          </div>
        </div>
      </div>
    `;
    
    // 移除旧的
    const oldModal = document.getElementById('familyTreeModal');
    if (oldModal) oldModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // 动画显示
    setTimeout(() => {
      const modal = document.getElementById('familyTreeModal');
      if (modal) modal.classList.add('show');
    }, 10);
  }
  
  function hideFamilyTree() {
    const modal = document.getElementById('familyTreeModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    }
  }

  // ===== 送猫系统 =====
  function showSendCatModal() {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    if (!cat) return;

    // 不能送最后一只
    if (state.cats.length <= 1) {
      toast('至少要留一只猫咪陪伴你哦~');
      return;
    }

    let modal = document.getElementById('sendCatModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'sendCatModal';
      modal.className = 'send-cat-modal';
      modal.innerHTML = `
        <div class="send-cat-mask" onclick="window.PET_UI.hideSendCatModal()"></div>
        <div class="send-cat-content">
          <div class="send-cat-header">
            <div class="send-cat-title">🎁 送猫给好友</div>
            <button class="send-cat-close" onclick="window.PET_UI.hideSendCatModal()">✕</button>
          </div>
          <div class="send-cat-body">
            <div class="send-cat-cat-info">
              <canvas class="send-cat-canvas" width="100" height="100"></canvas>
              <div class="send-cat-meta">
                <div class="send-cat-name" id="sendCatName"></div>
                <div class="send-cat-rarity" id="sendCatRarity"></div>
                <div class="send-cat-hint">送出后将无法找回，请慎重~</div>
              </div>
            </div>
            <div class="send-cat-search-box">
              <div class="send-cat-search-label">搜索蛋蛋用户</div>
              <div class="send-cat-search-input-wrap">
                <span class="send-cat-search-icon">🔍</span>
                <input type="text" class="send-cat-search-input" id="sendCatSearchInput" placeholder="输入昵称或学校名称...">
              </div>
              <div class="send-cat-search-results" id="sendCatSearchResults">
                <div class="send-cat-search-empty">输入关键词搜索用户</div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // 搜索输入
      const searchInput = modal.querySelector('#sendCatSearchInput');
      const resultsEl = modal.querySelector('#sendCatSearchResults');
      let searchTimer = null;

      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const kw = e.target.value;
        searchTimer = setTimeout(() => {
          const results = window.PET_ENGINE.searchUsers(kw);
          renderSearchResults(results, resultsEl);
        }, 200);
      });

      // 动画显示
      setTimeout(() => modal.classList.add('show'), 10);
    }

    // 更新当前猫信息
    document.getElementById('sendCatName').textContent = cat.name;
    const catData = window.PET_ENGINE.getCatData(cat.catId);
    const rarityEl = document.getElementById('sendCatRarity');
    const rarity = cat.rarity || (catData?.rarity || 'common');
    const rarityText = rarity === 'common' ? '普通' :
      rarity === 'rare3' ? '稀有' :
      rarity === 'rare4' ? '珍稀' : '传说';
    rarityEl.textContent = rarityText;
    rarityEl.className = 'send-cat-rarity rarity-tag-' + rarity;

    // 画猫
    const canvas = document.querySelector('#sendCatModal .send-cat-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      window.PET_RENDERER.loadSprites(() => {
        window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 50, 55, 80);
      });
    }

    // 清空搜索框
    const searchInput = document.querySelector('#sendCatSearchInput');
    if (searchInput) searchInput.value = '';
    const resultsEl = document.querySelector('#sendCatSearchResults');
    if (resultsEl) {
      resultsEl.innerHTML = '<div class="send-cat-search-empty">输入关键词搜索用户</div>';
    }
    modal.style.display = 'flex';
  }

  function renderSearchResults(results, container) {
    if (!results || results.length === 0) {
      container.innerHTML = '<div class="send-cat-search-empty">没有找到相关用户</div>';
      return;
    }

    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];

    let html = '';
    results.forEach(user => {
      html += `
        <div class="send-cat-user-item" data-userid="${user.userId}">
          <div class="send-cat-user-avatar">${user.avatar || '🥚'}</div>
          <div class="send-cat-user-info">
            <div class="send-cat-user-name">${user.name}</div>
            <div class="send-cat-user-school">${user.school}</div>
          </div>
          <button class="send-cat-user-btn">送给他</button>
        </div>
      `;
    });
    container.innerHTML = html;

    // 绑定按钮事件
    container.querySelectorAll('.send-cat-user-item').forEach(item => {
      const btn = item.querySelector('.send-cat-user-btn');
      const userId = item.dataset.userid;
      const user = results.find(u => u.userId === userId);
      btn.addEventListener('click', () => {
        confirmSendCat(cat, user);
      });
    });
  }

  function confirmSendCat(cat, user) {
    const confirmModal = document.createElement('div');
    confirmModal.className = 'send-cat-confirm-modal';
    confirmModal.innerHTML = `
      <div class="send-cat-confirm-mask"></div>
      <div class="send-cat-confirm-content">
        <div class="send-cat-confirm-title">确认送猫？</div>
        <div class="send-cat-confirm-body">
          <div class="send-cat-confirm-cat">
            <canvas width="80" height="80" class="confirm-cat-canvas"></canvas>
            <div class="confirm-cat-name">${cat.name}</div>
          </div>
          <div class="send-cat-confirm-arrow">➡️</div>
          <div class="send-cat-confirm-user">
            <div class="confirm-user-avatar">${user.avatar || '🥚'}</div>
            <div class="confirm-user-name">${user.name}</div>
            <div class="confirm-user-school">${user.school}</div>
          </div>
        </div>
        <div class="send-cat-confirm-tip">送出后猫咪将从你的队伍中移除，无法找回哦~</div>
        <div class="send-cat-confirm-btns">
          <button class="send-cat-btn-cancel">再想想</button>
          <button class="send-cat-btn-confirm">确认送出</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);

    // 画猫
    const canvas = confirmModal.querySelector('.confirm-cat-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      window.PET_RENDERER.loadSprites(() => {
        window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 40, 45, 65);
      });
    }

    // 取消
    confirmModal.querySelector('.send-cat-btn-cancel').addEventListener('click', () => {
      confirmModal.remove();
    });
    confirmModal.querySelector('.send-cat-confirm-mask').addEventListener('click', () => {
      confirmModal.remove();
    });

    // 确认
    confirmModal.querySelector('.send-cat-btn-confirm').addEventListener('click', () => {
      const state = window.PET_ENGINE.getState();
      const catIdx = state.cats.findIndex(c => c.uid === cat.uid);
      if (catIdx < 0) return;

      const result = window.PET_ENGINE.sendCat(catIdx, user.userId);
      confirmModal.remove();
      hideSendCatModal();
      
      if (result.success) {
        toast(result.msg);
        render();
        // 如果当前猫被送走了，刷新动画
        startAnimation();
      } else {
        toast(result.msg);
      }
    });

    setTimeout(() => confirmModal.classList.add('show'), 10);
  }

  function hideSendCatModal() {
    const modal = document.getElementById('sendCatModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => { if (modal.parentNode) modal.style.display = 'none'; }, 300);
    }
  }

  function doClean() {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];

    if (!cat) return;
    if (cat.poopCount <= 0) {
      toast('干干净净的，没有便便~');
      return;
    }

    const result = window.PET_ENGINE.cleanPoop(state.currentCatIndex);
    if (result.success) {
      window.PET_RENDERER.triggerAction('clean', 1200);
      toast(`🧹 清理了 ${result.cleaned} 坨便便！`);
      render();
    } else {
      toast(result.msg);
    }
  }

  function doToggleSleep() {
    const state = window.PET_ENGINE.getState();
    const wasSleeping = state.cats[state.currentCatIndex]?.isSleeping;
    const result = window.PET_ENGINE.toggleSleep(state.currentCatIndex);
    if (result.success) {
      toast(result.msg);
      // 猫咪对话反馈
      if (window.CAT_CHAT) {
        setTimeout(() => window.CAT_CHAT.onSleep(!wasSleeping), 500);
      }
      // 只更新UI状态，不重建整个页面（避免canvas被销毁导致白屏）
      updateSleepUIState();
      updateStatusBars();
    } else {
      toast(result.msg);
    }
  }

  function updateSleepUIState() {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    if (!cat) return;
    
    const isSleeping = cat.isSleeping;
    
    // 更新睡觉按钮
    const sleepBtn = document.getElementById('btnSleep');
    if (sleepBtn) {
      sleepBtn.classList.toggle('sleep-mode', isSleeping);
      const iconEl = sleepBtn.querySelector('.icon');
      const textEl = sleepBtn.querySelectorAll('span')[1];
      if (iconEl) iconEl.textContent = isSleeping ? '☀️' : '💤';
      if (textEl) textEl.textContent = isSleeping ? '叫醒' : '睡觉';
    }
    
    // 更新禁用按钮状态
    const btns = ['btnFeed', 'btnPlay', 'btnPet'];
    btns.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.classList.toggle('disabled', isSleeping);
        if (isSleeping) {
          btn.setAttribute('disabled', 'disabled');
        } else {
          btn.removeAttribute('disabled');
        }
      }
    });
    
    // 更新清洁按钮显示
    const cleanBtn = document.getElementById('btnCleanFab');
    if (cleanBtn) {
      cleanBtn.classList.toggle('show', cat.poopCount > 0 && !isSleeping);
      if (isSleeping) {
        cleanBtn.setAttribute('disabled', 'disabled');
      } else {
        cleanBtn.removeAttribute('disabled');
      }
    }
    
    // 更新活力状态标签
    const energyTag = document.getElementById('energyStatusTag');
    if (energyTag) {
      if (isSleeping) {
        energyTag.textContent = '💤 睡眠中';
        energyTag.className = 'energy-status-tag sleeping';
      } else {
        energyTag.textContent = '';
        energyTag.className = 'energy-status-tag';
      }
    }
  }

  // 旧「图鉴标签页」renderCollectionTab / renderCollectionRow / doAdopt 已移除（2026-10-12）：
  // 图鉴统一走 collectionModal 弹窗（renderCollectionGrid）。
  // 公园盲盒领养由 bridge 的 doAdopt（cat-cabin-bridge.js）承担，与此处无关。

  // ===== 专注模式标签页 =====
  function renderFocusTab(container) {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    const catData = cat ? window.PET_ENGINE.getCatData(cat.catId) : null;
    const isActive = state.focus.isActive;

    const focusOptions = [
      { minutes: 15, label: '15分钟', desc: '快速专注', bonus: '🐟×1~2' },
      { minutes: 25, label: '25分钟', desc: '番茄钟', bonus: '🍖 更多猫粮' },
      { minutes: 45, label: '45分钟', desc: '深度专注', bonus: '🧸 可能出玩具' },
      { minutes: 60, label: '60分钟', desc: '长时专注', bonus: '🎁 丰厚奖励' },
      { minutes: 90, label: '90分钟', desc: '超长专注', bonus: '💎 稀有奖励' }
    ];

    container.innerHTML = `
      <div class="focus-header">
        <div class="focus-title">⏱️ 专注模式</div>
        <div class="focus-subtitle">专注学习，获得猫粮和玩具奖励~</div>
      </div>

      <!-- 专注计时显示 -->
      <div class="focus-timer-box" id="focusTimerBox">
        <div class="focus-timer" id="focusTimer">25:00</div>
        <div class="focus-timer-label" id="focusTimerLabel">选择专注时长</div>
        <div class="focus-earned" id="focusEarned" style="display:none">亲密度 💕 +<span id="focusEarnedAmount">0</span></div>
      </div>

      <!-- 时长选择 -->
      <div class="focus-options" id="focusOptions" style="${isActive ? 'display:none' : ''}">
        <div class="focus-options-title">选择专注时长</div>
        <div class="focus-options-grid">
          ${focusOptions.map(opt => `
            <div class="focus-option" data-minutes="${opt.minutes}">
              <div class="focus-option-time">${opt.label}</div>
              <div class="focus-option-desc">${opt.desc}</div>
              ${opt.bonus ? `<div class="focus-option-bonus">🎁 ${opt.bonus}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 控制按钮 -->
      <div class="focus-controls">
        ${isActive 
          ? `<button class="focus-btn stop" id="focusStopBtn">⏹️ 结束专注</button>
             <button class="focus-btn giveup" id="focusGiveUpBtn">放弃</button>`
          : `<button class="focus-btn start disabled" id="focusStartBtn" disabled>
               ▶️ 开始专注
             </button>`
        }
      </div>

      <!-- 专注统计 -->
      <div class="focus-stats">
        <div class="focus-stat-item">
          <div class="focus-stat-value">${state.focus.completedSessions || 0}</div>
          <div class="focus-stat-label">完成次数</div>
        </div>
        <div class="focus-stat-item">
          <div class="focus-stat-value">${Math.floor(state.totalFocusMinutes || 0)}</div>
          <div class="focus-stat-label">累计分钟</div>
        </div>
        <div class="focus-stat-item">
          <div class="focus-stat-value">${state.focus.earnedCoins || 0}</div>
          <div class="focus-stat-label">专注赚币</div>
        </div>
      </div>

      <!-- 奖励说明 -->
      <div class="focus-reward-info">
        <div class="reward-info-title">💰 奖励规则</div>
        <div class="reward-info-list">
          <div>• 基础奖励：每分钟 ${FOCUS_REWARDS.baseCoinsPerMinute} 金币</div>
          <div>• 完整完成：奖励 ×${FOCUS_REWARDS.perfectBonus}</div>
          <div>• 里程碑奖励：25分钟+20 / 45分钟+50 / 90分钟+120</div>
          <div>💕 <b>专注陪伴：每分钟增加亲密度！</b></div>
          <div>🎁 <b>完成奖励：随机获得食物或玩具！</b></div>
        </div>
      </div>
    `;

    // 绑定时长选择
    if (!isActive) {
      container.querySelectorAll('.focus-option').forEach(opt => {
        opt.onclick = () => selectFocusTime(parseInt(opt.dataset.minutes));
      });
      // 默认选中 25 分钟（番茄钟），进入页面即可直接点击开始
      selectFocusTime(25);
    }

    // 绑定开始/结束按钮
    const startBtn = document.getElementById('focusStartBtn');
    const stopBtn = document.getElementById('focusStopBtn');
    const giveUpBtn = document.getElementById('focusGiveUpBtn');

    if (startBtn) startBtn.onclick = () => startFocusMode();
    if (stopBtn) stopBtn.onclick = () => stopFocusMode(true);
    if (giveUpBtn) giveUpBtn.onclick = () => stopFocusMode(false);

    // 初始化专注画布
    const focusCanvas = document.getElementById('focusCanvas');
    if (focusCanvas && cat) {
      setTimeout(() => {
        const rect = focusCanvas.getBoundingClientRect();
        focusCanvas.width = rect.width * 2;
        focusCanvas.height = rect.height * 2;
      }, 50);
    }

    // 如果正在专注中，启动计时器
    if (isActive) {
      startFocusTimer();
    }
  }

  let selectedFocusMinutes = null;

  function selectFocusTime(minutes) {
    selectedFocusMinutes = minutes;
    
    // 更新UI
    document.querySelectorAll('.focus-option').forEach(opt => {
      opt.classList.toggle('selected', parseInt(opt.dataset.minutes) === minutes);
    });

    const timer = document.getElementById('focusTimer');
    const label = document.getElementById('focusTimerLabel');
    const startBtn = document.getElementById('focusStartBtn');

    if (timer) timer.textContent = String(minutes).padStart(2, '0') + ':00';
    if (label) label.textContent = `${minutes}分钟专注`;
    if (startBtn) {
      startBtn.classList.remove('disabled');
      startBtn.disabled = false;
    }
  }

  function startFocusMode() {
    if (!selectedFocusMinutes) {
      toast('请先选择专注时长~');
      return;
    }

    const result = window.PET_ENGINE.startFocus(selectedFocusMinutes);
    if (result.success) {
      toast(result.msg);
      // 开始后自动切回猫咪页面，让猫咪陪着学习
      switchTab('cat');
      startFocusTimer();
      // 猫咪专注陪伴 - 开始
      if (window.CAT_CHAT) {
        setTimeout(() => window.CAT_CHAT.onFocusStart(), 800);
      }
    } else {
      toast(result.msg);
    }
  }

  function startFocusTimer() {
    if (focusTimerInterval) {
      clearInterval(focusTimerInterval);
    }

    focusTimerInterval = setInterval(() => {
      const progress = window.PET_ENGINE.getFocusProgress();
      
      // 专注页面的计时器
      if (currentTab === 'focus') {
        const timer = document.getElementById('focusTimer');
        const earnedEl = document.getElementById('focusEarned');
        const earnedAmount = document.getElementById('focusEarnedAmount');

        if (timer) {
          const remaining = Math.max(0, Math.floor(progress.remainingSeconds || 0));
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          timer.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        }

        if (earnedEl) earnedEl.style.display = 'block';
        if (earnedAmount) earnedAmount.textContent = progress.intimacyGain || 0;

        // 更新专注画布中的猫咪
        const focusCanvas = document.getElementById('focusCanvas');
        const cat = window.PET_ENGINE.getCurrentCat();
        if (focusCanvas && cat) {
          window.PET_RENDERER.renderPetScene(focusCanvas, cat);
        }
      }
      
      // 猫咪页面的专注悬浮条
      if (currentTab === 'cat') {
        updateFocusBar(progress);
      }

      // 专注陪伴 - 里程碑文案
      if (window.CAT_CHAT && progress.totalSeconds && progress.totalSeconds > 0) {
        const elapsedMin = (progress.totalSeconds - progress.remainingSeconds) / 60;
        const totalMin = progress.totalSeconds / 60;
        window.CAT_CHAT.onFocusTick(elapsedMin, totalMin);
      }

      // 时间到了自动完成
      if (progress.progress >= 1) {
        stopFocusMode(true);
      }
    }, 500);
  }

  function stopFocusMode(completed) {
    if (focusTimerInterval) {
      clearInterval(focusTimerInterval);
      focusTimerInterval = null;
    }

    const result = window.PET_ENGINE.stopFocus(completed);
    if (result.success) {
      updateCoinDisplay();
      notifyCoinsChange();
      selectedFocusMinutes = null;
      
      // 隐藏专注悬浮条
      const bar = document.getElementById('focusFloatingBar');
      if (bar) bar.style.display = 'none';
      
      render();
      
      // 完成专注时弹出盲盒
      if (result.completed) {
        // 猫咪专注陪伴 - 完成
        if (window.CAT_CHAT) {
          setTimeout(() => window.CAT_CHAT.onFocusComplete(), 300);
        }
        setTimeout(() => {
          showBlindBox(result.minutes);
        }, 500);
      } else {
        // 猫咪专注陪伴 - 放弃
        if (window.CAT_CHAT) {
          setTimeout(() => window.CAT_CHAT.onFocusGiveUp(), 300);
        }
        toast(result.msg);
      }
    } else {
      toast(result.msg);
    }
  }

  // ===== 盲盒系统 =====
  let pendingBlindBoxMinutes = 0;

  function showBlindBox(focusMinutes) {
    pendingBlindBoxMinutes = focusMinutes;
    const modal = document.getElementById('blindBoxModal');
    if (!modal) return;
    
    // 重置状态
    const wrapper = document.getElementById('blindBoxWrapper');
    const icon = document.getElementById('blindBoxIcon');
    const resultEl = document.getElementById('blindBoxResult');
    const openBtn = document.getElementById('blindBoxOpenBtn');
    const closeBtn = document.getElementById('blindBoxCloseBtn');
    
    if (wrapper) wrapper.className = 'blind-box-wrapper';
    if (icon) icon.textContent = '📦';
    if (resultEl) resultEl.style.display = 'none';
    if (openBtn) { openBtn.style.display = 'block'; openBtn.textContent = '👆 点击开启'; }
    if (closeBtn) closeBtn.style.display = 'none';
    
    modal.style.display = 'flex';
    
    // 绑定开启按钮
    const openBtnEl = document.getElementById('blindBoxOpenBtn');
    if (openBtnEl) {
      openBtnEl.onclick = openBlindBoxAction;
    }
    
    // 绑定关闭按钮
    const closeBtnEl = document.getElementById('blindBoxCloseBtn');
    if (closeBtnEl) {
      closeBtnEl.onclose = null;
      closeBtnEl.onclick = closeBlindBox;
    }
  }

  function openBlindBoxAction() {
    const openBtn = document.getElementById('blindBoxOpenBtn');
    if (openBtn) { openBtn.style.display = 'none'; }
    
    const wrapper = document.getElementById('blindBoxWrapper');
    if (wrapper) {
      wrapper.classList.add('shaking');
    }
    
    // 震动动画后开启
    setTimeout(() => {
      const result = window.PET_ENGINE.openBlindBox(pendingBlindBoxMinutes);
      displayBlindBoxResult(result);
    }, 1200);
  }

  function displayBlindBoxResult(result) {
    const wrapper = document.getElementById('blindBoxWrapper');
    const icon = document.getElementById('blindBoxIcon');
    const resultEl = document.getElementById('blindBoxResult');
    const tierEl = document.getElementById('blindBoxTier');
    const rewardsEl = document.getElementById('blindBoxRewards');
    const closeBtn = document.getElementById('blindBoxCloseBtn');
    
    if (wrapper) {
      wrapper.classList.remove('shaking');
      wrapper.classList.add('opened');
      wrapper.style.background = `radial-gradient(circle, ${result.tier.bgColor} 0%, transparent 70%)`;
    }
    if (icon) {
      icon.textContent = result.tier.emoji;
      icon.style.color = result.tier.color;
      icon.style.fontSize = '80px';
    }
    
    if (tierEl) {
      tierEl.innerHTML = `<span style="color: ${result.tier.color}; font-weight: bold;">【${result.tier.name}】</span>${result.isUpgrade ? ' ✨ 时长加成升级！' : ''}`;
    }
    
    if (rewardsEl) {
      let html = '';
      
      result.foods.forEach(f => {
        html += `<div class="reward-item">${f.emoji} <span>${f.name}</span> ×${f.count}</div>`;
      });
      
      result.toys.forEach(t => {
        html += `<div class="reward-item">${t.emoji} <span>${t.name}</span> ×${t.count}</div>`;
      });
      
      if (result.intimacyGain && result.intimacyGain > 0) {
        html += `<div class="reward-item reward-intimacy">💕 <span>亲密度</span> +${result.intimacyGain}</div>`;
      }
      
      rewardsEl.innerHTML = html;
    }
    
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.classList.add('fade-in-up');
    }
    
    if (closeBtn) closeBtn.style.display = 'block';
    
    updateCoinDisplay();
    notifyCoinsChange();
    render();
  }

  function closeBlindBox() {
    const modal = document.getElementById('blindBoxModal');
    if (modal) modal.style.display = 'none';
  }

  // ===== 每日签到 =====
  function updateCheckinEntry() {
    const canCheck = window.PET_ENGINE.canCheckIn();
    // 左侧栏「每日签到」按钮的红点提示
    const sideBtn = document.getElementById('sideCheckinBtn');
    if (sideBtn) {
      if (canCheck) {
        sideBtn.classList.add('has-notification');
      } else {
        sideBtn.classList.remove('has-notification');
      }
    }
  }

  /** 奖励短标签（周卡小格内用一行说得清的说法） */
  function checkinRewardLabel(reward) {
    switch (reward.type) {
      case 'coin': return `${reward.coins}币`;
      case 'food': return `${reward.count}份粮`;
      case 'toy': return `${reward.count}玩具`;
      case 'cat': return '猫咪';
      case 'slot': return '栏位+1';
      case 'adoption_slot': return '名额+1';
      default: return '奖励';
    }
  }

  function refreshCheckinInfo() {
    const info = window.PET_ENGINE.getCheckinInfo();

    // 连续天数（头部胶囊）
    const streakNum = document.getElementById('checkinStreakNum');
    if (streakNum) streakNum.textContent = info.streakDays;

    // 渲染7天奖励
    const weekEl = document.getElementById('checkinWeek');
    if (weekEl) {
      let html = '';
      info.allRewards.forEach((reward, idx) => {
        const day = idx + 1;
        // 今天落在周卡上的第几格：未签到时是「下一格」（nextDay）；
        // 已签到时是「刚签的那一格」（streakDays 本身），否则会把明天误标成已签。
        const cycleDay = info.canCheckIn
          ? (info.streakDays % 7) + 1
          : ((info.streakDays - 1) % 7) + 1;
        const isToday = day === cycleDay;
        const isChecked = day < cycleDay || (isToday && !info.canCheckIn);

        let statusClass = '';
        let mark = '';
        if (isChecked) { statusClass = 'checked'; mark = '<div class="checkin-day-mark">✓</div>'; }
        if (isToday && info.canCheckIn) statusClass = 'today';
        if (isToday && !info.canCheckIn) statusClass = 'checked today-checked';

        html += `
          <div class="checkin-day ${statusClass} ${day === 7 ? 'day-special' : ''}">
            <div class="checkin-day-num">${day === 7 ? '大奖' : '第' + day + '天'}</div>
            <div class="checkin-day-emoji">${reward.emoji}</div>
            <div class="checkin-day-reward">${checkinRewardLabel(reward)}</div>
            ${mark}
          </div>
        `;
      });
      weekEl.innerHTML = html;
    }

    // 今日奖励预览
    const todayRewardEl = document.getElementById('checkinTodayReward');
    if (todayRewardEl) {
      if (info.canCheckIn) {
        todayRewardEl.style.display = 'block';
        todayRewardEl.innerHTML = `今日可领：${info.todayReward.emoji} ` +
          (info.todayReward.type === 'coin' ? info.todayReward.coins + ' 金币' :
           info.todayReward.type === 'food' ? info.todayReward.count + ' 个食物' :
           info.todayReward.type === 'toy' ? info.todayReward.count + ' 个玩具' :
           info.todayReward.type === 'cat' ? '随机猫咪一只！🐱' :
           info.todayReward.type === 'adoption_slot' ? '野猫领养名额+1 🎫 可去公园多洗一只流浪猫~' :
           info.todayReward.type === 'slot' ? '猫咪栏位+1 🏠 含200金币+高级粮' :
           '神秘奖励！');
      } else {
        todayRewardEl.style.display = 'none';
      }
    }

    // 签到按钮状态（display 交给 CSS 的 flex 居中，不再内联 block）
    const doBtn = document.getElementById('checkinDoBtn');
    if (doBtn) {
      if (info.canCheckIn) {
        doBtn.textContent = '🎁 立即签到';
        doBtn.disabled = false;
      } else {
        doBtn.textContent = '✓ 今日已签到';
        doBtn.disabled = true;
      }
    }

    // 隐藏结果区
    const resultEl = document.getElementById('checkinResult');
    if (resultEl) resultEl.style.display = 'none';
  }

  function openCheckinModal() {
    const modal = document.getElementById('checkinModal');
    if (!modal) return;
    modal.style.display = 'flex';
    refreshCheckinInfo();
  }

  function closeCheckinModal() {
    const modal = document.getElementById('checkinModal');
    if (modal) modal.style.display = 'none';
  }

  function doCheckinAction() {
    const result = window.PET_ENGINE.doCheckin();
    if (result.success) {
      // 先重渲染签到页（周卡打勾、连续天数胶囊、今日奖励预览、按钮状态），
      // 否则签到后页面停留在旧状态、看起来"没刷新"。
      // 注意：refreshCheckinInfo 末尾会隐藏结果区，故结果区需在其之后再显示。
      refreshCheckinInfo();

      // 显示结果
      const resultEl = document.getElementById('checkinResult');
      const resultItems = document.getElementById('checkinResultItems');
      const doBtn = document.getElementById('checkinDoBtn');
      const resultTitle = document.getElementById('checkinResultTitle');
      
      if (resultTitle) {
        if (result.rewards.cat && result.rewards.cat !== 'all_collected') {
          resultTitle.textContent = `🎉 获得新猫咪：${result.rewards.cat.name}！`;
        } else if (result.rewards.adoptionSlot) {
          resultTitle.textContent = '🎫 野猫领养名额+1！';
        } else if (result.slotIncreased) {
          resultTitle.textContent = '🏠 猫咪栏位+1！';
        } else {
          resultTitle.textContent = `🎉 第 ${result.day} 天签到成功！`;
        }
      }
      
      if (resultItems) {
        let html = '';
        
        // 新猫咪奖励（放在最前面，最大最醒目）
        if (result.rewards.cat && result.rewards.cat !== 'all_collected') {
          html += `
            <div class="checkin-reward-cat">
              <div class="reward-cat-emoji">🐱</div>
              <div class="reward-cat-info">
                <div class="reward-cat-name">${result.rewards.cat.name}</div>
                <div class="reward-cat-desc">${result.rewards.cat.personality}</div>
              </div>
              <div class="reward-cat-badge">NEW!</div>
            </div>
          `;
        }
        
        // 领养名额+1奖励（第3天，也放最前面）
        if (result.rewards.adoptionSlot) {
          html += `
            <div class="checkin-reward-cat" style="background: linear-gradient(135deg, #E3F2FD, #BBDEFB);">
              <div class="reward-cat-emoji">🎫</div>
              <div class="reward-cat-info">
                <div class="reward-cat-name" style="color: #1565C0;">野猫领养名额 +1</div>
                <div class="reward-cat-desc">去公园多洗一只流浪猫，说不定是稀有品种哦~</div>
              </div>
              <div class="reward-cat-badge" style="background: #2196F3;">NEW!</div>
            </div>
          `;
        } else if (result.rewards.adoptionSlotFull) {
          html += `<div class="checkin-reward-item">🎫 领养名额已满（10个上限），折算 +100 金币</div>`;
        }

        // 栏位+1奖励（第7天，也放最前面）
        if (result.slotIncreased) {
          html += `
            <div class="checkin-reward-cat" style="background: linear-gradient(135deg, #FFF3E0, #FFE0B2);">
              <div class="reward-cat-emoji">🏠</div>
              <div class="reward-cat-info">
                <div class="reward-cat-name" style="color: #E65100;">猫咪栏位 +1</div>
                <div class="reward-cat-desc">可以多养一只猫咪啦~</div>
              </div>
              <div class="reward-cat-badge" style="background: #FF9800;">NEW!</div>
            </div>
          `;
        }
        
        if (result.rewards.coins > 0) {
          html += `<div class="checkin-reward-item">💰 <span>+${result.rewards.coins}</span> 金币</div>`;
        }
        result.rewards.foods.forEach(f => {
          html += `<div class="checkin-reward-item">${f.emoji} <span>${f.name}</span> ×${f.count}</div>`;
        });
        result.rewards.toys.forEach(t => {
          html += `<div class="checkin-reward-item">${t.emoji} <span>${t.name}</span> ×${t.count}</div>`;
        });
        
        // 全部收集完的提示
        if (result.rewards.cat === 'all_collected') {
          html += `<div class="checkin-reward-item all-collected">🌟 猫咪已全部收集！获得300金币补偿~</div>`;
        }
        
        resultItems.innerHTML = html;
      }
      
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.classList.add('fade-in-up');
      }
      
      if (doBtn) {
        doBtn.textContent = '✓ 签到完成';
        doBtn.disabled = true;
      }
      
      updateCoinDisplay();
      notifyCoinsChange();
      updateCheckinEntry();
      render();
      
      toast('签到成功！获得奖励~');
    } else {
      toast(result.msg);
    }
  }

  // ===== 亲密度提升提示 =====
  function checkLevelUp(levelUpInfo) {
    if (!levelUpInfo) return;
    showLevelUpToast(levelUpInfo);
  }

  function showLevelUpToast(levelUp) {
    const toastEl = document.getElementById('levelUpToast');
    const detailEl = document.getElementById('levelUpDetail');
    const bonusEl = document.getElementById('levelUpBonus');
    
    if (!toastEl) return;
    
    const prevLevel = levelUp.newLevel - 1;
    const newLevel = levelUp.newLevel;
    
    if (detailEl) {
      detailEl.textContent = `Lv.${prevLevel} → Lv.${newLevel}`;
    }
    if (bonusEl) {
      if (levelUp.focusBonus) {
        bonusEl.textContent = `专注加成 +${levelUp.focusBonus}%`;
      } else {
        bonusEl.textContent = '亲密度又提升啦~';
      }
    }
    
    toastEl.style.display = 'block';
    toastEl.classList.remove('level-up-hide');
    toastEl.classList.add('level-up-show');
    
    // 3秒后消失
    setTimeout(() => {
      toastEl.classList.remove('level-up-show');
      toastEl.classList.add('level-up-hide');
      setTimeout(() => {
        toastEl.style.display = 'none';
      }, 500);
    }, 3000);
  }

  // ===== 商店标签页 =====
  function renderShopTab(container) {
    container.innerHTML = `
      <div class="shop-tabs">
        <div class="shop-tab active" data-shop="food">🥫 食物</div>
        <div class="shop-tab" data-shop="toy">🧸 玩具</div>
        <div class="shop-tab" data-shop="item">🎁 道具</div>
      </div>
      <div class="shop-grid" id="shopGrid"></div>
    `;

    // 绑定商店标签
    container.querySelectorAll('.shop-tab').forEach(tab => {
      tab.onclick = () => {
        container.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderShopGrid(tab.dataset.shop);
      };
    });

    renderShopGrid('food');
  }

  function renderShopGrid(type) {
    const grid = document.getElementById('shopGrid');
    if (!grid) return;

    let items;
    let buyFn;
    let invKey;

    switch(type) {
      case 'food':
        items = FOODS;
        buyFn = (id) => window.PET_ENGINE.buyFood(id, 1);
        invKey = 'foods';
        break;
      case 'toy':
        items = TOYS;
        buyFn = (id) => window.PET_ENGINE.buyToy(id, 1);
        invKey = 'toys';
        break;
      case 'item':
        items = ITEMS;
        buyFn = (id) => window.PET_ENGINE.buyItem(id);
        invKey = 'items';
        break;
    }

    const state = window.PET_ENGINE.getState();
    const inv = state.inventory[invKey] || {};

    grid.innerHTML = '';

    items.forEach(item => {
      const count = inv[item.id] || 0;
      const canAfford = state.coins >= item.price;
      const isFurniture = item.type === 'furniture' || item.type === 'bed';
      const isOwned = isFurniture && count > 0;

      // 效果描述
      let effectDesc = '';
      switch(item.effect) {
        case 'sleepBonus': effectDesc = '睡眠恢复+50%，心情恢复+100%'; break;
        case 'happinessBonus': effectDesc = '心情衰减-30%，玩耍效果+50%'; break;
        case 'healthBonus': effectDesc = '饥饿衰减-25%'; break;
        case 'grooming': effectDesc = '使用后心情+25'; break;
        case 'energy': effectDesc = '使用后活力+35，饥饿+10'; break;
      }

      const el = document.createElement('div');
      el.className = 'shop-item-card' + (isFurniture ? ' furniture' : ' consumable');
      el.innerHTML = `
        <div class="shop-item-type-tag">${isFurniture ? '家具' : '消耗品'}</div>
        <div class="shop-item-icon">${item.emoji}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-effect">${effectDesc}</div>
        <div class="shop-item-owned">${isFurniture ? (isOwned ? '✅ 已拥有' : '未拥有') : `已有 ${count}`}</div>
        ${!isOwned ? `<div class="shop-item-price">💰 ${item.price}</div>` : ''}
        <div class="shop-item-actions">
          ${!isOwned ? `<button class="shop-buy-btn">
            购买
          </button>` : (isFurniture ? `<div class="shop-owned-tip">已放置到小屋</div>` : '')}
        </div>
      `;

      if (!isOwned) {
        el.querySelector('.shop-buy-btn').onclick = () => {
          if (!canAfford) {
            toast('金币不够哦，去专注模式赚金币吧！💰');
            return;
          }
          const result = buyFn(item.id);
          if (result.success) {
            toast(result.msg || '购买成功！');
            updateCoinDisplay();
            notifyCoinsChange();
            renderShopGrid(type);
            if (window.PET_RENDERER && window.PET_RENDERER.refreshFurniture) {
              window.PET_RENDERER.refreshFurniture();
            }
          } else {
            toast(result.msg);
          }
        };
      }

      grid.appendChild(el);
    });
  }

  // ===== 动画循环 =====
  let renderLoopCtrl = null;
  let statusUpdateTimer = null;

  function startAnimation() {
    // 启动猫咪渲染循环（只启动一次）
    function tryStartRender() {
      if (canvasEl && currentTab === 'cat' && !renderLoopCtrl) {
        const cat = window.PET_ENGINE.getCurrentCat();
        if (cat) {
          window.PET_RENDERER.loadSprites(() => {
            if (canvasEl && currentTab === 'cat' && !renderLoopCtrl) {
              renderLoopCtrl = window.PET_RENDERER.startRenderLoop(canvasEl, cat);
            }
          });
        }
      }
    }
    tryStartRender();

    // 状态条每 500ms 更新一次（不需要60fps，节省大量性能）
    if (statusUpdateTimer) clearInterval(statusUpdateTimer);
    statusUpdateTimer = setInterval(() => {
      if (currentTab === 'cat') {
        updateStatusBars();
      }
    }, 500);
    // 立即更新一次
    updateStatusBars();
  }

  function stopAnimation() {
    if (renderLoopCtrl) {
      renderLoopCtrl.stop();
      renderLoopCtrl = null;
    }
    if (statusUpdateTimer) {
      clearInterval(statusUpdateTimer);
      statusUpdateTimer = null;
    }
    if (focusTimerInterval) {
      clearInterval(focusTimerInterval);
      focusTimerInterval = null;
    }
  }

  // ===== 工具函数 =====
  function formatDate(timestamp) {
    if (!timestamp) return '未知';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return days + '天前';
    if (days < 30) return Math.floor(days / 7) + '周前';
    if (days < 365) return Math.floor(days / 30) + '个月前';
    return Math.floor(days / 365) + '年前';
  }

  // ===== 「看看猫咪在想什么」：故事事件入口 + 冷却提示 =====
  function openCatThought() {
    const triggered = window.CAT_CHAT.tryTriggerStoryEvent();
    if (!triggered) {
      // 没有可用事件时，显示一句随机闲聊
      window.CAT_CHAT.triggerIdleChat();
    }
  }

  // 气泡按钮冷却外观：点过后变灰、停跳、标题显示剩余时间；冷却结束自动恢复可点击态。
  // 每次渲染（render 重建 DOM）调用一次，幂等；页面停留期间每分钟自查一次剩余时间。
  let thoughtBubbleTimer = null;
  function refreshThoughtBubble() {
    const bubble = document.getElementById('catEventBubble');
    if (!bubble || !window.PET_ENGINE) return;
    if (thoughtBubbleTimer) { clearInterval(thoughtBubbleTimer); thoughtBubbleTimer = null; }
    const COOLDOWN_MS = 6 * 60 * 60 * 1000;
    const paint = () => {
      const b = document.getElementById('catEventBubble');
      if (!b || !b.isConnected) return false;   // DOM 已重建/移除：停止自查
      const st = window.PET_ENGINE.getState();
      const lastAt = (st.thought && st.thought.lastAt) || 0;
      const remain = lastAt ? COOLDOWN_MS - (Date.now() - lastAt) : 0;
      if (remain > 0) {
        b.classList.add('on-cooldown');
        const totalMin = Math.ceil(remain / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        b.title = `猫咪脑袋空空，${h > 0 ? h + '小时' : ''}${m}分钟后再来看`;
        return true;
      }
      b.classList.remove('on-cooldown');
      b.title = '看看猫在想什么';
      return false;
    };
    if (paint()) {
      thoughtBubbleTimer = setInterval(() => { if (!paint() && thoughtBubbleTimer) { clearInterval(thoughtBubbleTimer); thoughtBubbleTimer = null; } }, 60000);
    }
  }

  function toastThoughtCooldown(remainMs) {
    const totalMin = Math.max(1, Math.ceil(remainMs / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    toast(h > 0 ? `💭 猫咪脑袋空空，${h}小时${m > 0 ? m + '分' : ''}后再来看看吧~`
                : `💭 猫咪脑袋空空，${m}分钟后再来看看吧~`);
  }

  // ===== Toast =====
  function toast(msg) {
    const existing = document.querySelector('.pet-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'pet-toast cat-toast';
    el.textContent = msg;
    el.style.opacity = '1';
    document.body.appendChild(el);

    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 1200);
    setTimeout(() => { el.remove(); }, 1600);
  }

  // ===== 金币变化通知 =====
  function notifyCoinsChange() {
    if (onCoinsChange) {
      onCoinsChange(window.PET_ENGINE.getState().coins);
    }
  }

  // ===== 猫咪公园标签页 =====
  let parkCanvas = null;
  let parkCtx = null;
  let parkBgCanvas = null; // 预渲染背景离屏canvas
  let parkAnimFrameId = null;
  let parkCatsData = []; // 公园里的猫咪数据（带位置和动画状态）
  let parkSelectedCat = null; // 当前选中的猫咪
  let parkLastTime = 0;
  let parkRefreshTimerId = null; // 刷新次数倒计时定时器
  let parkSceneSig = ''; // 场景猫签名（服务端抽取结果变化才重绘）
  let parkSceneTimerId = null; // 场景猫轮询定时器（他人把猫带回家→立即重新抽取刷新）

  // 格式化刷新恢复倒计时
  function formatRefreshCountdown(ms) {
    if (ms <= 0) return '';
    const mins = Math.ceil(ms / 60000);
    if (mins >= 60) return `${Math.floor(mins / 60)}小时${mins % 60}分`;
    return `${mins}分钟`;
  }

  // 更新公园刷新按钮/次数/倒计时显示
  function updateParkRefreshUI() {
    const info = window.PET_ENGINE.getParkRefreshInfo();
    const btn = document.getElementById('parkRefreshBtnV2');
    const countEl = document.getElementById('parkRefreshCount');
    const infoEl = document.getElementById('parkRefreshInfoText');
    const countdown = formatRefreshCountdown(info.nextRegenMs);

    if (countEl) countEl.textContent = info.count;
    if (btn) {
      if (info.count <= 0) {
        btn.classList.add('refresh-disabled');
      } else {
        btn.classList.remove('refresh-disabled');
      }
      btn.title = `消耗1次刷新次数重新抽一批（每${info.regenHours}小时恢复1次，上限${info.maxCount}次）`;
    }
    if (infoEl) {
      infoEl.innerHTML = info.count >= info.maxCount
        ? `🔄 刷新次数 <b>${info.count}/${info.maxCount}</b> · 已存满`
        : `🔄 刷新次数 <b>${info.count}/${info.maxCount}</b> · ${countdown}后+1（每${info.regenHours}小时恢复，上限${info.maxCount}）`;
    }
    return info;
  }

  // ===== 公园场景猫（服务端权威抽取：2 流浪 + 至多 3 他人猫）=====
  // 拉取服务端场景猫注入引擎。返回场景是否发生变化（签名比对）。
  function fetchParkScene() {
    if (!window.catPark || typeof window.catPark.loadScene !== 'function') {
      return Promise.resolve(false);
    }
    return window.catPark.loadScene().then(function (list) {
      if (!list) return false; // 网络异常：保留现有场景，不清空
      window.PET_ENGINE.setParkSceneCats(list);
      const sig = window.PET_ENGINE.getParkSceneSignature();
      if (sig !== parkSceneSig) {
        parkSceneSig = sig;
        return true;
      }
      return false;
    }).catch(function () { return false; });
  }

  // 场景变更后重绘：清掉选中/气泡（选中的猫可能已被主人带回家）
  function redrawParkScene() {
    if (!document.getElementById('parkSceneCanvas')) return;
    hideCatBubble();
    parkSelectedCat = null;
    generateParkCats();
  }

  // 轮询监听公园内猫咪状态变更（他人把展示中的猫带回家/进入冷却 → 服务端重新抽取）
  function startParkScenePolling() {
    if (parkSceneTimerId) clearInterval(parkSceneTimerId);
    parkSceneTimerId = setInterval(function () {
      if (!document.getElementById('parkSceneCanvas')) {
        clearInterval(parkSceneTimerId);
        parkSceneTimerId = null;
        return;
      }
      fetchParkScene().then(function (changed) {
        if (changed) redrawParkScene();
      });
    }, 10000);
  }

  // 供 bridge 在名录/繁育状态变更后即时刷新场景（比轮询更低延迟）
  function refreshParkScene() {
    return fetchParkScene().then(function (changed) {
      if (changed) redrawParkScene();
      return changed;
    });
  }

  function renderParkTab(container) {
    const state = window.PET_ENGINE.getState();
    const myCatsInPark = window.PET_ENGINE.getMyCatsInPark();

    // 检查玩家是否有猫
    const hasCat = state.cats.length > 0;

    // 停止之前的动画
    if (parkAnimFrameId) {
      cancelAnimationFrame(parkAnimFrameId);
      parkAnimFrameId = null;
    }
    // 停止之前的刷新倒计时定时器
    if (parkRefreshTimerId) {
      clearInterval(parkRefreshTimerId);
      parkRefreshTimerId = null;
    }

    // 抽卡概率横幅：野猫稀有度概率表
    const rarityTable = window.PET_ENGINE.CAT_PARK_CONFIG.strayRarityTable || [];
    const totalWeight = rarityTable.reduce((s, t) => s + t.weight, 0);
    const rarityCfg = window.PET_ENGINE.RARITY_CONFIG || {};
    const oddsHtml = rarityTable.map(t => {
      const cfg = rarityCfg[t.rarity] || {};
      const pct = Math.round((t.weight / totalWeight) * 100);
      return `<span class="gacha-odds-item" style="color:${cfg.color || '#757575'};background:${cfg.bgColor || '#F5F5F5'}">${cfg.name || t.rarity} <b>${pct}%</b></span>`;
    }).join('');

    const parkMinLv = window.PET_ENGINE.CAT_PARK_CONFIG.minLevelInPark || 3;
    container.innerHTML = `
      <div class="park-header-v2">
        <div class="park-header-left">
          <div class="park-title-v2">🌳 猫咪公园</div>
        </div>
        <div class="park-header-right">
          <div class="park-my-cats-badge" id="parkMyCatsBadge">
            🐱 我的猫 ${myCatsInPark.length}/${window.PET_ENGINE.CAT_PARK_CONFIG.maxCatsInPark}
          </div>
          <div class="park-refresh-v2" id="parkRefreshBtnV2">
            🔄 换一批 <span class="park-refresh-count" id="parkRefreshCount">-</span>
          </div>
        </div>
      </div>

      <div class="park-gacha-banner">
        <div class="gacha-banner-row">
          <span class="gacha-banner-title">🎁 野猫抽卡概率</span>
          <span class="park-refresh-info" id="parkRefreshInfoText"></span>
        </div>
        <div class="gacha-odds-row">${oddsHtml}</div>
      </div>

      ${!hasCat ? `
        <div class="park-empty-tip-v2 park-guide-tip">
          <div class="empty-tip-icon-v2">🐱</div>
          <div class="empty-tip-title-v2">校园流浪猫等你领养~</div>
          <div class="empty-tip-desc-v2">点击下方<span class="guide-highlight">脏兮兮的小流浪猫</span>，花50金币洗干净就能领养啦！<br>每只流浪猫品种都是随机的，快来看看你的缘分~</div>
          <div class="guide-arrow">👇</div>
        </div>
      ` : ''}

      ${hasCat ? `
        <div class="park-my-cats-panel" id="parkMyCatsPanel">
          <div class="my-cats-panel-title">🐾 把我的猫放到公园，让它去交朋友搞对象</div>
          <div class="my-cats-panel-sub">好感度养到 Lv.${parkMinLv} 才能放上公园（与繁育门槛同源）</div>
          <div class="my-cats-panel-grid" id="myCatsPanelGrid"></div>
        </div>
      ` : ''}

      <div class="park-scene-container">
        <canvas class="park-scene-canvas" id="parkSceneCanvas"></canvas>
        <!-- 猫咪信息气泡 -->
        <div class="park-cat-bubble" id="parkCatBubble" style="display:none;">
          <div class="bubble-arrow"></div>
          <div class="bubble-content">
            <div class="bubble-cat-name" id="bubbleCatName">猫咪名字</div>
            <div class="bubble-owner" id="bubbleOwner">🥚 蛋蛋用户名</div>
            <div class="bubble-school" id="bubbleSchool">🏫 学校</div>
            <div class="bubble-rarity" id="bubbleRarity">稀有度</div>
            <div class="bubble-actions" id="bubbleActions">
              <button class="bubble-breed-btn" id="bubbleBreedBtn">🐾 申请繁育</button>
            </div>
          </div>
        </div>
      </div>

      <div class="park-hint-v2">
        <div class="park-hint-row">🐾 <b>把你的猫放到公园</b>，和其他蛋蛋用户的猫咪交朋友~</div>
        <div class="park-hint-row">💕 看对眼了可以<span class="hint-highlight">申请繁育</span>，有机会生出稀有品种哦！</div>
        <div class="park-hint-row">🐱 流浪猫可以花50金币洗干净领养回家~</div>
      </div>
    `;

    // 渲染我的猫咪面板（可放到公园）
    const myCatsGrid = document.getElementById('myCatsPanelGrid');
    if (myCatsGrid && state.cats.length > 0) {
      state.cats.forEach((cat, idx) => {
        const catData = window.PET_ENGINE.getCatData(cat.catId);
        const inPark = !!cat.inPark;   // 唯一事实源：猫实例标志（旧影子字段 catsInPark 下标已废除）
        // 权威好感度等级：与「我的猫咪」页 getLevelInfo().level、服务端繁育门槛判定同源
        const intimacyLvl = cat.level || 1;
        // 等级不足 → 不可放置：按钮置灰 + title 解释（点击仍走引擎权威校验弹 toast）
        const lvBlocked = !inPark && intimacyLvl < parkMinLv;

        const item = document.createElement('div');
        item.className = 'my-cat-item' + (inPark ? ' in-park' : '') + (lvBlocked ? ' lv-locked' : '');
        item.innerHTML = `
          <canvas class="my-cat-canvas" width="60" height="60"></canvas>
          <div class="my-cat-name">${catData?.name || '猫咪'}</div>
          <div class="my-cat-intimacy">💕 Lv.${intimacyLvl}</div>
          <button class="my-cat-toggle-btn"${lvBlocked ? ' title="好感度需养到 Lv.' + parkMinLv + '（当前 Lv.' + intimacyLvl + '）：多喂食、玩耍、陪伴培养感情后才能放上公园"' : ''}>
            ${inPark ? '🏠 带回家' : '🌳 放公园'}
          </button>
        `;

        myCatsGrid.appendChild(item);

        // 绘制猫咪小图
        const canvas = item.querySelector('.my-cat-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          window.PET_RENDERER.loadSprites(() => {
            window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 30, 33, 45);
          });
        }

        // 按钮事件
        const btn = item.querySelector('.my-cat-toggle-btn');
        if (btn) {
          btn.onclick = () => {
            const result = inPark
              ? window.PET_ENGINE.takeCatHome(idx)
              : window.PET_ENGINE.putCatInPark(idx);
            toast(result.msg);
            if (result.success) {
              render(); // 重新渲染：公园场景与按钮状态即时同步
              // 上/下架公园是服务端名录的变更点：即时回写，别人无需等 5s 防抖即可见/消失
              if (window.catCabinFlush) window.catCabinFlush();
            }
          };
        }
      });
    }

    // 初始化公园场景（等DOM布局完成后再设置canvas尺寸）
    const canvas = document.getElementById('parkSceneCanvas');
    if (canvas) {
      parkCanvas = canvas;
      parkCtx = canvas.getContext('2d');

      // 等待DOM布局完成后设置尺寸
      requestAnimationFrame(() => {
        const rect = canvas.parentElement.getBoundingClientRect();
        // 使用1倍分辨率（之前2倍太耗性能，移动端卡顿）
        canvas.width = Math.max(rect.width, 300);
        canvas.height = Math.max(rect.height, 250);
        
        // 预渲染背景到离屏canvas，避免每帧重复绘制渐变、云朵、山、树等
        parkBgCanvas = document.createElement('canvas');
        parkBgCanvas.width = canvas.width;
        parkBgCanvas.height = canvas.height;
        const bgCtx = parkBgCanvas.getContext('2d');
        drawParkBackground(bgCtx, canvas.width, canvas.height);

        // 生成随机猫咪（流浪猫抽卡 + 服务端抽取的他人用户猫）
        generateParkCats();
        parkSceneSig = window.PET_ENGINE.getParkSceneSignature();

        // 拉取服务端场景猫（他人猫），签名变化则重绘；并启动轮询监听状态变更
        fetchParkScene().then(function (changed) {
          if (changed && document.getElementById('parkSceneCanvas')) generateParkCats();
        });
        startParkScenePolling();

        // 加载精灵图后开始动画
        window.PET_RENDERER.loadSprites(() => {
          startParkAnimation();
        });
      });

      // 绑定点击事件
      canvas.addEventListener('click', onParkCanvasClick);
    }

    // 刷新按钮：消耗1次刷新次数重新抽一批（流浪猫本地重抽 + 他人猫服务端重抽）
    const refreshBtn = document.getElementById('parkRefreshBtnV2');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        const result = window.PET_ENGINE.refreshPark();
        if (result.success) {
          fetchParkScene().then(function () {
            if (document.getElementById('parkSceneCanvas')) {
              parkSceneSig = window.PET_ENGINE.getParkSceneSignature();
              generateParkCats();
            }
          });
          toast('🔄 来了一批新猫咪~ 说不定有稀有品种哦！');
        } else {
          toast(result.msg);
        }
        updateParkRefreshUI();
      };
    }

    // 初始化刷新次数显示，并启动倒计时定期更新（每30秒；元素被移除时自动停止）
    updateParkRefreshUI();
    parkRefreshTimerId = setInterval(() => {
      if (!document.getElementById('parkRefreshInfoText')) {
        clearInterval(parkRefreshTimerId);
        parkRefreshTimerId = null;
        return;
      }
      updateParkRefreshUI();
    }, 30000);
  }

  // 生成公园里的猫咪（蛋蛋世界用户 + 玩家的猫）
  function generateParkCats() {
    const canvas = parkCanvas;
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;

    // 从引擎获取公园猫咪数据（包含我的猫 + 蛋蛋用户的猫）
    const parkCats = window.PET_ENGINE.getParkCats();

    parkCatsData = [];
    const minDist = 130; // 猫咪之间最小间距（canvas坐标）
    
    parkCats.forEach((cat, idx) => {
      // 尝试找一个不重叠的位置（最多试30次）
      let x = 0, y = 0;
      let placed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        x = 100 + Math.random() * (w - 200);
        y = 120 + Math.random() * (h - 220);
        
        // 检查与已有猫咪的距离
        let tooClose = false;
        for (const existing of parkCatsData) {
          const dx = x - existing.x;
          const dy = y - existing.y;
          if (Math.sqrt(dx * dx + dy * dy) < minDist) {
            tooClose = true;
            break;
          }
        }
        
        if (!tooClose) {
          placed = true;
          break;
        }
      }
      
      // 如果30次都没找到空位，就随机放（避免极端情况卡住）
      if (!placed) {
        x = 100 + Math.random() * (w - 200);
        y = 120 + Math.random() * (h - 220);
      }
      
      parkCatsData.push({
        catId: cat.catId,
        name: cat.name || '',
        uid: cat.uid || '',
        owner: cat.owner,
        school: cat.school || '',
        userId: cat.userId,
        level: cat.level,
        catData: cat.catData,
        rarityLevel: cat.rarityLevel,
        rarityLabel: cat.rarityLabel,
        isMine: cat.isMine || false,
        isStray: cat.isStray || false,
        isDirty: cat.isDirty || false,
        canAdopt: cat.canAdopt !== undefined ? cat.canAdopt : true,
        intimacyLevel: cat.intimacyLevel || 1,
        intimacyValue: cat.intimacyValue || 0,
        catIndex: cat.catIndex,
        x: x,
        y: y,
        // 移动方向和速度（慢一点，避免很快又挤到一起）
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.25,
        speed: 0.15 + Math.random() * 0.25,
        facing: Math.random() > 0.5 ? 1 : -1,
        state: Math.random() > 0.5 ? 'walking' : 'idle',
        stateTimer: Math.random() * 3000,
        animFrame: 0,
        animTimer: 0,
        scale: 0.6 + Math.random() * 0.1
      });
    });
  }

  // 公园动画循环
  function startParkAnimation() {
    parkLastTime = performance.now();
    parkSelectedCat = null;
    hideCatBubble();

    function loop(now) {
      const delta = now - parkLastTime;
      parkLastTime = now;

      updateParkCats(delta);
      drawParkScene();

      parkAnimFrameId = requestAnimationFrame(loop);
    }
    loop(performance.now());
  }

  // 更新公园里的猫咪位置
  function updateParkCats(delta) {
    if (!parkCanvas) return;
    const w = parkCanvas.width;
    const h = parkCanvas.height;

    parkCatsData.forEach(cat => {
      cat.stateTimer -= delta;

      // 状态切换
      if (cat.stateTimer <= 0) {
        if (cat.state === 'walking') {
          cat.state = 'idle';
          cat.stateTimer = 1500 + Math.random() * 2500;
          cat.vx = 0;
          cat.vy = 0;
        } else {
          cat.state = 'walking';
          cat.stateTimer = 2000 + Math.random() * 3000;
          // 随机方向
          const angle = Math.random() * Math.PI * 2;
          cat.vx = Math.cos(angle) * cat.speed;
          cat.vy = Math.sin(angle) * cat.speed * 0.5; // Y方向慢一些
          cat.facing = cat.vx >= 0 ? 1 : -1;
        }
      }

      // 移动
      if (cat.state === 'walking') {
        // 计算避让力：离其他猫太近就推开
        let avoidX = 0, avoidY = 0;
        parkCatsData.forEach(other => {
          if (other === cat) return;
          const dx = cat.x - other.x;
          const dy = cat.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = 100;
          if (dist < minDist && dist > 0) {
            const force = (minDist - dist) / minDist * 0.3;
            avoidX += (dx / dist) * force;
            avoidY += (dy / dist) * force;
          }
        });
        
        cat.x += (cat.vx + avoidX) * delta * 0.05;
        cat.y += (cat.vy + avoidY) * delta * 0.05;
        cat.facing = (cat.vx + avoidX) >= 0 ? 1 : -1;

        // 边界检测，碰到边界就停下转身
        const margin = 60;
        if (cat.x < margin) {
          cat.x = margin;
          cat.vx = Math.abs(cat.vx);
          cat.facing = 1;
        }
        if (cat.x > w - margin) {
          cat.x = w - margin;
          cat.vx = -Math.abs(cat.vx);
          cat.facing = -1;
        }
        if (cat.y < 80) {
          cat.y = 80;
          cat.vy = Math.abs(cat.vy);
        }
        if (cat.y > h - 80) {
          cat.y = h - 80;
          cat.vy = -Math.abs(cat.vy);
        }

        // 动画帧
        cat.animTimer += delta;
        if (cat.animTimer > 200) {
          cat.animTimer = 0;
          cat.animFrame = (cat.animFrame + 1) % 4;
        }
      }
    });
  }

  // 绘制公园背景（预渲染用，只绘制静态元素）
  function drawParkBackground(ctx, w, h) {
    // 背景 - 天空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(1, '#B0E0E6');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.4);

    // 云朵
    drawCloud(ctx, w * 0.15, h * 0.1, 40);
    drawCloud(ctx, w * 0.5, h * 0.08, 50);
    drawCloud(ctx, w * 0.8, h * 0.15, 35);

    // 远处的山
    ctx.fillStyle = '#A5D6A7';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.4);
    ctx.lineTo(w * 0.2, h * 0.28);
    ctx.lineTo(w * 0.35, h * 0.35);
    ctx.lineTo(w * 0.55, h * 0.25);
    ctx.lineTo(w * 0.75, h * 0.32);
    ctx.lineTo(w * 0.9, h * 0.27);
    ctx.lineTo(w, h * 0.35);
    ctx.lineTo(w, h * 0.4);
    ctx.closePath();
    ctx.fill();

    // 草地
    const grassGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
    grassGrad.addColorStop(0, '#81C784');
    grassGrad.addColorStop(0.5, '#66BB6A');
    grassGrad.addColorStop(1, '#4CAF50');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, h * 0.4, w, h * 0.6);

    // 草地上的小花
    for (let i = 0; i < 15; i++) {
      const fx = (i * 73 + 30) % w;
      const fy = h * 0.5 + (i * 47) % (h * 0.45);
      const colors = ['#FF6B6B', '#FFD93D', '#FF8C42', '#F48FB1', '#CE93D8'];
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF59D';
      ctx.beginPath();
      ctx.arc(fx, fy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 树
    drawTree(ctx, w * 0.08, h * 0.5, 60);
    drawTree(ctx, w * 0.92, h * 0.45, 70);
    drawTree(ctx, w * 0.5, h * 0.38, 50);
  }

  // 绘制公园场景
  function drawParkScene() {
    if (!parkCtx || !parkCanvas) return;
    const ctx = parkCtx;
    const w = parkCanvas.width;
    const h = parkCanvas.height;

    // 使用预渲染背景（大幅提升性能，避免每帧重绘渐变/云朵/山/树）
    if (parkBgCanvas) {
      ctx.drawImage(parkBgCanvas, 0, 0);
    } else {
      // 降级：直接绘制背景
      drawParkBackground(ctx, w, h);
    }

    // 按Y坐标排序猫咪（越靠下越近）
    const sortedCats = [...parkCatsData].sort((a, b) => a.y - b.y);

    // 绘制猫咪
    sortedCats.forEach(cat => {
      const catSize = 70 * cat.scale * 2;
      const catY = cat.y;
      
      // 流浪猫：柔和的呼吸发光（吸引注意但不刺眼）
      if (cat.isStray) {
        const breathe = Math.sin(performance.now() / 600) * 0.25 + 0.55; // 0.3~0.8 呼吸
        const gradient = ctx.createRadialGradient(
          cat.x, catY, catSize * 0.15,
          cat.x, catY, catSize * 0.6
        );
        gradient.addColorStop(0, `rgba(255, 193, 7, ${0.2 * breathe})`);
        gradient.addColorStop(0.6, `rgba(255, 152, 0, ${0.1 * breathe})`);
        gradient.addColorStop(1, 'rgba(255, 152, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cat.x, catY, catSize * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // 猫咪阴影
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(cat.x, catY + catSize * 0.4, catSize * 0.35, catSize * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      // 绘制猫咪精灵
      ctx.save();
      if (cat.facing < 0) {
        ctx.translate(cat.x, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cat.x, 0);
      }

      // 使用渲染器绘制猫咪
      if (window.PET_RENDERER && window.PET_RENDERER.isLoaded()) {
        window.PET_RENDERER.drawStaticCat(
          ctx,
          cat.catId,
          cat.x,
          catY,
          catSize
        );
      }

      ctx.restore();

      // 野猫：脏兮兮效果（淡一些，更自然）
      if (cat.isStray) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#6D4C41';
        // 几个小泥点（集中在身体和爪子，不要盖到脸）
        const spots = [
          [-catSize*0.18, catSize*0.05, catSize*0.1],
          [catSize*0.12, catSize*0.08, catSize*0.08],
          [-catSize*0.05, catSize*0.18, catSize*0.07],
          [catSize*0.18, catSize*0.15, catSize*0.06]
        ];
        spots.forEach(([dx, dy, size]) => {
          ctx.beginPath();
          ctx.arc(cat.x + dx, catY + dy, size, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();

        // 流浪猫标签
        ctx.fillStyle = '#795548';
        ctx.strokeStyle = '#5D4037';
        ctx.lineWidth = 2;
        const badgeW = 60;
        const badgeH = 20;
        const badgeX = cat.x - badgeW / 2;
        const badgeY = catY - catSize * 0.55;
        
        ctx.beginPath();
        const r = 10;
        ctx.moveTo(badgeX + r, badgeY);
        ctx.lineTo(badgeX + badgeW - r, badgeY);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + r);
        ctx.lineTo(badgeX + badgeW, badgeY + badgeH - r);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH);
        ctx.lineTo(badgeX + r, badgeY + badgeH);
        ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - r);
        ctx.lineTo(badgeX, badgeY + r);
        ctx.quadraticCurveTo(badgeX, badgeY, badgeX + r, badgeY);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐱 流浪猫', cat.x, badgeY + badgeH / 2);
      }

      // "我的猫"标记
      if (cat.isMine) {
        ctx.fillStyle = '#FF80AB';
        ctx.strokeStyle = '#F06292';
        ctx.lineWidth = 2;
        const badgeW = 50;
        const badgeH = 18;
        const badgeX = cat.x - badgeW / 2;
        const badgeY = catY - catSize * 0.55;
        
        // 圆角矩形背景
        ctx.beginPath();
        const r = 9;
        ctx.moveTo(badgeX + r, badgeY);
        ctx.lineTo(badgeX + badgeW - r, badgeY);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + r);
        ctx.lineTo(badgeX + badgeW, badgeY + badgeH - r);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH);
        ctx.lineTo(badgeX + r, badgeY + badgeH);
        ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - r);
        ctx.lineTo(badgeX, badgeY + r);
        ctx.quadraticCurveTo(badgeX, badgeY, badgeX + r, badgeY);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('我的猫', cat.x, badgeY + badgeH / 2);
      }

      // 选中状态光圈
      if (parkSelectedCat === cat) {
        ctx.strokeStyle = '#FF80AB';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.ellipse(cat.x, catY + catSize * 0.4, catSize * 0.4, catSize * 0.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  // 绘制云朵
  function drawCloud(ctx, x, y, size) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.1, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y + size * 0.2, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // 绘制树
  function drawTree(ctx, x, y, size) {
    // 树干
    ctx.fillStyle = '#8D6E63';
    ctx.fillRect(x - size * 0.1, y, size * 0.2, size * 0.5);

    // 树冠
    ctx.fillStyle = '#388E3C';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.1, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.arc(x - size * 0.25, y + size * 0.05, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(x + size * 0.25, y + size * 0.05, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  // 公园Canvas点击事件
  function onParkCanvasClick(e) {
    const canvas = parkCanvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // 从后往前检测（前面的优先）
    const sortedCats = [...parkCatsData].sort((a, b) => b.y - a.y);
    let clickedCat = null;

    for (const cat of sortedCats) {
      const catSize = 70 * cat.scale * 2;
      const dx = clickX - cat.x;
      const dy = clickY - cat.y;
      // 点击范围（椭圆）
      if (Math.abs(dx) < catSize * 0.4 && Math.abs(dy) < catSize * 0.5) {
        clickedCat = cat;
        break;
      }
    }

    if (clickedCat) {
      parkSelectedCat = clickedCat;
      showCatBubble(clickedCat, e.clientX, e.clientY);
    } else {
      parkSelectedCat = null;
      hideCatBubble();
    }
  }

  // 显示猫咪信息气泡
  function showCatBubble(cat, mouseX, mouseY) {
    const bubble = document.getElementById('parkCatBubble');
    if (!bubble) return;

    const state = window.PET_ENGINE.getState();
    const hasAdultCat = state.cats.length > 0;

    const rarityColor = cat.rarityLevel === 0 ? '#9E9E9E' :
                       cat.rarityLevel === 3 ? '#2196F3' :
                       cat.rarityLevel === 4 ? '#9C27B0' : '#FF9800';

    document.getElementById('bubbleCatName').textContent = cat.isStray ? '流浪猫' : (cat.name || cat.catData?.name || '未知');
    
    const ownerEl = document.getElementById('bubbleOwner');
    if (cat.isMine) {
      ownerEl.innerHTML = '🥚 <b>我的猫咪</b>';
    } else if (cat.isStray) {
      ownerEl.innerHTML = '🐱 <b>无家可归</b>';
    } else {
      ownerEl.innerHTML = '🥚 ' + cat.owner;
    }

    const schoolEl = document.getElementById('bubbleSchool');
    if (schoolEl) {
      if (cat.isMine) {
        schoolEl.textContent = '🏫 蛋蛋世界';
      } else if (cat.isStray) {
        schoolEl.textContent = '🌳 在公园里流浪';
      } else if (cat.school) {
        schoolEl.textContent = '🏫 蛋蛋世界的' + cat.school;
      } else {
        schoolEl.textContent = '🌳 主人寄养在公园';
      }
    }

    const rarityEl = document.getElementById('bubbleRarity');
    if (cat.isStray) {
      rarityEl.textContent = '脏兮兮的，不知道是什么品种';
      rarityEl.style.color = '#795548';
    } else {
      rarityEl.textContent = cat.rarityLabel + ' · 亲密度 Lv.' + (cat.intimacyLevel || 1);
      rarityEl.style.color = rarityColor;
    }

    // 按钮区域
    const actionsEl = document.getElementById('bubbleActions');
    const breedBtn = document.getElementById('bubbleBreedBtn');
    
    if (cat.isMine) {
      // 我的猫：显示带回家按钮
      breedBtn.style.display = 'block';
      breedBtn.disabled = false;
      breedBtn.textContent = '🏠 带回家';
      breedBtn.style.background = 'linear-gradient(180deg, #66BB6A, #43A047)';
      breedBtn.onclick = (e) => {
        e.stopPropagation();
        const result = window.PET_ENGINE.takeCatHome(cat.catIndex);
        toast(result.msg);
        hideCatBubble();
        if (result.success) {
          render();
          if (window.catCabinFlush) window.catCabinFlush();   // 下架即时同步公园名录
        }
      };
    } else if (cat.isStray) {
      // 流浪猫：显示领养按钮
      const slots = window.PET_ENGINE.getAdoptionSlots();
      const price = window.PET_ENGINE.CAT_PARK_CONFIG.strayAdoptPrice;
      
      breedBtn.style.display = 'block';
      breedBtn.style.background = '';
      
      if (!cat.canAdopt) {
        breedBtn.disabled = true;
        breedBtn.textContent = '✓ 已拥有';
      } else if (slots.remaining <= 0) {
        breedBtn.disabled = true;
        breedBtn.textContent = '名额用完了';
      } else {
        breedBtn.disabled = false;
        breedBtn.textContent = `🧼 领养清洗 (${price}金币)`;
        breedBtn.onclick = (e) => {
          e.stopPropagation();
          hideCatBubble();
          showStrayAdoptModal(cat);
        };
      }
    } else {
      // 别人的猫（服务端场景猫）：走服务端权威繁育申请
      breedBtn.style.display = 'block';
      breedBtn.style.background = '';
      if (!cat.parkCatId) {
        breedBtn.disabled = true;
        breedBtn.textContent = '暂不可繁育';
      } else if (!cat.breedable) {
        breedBtn.disabled = true;
        breedBtn.textContent = cat.blockedReason || '暂不可繁育';
      } else if (hasAdultCat) {
        breedBtn.disabled = false;
        breedBtn.textContent = '🐾 申请繁育';
        breedBtn.onclick = (e) => {
          e.stopPropagation();
          hideCatBubble();
          if (window.catPark && typeof window.catPark.sceneBreed === 'function') {
            window.catPark.sceneBreed(cat);
          } else if (window.toast) {
            toast('网络异常，请稍后再试～');
          }
        };
      } else {
        breedBtn.disabled = true;
        breedBtn.textContent = '需要先有猫咪';
      }
    }

    // 定位气泡
    const canvasRect = parkCanvas.getBoundingClientRect();
    bubble.style.display = 'block';

    // 计算位置（在猫咪上方）
    const bubbleRect = bubble.getBoundingClientRect();
    let left = mouseX - bubbleRect.width / 2;
    let top = mouseY - bubbleRect.height - 20;

    // 边界修正
    if (left < 10) left = 10;
    if (left + bubbleRect.width > window.innerWidth - 10) {
      left = window.innerWidth - bubbleRect.width - 10;
    }
    if (top < 10) top = mouseY + 30;

    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';

    // 小箭头位置
    const arrow = bubble.querySelector('.bubble-arrow');
    if (arrow) {
      const arrowLeft = Math.max(20, Math.min(bubbleRect.width - 20, mouseX - left));
      arrow.style.left = arrowLeft + 'px';
      // 如果气泡在下方，箭头朝上
      if (mouseY - bubbleRect.height - 20 < 10) {
        arrow.style.top = '-8px';
        arrow.style.transform = 'rotate(180deg)';
      } else {
        arrow.style.bottom = '-8px';
        arrow.style.top = 'auto';
        arrow.style.transform = 'rotate(0deg)';
      }
    }
  }

  function hideCatBubble() {
    const bubble = document.getElementById('parkCatBubble');
    if (bubble) bubble.style.display = 'none';
  }

  // 停止公园动画（切换标签页时调用）
  function stopParkAnimation() {
    if (parkAnimFrameId) {
      cancelAnimationFrame(parkAnimFrameId);
      parkAnimFrameId = null;
    }
    parkSelectedCat = null;
  }

  // 繁育确认弹窗
  function showBreedingConfirm(parkCat) {
    const state = window.PET_ENGINE.getState();
    const allCats = state.cats;
    
    // 创建选择猫咪的弹窗
    let selectModal = document.getElementById('breedingSelectModal');
    if (!selectModal) {
      selectModal = document.createElement('div');
      selectModal.id = 'breedingSelectModal';
      selectModal.className = 'breeding-select-modal';
      selectModal.innerHTML = `
        <div class="breeding-select-content" onclick="event.stopPropagation()">
          <button class="breeding-select-close" id="breedingSelectClose">✕</button>
          <div class="breeding-select-title">🐾 选择你的猫咪</div>
          <div class="breeding-select-subtitle">选择一只猫咪和对方繁育~ 亲密度越高，稀有品种概率越大！</div>
          <div class="breeding-select-grid" id="breedingSelectGrid"></div>
          <div class="breeding-partner-info">
            <div class="partner-label">对方猫咪:</div>
            <div class="partner-cat" id="breedingPartnerCat"></div>
          </div>
          <div class="breeding-cost-info">
            <span class="intimacy-bonus-text" id="intimacyBonusText"></span>
          </div>
          <button class="breeding-confirm-btn" id="breedingConfirmBtn" disabled>
            💕 确认繁育
          </button>
        </div>
      `;
      document.body.appendChild(selectModal);

      // 关闭
      selectModal.addEventListener('click', (e) => {
        if (e.target === selectModal) closeBreedingSelect();
      });
      document.getElementById('breedingSelectClose').addEventListener('click', closeBreedingSelect);
    }

    // 更新对方猫咪信息
    const partnerEl = document.getElementById('breedingPartnerCat');
    if (partnerEl) {
      partnerEl.innerHTML = `
        <span class="partner-cat-name">${parkCat.catData?.name || '未知'}</span>
        <span class="partner-cat-owner">(${parkCat.owner})</span>
        <span class="partner-cat-rarity" style="color: ${
          parkCat.rarityLevel === 0 ? '#9E9E9E' :
          parkCat.rarityLevel === 3 ? '#2196F3' :
          parkCat.rarityLevel === 4 ? '#9C27B0' : '#FF9800'
        }">${parkCat.rarityLabel}</span>
        <span class="partner-cat-intimacy">💕 Lv.${parkCat.intimacyLevel || 1}</span>
      `;
    }

    // 渲染可选猫咪列表
    const grid = document.getElementById('breedingSelectGrid');
    if (grid) {
      grid.innerHTML = '';
      let selectedCatIndex = -1;

      allCats.forEach((cat, idx) => {
        const catData = window.PET_ENGINE.getCatData(cat.catId);
        const catIndex = state.cats.indexOf(cat);
        const intimacyVal = cat.intimacy || 0;
        // 权威好感度等级：与「我的猫咪」页 getLevelInfo().level、服务端繁育门槛判定同源
        const intimacyLvl = cat.level || 1;
        
        const item = document.createElement('div');
        item.className = 'breeding-cat-option';
        item.innerHTML = `
          <canvas class="breeding-cat-canvas" width="100" height="100"></canvas>
          <div class="breeding-cat-name">${cat.name}</div>
          <div class="breeding-cat-breed">${catData?.name || ''}</div>
          <div class="breeding-cat-intimacy">💕 Lv.${intimacyLvl}</div>
        `;

        item.onclick = () => {
          document.querySelectorAll('.breeding-cat-option').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedCatIndex = catIndex;
          document.getElementById('breedingConfirmBtn').disabled = false;
          
          // 计算亲密度加成并显示
          const myIntimacy = intimacyVal;
          const partnerIntimacy = parkCat.intimacyValue || 60;
          const avgIntimacy = (myIntimacy + partnerIntimacy) / 2;
          const bonus = Math.round(avgIntimacy / 100 * 50);
          const bonusEl = document.getElementById('intimacyBonusText');
          if (bonusEl) {
            bonusEl.textContent = ` · 稀有率 +${bonus}%`;
            bonusEl.style.color = '#E91E63';
          }
        };

        grid.appendChild(item);

        // 绘制猫咪
        const canvas = item.querySelector('.breeding-cat-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          canvas.width = 100;
          canvas.height = 100;
          window.PET_RENDERER.loadSprites(() => {
            window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 50, 55, 70);
          });
        }
      });

      // 确认按钮
      const confirmBtn = document.getElementById('breedingConfirmBtn');
      if (confirmBtn) {
        confirmBtn.onclick = () => {
          if (selectedCatIndex < 0) return;
          closeBreedingSelect();
          doBreedingAction(selectedCatIndex, parkCat);
        };
      }
    }

    selectModal.style.display = 'flex';
  }

  function closeBreedingSelect() {
    const modal = document.getElementById('breedingSelectModal');
    if (modal) modal.style.display = 'none';
  }

  // 执行繁育
  function doBreedingAction(catIndex, parkCat) {
    const result = window.PET_ENGINE.requestBreeding(catIndex, parkCat);
    if (!result.success) {
      toast(result.msg);
      return;
    }

    toast(result.msg);

    // 模拟等待对方回应
    setTimeout(() => {
      const accepted = Math.random() < window.PET_ENGINE.CAT_PARK_CONFIG.acceptProbability;
      const breedingResult = window.PET_ENGINE.completeBreedingRequest(
        catIndex, 
        parkCat.catId, 
        accepted,
        { 
          partnerIntimacy: parkCat.intimacyValue,
          partnerName: parkCat.name,
          partnerUid: parkCat.uid,
          partnerOwnerName: parkCat.owner || '公园玩家'
        }
      );
      
      if (breedingResult.success) {
        showBreedingResult(breedingResult);
        updateCoinDisplay();
        notifyCoinsChange();
        render();
      } else {
        toast(breedingResult.msg);
      }
    }, window.PET_ENGINE.CAT_PARK_CONFIG.responseTime * 1000);
  }

  // 繁育结果弹窗
  function showBreedingResult(result) {
    let resultModal = document.getElementById('breedingResultModal');
    if (!resultModal) {
      resultModal = document.createElement('div');
      resultModal.id = 'breedingResultModal';
      resultModal.className = 'breeding-result-modal';
      resultModal.innerHTML = `
        <div class="breeding-result-content" onclick="event.stopPropagation()">
          <div class="breeding-result-title" id="breedingResultTitle">🎉 繁育成功！</div>
          <div class="breeding-parents-row" id="breedingParentsRow"></div>
          <div class="breeding-kittens-show" id="breedingKittensShow"></div>
          <div class="breeding-result-desc" id="breedingResultDesc"></div>
          <button class="breeding-result-btn" id="breedingResultCloseBtn">太棒了！</button>
        </div>
      `;
      document.body.appendChild(resultModal);

      resultModal.addEventListener('click', (e) => {
        if (e.target === resultModal) closeBreedingResult();
      });
      document.getElementById('breedingResultCloseBtn').addEventListener('click', closeBreedingResult);
    }

    // 渲染父母猫
    const parentsRow = document.getElementById('breedingParentsRow');
    if (parentsRow && result.parent1 && result.parent2) {
      const p1Data = window.PET_ENGINE.getCatData(result.parent1.catId);
      const p2Data = window.PET_ENGINE.getCatData(result.parent2.catId);
      
      parentsRow.innerHTML = `
        <div class="parent-cat parent-1">
          <canvas class="parent-canvas" width="90" height="90"></canvas>
          <div class="parent-name">${result.parent1.name}</div>
          <div class="parent-breed">${p1Data?.name || ''}</div>
        </div>
        <div class="breeding-heart">💕</div>
        <div class="parent-cat parent-2">
          <canvas class="parent-canvas" width="90" height="90"></canvas>
          <div class="parent-name">${result.parent2.name}</div>
          <div class="parent-breed">${p2Data?.name || ''}</div>
        </div>
      `;
      
      // 绘制父母猫
      window.PET_RENDERER.loadSprites(() => {
        const canvases = parentsRow.querySelectorAll('.parent-canvas');
        if (canvases[0]) {
          const ctx1 = canvases[0].getContext('2d');
          window.PET_RENDERER.drawStaticCat(ctx1, result.parent1.catId, 45, 50, 65);
        }
        if (canvases[1]) {
          const ctx2 = canvases[1].getContext('2d');
          window.PET_RENDERER.drawStaticCat(ctx2, result.parent2.catId, 45, 50, 65);
        }
      });
    }

    // 渲染小猫
    const kittensShow = document.getElementById('breedingKittensShow');
    if (kittensShow && result.kittens) {
      kittensShow.innerHTML = '';
      
      result.kittens.forEach((kitten, idx) => {
        const kittenData = window.PET_ENGINE.getCatData(kitten.catId);
        const isMine = idx === 0;
        
        const kittenEl = document.createElement('div');
        kittenEl.className = 'kitten-card' + (isMine ? ' mine' : ' partner');
        kittenEl.innerHTML = `
          <div class="kitten-label">${isMine ? '你的小猫' : '对方的小猫'}</div>
          <canvas class="kitten-canvas" width="120" height="120"></canvas>
          <div class="kitten-name">${kittenData?.name || '未知'}</div>
          <div class="kitten-rarity ${kitten.rarity || 'common'}">${
            kitten.rarity === 'common' ? '普通' :
            kitten.rarity === 'rare3' ? '稀有' :
            kitten.rarity === 'rare4' ? '珍稀' : '传说'
          }</div>
        `;
        kittensShow.appendChild(kittenEl);

        // 绘制小猫
        const canvas = kittenEl.querySelector('.kitten-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          canvas.width = 120;
          canvas.height = 120;
          window.PET_RENDERER.loadSprites(() => {
            window.PET_RENDERER.drawStaticCat(ctx, kitten.catId, 60, 65, 80);
          });
        }
      });
    }

    // 描述
    const descEl = document.getElementById('breedingResultDesc');
    if (descEl) {
      descEl.textContent = '亲密度越高，繁育出稀有品种的概率越大哦~';
    }

    resultModal.style.display = 'flex';
  }

  function closeBreedingResult() {
    const modal = document.getElementById('breedingResultModal');
    if (modal) modal.style.display = 'none';
  }

  // ===== 盲盒领养（校园流浪猫） =====
  // ===== 野猫领养弹窗 =====
  function showStrayAdoptModal(strayCat) {
    let modal = document.getElementById('strayAdoptModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'strayAdoptModal';
      modal.className = 'stray-adopt-modal';
      modal.innerHTML = `
        <div class="stray-adopt-content" onclick="event.stopPropagation()">
          <button class="stray-adopt-close" id="strayAdoptClose">✕</button>
          <div class="stray-adopt-title">🐱 领养流浪猫</div>
          <div class="stray-adopt-desc">
            在公园角落发现了一只脏兮兮的小流浪猫~<br>
            花50金币给它洗干净，带回家吧！
          </div>
          <div class="stray-adopt-box" id="strayAdoptBox">
            <div class="mystery-box">
              <div class="mystery-box-lid"></div>
              <div class="mystery-box-body">
                <div class="mystery-box-tape-h"></div>
                <div class="mystery-box-tape-v"></div>
                <div class="mystery-box-question">?</div>
                <div class="mystery-dirt-spot dirt-1"></div>
                <div class="mystery-dirt-spot dirt-2"></div>
                <div class="mystery-dirt-spot dirt-3"></div>
                <div class="mystery-dirt-spot dirt-4"></div>
                <div class="mystery-dirt-spot dirt-5"></div>
              </div>
              <div class="mystery-box-shadow"></div>
            </div>
            <div class="stray-adopt-dirt">脏兮兮的纸箱...里面是什么猫？</div>
          </div>
          <div class="stray-adopt-result" id="strayAdoptResult" style="display:none;">
            <canvas class="stray-adopt-result-canvas" id="strayAdoptResultCanvas" width="120" height="120"></canvas>
            <div class="stray-adopt-result-name" id="strayAdoptResultName"></div>
            <div class="stray-adopt-result-rarity" id="strayAdoptResultRarity"></div>
          </div>
          <div class="stray-adopt-slot-info" id="strayAdoptSlotInfo"></div>
          <button class="stray-adopt-btn" id="strayAdoptBtn">
            🧼 洗干净领养 (50金币)
          </button>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeStrayAdoptModal();
      });
      document.getElementById('strayAdoptClose').addEventListener('click', closeStrayAdoptModal);
    }

    // 重置状态
    document.getElementById('strayAdoptBox').style.display = 'block';
    document.getElementById('strayAdoptResult').style.display = 'none';
    document.getElementById('strayAdoptBtn').textContent = '🧼 洗干净领养 (50金币)';
    document.getElementById('strayAdoptBtn').disabled = false;

    // 显示名额信息
    const slots = window.PET_ENGINE.getAdoptionSlots();
    const slotInfo = document.getElementById('strayAdoptSlotInfo');
    if (slotInfo) {
      slotInfo.innerHTML = `📋 领养名额: ${slots.used}/${slots.total}`;
    }

    // 绑定领养按钮（传入具体的野猫ID）
    const btn = document.getElementById('strayAdoptBtn');
    btn.onclick = () => doStrayAdopt(strayCat.catId);

    modal.style.display = 'flex';
  }

  function closeStrayAdoptModal() {
    const modal = document.getElementById('strayAdoptModal');
    if (modal) modal.style.display = 'none';
  }

  function doStrayAdopt(catId) {
    const result = window.PET_ENGINE.adoptStrayCat(catId);
    if (!result.success) {
      toast(result.msg);
      return;
    }

    const btn = document.getElementById('strayAdoptBtn');
    btn.disabled = true;
    btn.textContent = '清洗中... 🧼';

    // 动画效果
    setTimeout(() => {
      document.getElementById('strayAdoptBox').style.display = 'none';
      document.getElementById('strayAdoptResult').style.display = 'block';
      
      const catData = window.PET_ENGINE.getCatData(result.breedId);
      document.getElementById('strayAdoptResultName').textContent = catData?.name || '未知';
      document.getElementById('strayAdoptResultRarity').textContent = '普通品种';
      
      // 绘制猫咪
      const canvas = document.getElementById('strayAdoptResultCanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        canvas.width = 120;
        canvas.height = 120;
        window.PET_RENDERER.loadSprites(() => {
          window.PET_RENDERER.drawStaticCat(ctx, result.breedId, 60, 65, 80);
        });
      }

      btn.textContent = '🎉 收入猫窝';
      btn.disabled = false;
      btn.onclick = () => {
        closeStrayAdoptModal();
        switchTab('cat');
        updateCoinDisplay();
        notifyCoinsChange();
        // 重新生成公园猫咪（这只被领养走了）
        generateParkCats();
      };

      toast(result.msg);
    }, 1500);
  }

  function showBlindAdoptModal() {
    let modal = document.getElementById('blindAdoptModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'blindAdoptModal';
      modal.className = 'blind-adopt-modal';
      modal.innerHTML = `
        <div class="blind-adopt-content" onclick="event.stopPropagation()">
          <button class="blind-adopt-close" id="blindAdoptClose">✕</button>
          <div class="blind-adopt-title">🐱 校园流浪猫</div>
          <div class="blind-adopt-desc">
            在校园角落发现了一只脏兮兮的小流浪猫~<br>
            花50金币给它洗干净，看看是什么品种吧！
          </div>
          <div class="blind-adopt-box" id="blindAdoptBox">
            <div class="blind-adopt-cat-icon">🐱</div>
            <div class="blind-adopt-dirt">脏脏的...</div>
          </div>
          <div class="blind-adopt-result" id="blindAdoptResult" style="display:none;">
            <canvas class="blind-adopt-result-canvas" id="blindAdoptResultCanvas" width="120" height="120"></canvas>
            <div class="blind-adopt-result-name" id="blindAdoptResultName"></div>
            <div class="blind-adopt-result-rarity" id="blindAdoptResultRarity"></div>
          </div>
          <button class="blind-adopt-btn" id="blindAdoptBtn">
            🧼 洗干净 (50金币)
          </button>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBlindAdoptModal();
      });
      document.getElementById('blindAdoptClose').addEventListener('click', closeBlindAdoptModal);
      document.getElementById('blindAdoptBtn').addEventListener('click', doBlindAdopt);
    }

    // 重置状态
    document.getElementById('blindAdoptBox').style.display = 'block';
    document.getElementById('blindAdoptResult').style.display = 'none';
    document.getElementById('blindAdoptBtn').textContent = '🧼 洗干净 (50金币)';
    document.getElementById('blindAdoptBtn').disabled = false;

    modal.style.display = 'flex';
  }

  function closeBlindAdoptModal() {
    const modal = document.getElementById('blindAdoptModal');
    if (modal) modal.style.display = 'none';
  }

  function doBlindAdopt() {
    const result = window.PET_ENGINE.blindAdopt();
    if (!result.success) {
      toast(result.msg);
      return;
    }

    const btn = document.getElementById('blindAdoptBtn');
    btn.disabled = true;
    btn.textContent = '清洗中... 🧼';

    // 动画效果
    setTimeout(() => {
      document.getElementById('blindAdoptBox').style.display = 'none';
      document.getElementById('blindAdoptResult').style.display = 'block';
      
      const catData = window.PET_ENGINE.getCatData(result.breedId);
      document.getElementById('blindAdoptResultName').textContent = catData?.name || '未知';
      document.getElementById('blindAdoptResultRarity').textContent = '普通品种';
      
      // 绘制猫咪
      const canvas = document.getElementById('blindAdoptResultCanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        canvas.width = 120;
        canvas.height = 120;
        window.PET_RENDERER.loadSprites(() => {
          window.PET_RENDERER.drawStaticCat(ctx, result.breedId, 60, 65, 80);
        });
      }

      btn.textContent = '🎉 收入猫窝';
      btn.disabled = false;
      btn.onclick = () => {
        closeBlindAdoptModal();
        switchTab('cat');
        updateCoinDisplay();
        notifyCoinsChange();
      };

      toast(result.msg);
    }, 1500);
  }

  // ===== 栏位状态 =====
  function updatePenStatus() {
    const penLimit = window.PET_ENGINE.getPenLimit();
    const countEl = document.getElementById('penStatusCount');

    if (countEl) {
      countEl.textContent = `${penLimit.used}/${penLimit.total}`;
    }
  }

  // ===== 新手任务提示 =====
  function updateNewbieTaskTip() {
    const tipEl = document.getElementById('newbieTaskTip');
    const nameEl = document.getElementById('newbieTaskName');
    const progressEl = document.getElementById('newbieTaskProgress');
    const statusEl = document.getElementById('newbieTaskStatus');

    if (!tipEl) return;

    try {
      const tasks = window.PET_ENGINE.getNewbieTasks();
      // 找第一个未完成的任务
      const incompleteTask = tasks.find(t => !t.completed);

      if (incompleteTask) {
        tipEl.style.display = 'flex';
        if (nameEl) nameEl.textContent = incompleteTask.name;
        if (progressEl) {
          const cur = incompleteTask.progress || 0;
          const total = incompleteTask.target || 1;
          progressEl.textContent = `(${cur}/${total})`;
        }
        if (statusEl) statusEl.textContent = '';
      } else {
        // 全部完成
        const firstTask = tasks[0];
        if (firstTask && firstTask.completed) {
          tipEl.style.display = 'flex';
          if (nameEl) nameEl.textContent = '新手任务';
          if (progressEl) progressEl.textContent = '';
          if (statusEl) statusEl.textContent = '✓ 已完成';
        } else {
          tipEl.style.display = 'none';
        }
      }
    } catch (e) {
      tipEl.style.display = 'none';
    }
  }

  // ===== 每日任务面板 =====
  function renderDailyTasks() {
    const listEl = document.getElementById('dailyTasksList');
    if (!listEl) return;

    try {
      const tasks = window.PET_ENGINE.getDailyTasks();
      listEl.innerHTML = '';

      tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'daily-task-item' + (task.completed ? ' completed' : '') + (task.claimed ? ' claimed' : '');
        
        const progress = Math.min(100, (task.progress / task.target) * 100);

        // 任务图标映射
        const taskIconMap = {
          'daily_invite': '👥',
          'daily_gossip': '💬',
          'daily_post_task': '📝',
          'daily_claim_task': '🤝'
        };
        const taskIcon = task.icon || taskIconMap[task.id] || '📋';

        item.innerHTML = `
          <div class="daily-task-icon">${taskIcon}</div>
          <div class="daily-task-info">
            <div class="daily-task-name">${task.name}</div>
            <div class="daily-task-desc">${task.desc || ''}</div>
            <div class="daily-task-progress-bar">
              <div class="daily-task-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="daily-task-progress-text">${task.progress || 0}/${task.target || 1}</div>
          </div>
          <div class="daily-task-reward-col">
            <div class="daily-task-reward">
              <span class="daily-task-reward-icon">${task.rewardIcon || '🎁'}</span>
              <span class="daily-task-reward-text">${task.rewardText || '奖励'}</span>
            </div>
            ${task.canClaim 
              ? `<button class="daily-task-claim-btn" data-taskid="${task.id}">领取</button>`
              : task.claimed 
                ? '<span class="daily-task-claimed-tag">已领取</span>'
                : '<span class="daily-task-go-btn">去完成</span>'
            }
          </div>
        `;

        listEl.appendChild(item);
      });

      // 绑定领取按钮
      listEl.querySelectorAll('.daily-task-claim-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskid;
          const result = window.PET_ENGINE.claimDailyTaskReward(taskId);
          if (result.success) {
            toast(result.msg || '领取成功！');
            updateCoinDisplay();
            notifyCoinsChange();
            renderDailyTasks();
          } else {
            toast(result.msg || '领取失败');
          }
        };
      });
    } catch (e) {
      listEl.innerHTML = '<div class="daily-tasks-empty">每日任务加载失败</div>';
    }
  }

  // ===== 家园操作菜单 =====
  function showHomeActionMenu() {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[state.currentCatIndex];
    if (!cat) return;

    const catData = window.PET_ENGINE.getCatData(cat.catId);

    let menuModal = document.getElementById('homeActionMenuModal');
    if (!menuModal) {
      menuModal = document.createElement('div');
      menuModal.id = 'homeActionMenuModal';
      menuModal.className = 'home-action-menu-modal';
      menuModal.innerHTML = `
        <div class="home-action-menu-mask" onclick="window.PET_UI.hideHomeActionMenu()"></div>
        <div class="home-action-menu-content" onclick="event.stopPropagation()">
          <div class="home-action-menu-title">🏠 家园操作</div>
          <div class="home-action-menu-cat-info" id="homeActionCatInfo"></div>
          <div class="home-action-menu-list">
            <div class="home-action-menu-item" id="homeActionList">
              <span class="action-item-icon">📦</span>
              <span class="action-item-text">上架到家园</span>
              <span class="action-item-arrow">›</span>
            </div>
            <div class="home-action-menu-item" id="homeActionDonate">
              <span class="action-item-icon">🎁</span>
              <span class="action-item-text">送给家园</span>
              <span class="action-item-arrow">›</span>
            </div>
          </div>
          <button class="home-action-menu-cancel" onclick="window.PET_UI.hideHomeActionMenu()">取消</button>
        </div>
      `;
      document.body.appendChild(menuModal);
    }

    // 更新猫咪信息
    const catInfoEl = document.getElementById('homeActionCatInfo');
    if (catInfoEl) {
      catInfoEl.innerHTML = `
        <span class="action-cat-name">${cat.name}</span>
        <span class="action-cat-breed">${catData?.name || ''}</span>
      `;
    }

    // 绑定上架按钮
    const listBtn = document.getElementById('homeActionList');
    if (listBtn) {
      listBtn.onclick = () => {
        hideHomeActionMenu();
        showListCatModal(state.currentCatIndex);
      };
    }

    // 绑定捐赠按钮
    const donateBtn = document.getElementById('homeActionDonate');
    if (donateBtn) {
      donateBtn.onclick = () => {
        hideHomeActionMenu();
        petConfirm({
          title: `把${cat.name}送给猫咪家园？`,
          desc: '送出后将获得 20 金币奖励\n猫咪将从你的猫舍中消失',
          okText: '送出', danger: true
        }, () => {
          const result = window.PET_ENGINE.donateCatToHome(state.currentCatIndex);
          if (result.success) {
            toast(result.msg || '捐赠成功！获得20金币~');
            updateCoinDisplay();
            notifyCoinsChange();
            render();
            startAnimation();
          } else {
            toast(result.msg || '捐赠失败');
          }
        });
      };
    }

    menuModal.style.display = 'flex';
    setTimeout(() => menuModal.classList.add('show'), 10);
  }

  function hideHomeActionMenu() {
    const modal = document.getElementById('homeActionMenuModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => { if (modal.parentNode) modal.style.display = 'none'; }, 300);
    }
  }

  // ===== 上架猫咪弹窗 =====
  function showListCatModal(catIndex) {
    const state = window.PET_ENGINE.getState();
    const cat = state.cats[catIndex];
    if (!cat) return;

    const catData = window.PET_ENGINE.getCatData(cat.catId);
    const HOME_CONFIG = window.PET_DATA.HOME_CONFIG;

    let modal = document.getElementById('listCatModal');
    // 每次都重建弹窗（确保样式最新，避免旧版本残留）
    if (modal) {
      modal.remove();
      modal = null;
    }
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'listCatModal';
      modal.className = 'list-cat-modal';
      modal.innerHTML = `
        <div class="list-cat-mask" onclick="window.PET_UI.hideListCatModal()"></div>
        <div class="list-cat-content" onclick="event.stopPropagation()">
          <div class="list-cat-header">
            <div class="list-cat-title-icon">📦</div>
            <div class="list-cat-title">上架到家园</div>
            <button class="list-cat-close-btn" onclick="window.PET_UI.hideListCatModal()">✕</button>
          </div>
          <div class="list-cat-body">
            <!-- 猫咪展示卡片 -->
            <div class="list-cat-card">
              <div class="list-cat-card-bg"></div>
              <div class="list-cat-rarity-badge" id="listCatRarityBadge">普通</div>
              <div class="list-cat-avatar-wrap">
                <canvas class="list-cat-canvas" width="140" height="140"></canvas>
              </div>
              <div class="list-cat-name" id="listCatName">猫咪名字</div>
              <div class="list-cat-tags">
                <span class="list-cat-tag gender-tag" id="listCatGender">弟弟</span>
                <span class="list-cat-tag level-tag">Lv.<span id="listCatLevel">1</span></span>
              </div>
            </div>
            <!-- 属性展示 -->
            <div class="list-cat-stats">
              <div class="list-stat-item">
                <div class="list-stat-icon">😊</div>
                <div class="list-stat-info">
                  <div class="list-stat-label">心情</div>
                  <div class="list-stat-bar">
                    <div class="list-stat-fill mood-fill" id="listCatMoodBar"></div>
                  </div>
                </div>
                <div class="list-stat-value" id="listCatMoodValue">80</div>
              </div>
              <div class="list-stat-item">
                <div class="list-stat-icon">⚡</div>
                <div class="list-stat-info">
                  <div class="list-stat-label">活力</div>
                  <div class="list-stat-bar">
                    <div class="list-stat-fill energy-fill" id="listCatEnergyBar"></div>
                  </div>
                </div>
                <div class="list-stat-value" id="listCatEnergyValue">90</div>
              </div>
            </div>
            <!-- 价格设置 -->
            <div class="list-price-section">
              <div class="list-price-header">
                <span class="list-price-label">💰 设置售价</span>
                <span class="list-price-unit">金币</span>
              </div>
              <div class="list-price-input-row">
                <button class="list-price-btn minus" id="listPriceMinus">-</button>
                <div class="list-price-input-wrap">
                  <span class="list-price-coin">💰</span>
                  <input type="number" class="list-price-input" id="listPriceInput" value="100" min="10" step="10">
                </div>
                <button class="list-price-btn plus" id="listPricePlus">+</button>
              </div>
              <div class="list-price-quick">
                <button class="list-quick-btn" data-price="50">50</button>
                <button class="list-quick-btn" data-price="100">100</button>
                <button class="list-quick-btn" data-price="200">200</button>
                <button class="list-quick-btn" data-price="500">500</button>
              </div>
              <div class="list-price-tip">
                <span>💡</span>
                <span>上架后其他玩家可在家园市场购买你的猫咪</span>
              </div>
            </div>
          </div>
          <div class="list-cat-footer">
            <button class="list-cat-cancel-btn" onclick="window.PET_UI.hideListCatModal()">取消</button>
            <button class="list-cat-confirm-btn" id="listCatConfirmBtn">
              <span>确认上架</span>
              <span class="list-btn-icon">📤</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    // 触发重绘后添加show类实现淡入
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // 更新信息
    document.getElementById('listCatName').textContent = cat.name;
    const rarityEl = document.getElementById('listCatRarityBadge');
    const rarity = cat.rarity || (catData?.rarity || 'common');
    const rarityLevel = cat.rarityLevel || (catData?.rarityLevel || 0);
    const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;
    // 稀有度key：common / rare3 / rare4 / rare5
    let rarityKey = rarity;
    if (rarity === 'rare' && rarityLevel) {
      rarityKey = 'rare' + rarityLevel;
    }
    const rarityInfo = RARITY_CONFIG?.[rarityKey] || RARITY_CONFIG?.common || { name: '普通', color: '#9E9E9E' };
    rarityEl.textContent = rarityInfo.name;
    rarityEl.style.background = rarityInfo.color;
    
    const genderEl = document.getElementById('listCatGender');
    if (genderEl) {
      const genderLabel = window.PET_ENGINE.getGenderLabel(cat.gender);
      genderEl.textContent = genderLabel;
      genderEl.className = 'list-cat-tag gender-tag gender-' + (cat.gender === 'female' ? 'female' : 'male');
    }

    // 等级
    const levelEl = document.getElementById('listCatLevel');
    if (levelEl) {
      levelEl.textContent = cat.level || 1;
    }

    // 心情和活力
    const mood = cat.mood != null ? cat.mood : 80;
    const energy = cat.energy != null ? cat.energy : 90;
    const moodBar = document.getElementById('listCatMoodBar');
    const energyBar = document.getElementById('listCatEnergyBar');
    const moodValue = document.getElementById('listCatMoodValue');
    const energyValue = document.getElementById('listCatEnergyValue');
    if (moodBar) moodBar.style.width = mood + '%';
    if (energyBar) energyBar.style.width = energy + '%';
    if (moodValue) moodValue.textContent = Math.round(mood);
    if (energyValue) energyValue.textContent = Math.round(energy);

    // 画猫
    const canvas = modal.querySelector('.list-cat-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      window.PET_RENDERER.loadSprites(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.PET_RENDERER.drawCat(ctx, cat.catId, 70, 80, 110, {
          frame: 'idle',
          flip: false
        });
      });
    }

    // 价格加减按钮
    const priceInput = document.getElementById('listPriceInput');
    const minusBtn = document.getElementById('listPriceMinus');
    const plusBtn = document.getElementById('listPricePlus');
    
    if (minusBtn) {
      minusBtn.onclick = () => {
        let val = parseInt(priceInput.value) || 100;
        val = Math.max(10, val - 10);
        priceInput.value = val;
      };
    }
    if (plusBtn) {
      plusBtn.onclick = () => {
        let val = parseInt(priceInput.value) || 100;
        val = Math.min(99999, val + 10);
        priceInput.value = val;
      };
    }

    // 快捷价格按钮
    const quickBtns = modal.querySelectorAll('.list-quick-btn');
    quickBtns.forEach(btn => {
      btn.onclick = () => {
        priceInput.value = btn.dataset.price;
        quickBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    // 确认上架
    const confirmBtn = document.getElementById('listCatConfirmBtn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const price = parseInt(priceInput?.value) || 100;
        
        if (price < 10) {
          toast('价格不能低于10金币');
          return;
        }

        const result = window.PET_ENGINE.listCatOnHome(catIndex, price);
        if (result.success) {
          toast(result.msg || '上架成功！');
          hideListCatModal();
          render();
          startAnimation();
        } else {
          toast(result.msg || '上架失败');
        }
      };
    }

    modal.style.display = 'flex';
  }

  function hideListCatModal() {
    const modal = document.getElementById('listCatModal');
    if (modal) modal.style.display = 'none';
  }

  // ===== 自繁育界面 =====
  let selfBreedSelected = { female: -1, male: -1 };

  function showSelfBreedingModal() {
    const state = window.PET_ENGINE.getState();

    // 检查是否有足够的成年猫
    const adultCats = state.cats.filter(c => c.isAdult !== false);
    const femaleCats = adultCats.filter(c => c.gender === 'female');
    const maleCats = adultCats.filter(c => c.gender === 'male');

    if (femaleCats.length === 0 || maleCats.length === 0) {
      toast('需要至少一只成年母猫和一只成年公猫才能自繁育~');
      return;
    }

    selfBreedSelected = { female: -1, male: -1 };

    let modal = document.getElementById('selfBreedingModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'selfBreedingModal';
      modal.className = 'self-breeding-modal';
      modal.innerHTML = `
        <div class="self-breeding-mask" onclick="window.PET_UI.hideSelfBreedingModal()"></div>
        <div class="self-breeding-content" onclick="event.stopPropagation()">
          <div class="self-breeding-header">
            <div class="self-breeding-title">🐾 自繁育</div>
            <button class="self-breeding-close" onclick="window.PET_UI.hideSelfBreedingModal()">✕</button>
          </div>
          <div class="self-breeding-body">
            <!-- 母猫选择 -->
            <div class="breed-select-col">
              <div class="breed-select-label">👩 选择母猫</div>
              <div class="breed-select-grid" id="selfBreedFemaleGrid"></div>
            </div>
            <!-- 繁育箭头 -->
            <div class="breed-heart-icon">💕</div>
            <!-- 公猫选择 -->
            <div class="breed-select-col">
              <div class="breed-select-label">👨 选择公猫</div>
              <div class="breed-select-grid" id="selfBreedMaleGrid"></div>
            </div>
          </div>
          <!-- 父母信息 -->
          <div class="self-breed-parents-info" id="selfBreedParentsInfo" style="display:none;">
            <div class="breed-parents-detail">
              <div class="breed-parent-female" id="breedParentFemale"></div>
              <div class="breed-vs">×</div>
              <div class="breed-parent-male" id="breedParentMale"></div>
            </div>
            <!-- 近亲警告 -->
            <div class="breed-inbreed-warning" id="breedInbreedWarning" style="display:none;">
              ⚠️ 三代以内近亲，不能繁育
            </div>
            <!-- 后代概率预览 -->
            <div class="breed-offspring-preview" id="breedOffspringPreview"></div>
          </div>
          <button class="self-breeding-confirm-btn" id="selfBreedingConfirmBtn" disabled>
            🐱 开始繁育
          </button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    // 显示弹窗
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.style.opacity = '1';

    // 渲染母猫列表
    renderSelfBreedCatGrid('selfBreedFemaleGrid', 'female');
    // 渲染公猫列表
    renderSelfBreedCatGrid('selfBreedMaleGrid', 'male');

    // 重置预览
    document.getElementById('selfBreedParentsInfo').style.display = 'none';
    document.getElementById('breedInbreedWarning').style.display = 'none';
    document.getElementById('selfBreedingConfirmBtn').disabled = true;

    // 确认繁育按钮
    const confirmBtn = document.getElementById('selfBreedingConfirmBtn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (selfBreedSelected.female < 0 || selfBreedSelected.male < 0) return;
        
        const result = window.PET_ENGINE.doSelfBreeding(
          selfBreedSelected.female,
          selfBreedSelected.male
        );
        
        if (result.success) {
          hideSelfBreedingModal();
          showSelfBreedingResult(result);
        } else if (result.penFull) {
          // 栏位满了，弹出选择弹窗
          hideSelfBreedingModal();
          setTimeout(() => showPenFullModal(), 300);
        } else {
          toast(result.msg || '繁育失败');
          // 按钮抖动反馈
          confirmBtn.classList.add('breed-btn-shake');
          setTimeout(() => confirmBtn.classList.remove('breed-btn-shake'), 400);
        }
      };
    }

    modal.style.display = 'flex';
  }

  function renderSelfBreedCatGrid(gridId, gender) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const state = window.PET_ENGINE.getState();
    const adultCats = state.cats.filter(c => c.isAdult !== false && c.gender === gender);
    
    grid.innerHTML = '';

    if (adultCats.length === 0) {
      grid.innerHTML = '<div class="breed-select-empty">没有成年' + (gender === 'female' ? '母' : '公') + '猫</div>';
      return;
    }

    state.cats.forEach((cat, idx) => {
      if (cat.gender !== gender || cat.isAdult === false) return;

      const catData = window.PET_ENGINE.getCatData(cat.catId);
      const item = document.createElement('div');
      item.className = 'breed-select-cat-item';
      item.dataset.index = idx;
      
      const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;
      const rarity = cat.rarity || (catData?.rarity || 'common');
      const rarityInfo = RARITY_CONFIG?.[rarity] || { name: '普通', color: '#9E9E9E' };

      item.innerHTML = `
        <canvas class="breed-select-canvas" width="80" height="80"></canvas>
        <div class="breed-select-name">${catData?.name || cat.name}</div>
        <div class="breed-select-breed" style="color:${rarityInfo.color}">${rarityInfo.name}</div>
      `;

      item.onclick = () => {
        // 取消同性别其他选中
        grid.querySelectorAll('.breed-select-cat-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        
        if (gender === 'female') {
          selfBreedSelected.female = idx;
        } else {
          selfBreedSelected.male = idx;
        }

        updateSelfBreedingPreview();
      };

      grid.appendChild(item);

      // 绘制猫咪
      const canvas = item.querySelector('.breed-select-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        window.PET_RENDERER.loadSprites(() => {
          window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 40, 45, 60);
        });
      }
    });
  }

  function updateSelfBreedingPreview() {
    const infoEl = document.getElementById('selfBreedParentsInfo');
    const warnEl = document.getElementById('breedInbreedWarning');
    const previewEl = document.getElementById('breedOffspringPreview');
    const confirmBtn = document.getElementById('selfBreedingConfirmBtn');

    if (selfBreedSelected.female < 0 || selfBreedSelected.male < 0) {
      if (infoEl) infoEl.style.display = 'none';
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }

    if (infoEl) infoEl.style.display = 'block';

    const state = window.PET_ENGINE.getState();
    const femaleCat = state.cats[selfBreedSelected.female];
    const maleCat = state.cats[selfBreedSelected.male];
    const femaleData = window.PET_ENGINE.getCatData(femaleCat.catId);
    const maleData = window.PET_ENGINE.getCatData(maleCat.catId);

    // 父母信息
    const femaleEl = document.getElementById('breedParentFemale');
    const maleEl = document.getElementById('breedParentMale');
    const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;
    
    if (femaleEl) {
      const fRarity = RARITY_CONFIG?.[femaleCat.rarity || femaleData?.rarity] || { name: '普通' };
      femaleEl.innerHTML = `${femaleCat.name} <span style="color:${fRarity.color || '#9E9E9E'}">${fRarity.name}</span>`;
    }
    if (maleEl) {
      const mRarity = RARITY_CONFIG?.[maleCat.rarity || maleData?.rarity] || { name: '普通' };
      maleEl.innerHTML = `${maleCat.name} <span style="color:${mRarity.color || '#9E9E9E'}">${mRarity.name}</span>`;
    }

    // 检查近亲
    const isInbreed = window.PET_ENGINE.isInbreeding(femaleCat.uid, maleCat.uid);
    if (warnEl) {
      warnEl.style.display = isInbreed ? 'block' : 'none';
    }
    if (confirmBtn) {
      confirmBtn.disabled = isInbreed;
    }

    // 后代概率预览
    if (previewEl) {
      const BREEDING_TABLE = window.PET_DATA.BREEDING_TABLE;
      const fLevel = window.PET_ENGINE.getCatRarityLevel(femaleCat.catId);
      const mLevel = window.PET_ENGINE.getCatRarityLevel(maleCat.catId);
      
      const minL = Math.min(fLevel, mLevel);
      const maxL = Math.max(fLevel, mLevel);
      const tableKey = `${minL}_${maxL}`;
      
      let previewHtml = '<div class="offspring-preview-title">预计后代概率：</div><div class="offspring-preview-list">';
      
      const tableEntry = BREEDING_TABLE && BREEDING_TABLE[tableKey];
      if (tableEntry && tableEntry.distribution) {
        let totalWeight = 0;
        tableEntry.distribution.forEach(item => { totalWeight += item.weight; });
        tableEntry.distribution.forEach(item => {
          const rInfo = RARITY_CONFIG?.[item.rarity] || { name: item.rarity, color: '#9E9E9E' };
          const prob = totalWeight > 0 ? item.weight / totalWeight : 0;
          previewHtml += `
            <div class="offspring-preview-item">
              <span class="offspring-rarity-dot" style="background:${rInfo.color}"></span>
              <span class="offspring-rarity-name">${rInfo.name}</span>
              <span class="offspring-rarity-prob">${Math.round(prob * 100)}%</span>
            </div>
          `;
        });
      } else {
        previewHtml += '<div class="offspring-preview-empty">暂无概率数据</div>';
      }
      
      previewHtml += '</div>';
      previewEl.innerHTML = previewHtml;
    }
  }

  function hideSelfBreedingModal() {
    const modal = document.getElementById('selfBreedingModal');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
      modal.style.opacity = '';
    }
  }

  // 自繁育结果弹窗
  function showSelfBreedingResult(result) {
    let resultModal = document.getElementById('selfBreedResultModal');
    if (!resultModal) {
      resultModal = document.createElement('div');
      resultModal.id = 'selfBreedResultModal';
      resultModal.className = 'self-breed-result-modal';
      resultModal.innerHTML = `
        <div class="self-breed-result-mask" onclick="window.PET_UI.hideSelfBreedResult()"></div>
        <div class="self-breed-result-content">
          <div class="self-breed-result-title">🎉 繁育成功！</div>
          <div class="self-breed-kittens" id="selfBreedKittens"></div>
          <div class="self-breed-result-desc">亲密度越高，繁育出稀有品种的概率越大哦~</div>
          <button class="self-breed-result-btn" id="selfBreedResultCloseBtn">太棒了！</button>
        </div>
      `;
      document.body.appendChild(resultModal);

      // 绑定关闭事件
      const mask = resultModal.querySelector('.self-breed-result-mask');
      const closeBtn = resultModal.querySelector('.self-breed-result-btn');
      const contentEl = resultModal.querySelector('.self-breed-result-content');
      if (mask) mask.addEventListener('click', hideSelfBreedingResult);
      if (closeBtn) closeBtn.addEventListener('click', hideSelfBreedingResult);
      if (contentEl) contentEl.addEventListener('click', (e) => e.stopPropagation());
    }

    const kittensEl = document.getElementById('selfBreedKittens');
    if (kittensEl && result.kittens) {
      kittensEl.innerHTML = '';
      const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;
      
      result.kittens.forEach(kitten => {
        const kittenData = window.PET_ENGINE.getCatData(kitten.catId);
        const rarity = kitten.rarity || 'common';
        const rarityInfo = RARITY_CONFIG?.[rarity] || { name: '普通', color: '#9E9E9E' };
        
        const kittenEl = document.createElement('div');
        kittenEl.className = 'self-breed-kitten-card';
        kittenEl.innerHTML = `
          <canvas class="self-breed-kitten-canvas" width="100" height="100"></canvas>
          <div class="self-breed-kitten-name">${kittenData?.name || '小猫'}</div>
          <div class="self-breed-kitten-rarity" style="color:${rarityInfo.color}">${rarityInfo.name}</div>
          <div class="self-breed-kitten-gender gender-${kitten.gender === 'female' ? 'female' : 'male'}">${window.PET_ENGINE.getGenderLabel(kitten.gender)}</div>
        `;
        kittensEl.appendChild(kittenEl);

        const canvas = kittenEl.querySelector('.self-breed-kitten-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          window.PET_RENDERER.loadSprites(() => {
            window.PET_RENDERER.drawStaticCat(ctx, kitten.catId, 50, 55, 75);
          });
        }
      });
    }

    resultModal.style.display = 'flex';
    
    // 检查栏位是否满了
    updateCoinDisplay();
    notifyCoinsChange();
    render();
    
    // 如果栏位满了，显示选择弹窗
    if (window.PET_ENGINE.isPenFull()) {
      // 延迟一点让用户先看到结果
      setTimeout(() => {
        showPenFullModal();
      }, 1500);
    }
  }

  function hideSelfBreedingResult() {
    const modal = document.getElementById('selfBreedResultModal');
    if (modal) modal.style.display = 'none';
  }

  // ===== 栏位满了弹窗 =====
  function showPenFullModal() {
    let modal = document.getElementById('penFullModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'penFullModal';
      modal.className = 'pen-full-modal';
      modal.innerHTML = `
        <div class="pen-full-mask"></div>
        <div class="pen-full-content" onclick="event.stopPropagation()">
          <div class="pen-full-title">🏠 猫舍栏位已满</div>
          <div class="pen-full-desc">繁育出的小猫没有地方住啦~<br>把猫咪放到家园腾出位置吧：</div>
          <div class="pen-full-options">
            <div class="pen-full-option" id="penFullOptionList">
              <div class="pen-full-option-icon">🏡</div>
              <div class="pen-full-option-text">
                <div class="main-text">把猫咪放到家园 <span style="background:#4CAF50;color:white;font-size:10px;padding:2px 6px;border-radius:8px;margin-left:6px;">推荐</span></div>
                <div class="pen-full-option-sub">上架出售赚金币，或直接送给家园</div>
              </div>
            </div>
            <div class="pen-full-option" id="penFullOptionDonate">
              <div class="pen-full-option-icon">🎁</div>
              <div class="pen-full-option-text">
                <div class="main-text">直接送给家园</div>
                <div class="pen-full-option-sub">获得20金币奖励</div>
              </div>
            </div>
            <div class="pen-full-option" id="penFullOptionReplace">
              <div class="pen-full-option-icon">🔄</div>
              <div class="pen-full-option-text">
                <div class="main-text">替换一只猫咪</div>
                <div class="pen-full-option-sub">选择一只猫替换掉</div>
              </div>
            </div>
          </div>
          <button class="pen-full-cancel" id="penFullCancelBtn">我再想想</button>
        </div>
      `;
      document.body.appendChild(modal);

      // 替换一只猫
      document.getElementById('penFullOptionReplace').onclick = () => {
        hidePenFullModal();
        showReplaceCatModal();
      };

      // 去家园上架
      document.getElementById('penFullOptionList').onclick = () => {
        hidePenFullModal();
        switchTab('home');
        currentHomeSubTab = 'myListings';
      };

      // 送给家园
      document.getElementById('penFullOptionDonate').onclick = () => {
        hidePenFullModal();
        showDonateCatSelectModal();
      };

      // 取消
      document.getElementById('penFullCancelBtn').onclick = () => {
        hidePenFullModal();
      };
    }

    modal.style.display = 'flex';
  }

  function hidePenFullModal() {
    const modal = document.getElementById('penFullModal');
    if (modal) modal.style.display = 'none';
  }

  // 替换猫咪选择弹窗
  function showReplaceCatModal() {
    const state = window.PET_ENGINE.getState();
    
    let modal = document.getElementById('replaceCatModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'replaceCatModal';
      modal.className = 'replace-cat-modal';
      modal.innerHTML = `
        <div class="replace-cat-mask" onclick="window.PET_UI.hideReplaceCatModal()"></div>
        <div class="replace-cat-content" onclick="event.stopPropagation()">
          <div class="replace-cat-header">
            <div class="replace-cat-title">🔄 选择要替换的猫</div>
            <button class="replace-cat-close" onclick="window.PET_UI.hideReplaceCatModal()">✕</button>
          </div>
          <div class="replace-cat-tip">被替换的猫咪将从你的猫舍中消失</div>
          <div class="replace-cat-grid" id="replaceCatGrid"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const grid = document.getElementById('replaceCatGrid');
    if (grid) {
      grid.innerHTML = '';
      const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;

      state.cats.forEach((cat, idx) => {
        const catData = window.PET_ENGINE.getCatData(cat.catId);
        const rarity = cat.rarity || (catData?.rarity || 'common');
        const rarityInfo = RARITY_CONFIG?.[rarity] || { name: '普通', color: '#9E9E9E' };

        const item = document.createElement('div');
        item.className = 'replace-cat-item';
        item.innerHTML = `
          <canvas class="replace-cat-canvas" width="70" height="70"></canvas>
          <div class="replace-cat-name">${cat.name}</div>
          <div class="replace-cat-rarity" style="color:${rarityInfo.color}">${rarityInfo.name}</div>
          <button class="replace-cat-btn">替换</button>
        `;

        item.querySelector('.replace-cat-btn').onclick = () => {
          petConfirm({
            title: `替换掉${cat.name}？`,
            desc: '替换后它将从你的猫舍中消失',
            okText: '替换', danger: true
          }, () => {
            // TODO: 调用引擎API替换猫咪
            toast('替换功能请在获得新猫时使用');
            hideReplaceCatModal();
          });
        };

        grid.appendChild(item);

        const canvas = item.querySelector('.replace-cat-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          window.PET_RENDERER.loadSprites(() => {
            window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 35, 40, 55);
          });
        }
      });
    }

    modal.style.display = 'flex';
  }

  function hideReplaceCatModal() {
    const modal = document.getElementById('replaceCatModal');
    if (modal) modal.style.display = 'none';
  }

  // 捐赠猫咪选择弹窗（栏位满时）
  function showDonateCatSelectModal() {
    const state = window.PET_ENGINE.getState();
    
    let modal = document.getElementById('donateCatSelectModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'donateCatSelectModal';
      modal.className = 'donate-cat-select-modal';
      modal.innerHTML = `
        <div class="donate-cat-select-mask" onclick="window.PET_UI.hideDonateCatSelectModal()"></div>
        <div class="donate-cat-select-content" onclick="event.stopPropagation()">
          <div class="donate-cat-select-header">
            <div class="donate-cat-select-title">🎁 选择送给家园的猫</div>
            <button class="donate-cat-select-close" onclick="window.PET_UI.hideDonateCatSelectModal()">✕</button>
          </div>
          <div class="donate-cat-select-tip">送出后猫咪将消失，获得20金币奖励</div>
          <div class="donate-cat-select-grid" id="donateCatSelectGrid"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const grid = document.getElementById('donateCatSelectGrid');
    if (grid) {
      grid.innerHTML = '';
      const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;

      state.cats.forEach((cat, idx) => {
        const catData = window.PET_ENGINE.getCatData(cat.catId);
        const rarity = cat.rarity || (catData?.rarity || 'common');
        const rarityInfo = RARITY_CONFIG?.[rarity] || { name: '普通', color: '#9E9E9E' };

        const item = document.createElement('div');
        item.className = 'donate-cat-select-item';
        item.innerHTML = `
          <canvas class="donate-cat-select-canvas" width="70" height="70"></canvas>
          <div class="donate-cat-select-name">${cat.name}</div>
          <div class="donate-cat-select-rarity" style="color:${rarityInfo.color}">${rarityInfo.name}</div>
          <button class="donate-cat-select-btn">送出 (+20💰)</button>
        `;

        item.querySelector('.donate-cat-select-btn').onclick = () => {
          petConfirm({
            title: `把${cat.name}送给猫咪家园？`,
            desc: '送出后将获得 20 金币奖励\n猫咪将从你的猫舍中消失',
            okText: '送出', danger: true
          }, () => {
            const result = window.PET_ENGINE.donateCatToHome(idx);
            if (result.success) {
              toast(result.msg || '捐赠成功！获得20金币~');
              updateCoinDisplay();
              notifyCoinsChange();
              hideDonateCatSelectModal();
              render();
              startAnimation();
            } else {
              toast(result.msg || '捐赠失败');
            }
          });
        };

        grid.appendChild(item);

        const canvas = item.querySelector('.donate-cat-select-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          window.PET_RENDERER.loadSprites(() => {
            window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 35, 40, 55);
          });
        }
      });
    }

    modal.style.display = 'flex';
  }

  function hideDonateCatSelectModal() {
    const modal = document.getElementById('donateCatSelectModal');
    if (modal) modal.style.display = 'none';
  }

  // ===== 猫咪家园标签页 =====
  function renderHomeTab(container) {
    const isUnlocked = window.PET_ENGINE.isHomeUnlocked();

    if (!isUnlocked) {
      container.innerHTML = `
        <div class="home-locked-state">
          <div class="home-locked-icon">🔒</div>
          <div class="home-locked-title">猫咪家园未解锁</div>
          <div class="home-locked-desc">
            发布或认领1个任务即可永久解锁猫咪家园<br>
            解锁后可在市场买卖猫咪、查看繁育概率表
          </div>
          <div class="home-locked-tip">
            💡 完成新手任务中的「发布任务」或「认领任务」即可解锁
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <!-- 家原子标签 -->
      <div class="home-sub-tabs">
        <div class="home-sub-tab ${currentHomeSubTab === 'probability' ? 'active' : ''}" data-subtab="probability">📊 概率表</div>
        <div class="home-sub-tab ${currentHomeSubTab === 'market' ? 'active' : ''}" data-subtab="market">🛒 市场</div>
        <div class="home-sub-tab ${currentHomeSubTab === 'myListings' ? 'active' : ''}" data-subtab="myListings">📦 我的上架</div>
      </div>

      <!-- 家园内容区 -->
      <div class="home-content-area" id="homeContentArea"></div>
    `;

    // 绑定子标签切换
    container.querySelectorAll('.home-sub-tab').forEach(tab => {
      tab.onclick = () => {
        currentHomeSubTab = tab.dataset.subtab;
        container.querySelectorAll('.home-sub-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderHomeSubContent();
      };
    });

    renderHomeSubContent();
  }

  function renderHomeSubContent() {
    const contentEl = document.getElementById('homeContentArea');
    if (!contentEl) return;

    switch (currentHomeSubTab) {
      case 'probability':
        renderProbabilityTab(contentEl);
        break;
      case 'market':
        renderMarketTab(contentEl);
        break;
      case 'myListings':
        renderMyListingsTab(contentEl);
        break;
    }
  }

  // 概率表子标签
  function renderProbabilityTab(container) {
    const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;
    const BREEDING_TABLE = window.PET_DATA.BREEDING_TABLE;
    const RARITY_BREEDS = window.PET_DATA.RARITY_BREEDS;
    const CATS = window.PET_DATA.CATS;

    // 稀有度键名到等级的映射
    const rarityKeyToLevel = { common: 0, rare3: 3, rare4: 4, rare5: 5 };
    const rarityKeys = ['common', 'rare3', 'rare4', 'rare5'];

    let html = `
      <div class="probability-section">
        <div class="probability-section-title">📊 繁育概率表</div>
        <div class="probability-table-wrap">
          <table class="probability-table">
            <thead>
              <tr>
                <th class="prob-corner">父\\母</th>
    `;

    // 表头 - 各稀有度
    rarityKeys.forEach(r => {
      const info = RARITY_CONFIG[r] || { name: r, color: '#9E9E9E' };
      html += `<th class="prob-th" style="color:${info.color}">${info.name}</th>`;
    });

    html += `
              </tr>
            </thead>
            <tbody>
    `;

    // 表格内容 - 计算每对组合的后代最高概率稀有度
    rarityKeys.forEach(r1 => {
      const info1 = RARITY_CONFIG[r1] || { name: r1, color: '#9E9E9E' };
      html += `<tr><td class="prob-row-label" style="color:${info1.color}">${info1.name}</td>`;
      
      rarityKeys.forEach(r2 => {
        let cellContent = '';
        const l1 = rarityKeyToLevel[r1];
        const l2 = rarityKeyToLevel[r2];
        const minL = Math.min(l1, l2);
        const maxL = Math.max(l1, l2);
        const tableKey = `${minL}_${maxL}`;
        
        const tableEntry = BREEDING_TABLE && BREEDING_TABLE[tableKey];
        if (tableEntry && tableEntry.distribution) {
          // 找到权重最高的稀有度
          let maxWeight = 0;
          let maxRarity = 'common';
          let totalWeight = 0;
          tableEntry.distribution.forEach(item => {
            totalWeight += item.weight;
            if (item.weight > maxWeight) {
              maxWeight = item.weight;
              maxRarity = item.rarity;
            }
          });
          const maxProb = totalWeight > 0 ? (maxWeight / totalWeight) : 0;
          const maxInfo = RARITY_CONFIG[maxRarity] || { name: maxRarity, color: '#9E9E9E' };
          cellContent = `
            <div class="prob-cell-inner">
              <div class="prob-cell-rarity" style="color:${maxInfo.color}">${maxInfo.name}</div>
              <div class="prob-cell-value">${Math.round(maxProb * 100)}%</div>
            </div>
          `;
        } else {
          cellContent = '<div class="prob-cell-inner"><div class="prob-cell-value">-</div></div>';
        }
        html += `<td class="prob-td">${cellContent}</td>`;
      });
      
      html += `</tr>`;
    });

    html += `
            </tbody>
          </table>
        </div>
        <div class="probability-tip">💡 表格显示基础概率。好感度等级越高，繁育出珍稀和传说猫的概率越高</div>
      </div>

      <!-- 好感度等级加成说明 -->
      <div class="probability-section">
        <div class="probability-section-title">💕 好感度等级加成</div>
        <div class="bond-bonus-info">
          <div class="bond-bonus-desc">
            提升猫咪好感度等级，可以直接增加繁育出<span style="color:#2196F3;font-weight:600">珍稀</span>和<span style="color:#E91E63;font-weight:600">传说</span>猫的概率
          </div>
          <div class="bond-bonus-table-wrap">
            <table class="bond-bonus-table">
              <thead>
                <tr>
                  <th>等级</th>
                  <th style="color:#2196F3">珍稀加成</th>
                  <th style="color:#E91E63">传说加成</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Lv.1</td><td>+0%</td><td>+0%</td></tr>
                <tr><td>Lv.2</td><td>+2%</td><td>+1%</td></tr>
                <tr><td>Lv.3</td><td>+4%</td><td>+2%</td></tr>
                <tr><td>Lv.4</td><td>+6%</td><td>+3%</td></tr>
                <tr><td>Lv.5</td><td>+8%</td><td>+4%</td></tr>
                <tr><td>Lv.6</td><td>+10%</td><td>+5%</td></tr>
                <tr><td>Lv.7</td><td>+12%</td><td>+6%</td></tr>
                <tr><td>Lv.8</td><td>+14%</td><td>+7%</td></tr>
                <tr><td>Lv.9</td><td>+16%</td><td>+8%</td></tr>
                <tr><td>Lv.10</td><td>+20%</td><td>+10%</td></tr>
              </tbody>
            </table>
          </div>
          <div class="bond-bonus-note">
            * 加成从普通/稀有概率中扣除，总概率保持100%<br>
            * 繁育时取两只猫的等级平均值计算加成
          </div>
        </div>
      </div>

      <div class="probability-section">
        <div class="probability-section-title">🐱 品种稀有度一览</div>
    `;

    // 各稀有度品种列表 - 显示品种中文名，用标签形式展示
    if (RARITY_BREEDS && CATS) {
      rarityKeys.forEach(rarity => {
        const breedIds = RARITY_BREEDS[rarity] || [];
        if (breedIds.length === 0) return;
        const info = RARITY_CONFIG?.[rarity] || { name: rarity, color: '#9E9E9E', bgColor: '#f5f5f5' };
        
        const breedNames = breedIds.map(id => {
          const cat = CATS.find(c => c.id === id);
          return cat ? cat.name : id;
        });
        
        const tagBgColor = info.bgColor || '#f5f5f5';
        const tagTextColor = info.color || '#666';
        
        html += `
          <div class="rarity-breeds-section">
            <div class="rarity-breeds-title" style="background:${tagBgColor};color:${tagTextColor}">
              ${info.name}品种 · ${breedNames.length}种
            </div>
            <div class="rarity-breeds-list">
              ${breedNames.map(b => `<span class="rarity-breed-tag" style="background:${tagBgColor};color:${tagTextColor}">${b}</span>`).join('')}
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;

    container.innerHTML = html;
  }

  // 市场子标签
  function renderMarketTab(container) {
    try {
      const result = window.PET_ENGINE.getHomeListings();
      const listings = result.listings || [];
      const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;

      if (listings.length === 0) {
        container.innerHTML = `
          <div class="market-empty">
            <div class="market-empty-icon">🐱</div>
            <div class="market-empty-text">市场上还没有猫咪~</div>
            <div class="market-empty-desc">快去上架你的猫咪吧！</div>
          </div>
        `;
        return;
      }

      let html = '<div class="market-cat-grid">';

      listings.forEach(listing => {
        const rarityInfo = RARITY_CONFIG?.[listing.rarity] || { name: '普通', color: '#9E9E9E' };
        const genderLabel = window.PET_ENGINE.getGenderLabel(listing.catGender);
        const genderClass = listing.catGender === 'female' ? 'female' : 'male';

        html += `
          <div class="market-cat-card" data-listingid="${listing.id}">
            <div class="market-cat-rarity-tag" style="background:${rarityInfo.color}">${rarityInfo.name}</div>
            <canvas class="market-cat-canvas" width="90" height="90" data-catid="${listing.catId}"></canvas>
            <div class="market-cat-name">${listing.catName}</div>
            <div class="market-cat-gender gender-${genderClass}">${genderLabel}</div>
            <div class="market-cat-seller">卖家：${listing.sellerName || '匿名'}</div>
            <div class="market-cat-price">💰 ${listing.price}</div>
            <button class="market-buy-btn" data-listingid="${listing.id}">购买</button>
          </div>
        `;
      });

      html += '</div>';
      container.innerHTML = html;

      // 绑定购买按钮
      container.querySelectorAll('.market-buy-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const listingId = btn.dataset.listingid;
          const listing = listings.find(l => l.id == listingId);
          if (listing) {
            petConfirm({
              icon: '🐱',
              title: `购买${listing.catName}？`,
              desc: `花费 ${listing.price} 金币\n带回家后占用一个栏位`,
              okText: `花 ${listing.price} 购买`
            }, () => {
              const result = window.PET_ENGINE.buyCatFromHome(listingId);
              if (result.success) {
                toast(result.msg || '购买成功！');
                updateCoinDisplay();
                notifyCoinsChange();
                renderHomeSubContent();
                // 检查栏位
                if (result.penFull) {
                  setTimeout(() => showPenFullModal(), 500);
                }
              } else {
                toast(result.msg || '购买失败');
                if (result.penFull) {
                  setTimeout(() => showPenFullModal(), 300);
                }
              }
            });
          }
        };
      });

      // 绘制猫咪
      container.querySelectorAll('.market-cat-canvas').forEach(canvas => {
        const catId = canvas.dataset.catid;
        if (catId) {
          const ctx = canvas.getContext('2d');
          window.PET_RENDERER.loadSprites(() => {
            window.PET_RENDERER.drawStaticCat(ctx, catId, 45, 50, 65);
          });
        }
      });
    } catch (e) {
      container.innerHTML = '<div class="market-error">市场加载失败</div>';
    }
  }

  // 我的上架子标签
  function renderMyListingsTab(container) {
    try {
      const result = window.PET_ENGINE.getHomeListings();
      const allListings = result.listings || [];
      const myListings = allListings.filter(l => l.isMine);
      const HOME_CONFIG = window.PET_DATA.HOME_CONFIG;
      const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;
      const maxListings = result.maxListings || HOME_CONFIG?.maxListingsPerUser || 5;

      container.innerHTML = `
        <div class="my-listings-header">
          <div class="my-listings-count">已上架：${myListings.length}/${maxListings}</div>
          <button class="my-listings-add-btn" id="myListingsAddBtn">+ 上架猫咪</button>
        </div>
      `;

      if (myListings.length === 0) {
        container.innerHTML += `
          <div class="my-listings-empty">
            <div class="my-listings-empty-icon">📦</div>
            <div class="my-listings-empty-text">还没有上架的猫咪</div>
            <div class="my-listings-empty-desc">点击上方按钮上架你的猫咪到市场吧</div>
          </div>
        `;
      } else {
        let html = '<div class="my-listings-grid">';
        
        myListings.forEach(listing => {
          const rarityInfo = RARITY_CONFIG?.[listing.rarity] || { name: '普通', color: '#9E9E9E' };
          const genderLabel = window.PET_ENGINE.getGenderLabel(listing.catGender);
          const genderClass = listing.catGender === 'female' ? 'female' : 'male';

          html += `
            <div class="my-listing-card" data-listingid="${listing.id}">
              <div class="my-listing-rarity-tag" style="background:${rarityInfo.color}">${rarityInfo.name}</div>
              <canvas class="my-listing-canvas" width="90" height="90" data-catid="${listing.catId}"></canvas>
              <div class="my-listing-name">${listing.catName}</div>
              <div class="my-listing-gender gender-${genderClass}">${genderLabel}</div>
              <div class="my-listing-price">💰 ${listing.price}</div>
              <button class="my-listing-cancel-btn" data-listingid="${listing.id}">下架</button>
            </div>
          `;
        });

        html += '</div>';
        container.innerHTML += html;

        // 绑定下架按钮
        container.querySelectorAll('.my-listing-cancel-btn').forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const listingId = btn.dataset.listingid;
            petConfirm({
              icon: '🐱',
              title: '下架这只猫咪？',
              desc: '下架后猫咪将回到你的猫舍',
              okText: '下架'
            }, () => {
              const result = window.PET_ENGINE.cancelHomeListing(listingId);
              if (result.success) {
                toast(result.msg || '下架成功！');
                renderHomeSubContent();
              } else {
                toast(result.msg || '下架失败');
              }
            });
          };
        });

        // 绘制猫咪
        container.querySelectorAll('.my-listing-canvas').forEach(canvas => {
          const catId = canvas.dataset.catid;
          if (catId) {
            const ctx = canvas.getContext('2d');
            window.PET_RENDERER.loadSprites(() => {
              window.PET_RENDERER.drawStaticCat(ctx, catId, 45, 50, 65);
            });
          }
        });
      }

      // 上架按钮
      const addBtn = document.getElementById('myListingsAddBtn');
      if (addBtn) {
        addBtn.onclick = () => {
          // 跳转到选择猫咪上架
          showListCatSelectModal();
        };
      }
    } catch (e) {
      container.innerHTML = '<div class="my-listings-error">加载失败</div>';
    }
  }

  // 选择猫咪上架弹窗（从我的上架页触发）
  function showListCatSelectModal() {
    const state = window.PET_ENGINE.getState();
    const HOME_CONFIG = window.PET_DATA.HOME_CONFIG;
    const RARITY_CONFIG = window.PET_DATA.RARITY_CONFIG;
    
    let modal = document.getElementById('listCatSelectModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'listCatSelectModal';
      modal.className = 'list-cat-select-modal';
      modal.innerHTML = `
        <div class="list-cat-select-mask" onclick="window.PET_UI.hideListCatSelectModal()"></div>
        <div class="list-cat-select-content" onclick="event.stopPropagation()">
          <div class="list-cat-select-header">
            <div class="list-cat-select-title">📦 选择要上架的猫</div>
            <button class="list-cat-select-close" onclick="window.PET_UI.hideListCatSelectModal()">✕</button>
          </div>
          <div class="list-cat-select-grid" id="listCatSelectGrid"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const grid = document.getElementById('listCatSelectGrid');
    if (grid) {
      grid.innerHTML = '';

      if (state.cats.length <= 1) {
        grid.innerHTML = '<div class="list-cat-select-empty">至少要留一只猫咪陪伴你哦~</div>';
      } else {
        state.cats.forEach((cat, idx) => {
          const catData = window.PET_ENGINE.getCatData(cat.catId);
          const rarity = cat.rarity || (catData?.rarity || 'common');
          const rarityInfo = RARITY_CONFIG?.[rarity] || { name: '普通', color: '#9E9E9E' };
          const genderLabel = window.PET_ENGINE.getGenderLabel(cat.gender);

          const item = document.createElement('div');
          item.className = 'list-cat-select-item';
          item.innerHTML = `
            <canvas class="list-cat-select-canvas" width="80" height="80"></canvas>
            <div class="list-cat-select-name">${cat.name}</div>
            <div class="list-cat-select-rarity" style="color:${rarityInfo.color}">${rarityInfo.name}</div>
            <div class="list-cat-select-gender gender-${cat.gender === 'female' ? 'female' : 'male'}">${genderLabel}</div>
            <button class="list-cat-select-btn">上架</button>
          `;

          item.querySelector('.list-cat-select-btn').onclick = () => {
            hideListCatSelectModal();
            showListCatModal(idx);
          };

          grid.appendChild(item);

          const canvas = item.querySelector('.list-cat-select-canvas');
          if (canvas) {
            const ctx = canvas.getContext('2d');
            window.PET_RENDERER.loadSprites(() => {
              window.PET_RENDERER.drawStaticCat(ctx, cat.catId, 40, 45, 60);
            });
          }
        });
      }
    }

    modal.style.display = 'flex';
  }

  function hideListCatSelectModal() {
    const modal = document.getElementById('listCatSelectModal');
    if (modal) modal.style.display = 'none';
  }

  // ===== 家原子标签切换 =====
  function switchHomeSubTab(subtab) {
    currentHomeSubTab = subtab;
    const tabs = document.querySelectorAll('.home-sub-tab');
    tabs.forEach(t => {
      if (t.dataset.subtab === subtab) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    renderHomeSubContent();
  }

  // ===== 外部接口 =====
  // ===== 自定义确认框（替代浏览器原生 confirm）=====
  // 结构复用全站弹窗语言：.modal-overlay 遮罩 + .modal-box 白卡 + 居中图标/标题/描述 + 按钮区；
  // 主按钮沿用猫咪小屋的暖橙（与游戏内自繁育大按钮同色），次按钮用全站 .btn-ghost。
  // 用法：petConfirm({ title, desc, okText, danger }, onOk)——确认后执行 onOk（回调式，
  // 与原生 confirm 的同步阻塞不同，调用点把后续逻辑挪进 onOk）。
  let petConfirmEl = null;
  function petConfirm(opts, onOk) {
    if (!petConfirmEl) {
      petConfirmEl = document.createElement('div');
      petConfirmEl.className = 'modal-overlay pet-confirm-overlay';
      petConfirmEl.style.display = 'none';
      petConfirmEl.innerHTML = `
        <div class="modal-box pet-confirm-box" onclick="event.stopPropagation()">
          <div class="pc-head">
            <div class="pc-icon" id="petConfirmIcon">🐱</div>
            <div class="pc-title" id="petConfirmTitle"></div>
            <div class="pc-desc" id="petConfirmDesc"></div>
          </div>
          <div class="pc-actions">
            <button class="btn pc-ok" id="petConfirmOk"></button>
            <button class="btn btn-ghost pc-cancel" id="petConfirmCancel">取消</button>
          </div>
        </div>`;
      document.body.appendChild(petConfirmEl);
      const dismiss = () => { petConfirmEl.style.display = 'none'; petConfirmEl._onOk = null; };
      petConfirmEl.addEventListener('click', (e) => { if (e.target === petConfirmEl) dismiss(); });
      petConfirmEl.querySelector('#petConfirmCancel').addEventListener('click', dismiss);
      petConfirmEl.querySelector('#petConfirmOk').addEventListener('click', () => {
        const cb = petConfirmEl._onOk;
        dismiss();
        if (cb) cb();
      });
    }
    const esc2 = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    petConfirmEl.querySelector('#petConfirmIcon').textContent = opts.danger ? '⚠️' : (opts.icon || '🐱');
    petConfirmEl.querySelector('#petConfirmTitle').textContent = opts.title || '';
    const descEl = petConfirmEl.querySelector('#petConfirmDesc');
    descEl.innerHTML = (opts.desc || '').split('\n').map(esc2).join('<br>');
    descEl.style.display = opts.desc ? '' : 'none';
    const okBtn = petConfirmEl.querySelector('#petConfirmOk');
    okBtn.textContent = opts.okText || '确定';
    okBtn.classList.toggle('pc-ok-danger', !!opts.danger);
    petConfirmEl._onOk = onOk;
    petConfirmEl.style.display = 'flex';
  }

  return {
    open, close, switchTab, render, toast, hideItemPanel,
    navigateTo, goBack,
    openDailyTasksModal, closeDailyTasksModal,
    openNewbieTasksModal, closeNewbieTasksModal,
    openShopModal, closeShopModal,
    showBlindAdoptModal,
    showFamilyTree, hideFamilyTree,
    showHomeActionMenu, hideHomeActionMenu,
    showListCatModal, hideListCatModal,
    showListCatSelectModal, hideListCatSelectModal,
    showSelfBreedingModal, hideSelfBreedingModal,
    showSelfBreedingResult, hideSelfBreedingResult,
    showBreedingConfirm, closeBreedingSelect,
    refreshParkScene,
    showPenFullModal, hidePenFullModal,
    showReplaceCatModal, hideReplaceCatModal,
    showDonateCatSelectModal, hideDonateCatSelectModal,
    switchHomeSubTab
  };
})();
