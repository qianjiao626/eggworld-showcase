// ============================================
// 猫咪渲染器 - 多动作帧动画版
// 不同动作显示不同姿势的猫咪，真正有代入感
// ============================================

window.PET_RENDERER = (function() {
  const { CATS } = window.PET_DATA;

  // 精灵图版本号：图片文件更新后递增此数字，强制浏览器绕过缓存重新加载
  const SPRITE_VER = 13;
  // 迁移到蛋蛋世界：素材改放仓库正式目录 assets/cat-cabin/（脚本在 js/ 下，../ 到根）
  const ASSET_BASE = new URL('../assets/cat-cabin/', document.currentScript.src);
  function verUrl(url) {
    const absoluteUrl = new URL(url, ASSET_BASE).href;
    return absoluteUrl + (absoluteUrl.indexOf('?') >= 0 ? '&' : '?') + 'sv=' + SPRITE_VER;
  }

  // 动作帧名称定义（共21帧）
  const ACTION_FRAMES = [
    'idle',       // 待机坐姿
    'walk_1',     // 走路帧1（前腿迈出）
    'walk_2',     // 走路帧2（对侧腿跟进）
    'walk_3',     // 走路帧3（后腿蹬地）
    'walk_4',     // 走路帧4（身体前移）
    'walk_5',     // 走路帧5（前腿落地）
    'walk_6',     // 走路帧6（后腿收回）
    'sleep',      // 睡觉蜷缩
    'groom',      // 舔爪子
    'play',       // 玩耍翻滚
    'stretch',    // 伸懒腰打哈欠
    'eat',        // 吃东西
    'blink',      // 眨眼（坐姿闭眼）
    'tilt',       // 歪头（好奇）
    'sit',        // 端正坐下
    'jump',       // 跳跃腾空
    'tailwag',    // 摇尾巴（开心）
    'pounce',     // 扑跃姿势
    'belly',      // 翻肚皮（露肚子撒娇）
    'loaf',       // 面包猫（揣手手）
    'roll'        // 打滚（侧躺玩耍）
  ];

  // 走路帧序列（6帧循环）
  const WALK_FRAMES = ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6'];

  // 需要重着色的关键帧（高频使用的动作，其他帧用兜底）
  const RECOLOR_FRAMES = [
    'idle',     // 静坐（预览/图鉴/市场用）
    'walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6', // 走路（6帧）
    'sleep',    // 睡觉
    'eat',      // 吃东西
    'play',     // 玩耍
    'groom',    // 舔毛
    'stretch'   // 伸懒腰
  ];

  // 非关键帧的兜底映射（用最近似的关键帧，确保每个动作都有明显视觉差异）
  const FRAME_FALLBACK = {
    'blink': 'stretch',   // 眨眼 → 伸懒腰（有动作感，不会像idle那样没变化）
    'tilt': 'walk_2',     // 歪头 → 走路第2帧（身体微侧，有动的感觉）
    'sit': 'walk_1',      // 端坐 → 走路第1帧（正面站姿，和坐姿有差异）
    'jump': 'walk_3',     // 跳跃 → 走路中间帧
    'tailwag': 'play',    // 摇尾巴 → 玩耍（身体有动作，比idle有活力）
    'pounce': 'walk_6',   // 扑跃 → 走路最后帧
    'belly': 'play',      // 翻肚皮 → 玩耍
    'loaf': 'sleep',      // 面包猫 → 睡觉（都是蜷缩状）
    'roll': 'play',       // 打滚 → 玩耍
    'pet': 'groom'        // 被抚摸 → 舔毛（享受状，有动作）
  };

  // 橘猫补充动作帧保存在统一素材目录中的 JPG；其余动作使用关键帧兜底。
  const ORANGE_EXTRA_FRAME_EXT = {
    blink: 'jpg',
    tilt: 'jpg',
    sit: 'jpg',
    belly: 'jpg',
    loaf: 'jpg'
  };

  // 猫咪颜色方案 - 基于橘猫精灵图进行程序化重着色
  // 每只猫都有独特的配色映射，保留橘猫的所有21帧动画
  const CAT_COLOR_SCHEMES = {
    orange: {
      name: '橘猫',
      // 橘猫用原图，不需要重映射
      method: 'original'
    },
    calico: {
      name: '三花猫',
      method: 'pattern',
      // 三花猫：白色为主，橙+黑斑块（脸部大面积白色）
      patternType: 'calico',
      primaryColor: { h: 30, s: 95, l: 60 },     // 橙色斑块（偏亮橘）
      secondaryColor: { h: 10, s: 80, l: 15 },    // 黑色斑块（偏暖黑）
      whiteColor: { h: 50, s: 15, l: 95 },        // 白色毛（大面积）
      bellyColor: { h: 50, s: 12, l: 92 },        // 肚子白色
      earColor: { h: 0, s: 70, l: 75 },           // 粉耳朵
      eyeColor: { h: 45, s: 85, l: 55 }           // 金黄色眼睛
    },
    black: {
      name: '黑猫',
      method: 'solid',
      // 黑猫：深炭黑色+金黄眼睛，低饱和度避免偏红棕
      furColor: { h: 20, s: 35, l: 12 },
      furHighlight: { h: 20, s: 30, l: 20 },
      bellyColor: { h: 20, s: 25, l: 18 },
      earColor: { h: 0, s: 65, l: 35 },         // 粉耳朵内侧
      eyeColor: { h: 45, s: 90, l: 55 },        // 金黄色眼睛
      noseColor: { h: 0, s: 40, l: 42 }
    },
    white: {
      name: '白猫',
      method: 'solid',
      // 白猫：纯白带柔和阴影+粉蓝眼睛
      furColor: { h: 50, s: 10, l: 96 },
      furHighlight: { h: 50, s: 5, l: 99 },
      bellyColor: { h: 50, s: 8, l: 98 },
      earColor: { h: 350, s: 70, l: 82 },        // 粉耳朵
      eyeColor: { h: 200, s: 75, l: 60 },        // 粉蓝色眼睛
      noseColor: { h: 350, s: 60, l: 78 }
    },
    tuxedo: {
      name: '奶牛猫',
      method: 'pattern',
      // 奶牛猫：白脸+黑身，黑白分明，低饱和黑避免偏红棕
      patternType: 'tuxedo',
      primaryColor: { h: 20, s: 35, l: 12 },      // 深炭黑色身体
      secondaryColor: { h: 50, s: 8, l: 96 },     // 纯白色脸部/胸部
      whiteColor: { h: 50, s: 8, l: 96 },
      bellyColor: { h: 50, s: 6, l: 98 },         // 白肚子
      earColor: { h: 0, s: 60, l: 40 },           // 深粉耳朵
      eyeColor: { h: 120, s: 70, l: 48 }          // 绿色眼睛
    },
    russianblue: {
      name: '蓝猫',
      method: 'solid',
      // 蓝猫：灰蓝色+绿色眼睛+圆脸
      furColor: { h: 210, s: 25, l: 55 },
      furHighlight: { h: 210, s: 30, l: 70 },
      bellyColor: { h: 205, s: 20, l: 75 },
      earColor: { h: 350, s: 50, l: 72 },         // 粉耳朵
      eyeColor: { h: 120, s: 65, l: 50 },         // 绿色眼睛
      noseColor: { h: 210, s: 25, l: 45 },
      textureStrength: 0.2  // 蓝猫毛色非常纯净，几乎看不到纹理
    },
    tabby: {
      name: '狸花猫',
      method: 'pattern',
      // 狸花猫：棕灰虎斑纹+绿眼睛（偏灰棕，不要太橘）
      patternType: 'tabby',
      primaryColor: { h: 30, s: 40, l: 50 },
      secondaryColor: { h: 20, s: 50, l: 22 },
      whiteColor: { h: 40, s: 15, l: 80 },
      bellyColor: { h: 38, s: 20, l: 70 },
      earColor: { h: 0, s: 55, l: 65 },
      eyeColor: { h: 120, s: 65, l: 48 }
    },
    ragdoll: {
      name: '布偶猫',
      method: 'pattern',
      // 布偶猫：重点色（奶油白身体+海豹色重点+深蓝眼睛）
      // 用patternType: 'colorpoint'，基于原始亮度自然分布重点色
      // 暗部（脸、耳、爪、尾、条纹）→ 海豹色重点色
      // 亮部（肚子、胸、身体中间）→ 奶油色身体
      patternType: 'colorpoint',
      primaryColor: { h: 42, s: 14, l: 90 },      // 奶油色身体（亮区）
      secondaryColor: { h: 22, s: 60, l: 28 },    // 海豹色重点色（暗区）
      whiteColor: { h: 45, s: 8, l: 96 },
      bellyColor: { h: 42, s: 10, l: 93 },
      earColor: { h: 20, s: 50, l: 32 },          // 耳朵内侧偏深
      eyeColor: { h: 220, s: 85, l: 52 }          // 深蓝色眼睛
    },
    munchkin: {
      name: '矮脚努米特',
      method: 'pattern',
      // 矮脚猫：奶油奶黄色+白胸白爪+琥珀色圆眼睛，小短腿
      patternType: 'solid',
      primaryColor: { h: 42, s: 45, l: 75 },       // 奶油黄毛
      secondaryColor: { h: 38, s: 50, l: 65 },     // 稍深奶油色
      whiteColor: { h: 48, s: 12, l: 95 },         // 白色胸毛
      bellyColor: { h: 45, s: 10, l: 92 },
      earColor: { h: 0, s: 65, l: 78 },
      eyeColor: { h: 38, s: 80, l: 50 }            // 琥珀色眼睛
    },
    mainecoon: {
      name: '缅因猫',
      method: 'pattern',
      // 缅因猫：深棕虎斑+大体型+绿眼睛
      patternType: 'tabby',
      primaryColor: { h: 25, s: 45, l: 40 },
      secondaryColor: { h: 15, s: 55, l: 18 },
      whiteColor: { h: 35, s: 15, l: 75 },
      bellyColor: { h: 30, s: 20, l: 65 },
      earColor: { h: 0, s: 50, l: 60 },
      eyeColor: { h: 120, s: 60, l: 45 }
    },
    devonrex: {
      name: '德文卷毛猫',
      method: 'pattern',
      // 德文卷毛：灰色调+大耳朵+黄眼睛
      patternType: 'solid',
      primaryColor: { h: 200, s: 15, l: 55 },
      secondaryColor: { h: 210, s: 20, l: 40 },
      whiteColor: { h: 200, s: 10, l: 80 },
      bellyColor: { h: 200, s: 8, l: 75 },
      earColor: { h: 0, s: 60, l: 70 },
      eyeColor: { h: 50, s: 90, l: 55 }
    },
    sphynx: {
      name: '斯芬克斯猫',
      method: 'pattern',
      // 斯芬克斯：无毛猫，粉肤色+蓝眼睛
      patternType: 'solid',
      primaryColor: { h: 20, s: 60, l: 80 },
      secondaryColor: { h: 15, s: 50, l: 65 },
      whiteColor: { h: 25, s: 40, l: 88 },
      bellyColor: { h: 20, s: 45, l: 85 },
      earColor: { h: 0, s: 70, l: 75 },
      eyeColor: { h: 210, s: 80, l: 55 }
    },
    lioncat: {
      name: '狮子猫',
      method: 'pattern',
      // 狮子猫：纯白色长毛+异瞳（蓝+黄），蓬松
      patternType: 'colorpoint',
      primaryColor: { h: 50, s: 5, l: 98 },
      secondaryColor: { h: 40, s: 10, l: 88 },
      whiteColor: { h: 50, s: 3, l: 99 },
      bellyColor: { h: 45, s: 5, l: 97 },
      earColor: { h: 0, s: 55, l: 80 },
      eyeColor: { h: 220, s: 85, l: 55 }
    },
    bengal: {
      name: '孟加拉豹猫',
      method: 'pattern',
      // 孟加拉豹猫：金棕色豹纹+绿眼睛
      patternType: 'tabby',
      primaryColor: { h: 35, s: 70, l: 55 },
      secondaryColor: { h: 15, s: 65, l: 25 },
      whiteColor: { h: 40, s: 20, l: 75 },
      bellyColor: { h: 38, s: 25, l: 70 },
      earColor: { h: 0, s: 60, l: 65 },
      eyeColor: { h: 120, s: 70, l: 50 }
    }
  };

  // 猫咪精灵图配置 - 所有猫咪现在都有多帧动画（通过颜色重映射）
  const CAT_SPRITES = {
    orange: {
      basePath: 'cats/orange_unified/',   // idle等用旧图（会被actionPath覆盖）
      walkPath: 'cats/orange_pixel_walk/',    // 橘猫像素风走路帧
      actionPath: 'cats/orange_pixel_actions/', // 橘猫像素风动作帧
      ext: 'png',
      hasMultiFrame: true,
      recolor: false,
      name: '橘猫',
      removeWhiteBg: false,  // 全部帧已离线预处理为透明PNG
      // 身形参数（默认橘猫为基准）
      bodyScale: 1.0,
      bodyWidthScale: 1.0,
      bodyHeightScale: 1.0,
      yOffset: 0
    },
    calico: {
      basePath: 'cats/orange_v6/',
      idlePath: 'cats/png/calico/idle.png',  // 三花猫独立idle图
      actionPath: 'cats/calico_actions/',    // 三花猫独立动作帧
      walkPath: 'cats/calico_walk/',         // 三花猫独立走路帧
      ext: 'png',
      hasMultiFrame: true,
      recolor: true,
      colorScheme: 'calico',
      removeWhiteBg: false,  // 全部帧已离线预处理为透明PNG
      name: '三花猫',
      // 三花：略小一点，偏瘦
      bodyScale: 0.95,
      bodyWidthScale: 0.95,
      bodyHeightScale: 1.0,
      yOffset: 0.02
    },
    black: {
      basePath: 'cats/png/black/',
      idlePath: 'cats/png/black/idle.png',
      actionPath: 'cats/png/black/actions/',       // 独立动作帧
      walkPath: 'cats/png/black/walk_png/',        // 独立走路帧（预去除白边的PNG）
      ext: 'png',
      walkRemoveWhiteBg: false,                    // 全部帧已离线预处理
      hasMultiFrame: true,
      recolor: false,
      removeWhiteBg: false,  // idle/动作帧已离线预处理为透明PNG
      name: '黑猫',
      // 黑猫：圆脸、稍胖
      bodyScale: 1.0,
      bodyWidthScale: 1.08,
      bodyHeightScale: 0.95,
      yOffset: 0.03
    },
    white: {
      basePath: 'cats/png/white/',
      idlePath: 'cats/png/white/idle.png',
      actionPath: 'cats/png/white/actions/',
      walkPath: 'cats/png/white/walk/',
      ext: 'png',
      hasMultiFrame: true,
      recolor: false,
      colorScheme: 'white',
      removeWhiteBg: false,
      name: '白猫',
      // 白猫：身形饱满圆润，毛绒绒
      bodyScale: 1.08,
      bodyWidthScale: 1.05,
      bodyHeightScale: 1.02,
      yOffset: 0.02
    },
    tuxedo: {
      basePath: 'cats/png/tuxedo/',
      idlePath: 'cats/png/tuxedo/idle.png',
      walkPath: 'cats/png/tuxedo/walk/',
      actionPath: 'cats/png/tuxedo/actions/',
      ext: 'png',
      hasMultiFrame: true,
      recolor: false,
      colorScheme: 'tuxedo',
      removeWhiteBg: false,  // 全部帧已离线预处理为透明PNG
      name: '奶牛猫',
      // 奶牛猫：偏瘦长、站姿稍高
      bodyScale: 1.02,
      bodyWidthScale: 0.92,
      bodyHeightScale: 1.03,
      yOffset: -0.03
    },
    russianblue: {
      basePath: 'cats/png/russianblue/',
      idlePath: 'cats/png/russianblue/idle.png',
      walkPath: 'cats/png/russianblue/walk/',
      actionPath: 'cats/png/russianblue/actions/',
      ext: 'png',
      hasMultiFrame: true,
      recolor: false,
      colorScheme: 'russianblue',
      removeWhiteBg: false,  // 全部帧已离线预处理为透明PNG（修复灰底边框）
      name: '蓝猫',
      // 蓝猫：圆脸、胖乎乎、腿短
      bodyScale: 1.05,
      bodyWidthScale: 1.15,
      bodyHeightScale: 0.88,
      yOffset: 0.05
    },
    tabby: {
      basePath: 'cats/png/tabby/',
      idlePath: 'cats/png/tabby/idle.png',
      actionPath: 'cats/png/tabby/actions/',     // 独立动作帧
      walkPath: 'cats/png/tabby/walk/',         // 独立走路帧
      ext: 'png',
      walkExt: 'png',
      hasMultiFrame: true,
      recolor: false,
      colorScheme: 'tabby',
      removeWhiteBg: false,  // PNG已经是透明背景（走路帧已离线修复棋盘格底）
      name: '狸花猫',
      // 狸花：瘦长、矫健
      bodyScale: 0.98,
      bodyWidthScale: 0.88,
      bodyHeightScale: 1.05,
      yOffset: -0.01
    },
    ragdoll: {
      basePath: 'cats/png/ragdoll/',
      idlePath: 'cats/png/ragdoll/idle.png',
      walkPath: 'cats/png/ragdoll/walk/',
      actionPath: 'cats/png/ragdoll/actions/',
      ext: 'png',
      hasMultiFrame: true,
      recolor: false,
      colorScheme: 'ragdoll',
      removeWhiteBg: false,  // 全部帧已离线预处理为透明PNG
      name: '布偶猫',
      // 布偶：大只、蓬松、大尾巴
      bodyScale: 1.08,
      bodyWidthScale: 1.08,
      bodyHeightScale: 1.02,
      yOffset: 0.02
    },
    // ===== 稀有品种（独立精灵图，重着色兜底走路帧） =====
    munchkin: {
      basePath: 'cats/png/munchkin_v7/',
      idlePath: 'cats/png/munchkin_v7/idle.png',
      actionPath: 'cats/png/munchkin_v7/actions/',  // 独立动作帧
      walkPath: 'cats/png/munchkin_v7/walk/',      // 独立走路帧
      ext: 'png',
      hasMultiFrame: true,
      recolor: true,
      colorScheme: 'munchkin',
      removeWhiteBg: false,  // PNG已经是透明背景
      name: '矮脚努米特',
      // 矮脚：矮胖，腿短，身体稍宽
      bodyScale: 0.95,
      bodyWidthScale: 1.1,
      bodyHeightScale: 0.88,
      yOffset: 0.05
    },
    maine: {
      basePath: 'cats/png/maine/',
      idlePath: 'cats/png/maine/idle.png',
      actionPath: 'cats/png/maine/actions/',       // 独立动作帧
      walkPath: 'cats/png/maine/walk/',           // 独立走路帧
      ext: 'png',
      walkExt: 'png',
      hasMultiFrame: true,
      recolor: true,
      colorScheme: 'mainecoon',
      removeWhiteBg: false,  // 走路帧已离线预处理为透明PNG
      name: '缅因猫',
      // 缅因：大只，壮硕
      bodyScale: 1.15,
      bodyWidthScale: 1.12,
      bodyHeightScale: 1.1,
      yOffset: -0.02
    },
    devon: {
      basePath: 'cats/png/devon/',
      idlePath: 'cats/png/devon/idle.png',      // 独立idle图（灰色德文）
      actionPath: 'cats/png/devon/actions/',    // 独立动作帧
      walkPath: 'cats/png/devon/walk/',         // 独立走路帧
      ext: 'png',
      walkExt: 'jpg',
      hasMultiFrame: true,
      recolor: false,                           // 有独立帧，不需要重着色
      removeWhiteBg: false,
      name: '德文卷毛猫',
      // 德文：精瘦，大耳朵
      bodyScale: 0.9,
      bodyWidthScale: 0.9,
      bodyHeightScale: 0.95,
      yOffset: 0.02
    },
    sphynx: {
      basePath: 'cats/png/sphynx/',
      idlePath: 'cats/png/sphynx/idle.png',
      actionPath: 'cats/png/sphynx/actions/',     // 独立动作帧
      walkPath: 'cats/png/sphynx/walk/',         // 独立走路帧
      ext: 'png',
      walkExt: 'png',
      hasMultiFrame: true,
      recolor: true,
      colorScheme: 'sphynx',
      removeWhiteBg: false,  // PNG已经是透明背景
      name: '斯芬克斯猫',
      // 斯芬克斯：瘦削无毛
      bodyScale: 0.92,
      bodyWidthScale: 0.88,
      bodyHeightScale: 1.0,
      yOffset: 0.01
    },
    lion: {
      basePath: 'cats/png/lion/',
      idlePath: 'cats/png/lion/idle.png',
      actionPath: 'cats/png/lion/actions/',       // 独立动作帧
      walkPath: 'cats/png/lion/walk_png/',       // 独立走路帧（预去除白边的PNG）
      ext: 'png',
      walkExt: 'png',
      hasMultiFrame: true,
      recolor: true,
      colorScheme: 'lioncat',
      removeWhiteBg: false,
      name: '狮子猫',
      // 狮子猫：蓬松大只
      bodyScale: 1.1,
      bodyWidthScale: 1.15,
      bodyHeightScale: 1.05,
      yOffset: 0.0
    },
    bengal: {
      basePath: 'cats/png/bengal/',
      idlePath: 'cats/png/bengal/idle.png',
      actionPath: 'cats/png/bengal/actions/',      // 独立动作帧
      walkPath: 'cats/png/bengal/walk/',          // 独立走路帧
      ext: 'png',
      walkExt: 'png',
      hasMultiFrame: true,
      recolor: true,
      colorScheme: 'bengal',
      removeWhiteBg: false,  // 走路帧已离线预处理为透明PNG（修复灰边框）
      name: '孟加拉豹猫',
      // 豹猫：修长矫健
      bodyScale: 1.02,
      bodyWidthScale: 0.95,
      bodyHeightScale: 1.05,
      yOffset: -0.01
    }
  };

  // ===== 颜色工具函数 =====
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  // 混合两种HSL颜色
  function mixHsl(color1, color2, ratio) {
    return {
      h: color1.h + (color2.h - color1.h) * ratio,
      s: color1.s + (color2.s - color1.s) * ratio,
      l: color1.l + (color2.l - color1.l) * ratio
    };
  }

  // 判断像素是否是橘猫的毛发色（橙色系）
  function isOrangeFur(h, s, l) {
    // 橙色系：色相在0-55之间（包括红橙色描边），饱和度>15，亮度在12-92之间
    return h >= 0 && h <= 55 && s > 15 && l > 12 && l < 93;
  }

  // 判断是否是白色/浅色毛（肚子、爪子等）
  function isWhiteFur(h, s, l) {
    // 高亮度 + 低饱和度，且色相不在橙色主毛范围内
    return l > 75 && s < 35 && (h < 20 || h > 55);
  }

  // 判断是否是深色条纹/阴影
  function isDarkStripe(h, s, l) {
    // 橙色调 + 高饱和度 + 低亮度（橘猫的深橘色条纹）
    return h >= 15 && h <= 45 && s > 55 && l < 45;
  }

  // 判断是否是粉色（耳朵、鼻子）
  function isPink(h, s, l) {
    // 红色/品红色调 + 中高饱和度 + 中高亮度
    // 橘猫毛色相约25-45，粉色应更偏红（h < 18 或 h > 340）
    return (h >= 340 || h <= 18) && s > 40 && l > 55 && l < 85;
  }

  // 判断是否是眼睛（黄色系，比橘猫毛更黄、饱和度更高）
  function isEye(h, s, l) {
    // 橘猫毛约 h:20-42，眼睛更偏黄（h:43-65）
    // 高饱和度 + 中等亮度是眼睛的关键特征
    // 注意：范围不能太宽，否则会把身体像素误判为眼睛
    return h >= 42 && h <= 65 && s > 75 && l > 42 && l < 70;
  }

  // 判断是否是轮廓/描边（深色低饱和或红棕色）
  function isOutline(h, s, l) {
    // 深色描边：低亮度 + (低饱和度 或 红橙色调)
    return l < 25 && (s < 40 || (h >= 0 && h <= 20));
  }

  // 程序化重着色
  // 基于橘猫原图，按颜色方案重新着色
  function recolorSprite(sourceImg, schemeId) {
    const scheme = CAT_COLOR_SCHEMES[schemeId];
    if (!scheme || scheme.method === 'original') return sourceImg;

    const canvas = document.createElement('canvas');
    // 支持Image对象或canvas元素作为源
    const srcW = sourceImg.naturalWidth || sourceImg.width;
    const srcH = sourceImg.naturalHeight || sourceImg.height;
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceImg, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 计算猫咪在画布中的边界（不透明区域）
    const bounds = computeCatBounds(data, canvas.width, canvas.height);
    const catW = bounds.maxX - bounds.minX;
    const catH = bounds.maxY - bounds.minY;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // 跳过透明像素
      if (a < 10) continue;

      const hsl = rgbToHsl(r, g, b);
      let newHsl = { h: hsl.h, s: hsl.s, l: hsl.l };
      
      const px = (i / 4) % canvas.width;
      const py = Math.floor((i / 4) / canvas.width);

      if (scheme.method === 'solid') {
        // 纯色猫：整体换色
        newHsl = recolorSolid(hsl, scheme);
      } else if (scheme.method === 'pattern') {
        // 花纹猫：将像素坐标归一化到猫咪身体范围内
        const nx = catW > 0 ? (px - bounds.minX) / catW : 0.5;
        const ny = catH > 0 ? (py - bounds.minY) / catH : 0.5;
        newHsl = recolorPattern(hsl, nx, ny, 1, 1, scheme);
      }

      const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
      data[i] = rgb.r;
      data[i + 1] = rgb.g;
      data[i + 2] = rgb.b;
    }

    ctx.putImageData(imageData, 0, 0);

    // 转为Image对象
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    return newImg;
  }

  // 计算猫咪在画布中的边界（不透明像素的范围）
  function computeCatBounds(data, width, height) {
    let minX = width, maxX = 0, minY = height, maxY = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const a = data[i + 3];
        if (a > 50) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    return { minX, maxX, minY, maxY };
  }

  // 纯色猫重着色 - 大幅压缩条纹对比度，让毛色纯净均匀
  function recolorSolid(hsl, scheme) {
    const { h, s, l } = hsl;
    const texStrength = scheme.textureStrength !== undefined ? scheme.textureStrength : 1.0;

    // 眼睛：特殊处理
    if (isEye(h, s, l)) {
      return scheme.eyeColor || { h: 45, s: 80, l: 50 };
    }

    // 粉色（耳朵内部、鼻子）
    if (isPink(h, s, l)) {
      return scheme.earColor || { h: 0, s: 60, l: 70 };
    }

    // 白色/浅色区域（肚子、爪子）
    if (isWhiteFur(h, s, l)) {
      return scheme.bellyColor || mixHsl(scheme.furColor, { h: 40, s: 10, l: 95 }, 0.6);
    }

    // 轮廓/描边 - 保持深色轮廓线
    if (isOutline(h, s, l)) {
      return {
        h: scheme.furColor.h,
        s: Math.min(scheme.furColor.s + 20, 100),
        l: Math.max(5, scheme.furColor.l * 0.25)
      };
    }

    // 深色条纹 - 适度提亮，保留立体感但不让条纹明显
    if (isDarkStripe(h, s, l)) {
      // 把深条纹亮度提升，只保留轻微阴影感体现立体感
      // 饱和度用目标色的饱和度，不保留原始高饱和
      // 根据纹理强度调整：强度越低，深条纹越接近主色
      const darkDepth = 10 * texStrength;
      return { 
        h: scheme.furColor.h, 
        s: Math.max(2, scheme.furColor.s * (0.9 + 0.1 * texStrength)), 
        l: scheme.furColor.l - darkDepth
      };
    }

    // 普通毛发 - 用目标色为主，原始亮度只提供轻微纹理
    if (s > 10 || (h >= 10 && h <= 60)) {
      // 压缩亮度范围，减少条纹感但保留立体感
      const normalizedL = Math.max(0, Math.min(1, (l - 22) / 55));
      const compressedL = 0.5 + (normalizedL - 0.5) * 0.55;
      // 根据纹理强度调整亮度变化范围
      const lVariation = 22 * texStrength;
      const targetL = scheme.furColor.l + (compressedL - 0.5) * lVariation;
      
      // 饱和度：直接使用目标色的饱和度，只保留轻微变化体现纹理
      // 橘猫原始饱和度很高，但重着色后应该以目标色为准
      const satVariation = (normalizedL - 0.5) * 8 * texStrength; // 微小变化
      const targetS = scheme.furColor.s + satVariation;
      
      return {
        h: scheme.furColor.h,
        s: Math.max(3, Math.min(100, targetS)),
        l: Math.max(8, Math.min(95, targetL))
      };
    }

    // 其他（灰色调的阴影等）
    return {
      h: scheme.furColor.h,
      s: Math.min(80, scheme.furColor.s * 0.5),
      l: Math.max(8, scheme.furColor.l - 15 * texStrength)
    };
  }

  // 花纹猫重着色 - 改进版：压缩条纹对比度，让色块更纯净
  function recolorPattern(hsl, x, y, w, h, scheme) {
    const { h: hue, s, l } = hsl;
    const patternValue = getPatternValue(x, y, w, h, scheme.patternType);
    
    // 对于colorpoint（重点色）模式，用位置+亮度混合决定颜色
    // 位置决定基础重点色分布（脸、耳、爪、尾 = 深色）
    // 亮度提供纹理和明暗变化
    let baseColor;
    if (scheme.patternType === 'colorpoint') {
      // patternValue: 低=重点色区域（脸/耳/爪），高=身体色区域
      // 基于位置的基础分布
      const positionFactor = patternValue;
      
      // 基于亮度的微调：暗的地方更深，亮的地方更浅
      const luminanceFactor = Math.max(0, Math.min(1, (l - 15) / 65));
      
      // 混合：位置为主（70%），亮度提供纹理（30%）
      const combinedFactor = positionFactor * 0.7 + luminanceFactor * 0.3;
      
      baseColor = mixHsl(scheme.secondaryColor, scheme.primaryColor, combinedFactor);
    } else {
      baseColor = getPatternBaseColor(scheme, patternValue);
    }

    // 1. 眼睛：特殊处理（优先级最高）
    if (isEye(hue, s, l)) {
      return scheme.eyeColor || { h: 45, s: 80, l: 50 };
    }

    // 2. 粉色（耳朵内部、鼻子）
    if (isPink(hue, s, l)) {
      return scheme.earColor || { h: 0, s: 60, l: 70 };
    }

    // 3. 白色/浅色区域（肚子、爪子、胸毛）
    if (isWhiteFur(hue, s, l)) {
      // 根据图案决定白色区域颜色
      if (scheme.patternType === 'tuxedo' && patternValue > 0.5) {
        return scheme.secondaryColor; // 白色胸部
      } else if (scheme.patternType === 'calico' && patternValue > 0.6) {
        return scheme.whiteColor;
      } else if (scheme.patternType === 'colorpoint') {
        return scheme.primaryColor; // 重点色的白/浅色区域是奶油色身体
      }
      return scheme.bellyColor || scheme.whiteColor || baseColor;
    }

    // 4. 轮廓/描边 - 用基础色的深色版本
    if (isOutline(hue, s, l)) {
      return {
        h: baseColor.h,
        s: Math.min(baseColor.s + 25, 100),
        l: Math.max(5, baseColor.l * 0.25)
      };
    }

    // 5. 深色条纹/阴影
    if (isDarkStripe(hue, s, l)) {
      if (scheme.patternType === 'tabby') {
        // 狸花猫：保留条纹感，但调整为狸花的棕灰色调
        const stripeFactor = Math.abs(Math.sin(patternValue * Math.PI * 5));
        const stripeColor = mixHsl(scheme.primaryColor, scheme.secondaryColor, 0.4 + stripeFactor * 0.5);
        return {
          h: stripeColor.h,
          s: stripeColor.s,
          l: stripeColor.l - 5
        };
      }
      if (scheme.patternType === 'colorpoint') {
        // 重点色：暗条纹更偏向重点色（更深）
        return mixHsl(baseColor, scheme.secondaryColor, 0.6);
      }
      // 其他花纹猫：把深色条纹提亮，接近基础色，只保留极轻微阴影
      // 饱和度用目标色的，避免橘猫高饱和透出来
      return { 
        h: baseColor.h, 
        s: Math.max(2, baseColor.s * 0.85), 
        l: baseColor.l - 6
      };
    }

    // 6. 普通毛发（橙色系）- 用基础色，压缩亮度变化
    if (isOrangeFur(hue, s, l)) {
      // 压缩亮度范围，减少橘猫条纹感
      const normalizedL = Math.max(0, Math.min(1, (l - 25) / 50));
      
      let finalColor = { ...baseColor };
      let contrastFactor = 0.5; // 对比度压缩因子
      
      if (scheme.patternType === 'tabby') {
        // 狸花猫：叠加虎斑纹效果
        const stripeMix = Math.abs(Math.sin(patternValue * Math.PI * 6));
        finalColor = mixHsl(scheme.primaryColor, scheme.secondaryColor, stripeMix * 0.55);
        contrastFactor = 0.6; // 狸花保留稍多对比度
      } else if (scheme.patternType === 'colorpoint') {
        // 重点色：保留更多亮度变化来体现重点色效果
        contrastFactor = 0.8;
      }
      
      const compressedL = 0.5 + (normalizedL - 0.5) * contrastFactor;
      const targetL = finalColor.l + (compressedL - 0.5) * 20;
      // 饱和度：以目标色为准，只保留微小变化
      // 避免橘猫的高饱和透出来（尤其是黑色、白色区域）
      const satVariation = (normalizedL - 0.5) * 6; // ±3%微小变化
      const targetS = finalColor.s + satVariation;
      
      return {
        h: finalColor.h,
        s: Math.max(3, Math.min(100, targetS)),
        l: Math.max(8, Math.min(95, targetL))
      };
    }

    // 7. 其他像素（灰色调阴影等）- 用基础色调整
    return {
      h: baseColor.h,
      s: Math.max(2, baseColor.s * 0.6),
      l: Math.max(8, baseColor.l - 12)
    };
  }

  // 根据图案值获取基础颜色
  function getPatternBaseColor(scheme, patternValue) {
    switch (scheme.patternType) {
      case 'calico':
        // 三花：黑/橙/白三色斑块，调整阈值让分布更均匀
        if (patternValue < 0.4) {
          return scheme.secondaryColor; // 黑色斑块（约40%）
        } else if (patternValue < 0.7) {
          return scheme.primaryColor;   // 橙色斑块（约30%）
        } else {
          return scheme.whiteColor;     // 白色区域（约30%）
        }
      
      case 'tuxedo':
        // 奶牛猫：黑色身体 + 白色胸部
        if (patternValue > 0.5) {
          return scheme.secondaryColor; // 白色
        }
        return scheme.primaryColor;     // 黑色
      
      case 'tabby':
        // 虎斑：条纹混合
        const stripeMix = Math.abs(Math.sin(patternValue * Math.PI * 5));
        return mixHsl(scheme.primaryColor, scheme.secondaryColor, stripeMix * 0.6);
      
      case 'colorpoint':
        // 重点色：边缘深，中间浅
        if (patternValue < 0.3) {
          return scheme.secondaryColor; // 深色重点
        } else if (patternValue < 0.5) {
          // 过渡区域
          return mixHsl(scheme.secondaryColor, scheme.primaryColor, (patternValue - 0.3) / 0.2);
        }
        return scheme.primaryColor;     // 浅色身体
      
      default:
        return scheme.primaryColor;
    }
  }

  // 计算图案值（0-1），用于决定花纹位置
  function getPatternValue(x, y, w, h, patternType) {
    const nx = x / w;  // 归一化x 0-1
    const ny = y / h;  // 归一化y 0-1

    switch (patternType) {
      case 'calico':
        // 三花猫：额头橙色斑块+黑耳朵+白脸+身体两侧小斑块+尾巴橙黑环
        // 基于位置直接判断，精确模拟参考图分布
        // 返回值：0-0.4黑色, 0.4-0.7橙色, 0.7-1白色
        
        // 基础：白色（脸部、胸部、肚子、爪子）
        let calicoValue = 0.85; // 默认白色
        
        // === 头部区域 ===
        // 注意：后绘制的会覆盖先绘制的
        
        // 1. 左眼周围橙色区域（左脸颊，眼睛周围，大面积）
        const leftEyeOrangeDx = (nx - 0.28) / 0.18;
        const leftEyeOrangeDy = (ny - 0.26) / 0.14;
        const leftEyeOrangeDist = Math.sqrt(leftEyeOrangeDx * leftEyeOrangeDx + leftEyeOrangeDy * leftEyeOrangeDy);
        if (leftEyeOrangeDist < 1) {
          calicoValue = 0.55; // 橙色
        }
        
        // 2. 右眼周围黑色区域（右脸颊，眼睛周围，大面积）
        const rightEyeBlackDx = (nx - 0.72) / 0.18;
        const rightEyeBlackDy = (ny - 0.26) / 0.14;
        const rightEyeBlackDist = Math.sqrt(rightEyeBlackDx * rightEyeBlackDx + rightEyeBlackDy * rightEyeBlackDy);
        if (rightEyeBlackDist < 1) {
          calicoValue = 0.2; // 黑色
        }
        
        // 3. 额头中央橙色大斑块（从头顶延伸到鼻梁两眼之间）
        // 形状：上宽下窄，覆盖头顶中央和额头
        const foreheadDx = (nx - 0.5) / 0.2;
        const foreheadDy = (ny - 0.13) / 0.11;
        const foreheadDist = Math.sqrt(foreheadDx * foreheadDx + foreheadDy * foreheadDy);
        if (foreheadDist < 1) {
          calicoValue = 0.55; // 橙色
        }
        
        // 4. 额头橙色向下延伸到鼻梁（两眼之间，收窄）
        const noseBridgeDx = (nx - 0.5) / 0.09;
        const noseBridgeDy = (ny - 0.25) / 0.07;
        const noseBridgeDist = Math.sqrt(noseBridgeDx * noseBridgeDx + noseBridgeDy * noseBridgeDy);
        if (noseBridgeDist < 1 && ny < 0.3) {
          calicoValue = 0.55; // 橙色
        }
        
        // 5. 左耳黑色（最后画，确保耳朵是黑色，覆盖额头橙色）
        const leftEarDx = (nx - 0.2) / 0.09;
        const leftEarDy = (ny - 0.09) / 0.08;
        const leftEarDist = Math.sqrt(leftEarDx * leftEarDx + leftEarDy * leftEarDy);
        if (leftEarDist < 1) {
          calicoValue = 0.2; // 黑色
        }
        
        // 6. 右耳黑色（最后画，确保耳朵是黑色）
        const rightEarDx = (nx - 0.8) / 0.09;
        const rightEarDy = (ny - 0.09) / 0.08;
        const rightEarDist = Math.sqrt(rightEarDx * rightEarDx + rightEarDy * rightEarDy);
        if (rightEarDist < 1) {
          calicoValue = 0.2; // 黑色
        }
        
        // 脸部白色区域（眼睛以下、口鼻部分）— 保持白色（基础色已白）
        // 只需要确保脸部中间不被身体色块覆盖
        
        // === 身体区域 ===
        
        // 左肩/背部橙色斑块
        const shoulderOrangeDx = (nx - 0.2) / 0.1;
        const shoulderOrangeDy = (ny - 0.5) / 0.12;
        const shoulderOrangeDist = Math.sqrt(shoulderOrangeDx * shoulderOrangeDx + shoulderOrangeDy * shoulderOrangeDy);
        if (shoulderOrangeDist < 1) {
          calicoValue = 0.55; // 橙色
        }
        
        // 左肩黑色小斑块
        const shoulderBlackDx = (nx - 0.15) / 0.06;
        const shoulderBlackDy = (ny - 0.58) / 0.08;
        const shoulderBlackDist = Math.sqrt(shoulderBlackDx * shoulderBlackDx + shoulderBlackDy * shoulderBlackDy);
        if (shoulderBlackDist < 1) {
          calicoValue = 0.2; // 黑色
        }
        
        // 右肩/背部黑色斑块
        const rightShoulderBlackDx = (nx - 0.8) / 0.1;
        const rightShoulderBlackDy = (ny - 0.5) / 0.12;
        const rightShoulderBlackDist = Math.sqrt(rightShoulderBlackDx * rightShoulderBlackDx + rightShoulderBlackDy * rightShoulderBlackDy);
        if (rightShoulderBlackDist < 1) {
          calicoValue = 0.2; // 黑色
        }
        
        // 右肩橙色小斑块
        const rightShoulderOrangeDx = (nx - 0.85) / 0.06;
        const rightShoulderOrangeDy = (ny - 0.58) / 0.08;
        const rightShoulderOrangeDist = Math.sqrt(rightShoulderOrangeDx * rightShoulderOrangeDx + rightShoulderOrangeDy * rightShoulderOrangeDy);
        if (rightShoulderOrangeDist < 1) {
          calicoValue = 0.55; // 橙色
        }
        
        // 左前腿橙色斑块
        const leftLegOrangeDx = (nx - 0.25) / 0.07;
        const leftLegOrangeDy = (ny - 0.7) / 0.1;
        const leftLegOrangeDist = Math.sqrt(leftLegOrangeDx * leftLegOrangeDx + leftLegOrangeDy * leftLegOrangeDy);
        if (leftLegOrangeDist < 1) {
          calicoValue = 0.55; // 橙色
        }
        
        // 左前腿黑色斑块
        const leftLegBlackDx = (nx - 0.2) / 0.05;
        const leftLegBlackDy = (ny - 0.78) / 0.06;
        const leftLegBlackDist = Math.sqrt(leftLegBlackDx * leftLegBlackDx + leftLegBlackDy * leftLegBlackDy);
        if (leftLegBlackDist < 1) {
          calicoValue = 0.2; // 黑色
        }
        
        // 右前腿黑色斑块
        const rightLegBlackDx = (nx - 0.75) / 0.07;
        const rightLegBlackDy = (ny - 0.7) / 0.1;
        const rightLegBlackDist = Math.sqrt(rightLegBlackDx * rightLegBlackDx + rightLegBlackDy * rightLegBlackDy);
        if (rightLegBlackDist < 1) {
          calicoValue = 0.2; // 黑色
        }
        
        // 右前腿橙色斑块
        const rightLegOrangeDx = (nx - 0.8) / 0.05;
        const rightLegOrangeDy = (ny - 0.78) / 0.06;
        const rightLegOrangeDist = Math.sqrt(rightLegOrangeDx * rightLegOrangeDx + rightLegOrangeDy * rightLegOrangeDy);
        if (rightLegOrangeDist < 1) {
          calicoValue = 0.55; // 橙色
        }
        
        // === 尾巴 ===
        // 尾巴：橙黑相间的环状条纹
        if (nx > 0.72 && ny > 0.5) {
          const tailDx = nx - 0.72;
          const tailDy = ny - 0.5;
          const tailDist = Math.sqrt(tailDx * tailDx + tailDy * tailDy);
          if (tailDist < 0.3 && tailDist > 0.02) {
            // 环状条纹
            const stripe = Math.sin(tailDist * 25);
            calicoValue = stripe > 0 ? 0.55 : 0.2;
          }
        }
        
        // 胸部/肚子白色（大面积，确保中间是白的）
        const bellyDx = (nx - 0.5) / 0.3;
        const bellyDy = (ny - 0.68) / 0.25;
        const bellyDist = Math.sqrt(bellyDx * bellyDx + bellyDy * bellyDy);
        if (bellyDist < 1) {
          if (calicoValue > 0.7) {
            calicoValue = 0.9;
          }
        }
        
        // 爪子白色
        if (ny > 0.88) {
          calicoValue = 0.85;
        }
        
        return calicoValue;

      case 'tuxedo':
        // 奶牛猫（燕尾服）：黑头+白脸+黑身+白胸+白爪+黑尾白尖
        // 基于位置直接判断，匹配 cat_tuxedo.png 原图分布
        // 返回值：<0.5黑色, >0.5白色
        
        // 基础：黑色（头、身体、尾巴大部分都是黑的）
        let tuxValue = 0.2; // 默认黑色
        
        // === 脸部白色区域 ===
        // 形状：从额头中央向下延伸，到脸颊变宽，覆盖口鼻
        // 整体像一个倒置的水滴或T字形
        
        // 脸部白色主体（椭圆形，覆盖眼睛以下到嘴部的大面积）
        const tuxFaceDx = (nx - 0.5) / 0.32;
        const tuxFaceDy = (ny - 0.38) / 0.28;
        const tuxFaceDist = Math.sqrt(tuxFaceDx * tuxFaceDx + tuxFaceDy * tuxFaceDy);
        if (tuxFaceDist < 1) {
          tuxValue = 0.8; // 白色
        }
        
        // 鼻梁白色（从额头向下延伸的窄条，连接额头和脸部白色）
        const tuxNoseDx = (nx - 0.5) / 0.1;
        const tuxNoseDy = (ny - 0.22) / 0.12;
        const tuxNoseDist = Math.sqrt(tuxNoseDx * tuxNoseDx + tuxNoseDy * tuxNoseDy);
        if (tuxNoseDist < 1 && ny < 0.3) {
          tuxValue = 0.8; // 白色
        }
        
        // === 胸部/肚子白色 ===
        // 从脖子向下延伸到肚子的大面积白色
        const tuxChestDx = (nx - 0.5) / 0.32;
        const tuxChestDy = (ny - 0.7) / 0.28;
        const tuxChestDist = Math.sqrt(tuxChestDx * tuxChestDx + tuxChestDy * tuxChestDy);
        if (tuxChestDist < 1) {
          tuxValue = 0.8; // 白色
        }
        
        // 脖子白色（连接脸部白色和胸部白色）
        if (ny > 0.48 && ny < 0.6 && nx > 0.3 && nx < 0.7) {
          tuxValue = 0.8; // 白色
        }
        
        // === 爪子白色 ===
        
        // 左前爪白色
        if (nx > 0.18 && nx < 0.32 && ny > 0.82) {
          tuxValue = 0.8;
        }
        
        // 右前爪白色
        if (nx > 0.68 && nx < 0.82 && ny > 0.82) {
          tuxValue = 0.8;
        }
        
        // 中间/后腿白色
        if (nx > 0.4 && nx < 0.6 && ny > 0.85) {
          tuxValue = 0.8;
        }
        
        // === 尾巴 ===
        // 尾巴大部分黑色，尾尖白色
        if (nx > 0.88 && ny > 0.78) {
          tuxValue = 0.8; // 尾尖白色
        }
        
        return tuxValue;

      case 'tabby':
        // 虎斑：条纹 + 一些波浪
        const baseStripe = Math.sin(nx * 16 + ny * 3 + 1) * 0.5 + 0.5;
        const waveStripe = Math.sin(ny * 12 + nx * 4 + 2) * 0.3 + 0.5;
        const detail = Math.sin(nx * 30 + ny * 20) * 0.1 + 0.5;
        return (baseStripe * 0.6 + waveStripe * 0.3 + detail * 0.1);

      case 'colorpoint':
        // 重点色（布偶猫）：基于位置的重点色分布
        // patternValue 低 = 重点色（深色），高 = 身体色（浅色）
        // 脸部、耳朵、爪子、尾巴 = 重点色区域（低值）
        // 身体、肚子 = 身体色区域（高值）
        
        const faceArea = ny < 0.4 ? Math.max(0, 1 - Math.abs(nx - 0.5) / 0.4) : 0;
        const earArea = ny < 0.18 ? Math.max(1 - Math.abs(nx - 0.22) / 0.18, 1 - Math.abs(nx - 0.78) / 0.18) : 0;
        const pawArea = ny > 0.82 ? Math.max(1 - Math.abs(nx - 0.28) / 0.22, 1 - Math.abs(nx - 0.72) / 0.22) : 0;
        const tailArea = nx > 0.82 ? (ny > 0.25 && ny < 0.75 ? 1 : 0.4) : 0;
        
        // pointStrength: 重点色区域强度（越高越偏重点色）
        const pointStrength = Math.max(faceArea * 0.9, earArea, pawArea * 0.85, tailArea * 0.7);
        
        // 转换为pattern值：重点色区域 = 低值（深色），身体区域 = 高值（浅色）
        // 使用更陡的曲线，让重点色和身体色对比更明显
        const adjustedStrength = Math.pow(pointStrength, 0.7); // 曲线调整，扩大重点区域
        return 0.1 + (1 - adjustedStrength) * 0.9;

      default:
        return 0.5;
    }
  }

  // 图片缓存 { catId: { idle: img, walk_1: img, ... } }
  const spriteCache = {};
  // 重着色专用源图缓存（像素风png，颜色分明，确保重着色准确）
  const recolorBaseCache = {};
  let spritesLoaded = false;
  let baseSpritesLoaded = false; // 橘猫展示图是否加载完成
  let recolorBaseLoaded = false; // 重着色源图是否加载完成

  // 加载所有精灵图
  // 极速首屏策略：橘猫idle加载完立即回调（不去白底），其他所有内容后台渐进加载
  function loadSprites(callback) {
    if (spritesLoaded) {
      if (callback) callback();
      return;
    }

    const orangeConfig = CAT_SPRITES.orange;
    const orangeExt = orangeConfig.ext || 'png';
    
    // 预先为所有猫创建缓存对象（确保静态图加载时能写入）
    initAllCatCacheObjects();

    // ===== 第一阶段：极速首屏（只加载橘猫idle，不去白底） =====
    // 同时并行加载所有猫的静态idle图（图鉴和预览用，非常重要）
    loadStaticIdleSprites();
    
    const idleImg = new Image();
    idleImg.crossOrigin = 'anonymous';
    idleImg.onload = () => {
      // 首屏先不去白底，直接显示（快！）
      spriteCache.orange.idle = idleImg;
      spritesLoaded = true;
      baseSpritesLoaded = true;
      
      // 立即回调，页面先跑起来
      if (callback) callback();
      
      // 后台渐进加载后续内容
      startProgressiveLoading();
    };
    idleImg.onerror = () => {
      spriteCache.orange.idle = createPlaceholderImage();
      spritesLoaded = true;
      baseSpritesLoaded = true;
      if (callback) callback();
      startProgressiveLoading();
    };
    let idlePath = orangeConfig.basePath + 'idle.' + orangeExt;
    idleImg.src = verUrl(idlePath);
    
    // ===== 渐进加载流程 =====
    function startProgressiveLoading() {
      // 阶段2: 橘猫idle去白底 + 走路帧加载 + 所有独立动作帧提前加载
      setTimeout(() => {
        // 1. idle 去白底（替换当前显示的图）
        if (orangeConfig.removeWhiteBg && spriteCache.orange.idle === idleImg) {
          const shrunk = shrinkImageIfNeeded(idleImg, 256);
          const processed = removeWhiteBackground(shrunk);
          spriteCache.orange.idle = processed;
        }
        
        // 2. 加载走路6帧（橘猫动起来需要）
        loadOrangeWalkFrames();
        
        // 3. 提前加载所有有独立帧的猫的自定义动作帧（不等重着色源图，并行更快）
        // 这样用户点稀有猫的动作时，能更快看到效果
        loadCustomActionFrames();
      }, 0);
      
      // 阶段3: 重着色源图 + 其他猫重着色（延迟一点，让走路帧先加载）
      setTimeout(() => {
        loadRecolorBaseImages(() => {
          // 给其他猫的关键帧设置兜底
          initOtherCatKeyFrames();
          // 开始重着色
          generateRecoloredSpritesAsync();
        });
      }, 100);
      
      // 阶段4: 橘猫其他动作帧（最不急，后台慢慢加载）
      setTimeout(() => {
        loadOrangeExtraFrames();
      }, 500);
    }
    
    // 加载橘猫走路帧
    function loadOrangeWalkFrames() {
      const walkFrames = WALK_FRAMES;
      let loaded = 0;
      
      walkFrames.forEach(frameName => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const shrunk = shrinkImageIfNeeded(img, 256);
          if (orangeConfig.removeWhiteBg) {
            spriteCache.orange[frameName] = removeWhiteBackground(shrunk);
          } else {
            spriteCache.orange[frameName] = shrunk;
          }
          loaded++;
        };
        img.onerror = () => {
          // 走路帧缺失用 walk_1 兜底
          if (spriteCache.orange.walk_1 && frameName !== 'walk_1') {
            spriteCache.orange[frameName] = spriteCache.orange.walk_1;
          }
          loaded++;
        };
        const path = orangeConfig.walkPath
          ? orangeConfig.walkPath + frameName + '.' + orangeExt
          : orangeConfig.basePath + frameName + '.' + orangeExt;
        img.src = verUrl(path);
      });
    }
    
    // 加载橘猫其他动作帧（从 actionPath 加载独立文件，加载失败再用fallback兜底）
    function loadOrangeExtraFrames() {
      const keyFrames = new Set(['idle', ...WALK_FRAMES]);
      const extraFrames = ACTION_FRAMES.filter(f => !keyFrames.has(f));
      
      // 先设置初始fallback兜底（保证有图可用）
      function applyFallbacks() {
        extraFrames.forEach(frameName => {
          if (spriteCache.orange[frameName]) return; // 已经加载成功的跳过
          const fallback = FRAME_FALLBACK[frameName] || 'idle';
          if (spriteCache.orange[fallback]) {
            spriteCache.orange[frameName] = spriteCache.orange[fallback];
          }
        });
      }
      
      // 从 actionPath 实际加载动作帧文件
      extraFrames.forEach(frameName => {
        const frameExt = orangeConfig.actionPath
          ? ORANGE_EXTRA_FRAME_EXT[frameName]
          : orangeExt;
        if (!frameExt) return; // 当前交接包没有独立帧，稍后由兜底逻辑补齐

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const shrunk = shrinkImageIfNeeded(img, 256);
          if (orangeConfig.removeWhiteBg) {
            spriteCache.orange[frameName] = removeWhiteBackground(shrunk);
          } else {
            spriteCache.orange[frameName] = shrunk;
          }
        };
        img.onerror = () => {
          // 加载失败用fallback兜底
          const fallback = FRAME_FALLBACK[frameName] || 'idle';
          if (spriteCache.orange[fallback]) {
            spriteCache.orange[frameName] = spriteCache.orange[fallback];
          }
        };
        img.src = verUrl(orangeConfig.basePath + frameName + '.' + frameExt);
      });
      
      // 3秒后如果还有没加载好的，用fallback补上
      setTimeout(applyFallbacks, 3000);
    }
    
    // 加载重着色专用源图
    function loadRecolorBaseImages(onDone) {
      // 重着色源图用橘猫像素风图（所有重着色猫都会变成像素风）
      const walkBasePath = 'cats/orange_pixel_walk/';
      const actionBasePath = 'cats/orange_pixel_actions/';
      const idleBasePath = 'cats/orange_unified/';
      const actionFrames = ['sleep', 'eat', 'play', 'groom', 'stretch'];
      
      let loaded = 0;
      const total = RECOLOR_FRAMES.length;
      
      function checkDone() {
        loaded++;
        if (loaded >= total) {
          recolorBaseLoaded = true;
          if (onDone) onDone();
        }
      }
      
      RECOLOR_FRAMES.forEach(frameName => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // 缩小到160px，再去白底（canvas操作完全同步，避免异步加载竞态）
          // 像素风图边缘清晰，适中尺寸兼顾锐利度和细节
          const shrunk = shrinkImageSync(img, 160);
          recolorBaseCache[frameName] = removeWhiteBgFromCanvas(shrunk);
          checkDone();
        };
        img.onerror = () => {
          const fallbackFrame = frameName.startsWith('walk') ? 'walk_1' : 'idle';
          if (fallbackFrame !== frameName && recolorBaseCache[fallbackFrame]) {
            recolorBaseCache[frameName] = recolorBaseCache[fallbackFrame];
          } else {
            recolorBaseCache[frameName] = createPlaceholderImage();
          }
          checkDone();
        };
        
        // 不同帧从不同目录加载
        if (frameName === 'idle') {
          img.src = verUrl(idleBasePath + 'idle.jpg');
        } else if (frameName.startsWith('walk')) {
          img.src = verUrl(walkBasePath + frameName + '.jpg');
        } else {
          img.src = verUrl(actionBasePath + frameName + '.jpg');
        }
      });
    }
  }
  
  // 缩小图片（同步，返回canvas，避免Image异步加载问题）
  function shrinkImageSync(img, maxSize) {
    const canvas = document.createElement('canvas');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const ratio = Math.min(maxSize / w, maxSize / h);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // 像素风保持锐利
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  
  // 从canvas上去除白底（同步修改canvas数据，直接返回canvas）
  function removeWhiteBgFromCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // 接近白色的像素（RGB都大于240）设为透明
      if (r > 240 && g > 240 && b > 240) {
        data[i + 3] = 0;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  // 缩小图片（加速重着色处理）
  function shrinkImage(img, maxSize) {
    if (img.naturalWidth <= maxSize && img.naturalHeight <= maxSize) {
      return img; // 已经很小了，不用缩
    }
    const canvas = document.createElement('canvas');
    const ratio = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight);
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // 像素风保持锐利
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = new Image();
    result.src = canvas.toDataURL();
    return result;
  }
  
  // 预先为所有猫创建缓存对象（空壳，确保静态图加载时能写入）
  function initAllCatCacheObjects() {
    const catIds = Object.keys(CAT_SPRITES);
    catIds.forEach(catId => {
      if (!spriteCache[catId]) {
        spriteCache[catId] = {};
      }
    });
  }
  
  // 初始化其他猫的关键帧兜底（重着色源图加载后调用）
  function initOtherCatKeyFrames() {
    const catIds = Object.keys(CAT_SPRITES).filter(id => CAT_SPRITES[id].recolor);
    catIds.forEach(catId => {
      if (spriteCache[catId]) {
        const config = CAT_SPRITES[catId];
        
        // 有独立idle图的猫（稀有品种+黑猫），不用橘猫兜底
        // 缺失的帧由drawCat自动回退到该猫自己的idle帧，避免显示橘猫
        if (config.idlePath) {
          return;
        }
        
        // 兜底图用橘猫idle（后续重着色完成后会被替换成正确颜色）
        const fallbackImg = spriteCache.orange.idle;
        
        // idle帧也设置兜底（防止预览/图鉴/市场页面显示占位圆圈）
        if (!spriteCache[catId].idle) {
          spriteCache[catId].idle = fallbackImg;
        }
        
        // 关键帧先用兜底图，重着色后会被替换
        RECOLOR_FRAMES.forEach(frameName => {
          if (!spriteCache[catId][frameName]) {
            spriteCache[catId][frameName] = fallbackImg;
          }
        });
        // 非关键帧也用兜底图（颜色正确，只是姿势是坐姿）
        for (const frame in FRAME_FALLBACK) {
          if (!spriteCache[catId][frame]) {
            spriteCache[catId][frame] = fallbackImg;
          }
        }
      }
    });
  }

  // 去除白色背景（将接近白色的像素变为透明）
  // 直接返回 canvas，避免 Image 异步加载导致的宽度为0问题
  function removeWhiteBackground(img) {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    
    if (w <= 0 || h <= 0) {
      console.warn('removeWhiteBackground: invalid image size', w, h, img.src);
      return img;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    try {
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      // 0. 检查是否已经是透明背景（四角有透明像素），如果是就直接返回
      let transparentCorners = 0;
      const corners = [
        { x: 2, y: 2 },
        { x: w - 3, y: 2 },
        { x: 2, y: h - 3 },
        { x: w - 3, y: h - 3 }
      ];
      corners.forEach(c => {
        const idx = (c.y * w + c.x) * 4;
        if (data[idx + 3] < 128) transparentCorners++;
      });
      if (transparentCorners >= 2) return img;
      
      // 1. 采样四角的颜色，确定背景色
      let bgR = 0, bgG = 0, bgB = 0;
      corners.forEach(c => {
        const idx = (c.y * w + c.x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
      });
      bgR = Math.round(bgR / 4);
      bgG = Math.round(bgG / 4);
      bgB = Math.round(bgB / 4);
      
      // 2. 生成粗略前景mask：用色差阈值分离前景和背景
      // 阈值根据中心平均色差动态调整：
      // - 深色猫：阈值低（因为猫和背景色差大，低阈值就能分开）
      // - 浅色猫：阈值高（因为猫和背景色差小，需要更高阈值才能把背景排除）
      const fgMask = new Uint8Array(w * h);
      
      // 先计算所有像素的色差（存起来后面用）
      const distMap = new Float32Array(w * h);
      
      // 同时采样中心区域的平均色差，用来判断是深色猫还是浅色猫
      let centerSampleCount = 0;
      let centerAvgDist = 0;
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const sampleRadius = Math.min(w, h) * 0.2; // 扩大采样范围
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const pixelIdx = idx * 4;
          const r = data[pixelIdx];
          const g = data[pixelIdx + 1];
          const b = data[pixelIdx + 2];
          
          const dr = r - bgR;
          const dg = g - bgG;
          const db = b - bgB;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          distMap[idx] = dist;
          
          // 中心区域采样，计算平均色差（用于判断猫的深浅）
          // 所有中心像素都采样，包括色差小的，这样浅色猫也能正确计算
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy < sampleRadius * sampleRadius) {
            centerAvgDist += dist;
            centerSampleCount++;
          }
        }
      }
      
      // 计算中心区域平均色差
      if (centerSampleCount > 0) {
        centerAvgDist /= centerSampleCount;
      }
      
      // 根据中心平均色差动态决定tightTolerance
      // 浅色猫（如狮子猫）：背景和猫毛色差都小，需要更高阈值才能把背景排除
      // 深色猫：猫和背景色差大，低阈值就能很好地分离
      let tightTolerance;
      if (centerAvgDist < 15) {
        tightTolerance = 12; // 极浅猫：高阈值，排除大部分背景
      } else if (centerAvgDist < 30) {
        tightTolerance = 10; // 浅色猫：中高阈值
      } else if (centerAvgDist < 60) {
        tightTolerance = 7;  // 中等颜色：中等阈值
      } else {
        tightTolerance = 5;  // 深色猫：低阈值，保留更多毛边
      }
      
      // 生成fgMask
      for (let i = 0; i < w * h; i++) {
        if (distMap[i] > tightTolerance) {
          fgMask[i] = 1;
        }
      }
      
      // 根据中心区域平均色差决定膨胀次数
      // 深色猫（色差大）：少膨胀，避免把白背景扩进来
      // 浅色猫（色差小）：多膨胀，保护毛发边缘不被切掉
      let dilatePasses = 3;
      if (centerAvgDist < 20) {
        dilatePasses = 10; // 极浅猫（如狮子猫）：大幅膨胀保护白毛
      } else if (centerAvgDist < 40) {
        dilatePasses = 6; // 浅色猫：多膨胀保护毛边
      } else if (centerAvgDist < 70) {
        dilatePasses = 4; // 中等颜色：适中膨胀
      } else {
        dilatePasses = 2; // 深色猫：少膨胀避免白边
      }
      
      // 3. 从图像中心做洪水填充，找到和中心连通的前景区域（就是猫的主体）
      // 这样可以把"误被判为前景的背景噪点"和"真正的猫"分开
      const connectedFg = new Uint8Array(w * h);
      const queue = [];
      
      // 在中心区域找一个前景像素作为种子（多试几个点，确保找到猫）
      const seedPoints = [
        { x: Math.floor(w / 2), y: Math.floor(h / 2) },
        { x: Math.floor(w / 2), y: Math.floor(h * 0.4) },
        { x: Math.floor(w / 2), y: Math.floor(h * 0.6) },
        { x: Math.floor(w * 0.4), y: Math.floor(h / 2) },
        { x: Math.floor(w * 0.6), y: Math.floor(h / 2) },
        { x: Math.floor(w * 0.35), y: Math.floor(h * 0.35) },
        { x: Math.floor(w * 0.65), y: Math.floor(h * 0.65) },
        { x: Math.floor(w * 0.35), y: Math.floor(h * 0.65) },
        { x: Math.floor(w * 0.65), y: Math.floor(h * 0.35) }
      ];
      
      let foundSeed = false;
      
      // 先用当前fgMask找种子点
      for (let s = 0; s < seedPoints.length; s++) {
        const sx = seedPoints[s].x;
        const sy = seedPoints[s].y;
        const sIdx = sy * w + sx;
        if (fgMask[sIdx] === 1) {
          queue.push(sx, sy);
          connectedFg[sIdx] = 1;
          foundSeed = true;
          break;
        }
      }
      
      // 如果没找到种子点（浅色猫导致中心色差太小），逐步降低阈值重建fgMask
      if (!foundSeed) {
        const lowerThresholds = [2.5, 2, 1.5, 1, 0.5];
        for (let t = 0; t < lowerThresholds.length; t++) {
          const thresh = lowerThresholds[t];
          // 重建fgMask
          for (let i = 0; i < w * h; i++) {
            fgMask[i] = distMap[i] > thresh ? 1 : 0;
          }
          // 重新找种子点
          for (let s = 0; s < seedPoints.length; s++) {
            const sx = seedPoints[s].x;
            const sy = seedPoints[s].y;
            const sIdx = sy * w + sx;
            if (fgMask[sIdx] === 1) {
              queue.push(sx, sy);
              connectedFg[sIdx] = 1;
              foundSeed = true;
              break;
            }
          }
          if (foundSeed) break;
        }
      }
      
      // 如果中心区域没找到前景（可能整图都是浅色）， fallback 到从边缘去背景的老方法
      if (!foundSeed) {
        const visited = new Uint8Array(w * h);
        const oldQueue = [];
        for (let x = 0; x < w; x++) {
          oldQueue.push(x, 0);
          oldQueue.push(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
          oldQueue.push(0, y);
          oldQueue.push(w - 1, y);
        }
        const oldTolerance = 30;
        while (oldQueue.length > 0) {
          const y = oldQueue.pop();
          const x = oldQueue.pop();
          const idx = y * w + x;
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          if (visited[idx]) continue;
          const pixelIdx = idx * 4;
          const r = data[pixelIdx];
          const g = data[pixelIdx + 1];
          const b = data[pixelIdx + 2];
          const dr = r - bgR;
          const dg = g - bgG;
          const db = b - bgB;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist > oldTolerance) continue;
          visited[idx] = 1;
          data[pixelIdx + 3] = 0;
          oldQueue.push(x + 1, y);
          oldQueue.push(x - 1, y);
          oldQueue.push(x, y + 1);
          oldQueue.push(x, y - 1);
        }
      } else {
        // 中心连通前景提取：在fgMask里扩散，找到完整的猫
        while (queue.length > 0) {
          const y = queue.pop();
          const x = queue.pop();
          
          // 四方向扩散，只在fgMask为1的区域里扩散
          const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
          for (let n = 0; n < 4; n++) {
            const nx = x + neighbors[n][0];
            const ny = y + neighbors[n][1];
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            
            const nIdx = ny * w + nx;
            if (connectedFg[nIdx]) continue;
            if (fgMask[nIdx] !== 1) continue;
            
            connectedFg[nIdx] = 1;
            queue.push(nx, ny);
          }
        }
        
        // 4. 形态学膨胀：把连通前景往外扩2像素，把猫毛边缘也包含进来
        // （因为fgMask用了严格阈值，猫毛边缘可能没被包含，需要往外扩一点）
        for (let pass = 0; pass < dilatePasses; pass++) {
          const dilated = new Uint8Array(connectedFg);
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = y * w + x;
              if (connectedFg[idx]) continue;
              // 只要4邻域有一个是前景，就把当前像素也设为前景
              if (connectedFg[(y) * w + (x-1)] ||
                  connectedFg[(y) * w + (x+1)] ||
                  connectedFg[(y-1) * w + (x)] ||
                  connectedFg[(y+1) * w + (x)]) {
                dilated[idx] = 1;
              }
            }
          }
          // 把膨胀后新加入的像素也加入连通前景（通过8邻域检查确保连上）
          for (let i = 0; i < w * h; i++) {
            if (dilated[i]) connectedFg[i] = 1;
          }
        }
        
        // 5. 应用alpha：连通前景内的保留，外部的设为透明
        for (let i = 0; i < w * h; i++) {
          if (connectedFg[i] === 0) {
            data[i * 4 + 3] = 0;
          }
        }
        
        // 6. 边缘羽化：在前景边界处做渐变柔化，同时根据与背景色的色差调整透明度
        // （越接近背景色的边缘像素越透明，消除JPG压缩导致的白边）
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const pixelIdx = idx * 4;
            if (data[pixelIdx + 3] === 0) continue; // 完全透明的跳过
            
            // 计算周围有多少透明像素（3x3范围）
            let transparentCount = 0;
            let totalNeighbors = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                totalNeighbors++;
                if (data[(ny * w + nx) * 4 + 3] === 0) {
                  transparentCount++;
                }
              }
            }
            
            if (transparentCount > 0) {
              // 基础羽化：周围透明像素越多越透明
              const neighborRatio = transparentCount / totalNeighbors;
              
              // 色差辅助：边缘像素与背景色越接近，越透明
              // （消除JPG压缩导致的边缘灰白色像素残留）
              const r = data[pixelIdx];
              const g = data[pixelIdx + 1];
              const b = data[pixelIdx + 2];
              const colorDist = Math.sqrt(
                (r - bgR) * (r - bgR) +
                (g - bgG) * (g - bgG) +
                (b - bgB) * (b - bgB)
              );
              // 动态阈值：根据猫的深浅自动调整
              // 深色猫：阈值高（需要色差大才认为是猫），避免白边
              // 浅色猫：阈值低（色差小也认为是猫），保护白毛
              // 用中心平均色差的60%作为"完全不透明"的门槛，最低12
              const colorThreshold = Math.max(12, centerAvgDist * 0.6);
              // 色差为0 → alpha乘0，达到阈值 → alpha乘1
              const colorFactor = Math.min(colorDist / colorThreshold, 1);
              
              // 综合两个因素：浅色猫减少邻域羽化的影响，保护毛边
              const featherStrength = centerAvgDist < 25 ? 0.35 : 0.6;
              const alphaMultiplier = colorFactor * (1 - neighborRatio * featherStrength);
              data[pixelIdx + 3] = Math.round(data[pixelIdx + 3] * Math.max(alphaMultiplier, 0));
            }
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    } catch (e) {
      console.warn('removeWhiteBackground failed:', e);
      return img;
    }
  }

  // 创建占位图
  function createPlaceholderImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5A623';
    ctx.beginPath();
    ctx.arc(50, 50, 40, 0, Math.PI * 2);
    ctx.fill();
    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  }

  // 加载每只猫的原版静态idle图（完美还原外观）
  function loadStaticIdleSprites() {
    const catIds = Object.keys(CAT_SPRITES);
    catIds.forEach(catId => {
      const config = CAT_SPRITES[catId];
      const ext = config.ext || 'png';
      
      const img = new Image();
      img.onload = () => {
        if (spriteCache[catId]) {
          // 先缩小大图再处理
          const shrunk = shrinkImageIfNeeded(img, 256);
          // 去白底（如果配置了的话）
          if (config.removeWhiteBg) {
            try {
              spriteCache[catId].idle = removeWhiteBackground(shrunk);
            } catch (e) {
              spriteCache[catId].idle = shrunk;
            }
          } else {
            spriteCache[catId].idle = shrunk;
          }
        }
      };
      img.onerror = () => {
        console.warn(`Failed to load static idle for ${catId}`);
      };
      
      // 如果配置了idlePath就用，否则走默认路径 cats/cat_品种.png
      if (config.idlePath) {
        img.src = verUrl(config.idlePath);
      } else {
        img.src = verUrl('cats/cat_' + catId + '.' + ext);
      }
    });
  }

  // 异步生成所有重着色猫咪的精灵图（只处理关键帧，批量处理不阻塞UI）
  let recoloringComplete = false;
  function generateRecoloredSpritesAsync() {
    const catIds = Object.keys(CAT_SPRITES).filter(id => CAT_SPRITES[id].recolor);
    const frames = RECOLOR_FRAMES;
    
    // 构建重着色任务列表（有独立帧的猫，对应帧跳过重着色）
    const actionFrames = ['sleep', 'eat', 'play', 'groom', 'stretch'];
    const tasks = [];
    catIds.forEach(catId => {
      const config = CAT_SPRITES[catId];
      // 有独立idlePath但没有独立walkPath和actionPath的猫
      // 说明只有单张idle图，默认全部帧用idle兜底，不做重着色
      // （避免重着色的走路/动作帧花纹和idle对不上，导致画面崩）
      // 但如果配置了 recolorAllFrames: true，则仍然重着色非idle帧
      if (config.idlePath && !config.walkPath && !config.actionPath && !config.recolorAllFrames) return;
      
      frames.forEach(frameName => {
        // 有独立idlePath的猫，idle帧不重着色（用自己的原图）
        if (config.idlePath && frameName === 'idle') return;
        // 有独立walkPath的猫，走路帧不重着色
        if (config.walkPath && frameName.startsWith('walk')) return;
        // 有独立actionPath的猫，动作帧不重着色
        if (config.actionPath && actionFrames.includes(frameName)) return;
        tasks.push({ catId, frameName });
      });
    });
    
    let currentIdx = 0;
    const total = tasks.length;
    const BATCH_SIZE = 3; // 每批处理3帧，平衡速度和UI响应
    
    function processBatch() {
      if (currentIdx >= total) {
        recoloringComplete = true;
        
        // 重着色完成后，更新非关键帧的兜底为对应重着色关键帧
        // 否则非关键帧会一直显示橘猫，颜色不对
        const recolorableCatIds = Object.keys(CAT_SPRITES).filter(id => CAT_SPRITES[id].recolor);
        let updatedCount = 0;
        recolorableCatIds.forEach(catId => {
          const config = CAT_SPRITES[catId];
          // 有独立idlePath的猫（稀有品种），用自己的idle兜底，不需要处理
          if (config.idlePath) return;
          
          for (const frame in FRAME_FALLBACK) {
            const fallbackFrame = FRAME_FALLBACK[frame];
            const recoloredFallback = spriteCache[catId][fallbackFrame];
            if (recoloredFallback) {
              spriteCache[catId][frame] = recoloredFallback;
            }
          }
          updatedCount++;
        });
        console.log('[recolor] 更新了' + updatedCount + '只猫的非关键帧兜底');
        
        // 加载有独立帧的猫的自定义帧
        loadCustomActionFrames();
        return;
      }
      
      const endIdx = Math.min(currentIdx + BATCH_SIZE, total);
      for (let i = currentIdx; i < endIdx; i++) {
        const { catId, frameName } = tasks[i];
        const schemeId = CAT_SPRITES[catId].colorScheme;
        const baseImg = recolorBaseCache[frameName];
        
        if (baseImg) {
          const baseW = baseImg.naturalWidth || baseImg.width || 0;
          const baseOk = baseImg.tagName === 'CANVAS' || (baseImg.complete && baseW > 0);
          if (baseOk && baseW > 0) {
            try {
              spriteCache[catId][frameName] = recolorSprite(baseImg, schemeId);
            } catch (e) {
              // 保持用兜底图
            }
          }
        }
      }
      
      currentIdx = endIdx;
      
      // 用 requestAnimationFrame 批量处理，和屏幕刷新同步，更流畅
      if (currentIdx < total) {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(processBatch);
        } else {
          setTimeout(processBatch, 16);
        }
      }
    }
    
    // 启动异步批量处理
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(processBatch);
    } else {
      setTimeout(processBatch, 0);
    }
  }
  
  // 加载有独立帧的猫的自定义动作帧（覆盖重着色结果，用高质量图）
  function loadCustomActionFrames() {
    const catIds = Object.keys(CAT_SPRITES).filter(id => 
      CAT_SPRITES[id].walkPath || CAT_SPRITES[id].actionPath
    );
    const actionFrames = ['sleep', 'eat', 'play', 'groom', 'stretch'];
    
    catIds.forEach(catId => {
      const config = CAT_SPRITES[catId];
      const ext = config.ext || 'png';
      const walkExt = config.walkExt || ext;
      const actionExt = config.actionExt || ext;
      const walkRemoveWhiteBg = config.walkRemoveWhiteBg !== undefined ? config.walkRemoveWhiteBg : config.removeWhiteBg;

      // 加载走路帧
      if (config.walkPath) {
        WALK_FRAMES.forEach(frameName => {
          loadCustomFrame(catId, frameName, config.walkPath + frameName + '.' + walkExt, walkRemoveWhiteBg);
        });
      }
      
      // 加载动作帧
      if (config.actionPath) {
        actionFrames.forEach(frameName => {
          loadCustomFrame(catId, frameName, config.actionPath + frameName + '.' + actionExt, config.removeWhiteBg);
        });
      }
    });
  }
  
  // 加载单帧自定义图（支持格式自动回退：png失败试jpg，反之亦然）
  function loadCustomFrame(catId, frameName, src, removeWhiteBg) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 先把大图缩小到256px，避免去白底和裁剪时性能爆炸
      let result = shrinkImageIfNeeded(img, 256);
      if (removeWhiteBg) {
        result = removeWhiteBackground(result);
      }
      // 走路帧自动裁剪居中（解决左右横跳问题）
      if (frameName.startsWith('walk_')) {
        result = centerAndCropSprite(result);
      }
      spriteCache[catId][frameName] = result;
    };
    img.onerror = () => {
      // 格式回退：png失败试jpg，jpg失败试png
      const altExt = src.endsWith('.png') ? 'jpg' : 'png';
      const altSrc = src.replace(/\.(png|jpg)$/, '.' + altExt);
      if (altSrc !== src) {
        const altImg = new Image();
        altImg.crossOrigin = 'anonymous';
        altImg.onload = () => {
          let result = shrinkImageIfNeeded(altImg, 256);
          // 切换到jpg的话需要去白底
          const needsWhiteBgRemoval = removeWhiteBg || altExt === 'jpg';
          if (needsWhiteBgRemoval) {
            result = removeWhiteBackground(result);
          }
          if (frameName.startsWith('walk_')) {
            result = centerAndCropSprite(result);
          }
          spriteCache[catId][frameName] = result;
        };
        altImg.onerror = () => {
          // 两种格式都失败，保持原有兜底图不变
        };
        altImg.src = verUrl(altSrc);
      }
    };
    img.src = verUrl(src);
  }
  
  // 如果图片太大就缩小到指定尺寸（保持比例）
  function shrinkImageIfNeeded(img, maxSize) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w <= maxSize && h <= maxSize) return img;
    
    const canvas = document.createElement('canvas');
    const scale = maxSize / Math.max(w, h);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // 裁剪并居中精灵图（找到非透明区域边界，居中到正方形画布）
  function centerAndCropSprite(imgOrCanvas) {
    const w = getSpriteWidth(imgOrCanvas);
    const h = getSpriteHeight(imgOrCanvas);
    
    if (w <= 0 || h <= 0) {
      console.warn('centerAndCropSprite: invalid size', w, h, imgOrCanvas?.src || 'canvas');
      return imgOrCanvas;
    }
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgOrCanvas, 0, 0, w, h);
      
      // 获取像素数据
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      
      let minX = w, maxX = 0, minY = h, maxY = 0;
      let hasPixel = false;
      const alphaThreshold = 20; // alpha 阈值
      
      // 扫描找边界
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4 + 3; // alpha 通道
          if (data[idx] > alphaThreshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            hasPixel = true;
          }
        }
      }
      
      if (!hasPixel) return imgOrCanvas; // 空图直接返回
      
      const catW = maxX - minX + 1;
      const catH = maxY - minY + 1;
      const side = Math.max(catW, catH) * 1.1; // 留10%边距
      const size = Math.min(side, Math.min(w, h)); // 不超过原尺寸
      
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = size;
      resultCanvas.height = size;
      const resultCtx = resultCanvas.getContext('2d');
      
      // 把猫居中绘制
      const offsetX = (size - catW) / 2;
      const offsetY = (size - catH) / 2;
      resultCtx.drawImage(
        canvas,
        minX, minY, catW, catH,
        offsetX, offsetY, catW, catH
      );
      
      return resultCanvas;
    } catch (e) {
      console.warn('centerAndCropSprite failed:', e);
      return imgOrCanvas;
    }
  }

  // 检查某只猫的重着色是否完成
  function isCatRecolored(catId) {
    if (!CAT_SPRITES[catId]?.recolor) return true; // 橘猫不需要
    return recoloringComplete || (spriteCache[catId] && spriteCache[catId].idle && 
           spriteCache[catId].idle !== spriteCache.orange.idle);
  }

  // ===== 动画状态 =====
  const animState = {
    catX: 0,
    catY: 0,
    targetX: 0,
    targetY: 0,
    isMoving: false,
    moveSpeed: 0.25, // 移动速度再降低（更悠闲的散步）
    direction: 1,
    
    // 走路帧切换（6帧循环）
    walkFrameIndex: 0,
    walkFrameTimer: 0,
    walkFrameDuration: 640, // 每帧持续时间ms（放慢走路速度，更自然）
    
    // 待机小动作
    idleAction: null,
    idleActionTimer: 0,
    nextIdleAction: 20000, // 再放慢一倍
    idleActionProgress: 0,
    idleActionDuration: 0,
    
    // 呼吸相位（轻微浮动）
    breathePhase: 0,
    
    // 动作状态
    action: null,
    actionStartTime: 0,
    actionDuration: 8000, // 动作持续时间再翻倍
    
    // idle ↔ walk 淡入淡出过渡
    transition: 'idle',       // 当前主状态: 'idle' | 'walk'
    transitionPhase: 'idle',  // 过渡阶段: 'idle' | 'toWalk' | 'walk' | 'toIdle'
    transitionProgress: 0,    // 0~1，1=完全显示walk，0=完全显示idle
    transitionDuration: 400,  // 过渡时间ms
  };

  function initAnimState(canvasWidth, canvasHeight) {
    animState.catX = canvasWidth / 2;
    animState.catY = canvasHeight * 0.62; // 猫咪变大了，稍微上移一点
    animState.targetX = animState.catX;
    animState.targetY = animState.catY;
    animState.isMoving = false;
    animState.walkFrameIndex = 0;
    animState.breathePhase = Math.random() * Math.PI * 2;
    animState.action = null;
    animState.idleAction = null;
    animState.idleActionTimer = 0;
    animState.nextIdleAction = 16000 + Math.random() * 16000; // 再放慢一倍
  }

  function setMoveTarget(x, y) {
    animState.targetX = x;
    animState.targetY = y;
    animState.direction = x > animState.catX ? 1 : -1;
    animState.isMoving = true;
    animState.idleAction = null;
  }

  function triggerAction(action, duration) {
    animState.action = action;
    animState.actionStartTime = performance.now();
    animState.actionDuration = duration || 2000;
    animState.idleAction = null;
  }

  // ===== 获取当前应该显示哪一帧 =====
  function getCurrentFrame(cat) {
    const sleeping = cat && cat.isSleeping;
    
    // 睡觉：sleep帧
    if (sleeping) return 'sleep';
    
    // 动作状态
    if (animState.action) {
      if (animState.action === 'sleep') return 'sleep';
      if (animState.action === 'eat') return 'eat';
      if (animState.action === 'groom') return 'groom';
      if (animState.action === 'play') return 'play';
      if (animState.action === 'clean') return 'groom';
      if (animState.action === 'jump') return 'jump';
      if (animState.action === 'pounce') return 'pounce';
      if (animState.action === 'pet') return 'tailwag'; // 被抚摸用摇尾巴帧
      if (animState.action === 'belly') return 'belly'; // 翻肚皮
      if (animState.action === 'loaf') return 'loaf';   // 面包猫
      if (animState.action === 'roll') return 'roll';   // 打滚
      if (animState.action === 'stretch') return 'stretch'; // 伸懒腰
      if (animState.action === 'tilt') return 'tilt';     // 歪头
      if (animState.action === 'tailwag') return 'tailwag'; // 摇尾巴
      if (animState.action === 'blink') return 'blink';   // 眨眼
      if (animState.action === 'sit') return 'sit';       // 坐下
    }
    
    // 待机小动作
    if (animState.idleAction) {
      if (animState.idleAction === 'stretch') return 'stretch';
      if (animState.idleAction === 'groom') return 'groom';
      if (animState.idleAction === 'blink') return 'blink';
      if (animState.idleAction === 'tilt') return 'tilt';
      if (animState.idleAction === 'tailwag') return 'tailwag';
      if (animState.idleAction === 'sit') return 'sit';
      if (animState.idleAction === 'belly') return 'belly';
      if (animState.idleAction === 'loaf') return 'loaf';
      if (animState.idleAction === 'roll') return 'roll';
    }
    
    // 走路（6帧循环）
    if (animState.isMoving) {
      return WALK_FRAMES[animState.walkFrameIndex % WALK_FRAMES.length];
    }
    
    // 默认待机
    return 'idle';
  }

  // 获取 idle 状态的帧（忽略走路状态，用于过渡时的 idle 层）
  function getIdleFrame(cat) {
    const sleeping = cat && cat.isSleeping;
    if (sleeping) return 'sleep';
    
    // 动作状态
    if (animState.action) {
      if (animState.action === 'sleep') return 'sleep';
      if (animState.action === 'eat') return 'eat';
      if (animState.action === 'groom') return 'groom';
      if (animState.action === 'play') return 'play';
      if (animState.action === 'clean') return 'groom';
      if (animState.action === 'jump') return 'jump';
      if (animState.action === 'pounce') return 'pounce';
      if (animState.action === 'pet') return 'tailwag';
      if (animState.action === 'belly') return 'belly';
      if (animState.action === 'loaf') return 'loaf';
      if (animState.action === 'roll') return 'roll';
      if (animState.action === 'stretch') return 'stretch';
      if (animState.action === 'tilt') return 'tilt';
      if (animState.action === 'tailwag') return 'tailwag';
      if (animState.action === 'blink') return 'blink';
      if (animState.action === 'sit') return 'sit';
    }
    
    // 待机小动作
    if (animState.idleAction) {
      if (animState.idleAction === 'stretch') return 'stretch';
      if (animState.idleAction === 'groom') return 'groom';
      if (animState.idleAction === 'blink') return 'blink';
      if (animState.idleAction === 'tilt') return 'tilt';
      if (animState.idleAction === 'tailwag') return 'tailwag';
      if (animState.idleAction === 'sit') return 'sit';
      if (animState.idleAction === 'belly') return 'belly';
      if (animState.idleAction === 'loaf') return 'loaf';
      if (animState.idleAction === 'roll') return 'roll';
    }
    
    return 'idle';
  }

  // ===== 绘制猫咪（多帧动作版） =====
  function drawCat(ctx, catId, x, y, size, options = {}) {
    const catConfig = CAT_SPRITES[catId];
    const catSprites = spriteCache[catId];
    if (!catConfig || !catSprites) return;
    
    const frameName = options.frame || 'idle';
    const flip = options.flip || false;
    const anim = options.anim || {};
    
    // 所有猫咪现在都有多帧动画
    let img = catSprites[frameName];
    
    // 非关键帧兜底：如果当前帧是非关键帧且用的是橘猫idle（还没更新），
    // 自动回退到FRAME_FALLBACK映射的关键帧，避免显示橘猫
    if (img && frameName !== 'idle' && FRAME_FALLBACK[frameName]) {
      const fallbackFrame = FRAME_FALLBACK[frameName];
      const fallbackImg = catSprites[fallbackFrame];
      // 如果关键帧已经重着色了（和橘猫idle不一样），就用关键帧代替
      if (fallbackImg && fallbackImg !== spriteCache.orange.idle && img === spriteCache.orange.idle) {
        img = fallbackImg;
      }
    }
    
    // 如果当前帧不存在，回退到idle帧（避免显示橙色占位圆点）
    // 特别针对有独立精灵图的稀有品种，它们可能没有blink/tilt等小动作帧
    if ((!img || !isSpriteReady(img)) && frameName !== 'idle') {
      img = catSprites['idle'];
    }
    
    if (!img || !isSpriteReady(img)) {
      // 图片未加载，画占位圆
      const color = getCatPlaceholderColor(catId);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size/4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    
    // 水平翻转
    if (flip) {
      ctx.scale(-1, 1);
    }

    // 动画变换
    const squish = anim.squish || 1;
    const squishX = anim.squishX || 1;
    const rotation = anim.rotation || 0;
    const bounce = anim.bounce || 0;
    const jumpOffset = anim.jumpOffset || 0;
    
    ctx.rotate(rotation);
    ctx.scale(squishX, squish);
    ctx.translate(0, bounce + jumpOffset);

    // 按比例绘制（保持原始宽高比）
    const imgW = getSpriteWidth(img);
    const imgH = getSpriteHeight(img);
    const imgRatio = imgH > 0 ? imgW / imgH : 1;
    let drawW, drawH;
    
    // 以高度为基准，宽度按比例
    drawH = size * (catConfig.bodyHeightScale || 1) * (catConfig.bodyScale || 1);
    drawW = size * imgRatio * (catConfig.bodyWidthScale || 1) * (catConfig.bodyScale || 1);
    
    // Y轴偏移（让猫站得高一点或低一点）
    const yOffset = (catConfig.yOffset || 0) * size;
    
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -drawW/2, -drawH/2 + yOffset, drawW, drawH);

    // 被抚摸时加开心效果（叠加星星）
    if (anim.happyEyes && frameName === 'idle') {
      drawHappySparkles(ctx, size);
    }
    
    // 睡觉Z字（sleep帧可能已经有Z了，再加一个飘动的）
    if (anim.showZ && frameName !== 'sleep') {
      drawSleepingZ(ctx, 0, -size * 0.6, size);
    }

    ctx.restore();
  }

  // 获取猫咪占位颜色
  function getCatPlaceholderColor(catId) {
    const colors = {
      orange: '#F5A623',
      calico: '#E8A849',
      black: '#2C2C2C',
      white: '#F5F5F5',
      tuxedo: '#3D3D3D',
      russianblue: '#7A93AC',
      tabby: '#8B6914',
      ragdoll: '#D4C5B0'
    };
    return colors[catId] || '#F5A623';
  }

  // 检查精灵图是否已准备好（支持 Image 和 Canvas 两种类型）
  function isSpriteReady(img) {
    if (!img) return false;
    // Canvas 类型：有 width 就准备好了
    if (img.tagName === 'CANVAS') return img.width > 0;
    // Image 类型：需要 complete 且有宽度
    return img.complete && (img.naturalWidth > 0 || img.width > 0);
  }

  // 获取精灵图的实际宽度
  function getSpriteWidth(img) {
    if (!img) return 0;
    if (img.tagName === 'CANVAS') return img.width;
    return img.naturalWidth || img.width || 0;
  }

  // 获取精灵图的实际高度
  function getSpriteHeight(img) {
    if (!img) return 0;
    if (img.tagName === 'CANVAS') return img.height;
    return img.naturalHeight || img.height || 0;
  }

  // ===== 绘制开心小星星（在猫周围） =====
  function drawHappySparkles(ctx, size) {
    const time = performance.now();
    const sparkleSize = size * 0.08;
    
    ctx.fillStyle = '#FFD700';
    
    // 几个小星星围绕猫咪
    const positions = [
      { x: -size * 0.4, y: -size * 0.3 },
      { x: size * 0.35, y: -size * 0.25 },
      { x: -size * 0.3, y: size * 0.1 },
      { x: size * 0.3, y: size * 0.15 },
    ];
    
    positions.forEach((pos, i) => {
      const twinkle = Math.sin(time / 200 + i) * 0.5 + 0.5;
      ctx.globalAlpha = 0.5 + twinkle * 0.5;
      const s = sparkleSize * (0.7 + twinkle * 0.3);
      // 画星形（简化为菱形）
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - s);
      ctx.lineTo(pos.x + s * 0.4, pos.y);
      ctx.lineTo(pos.x, pos.y + s);
      ctx.lineTo(pos.x - s * 0.4, pos.y);
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ===== 绘制开心眼 =====
  function drawHappyEyes(ctx, size) {
    const eyeY = -size * 0.08;
    const eyeSpacing = size * 0.2;
    const eyeWidth = size * 0.13;
    
    ctx.strokeStyle = '#3d2817';
    ctx.lineWidth = Math.max(2, size * 0.03);
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.arc(-eyeSpacing, eyeY + size * 0.02, eyeWidth/2, Math.PI + 0.2, -0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eyeSpacing, eyeY + size * 0.02, eyeWidth/2, Math.PI + 0.2, -0.2);
    ctx.stroke();
  }

  // ===== 绘制睡觉闭眼 =====
  function drawSleepingEyes(ctx, size) {
    const eyeY = -size * 0.08;
    const eyeSpacing = size * 0.2;
    const eyeWidth = size * 0.12;
    
    ctx.strokeStyle = '#3d2817';
    ctx.lineWidth = Math.max(2, size * 0.025);
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.arc(-eyeSpacing, eyeY, eyeWidth/2, 0.1, Math.PI - 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eyeSpacing, eyeY, eyeWidth/2, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  // ===== 绘制眨眼 =====
  function drawBlinkEyes(ctx, size, blinkAmount) {
    const eyeY = -size * 0.08;
    const eyeSpacing = size * 0.2;
    const eyeWidth = size * 0.1;
    const coverHeight = size * 0.16 * blinkAmount;
    
    ctx.fillStyle = '#f5e6d3';
    ctx.fillRect(-eyeSpacing - eyeWidth/2, eyeY - size*0.08, eyeWidth, coverHeight);
    ctx.fillRect(eyeSpacing - eyeWidth/2, eyeY - size*0.08, eyeWidth, coverHeight);
  }

  // ===== 绘制睡觉Z字 =====
  function drawSleepingZ(ctx, x, y, size) {
    const time = performance.now();
    const floatOffset = Math.sin(time / 500) * 3;
    const zSize = size * 0.12;
    
    ctx.save();
    ctx.translate(x + size * 0.25, y + floatOffset);
    
    ctx.fillStyle = '#7BA3D9';
    ctx.font = `bold ${zSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const scale = 0.8 + Math.sin(time / 600) * 0.2;
    ctx.scale(scale, scale);
    ctx.fillText('Z', 0, 0);
    
    ctx.fillStyle = '#A8C8E8';
    ctx.font = `bold ${zSize * 0.6}px Arial, sans-serif`;
    ctx.fillText('z', -zSize * 0.8, zSize * 0.5);
    
    ctx.restore();
  }

  // ===== 绘制地面阴影 =====
  function drawShadow(ctx, x, y, size, scale) {
    ctx.save();
    ctx.globalAlpha = 0.15 * scale;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const shadowW = size * 0.35 * scale;
    const shadowH = size * 0.07 * scale;
    ctx.ellipse(x, y, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ===== 绘制便便 =====
  function drawPoop(ctx, x, y, size) {
    const p = size / 32;
    ctx.fillStyle = '#8B6914';
    
    ctx.beginPath();
    ctx.ellipse(x, y, 4*p, 3*p, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - 0.5*p, y - 3*p, 3*p, 2.5*p, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 0.5*p, y - 5.5*p, 2*p, 2*p, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#A67C00';
    ctx.fillRect(x - 2*p, y - 2*p, p, p*0.5);
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 1.5*p, y - 3.5*p, p*0.8, p*0.8);
    ctx.fillRect(x + 0.5*p, y - 3.5*p, p*0.8, p*0.8);
    ctx.fillStyle = '#333';
    ctx.fillRect(x - 1.2*p, y - 3.2*p, p*0.4, p*0.4);
    ctx.fillRect(x + 0.8*p, y - 3.2*p, p*0.4, p*0.4);
  }

  // ===== 绘制家具 =====
  let furnitureCache = null;
  function refreshFurniture() {
    furnitureCache = null;
  }

  function getFurnitureState() {
    if (furnitureCache) return furnitureCache;
    try {
      const bonuses = window.PET_ENGINE.getItemBonuses();
      furnitureCache = {
        hasBed: bonuses.hasBed,
        hasTree: bonuses.hasTree,
        hasFountain: bonuses.hasFountain
      };
    } catch(e) {
      furnitureCache = { hasBed: false, hasTree: false, hasFountain: false };
    }
    return furnitureCache;
  }

  function drawFurniture(ctx, w, h) {
    const furn = getFurnitureState();
    const groundY = h * 0.78;

    // 🛏️ 猫窝（左边）
    if (furn.hasBed) {
      const bedX = w * 0.12;
      const bedY = groundY;
      const bedW = w * 0.18;
      const bedH = h * 0.1;

      // 窝的底座
      ctx.fillStyle = '#D7CCC8';
      ctx.beginPath();
      ctx.ellipse(bedX, bedY, bedW/2, bedH/3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 窝的边缘（粉色）
      ctx.fillStyle = '#F8BBD9';
      ctx.beginPath();
      ctx.ellipse(bedX, bedY - bedH*0.2, bedW/2 - 4, bedH/4, 0, 0, Math.PI, true);
      ctx.fill();

      // 窝内部
      ctx.fillStyle = '#EFEBE9';
      ctx.beginPath();
      ctx.ellipse(bedX, bedY - bedH*0.1, bedW/2 - 8, bedH/5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 小枕头
      ctx.fillStyle = '#FFCCBC';
      ctx.beginPath();
      ctx.ellipse(bedX - bedW*0.2, bedY - bedH*0.15, bedW*0.12, bedH*0.08, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 🌳 猫爬架（右边）
    if (furn.hasTree) {
      const treeX = w * 0.88;
      const treeY = groundY;
      const treeW = w * 0.12;
      const treeH = h * 0.35;

      // 底座
      ctx.fillStyle = '#8D6E63';
      ctx.fillRect(treeX - treeW/2, treeY - 8, treeW, 10);

      // 柱子
      const postW = treeW * 0.25;
      ctx.fillStyle = '#A1887F';
      ctx.fillRect(treeX - postW/2, treeY - treeH + 20, postW, treeH - 20);

      // 柱子缠绕绳子（纹理）
      ctx.strokeStyle = '#8D6E63';
      ctx.lineWidth = 2;
      for (let i = 0; i < treeH - 20; i += 8) {
        ctx.beginPath();
        ctx.moveTo(treeX - postW/2, treeY - treeH + 20 + i);
        ctx.lineTo(treeX + postW/2, treeY - treeH + 22 + i);
        ctx.stroke();
      }

      // 顶层平台
      ctx.fillStyle = '#A1887F';
      ctx.beginPath();
      ctx.ellipse(treeX, treeY - treeH + 15, treeW*0.45, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // 顶层垫
      ctx.fillStyle = '#FFCCBC';
      ctx.beginPath();
      ctx.ellipse(treeX, treeY - treeH + 12, treeW*0.35, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // 中层小平台
      ctx.fillStyle = '#A1887F';
      ctx.beginPath();
      ctx.ellipse(treeX - treeW*0.3, treeY - treeH*0.55, treeW*0.3, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 吊球装饰
      ctx.strokeStyle = '#FF7043';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(treeX + treeW*0.2, treeY - treeH + 15);
      ctx.lineTo(treeX + treeW*0.25, treeY - treeH + 35);
      ctx.stroke();
      ctx.fillStyle = '#FF5722';
      ctx.beginPath();
      ctx.arc(treeX + treeW*0.25, treeY - treeH + 37, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 💧 饮水机（中间偏右）
    if (furn.hasFountain) {
      const fX = w * 0.72;
      const fY = groundY;
      const fW = w * 0.08;
      const fH = h * 0.12;

      // 底座
      ctx.fillStyle = '#B0BEC5';
      ctx.fillRect(fX - fW/2, fY - fH*0.2, fW, fH*0.2);

      // 主体
      ctx.fillStyle = '#CFD8DC';
      ctx.fillRect(fX - fW*0.4, fY - fH*0.7, fW*0.8, fH*0.5);

      // 顶部水盘
      ctx.fillStyle = '#ECEFF1';
      ctx.beginPath();
      ctx.ellipse(fX, fY - fH*0.7, fW*0.4, fH*0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // 水
      ctx.fillStyle = '#4FC3F7';
      ctx.beginPath();
      ctx.ellipse(fX, fY - fH*0.72, fW*0.3, fH*0.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // 水流（小动画）
      const time = Date.now() / 1000;
      const bubbleOffset = (time * 20) % 10;
      ctx.fillStyle = '#81D4FA';
      ctx.beginPath();
      ctx.arc(fX - fW*0.1, fY - fH*0.6 - bubbleOffset, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fX + fW*0.15, fY - fH*0.55 - ((bubbleOffset + 5) % 10), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ===== 计算动画参数（简化版，因为帧本身就是动作） =====
  function computeAnimParams(time, cat) {
    const params = {
      bounce: 0,
      squish: 1,
      squishX: 1,
      rotation: 0,
      jumpOffset: 0,
      shadowScale: 1,
      showZ: false,
      sleeping: false,
      happyEyes: false,
      blink: 0,
    };

    const sleeping = cat && cat.isSleeping;
    params.sleeping = sleeping;

    // 呼吸浮动+缩放（让静态图也有明显的生命感）
    params.bounce = Math.sin(animState.breathePhase) * 3;
    // 呼吸缩放效果（胸部起伏，更有生命感）
    const breatheScale = 1 + Math.sin(animState.breathePhase * 2) * 0.025;
    params.squish = breatheScale;
    params.squishX = 1 / breatheScale * 0.96 + 0.04; // 横向收缩，纵向膨胀，模拟呼吸
    
    // 睡觉
    if (sleeping) {
      params.bounce = Math.sin(time / 1200) * 1.5;
      params.squish = 1 + Math.sin(time / 1200) * 0.02;
      params.squishX = 1 / params.squish * 0.97 + 0.03;
      params.showZ = true;
    }

    // 玩耍动作：跳跃效果
    if (animState.action === 'play') {
      const elapsed = time - animState.actionStartTime;
      const progress = Math.min(1, elapsed / animState.actionDuration);
      const jumpPhase = progress * Math.PI;
      params.jumpOffset = -Math.sin(jumpPhase) * 20;
      params.shadowScale = 1 - Math.sin(jumpPhase) * 0.3;
      params.rotation = Math.sin(progress * Math.PI * 2) * 0.05;
    }
    
    // 跳跃动作
    if (animState.action === 'jump') {
      const elapsed = time - animState.actionStartTime;
      const progress = Math.min(1, elapsed / animState.actionDuration);
      const jumpPhase = progress * Math.PI;
      params.jumpOffset = -Math.sin(jumpPhase) * 40;
      params.shadowScale = 1 - Math.sin(jumpPhase) * 0.4;
      params.squish = 1 + Math.sin(jumpPhase) * 0.1;
    }
    
    // 扑跃动作
    if (animState.action === 'pounce') {
      const elapsed = time - animState.actionStartTime;
      const progress = Math.min(1, elapsed / animState.actionDuration);
      params.jumpOffset = -Math.sin(progress * Math.PI) * 15;
      params.squishX = 1 + Math.sin(progress * Math.PI) * 0.15;
      params.shadowScale = 1 - Math.sin(progress * Math.PI) * 0.2;
    }
    
    // 吃东西：轻微上下动
    if (animState.action === 'eat') {
      const elapsed = time - animState.actionStartTime;
      const progress = Math.min(1, elapsed / animState.actionDuration);
      params.bounce += Math.sin(progress * Math.PI * 8) * 2;
    }
    
    // 舔毛：轻微晃动
    if (animState.action === 'groom') {
      const elapsed = time - animState.actionStartTime;
      const progress = Math.min(1, elapsed / animState.actionDuration);
      params.rotation = Math.sin(progress * Math.PI * 4) * 0.03;
    }
    
    // 被抚摸：开心效果
    if (animState.action === 'pet') {
      params.happyEyes = true;
      const elapsed = time - animState.actionStartTime;
      const progress = Math.min(1, elapsed / animState.actionDuration);
      params.bounce += Math.sin(progress * Math.PI * 3) * 2;
    }
    
    // 翻肚皮：轻微摇摆，露肚子撒娇
    if (animState.action === 'belly' || animState.idleAction === 'belly') {
      const elapsed = time - (animState.action ? animState.actionStartTime : 0);
      const progress = Math.min(1, elapsed / (animState.actionDuration || 3000));
      params.rotation = Math.sin(progress * Math.PI * 4) * 0.03;
      params.bounce += Math.sin(progress * Math.PI * 2) * 1.5;
    }
    
    // 面包猫（揣手手）：非常稳定，轻微呼吸
    if (animState.action === 'loaf' || animState.idleAction === 'loaf') {
      // 面包猫姿势很稳，几乎不动
    }
    
    // 打滚：左右摇摆翻滚
    if (animState.action === 'roll' || animState.idleAction === 'roll') {
      const elapsed = time - (animState.action ? animState.actionStartTime : 0);
      const progress = Math.min(1, elapsed / (animState.actionDuration || 3000));
      params.rotation = Math.sin(progress * Math.PI * 3) * 0.08;
      params.bounce += Math.sin(progress * Math.PI * 2) * 2;
      params.squishX = 1 + Math.sin(progress * Math.PI) * 0.05;
    }

    // 走路时身体上下动
    if (animState.isMoving && !sleeping && !animState.action) {
      params.bounce += Math.sin(animState.walkFrameIndex * Math.PI) * 2;
    }

    return params;
  }

  // ===== 更新动画状态 =====
  function updateAnim(deltaTime, cat, canvasWidth, canvasHeight) {
    const time = performance.now();
    
    // ===== idle ↔ walk 过渡状态 =====
    const shouldWalk = animState.isMoving && !cat.isSleeping && !animState.action;
    
    if (shouldWalk && animState.transitionPhase !== 'walk' && animState.transitionPhase !== 'toWalk') {
      // 开始走路 → 进入 toWalk 过渡
      animState.transitionPhase = 'toWalk';
    } else if (!shouldWalk && animState.transitionPhase !== 'idle' && animState.transitionPhase !== 'toIdle') {
      // 停止走路 → 进入 toIdle 过渡
      animState.transitionPhase = 'toIdle';
    }
    
    // 更新过渡进度
    if (animState.transitionPhase === 'toWalk') {
      animState.transitionProgress += deltaTime / animState.transitionDuration;
      if (animState.transitionProgress >= 1) {
        animState.transitionProgress = 1;
        animState.transitionPhase = 'walk';
      }
    } else if (animState.transitionPhase === 'toIdle') {
      animState.transitionProgress -= deltaTime / animState.transitionDuration;
      if (animState.transitionProgress <= 0) {
        animState.transitionProgress = 0;
        animState.transitionPhase = 'idle';
      }
    }
    
    animState.breathePhase += deltaTime * 0.0012; // 呼吸速度，更自然的节奏

    // 走路帧切换（6帧循环）
    if (animState.isMoving && !cat.isSleeping && !animState.action) {
      animState.walkFrameTimer += deltaTime;
      if (animState.walkFrameTimer > animState.walkFrameDuration) {
        animState.walkFrameTimer = 0;
        animState.walkFrameIndex = (animState.walkFrameIndex + 1) % WALK_FRAMES.length;
      }
    }

    // 移动逻辑
    if (animState.isMoving && !cat.isSleeping && !animState.action) {
      const dx = animState.targetX - animState.catX;
      const dy = animState.targetY - animState.catY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < animState.moveSpeed) {
        animState.catX = animState.targetX;
        animState.catY = animState.targetY;
        animState.isMoving = false;
        animState.walkFrameIndex = 0;
      } else {
        animState.catX += (dx / dist) * animState.moveSpeed;
        animState.catY += (dy / dist) * animState.moveSpeed * 0.3;
      }
    }

    // 随机移动（频率再减半）
    if (!cat.isSleeping && !animState.isMoving && !animState.action && !animState.idleAction && Math.random() < 0.0005) {
      const newX = canvasWidth * 0.2 + Math.random() * canvasWidth * 0.6;
      const newY = canvasHeight * 0.55 + Math.random() * canvasHeight * 0.25;
      setMoveTarget(newX, newY);
    }

    // 待机小动作系统
    if (!cat.isSleeping && !animState.isMoving && !animState.action) {
      if (animState.idleAction) {
        animState.idleActionTimer += deltaTime;
        animState.idleActionProgress = Math.min(1, animState.idleActionTimer / animState.idleActionDuration);
        
        if (animState.idleActionProgress >= 1) {
          animState.idleAction = null;
          animState.nextIdleAction = 16000 + Math.random() * 20000; // 再放慢一倍
          animState.idleActionTimer = 0;
        }
      } else {
        animState.idleActionTimer += deltaTime;
        if (animState.idleActionTimer > animState.nextIdleAction) {
          // 更多待机小动作选择（sit 频率降低，更活泼的动作更多）
          const actions = ['stretch', 'groom', 'blink', 'tilt', 'tailwag', 'blink', 'belly', 'loaf', 'roll', 'tailwag', 'stretch', 'blink', 'tilt'];
          const action = actions[Math.floor(Math.random() * actions.length)];
          animState.idleAction = action;
          animState.idleActionTimer = 0;
          animState.idleActionProgress = 0;
          
          // 不同动作不同时长
          const durations = {
            stretch: 10000 + Math.random() * 10000,
            groom: 20000 + Math.random() * 10000,
            blink: 1200 + Math.random() * 800,
            tilt: 20000 + Math.random() * 10000,
            tailwag: 8000 + Math.random() * 4000,
            sit: 5000 + Math.random() * 7000,
            belly: 12000 + Math.random() * 8000,  // 翻肚皮
            loaf: 15000 + Math.random() * 10000, // 面包猫
            roll: 8000 + Math.random() * 6000     // 打滚
          };
          animState.idleActionDuration = durations[action] || 2000;
        }
      }
    } else {
      animState.idleAction = null;
      animState.idleActionTimer = 0;
    }

    // 动作结束检查
    if (animState.action) {
      const elapsed = time - animState.actionStartTime;
      if (elapsed > animState.actionDuration) {
        animState.action = null;
      }
    }
  }

  // ===== 主渲染循环 =====
  function startRenderLoop(canvas, cat) {
    const ctx = canvas.getContext('2d');
    let lastTime = performance.now();
    let animationId = null;
    let running = true;

    initAnimState(canvas.width, canvas.height);

    // 预渲染背景到离屏canvas（避免每帧重绘渐变、地面线、家具）
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    const bgCtx = bgCanvas.getContext('2d');
    
    // 背景渐变
    const bgGrad = bgCtx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#FFFFFF');
    bgGrad.addColorStop(1, '#FFFFFF');
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 地面线
    bgCtx.strokeStyle = 'rgba(200, 150, 100, 0.2)';
    bgCtx.lineWidth = 2;
    bgCtx.beginPath();
    bgCtx.moveTo(0, canvas.height * 0.78);
    bgCtx.lineTo(canvas.width, canvas.height * 0.78);
    bgCtx.stroke();
    
    // 家具（在猫咪后面）
    drawFurniture(bgCtx, canvas.width, canvas.height);

    function render() {
      if (!running) return;
      
      const now = performance.now();
      const deltaTime = now - lastTime;
      lastTime = now;

      updateAnim(deltaTime, cat, canvas.width, canvas.height);
      const animParams = computeAnimParams(now, cat);
      const currentFrame = getCurrentFrame(cat);

      // 直接绘制预渲染的背景（1次drawImage，比重绘渐变+家具快很多）
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bgCanvas, 0, 0);

      const catSize = Math.min(canvas.width, canvas.height) * 0.65; // 增大30%
      const catX = animState.catX;
      const catY = animState.catY;

      // 阴影
      drawShadow(ctx, catX, catY + catSize * 0.4, catSize, animParams.shadowScale);

      // 猫咪（idle ↔ walk 淡入淡出过渡）
      const t = animState.transitionProgress;
      
      if (t < 1) {
        // 绘制 idle 层（用 getIdleFrame 忽略走路状态）
        ctx.save();
        ctx.globalAlpha = 1 - t;
        drawCat(ctx, cat.catId || cat.breed, catX, catY, catSize, {
          frame: getIdleFrame(cat),
          flip: animState.direction < 0,
          anim: animParams
        });
        ctx.restore();
      }
      
      if (t > 0) {
        // 绘制 walk 层（走路帧用不同的动画参数：没有呼吸浮动，更平稳）
        const walkFrame = WALK_FRAMES[animState.walkFrameIndex];
        const walkAnimParams = { ...animParams, bounce: 0, squish: 1, squishX: 1 };
        ctx.save();
        ctx.globalAlpha = t;
        drawCat(ctx, cat.catId || cat.breed, catX, catY, catSize, {
          frame: walkFrame,
          flip: animState.direction < 0,
          anim: walkAnimParams
        });
        ctx.restore();
      }

      // 便便
      if (cat.poopCount > 0) {
        const poopSize = catSize * 0.25;
        for (let i = 0; i < Math.min(cat.poopCount, 3); i++) {
          const poopX = canvas.width * 0.15 + i * (poopSize * 1.5);
          const poopY = canvas.height * 0.75;
          drawPoop(ctx, poopX, poopY, poopSize);
        }
        if (cat.poopCount > 3) {
          ctx.fillStyle = '#8B6914';
          ctx.font = 'bold 14px Arial';
          ctx.fillText(`+${cat.poopCount - 3}`, canvas.width * 0.15 + 3 * poopSize * 1.5 + 5, canvas.height * 0.78);
        }
      }

      animationId = requestAnimationFrame(render);
    }

    render();

    return {
      stop: function() {
        running = false;
        if (animationId) cancelAnimationFrame(animationId);
      },
      triggerAction: triggerAction,
      getState: function() { return animState; }
    };
  }

  // ===== 绘制静态猫咪预览 =====
  function drawStaticCat(ctx, catId, x, y, size) {
    const catConfig = CAT_SPRITES[catId];
    const catSprites = spriteCache[catId];
    if (!catConfig || !catSprites) return;
    
    // 所有猫咪都有多帧，取idle帧
    let img = catSprites.idle;
    
    if (!img || !isSpriteReady(img)) {
      ctx.fillStyle = getCatPlaceholderColor(catId);
      ctx.beginPath();
      ctx.arc(x, y, size/4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    
    const imgW = getSpriteWidth(img);
    const imgH = getSpriteHeight(img);
    const imgRatio = imgH > 0 ? imgW / imgH : 1;
    
    // 以高度为基准，和主渲染保持一致的尺寸计算
    const drawH = size * (catConfig.bodyHeightScale || 1) * (catConfig.bodyScale || 1);
    const drawW = size * imgRatio * (catConfig.bodyWidthScale || 1) * (catConfig.bodyScale || 1);
    const yOffset = (catConfig.yOffset || 0) * size;
    const drawY = y + yOffset;
    
    // 白猫等浅色猫：加柔和光晕增强对比度，避免"透明感"
    if (catId === 'white' || catId === 'ragdoll') {
      const glowW = drawW * 1.1;
      const glowH = drawH * 0.5;
      const glowY = drawY + drawH * 0.25;
      const gradient = ctx.createRadialGradient(
        x, glowY, 0,
        x, glowY, glowW * 0.6
      );
      gradient.addColorStop(0, 'rgba(180, 180, 200, 0.15)');
      gradient.addColorStop(0.5, 'rgba(180, 180, 200, 0.06)');
      gradient.addColorStop(1, 'rgba(180, 180, 200, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, glowY, glowW * 0.6, glowH, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.drawImage(img, x - drawW/2, drawY - drawH/2, drawW, drawH);
    ctx.restore();
  }

  function getCatSprite(catId) {
    return spriteCache[catId]?.idle || null;
  }

  function isLoaded() {
    return spritesLoaded;
  }

  // 重新加载所有精灵图（用于调试）
  function reloadSprites(callback) {
    spritesLoaded = false;
    baseSpritesLoaded = false;
    recolorBaseLoaded = false;
    recoloringComplete = false;
    for (const key in spriteCache) {
      delete spriteCache[key];
    }
    for (const key in recolorBaseCache) {
      delete recolorBaseCache[key];
    }
    loadSprites(callback);
  }

  return {
    loadSprites: loadSprites,
    reloadSprites: reloadSprites,
    drawCat: drawCat,
    drawStaticCat: drawStaticCat,
    drawPoop: drawPoop,
    drawShadow: drawShadow,
    startRenderLoop: startRenderLoop,
    triggerAction: triggerAction,
    getCatSprite: getCatSprite,
    isLoaded: isLoaded,
    isCatRecolored: isCatRecolored,
    initAnimState: initAnimState,
    setMoveTarget: setMoveTarget,
    refreshFurniture: refreshFurniture,
    // 调试用：获取指定猫指定动作的sprite
    _getSprite: function(catId, action) {
      return spriteCache[catId]?.[action] || null;
    },
    // 调试用：获取sprite缓存
    _getCache: function() { return spriteCache; },
    // 调试用：重着色测试
    _recolorTest: function(img, schemeId) { return recolorSprite(img, schemeId); },
    // 调试用：获取重着色源图缓存
    _getBaseCache: function() { return recolorBaseCache; }
  };
})();
