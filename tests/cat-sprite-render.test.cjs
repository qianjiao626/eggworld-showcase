const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('zlib');

/* 猫咪精灵图渲染完整性 · 回归测试（2026-10-11）
   缺陷：「我的猫咪」与「猫咪公园」中浅色毛品种（white/lion/munchkin 等）头部/身体透明。
   根因：离线预处理生成的 PNG 把白毛区域按"白底背景"抠成了 alpha=0（素材按白底显示设计），
         公园绿草地上直接透出背景；白底主视图里也只剩一圈描边轮廓。
   修复：离线脚本（output/sprite-debug/repair_v6.py，射线封闭 + 边界浅色占比双门控）把
         被白毛包围的封闭透明区填成不透明白；素材更新后 SPRITE_VER 3→4 强制绕缓存。
   本测试守住：① 每品种 idle 帧头部/身体区域必须有足够不透明像素（不再"透明幽灵"）；
              ② 不允许残留"大尺度 + 边界浅色"的封闭透明区（= 未修复的白毛）；
              ③ 素材改动必须同步升 SPRITE_VER（源码守卫）。 */

const root = path.join(__dirname, '..');

// ---- 最小 PNG 解码器：仅支持 8bit RGBA（colorType 6）、5 种行滤波、多 IDAT ----
function decodePNG(file) {
  const buf = fs.readFileSync(path.join(root, file));
  assert.equal(buf.readUInt32BE(0), 0x89504e47, 'PNG 签名');
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  assert.equal(bitDepth, 8, `${file} 应为 8bit`);
  assert.equal(colorType, 6, `${file} 应为 RGBA（本次修复后的素材必须是 8bit RGBA PNG）`);
  const raw = zlib.inflateSync(Buffer.concat(idat));   // PIL 保存：zlib 封装（带 2 字节头）
  const stride = w * 4;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v;
      switch (ft) {
        case 0: v = line[x]; break;
        case 1: v = line[x] + a; break;
        case 2: v = line[x] + b; break;
        case 3: v = line[x] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: assert.fail(`${file} 未知行滤波 ${ft}`);
      }
      cur[x] = v & 255;
    }
    cur.copy(px, y * stride);
    prev = cur;
  }
  return { w, h, px };
}

const alphaAt = (img, x, y) => img.px[(y * img.w + x) * 4 + 3];
const isLightPx = (img, x, y) => {
  const i = (y * img.w + x) * 4;
  return img.px[i] > 200 && img.px[i + 1] > 200 && img.px[i + 2] > 200;
};

// 头部/身体窗口不透明占比（窗口按 256x256 归一化坐标）
function opaqueCoverage(img, x0, y0, x1, y1) {
  let op = 0, tot = 0;
  for (let y = Math.floor(img.h * y0); y < Math.floor(img.h * y1); y++)
    for (let x = Math.floor(img.w * x0); x < Math.floor(img.w * x1); x++) {
      tot++;
      if (alphaAt(img, x, y) >= 20) op++;
    }
  return op / tot;
}

// 射线法封闭透明分量（与修复脚本同判据）：返回"大尺度 + 边界浅色"的未填白毛像素数
function enclosedRegions(img, minSize, lightBorderOnly) {
  const { w, h } = img;
  const rows = [], cols = [];
  for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) if (alphaAt(img, x, y) >= 20) r.push(x); rows.push(r); }
  for (let x = 0; x < w; x++) { const c = []; for (let y = 0; y < h; y++) if (alphaAt(img, x, y) >= 20) c.push(y); cols.push(c); }
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ry = rows[y];
    if (ry.length < 2) continue;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alphaAt(img, x, y) >= 20) continue;
      let l = false, r = false;
      for (const v of ry) { if (v < x) l = true; else if (v > x) { r = true; break; } }
      const cx = cols[x];
      let u = false, d = false;
      for (const v of cx) { if (v < y) u = true; else if (v > y) { d = true; break; } }
      if (l && r && u && d) mask[i] = 1;
    }
  }
  const seen = new Uint8Array(w * h);
  let bad = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (seen[i] || !mask[i]) continue;
    const comp = []; const dq = [[x, y]]; seen[i] = 1;
    while (dq.length) {
      const [cx0, cy0] = dq.pop(); comp.push([cx0, cy0]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx0 + dx, ny = cy0 + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const j = ny * w + nx;
          if (!seen[j] && mask[j]) { seen[j] = 1; dq.push([nx, ny]); }
        }
      }
    }
    if (comp.length < minSize) continue;
    if (lightBorderOnly) {
      const border = new Set();
      for (const [cx0, cy0] of comp)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = cx0 + dx, ny = cy0 + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && alphaAt(img, nx, ny) >= 20) border.add(ny * w + nx);
        }
      let light = 0;
      for (const j of border) if (isLightPx(img, j % w, Math.floor(j / w))) light++;
      const lb = border.size ? light / border.size : 0;
      if (lb < 0.40) continue;
    }
    bad += comp.length;
  }
  return bad;
}

function unfilledWhiteFur(img) {
  return enclosedRegions(img, 400, true);
}

const IDLE_FRAMES = {
  orange: 'assets/cat-cabin/cats/orange_unified/idle.png',
  calico: 'assets/cat-cabin/cats/png/calico/idle.png',
  black: 'assets/cat-cabin/cats/png/black/idle.png',
  white: 'assets/cat-cabin/cats/png/white/idle.png',
  tuxedo: 'assets/cat-cabin/cats/png/tuxedo/idle.png',
  russianblue: 'assets/cat-cabin/cats/png/russianblue/idle.png',
  tabby: 'assets/cat-cabin/cats/png/tabby/idle.png',
  ragdoll: 'assets/cat-cabin/cats/png/ragdoll/idle.png',
  munchkin: 'assets/cat-cabin/cats/png/munchkin_v7/idle.png',
  maine: 'assets/cat-cabin/cats/png/maine/idle.png',
  devon: 'assets/cat-cabin/cats/png/devon/idle.png',
  sphynx: 'assets/cat-cabin/cats/png/sphynx/idle.png',
  lion: 'assets/cat-cabin/cats/png/lion/idle.png',
  bengal: 'assets/cat-cabin/cats/png/bengal/idle.png',
};

test('every breed idle sprite renders a solid head and body (no transparent ghost)', () => {
  for (const [breed, file] of Object.entries(IDLE_FRAMES)) {
    const img = decodePNG(file);
    // 头部窗口（脸+耳下区域）与身体窗口（躯干）不透明占比下限 45%：
    // 修复前 white 仅 6%/18%、lion 6.4%/26%；修复后最低 51.9%（white 头部，含合法耳间背景缝）。
    const head = opaqueCoverage(img, 0.35, 0.15, 0.65, 0.45);
    const body = opaqueCoverage(img, 0.30, 0.50, 0.70, 0.85);
    assert.ok(head >= 0.45, `${breed}: 头部不透明占比 ${(head * 100).toFixed(1)}% < 45%（头部透明 bug 复发）`);
    assert.ok(body >= 0.45, `${breed}: 身体不透明占比 ${(body * 100).toFixed(1)}% < 45%（身体透明 bug 复发）`);
  }
});

test('no breed keeps large light-bordered enclosed transparent regions (unfilled white fur)', () => {
  for (const [breed, file] of Object.entries(IDLE_FRAMES)) {
    const img = decodePNG(file);
    const bad = unfilledWhiteFur(img);
    assert.equal(bad, 0, `${breed}: 残留 ${bad}px 未填充的白毛封闭区（离线修复未覆盖该帧）`);
  }
});

test('calico/tuxedo idle have NO large enclosed transparent regions at all (dark-bordered white patches)', () => {
  // 回归（2026-10-12 用户实测）：三花/奶牛的白毛斑块被橙/黑毛包围（边界浅色占比 <0.40），
  // 被 v7 双门控跳过 → 公园绿底上脸部/口鼻/胸腹白斑透绿。仅 idle 对 >=400px 大区放宽；
  // 30-120px 的小白斑逐帧核对后填白，奶牛猫 idle 尾根另按位置修复；486px play 腿缝保持透明。
  for (const breed of ['calico', 'tuxedo']) {
    const img = decodePNG(IDLE_FRAMES[breed]);
    const bad = enclosedRegions(img, 400);
    assert.equal(bad, 0,
      `${breed}: 残留 ${bad}px 大尺度封闭透明区（白毛斑块未填 → 公园透绿 bug 复发）`);
  }
});

test('tuxedo idle feet are opaque (do not show the park background)', () => {
  const img = decodePNG(IDLE_FRAMES.tuxedo);
  // 四只脚上共有四处封闭透明区，分别位于两组脚掌坐标；修复前像素都直接透出公园绿底。
  for (const [x, y] of [[100, 180], [152, 180], [100, 215], [152, 215]]) {
    assert.ok(alphaAt(img, x, y) >= 20,
      `tuxedo idle paw (${x},${y}) 仍透明`);
  }
});

test('tuxedo idle tail root is opaque (do not show the park background)', () => {
  const img = decodePNG(IDLE_FRAMES.tuxedo);
  assert.ok(alphaAt(img, 216, 180) >= 20,
    'tuxedo idle tail root (216,180) 仍透明');
});

test('calico idle feet are opaque (do not show the park background)', () => {
  const img = decodePNG(IDLE_FRAMES.calico);
  // 两只前脚掌各有一个封闭透明块，左脚上沿还残留一块连到脚面的白毛透明区。
  for (const [x, y] of [[73, 198], [80, 218], [175, 218]]) {
    assert.ok(alphaAt(img, x, y) >= 20,
      `calico idle paw (${x},${y}) 仍透明`);
  }
});

test('munchkin idle raised paw is opaque (do not show the park background)', () => {
  const img = decodePNG(IDLE_FRAMES.munchkin);
  assert.ok(alphaAt(img, 152, 153) >= 20,
    'munchkin idle raised paw (152,153) 仍透明');
});

test('lion idle tail and front paw are opaque', () => {
  const img = decodePNG(IDLE_FRAMES.lion);
  for (const [x, y] of [[60, 140], [49, 158], [60, 156], [154, 186]]) {
    assert.ok(alphaAt(img, x, y) >= 20, `lion idle (${x},${y}) 仍透明`);
  }
});

test('tabby idle chest and paw are opaque', () => {
  const img = decodePNG(IDLE_FRAMES.tabby);
  for (const [x, y] of [[123, 159], [137, 154], [126, 167], [150, 203]]) {
    assert.ok(alphaAt(img, x, y) >= 20, `tabby idle (${x},${y}) 仍透明`);
  }
});

test('russianblue idle eyes, whiskers, forehead, and paws are opaque', () => {
  const img = decodePNG(IDLE_FRAMES.russianblue);
  for (const [x, y] of [
    [88, 115], [166, 115], [99, 109], [151, 109],
    [111, 207], [144, 207], [85, 207],
    [75, 124], [180, 124], [181, 131], [73, 131], [80, 135], [72, 138],
    [152, 89], [101, 90],
  ]) {
    assert.ok(alphaAt(img, x, y) >= 20, `russianblue idle (${x},${y}) 仍透明`);
  }
});

test('white idle right eye is opaque', () => {
  const img = decodePNG(IDLE_FRAMES.white);
  assert.ok(alphaAt(img, 172, 117) >= 20,
    'white idle right eye (172,117) 仍透明');
});

test('white idle ear borders are opaque', () => {
  const img = decodePNG(IDLE_FRAMES.white);
  for (const [x, y] of [[97, 69], [100, 70], [190, 70], [205, 70]]) {
    assert.ok(alphaAt(img, x, y) >= 20,
      `white idle ear border (${x},${y}) 仍透明`);
  }
});

test('white idle center forehead seam between the ears is opaque', () => {
  const img = decodePNG(IDLE_FRAMES.white);
  for (const [x, y] of [[165, 72], [164, 85], [165, 105], [165, 112]]) {
    assert.ok(alphaAt(img, x, y) >= 20,
      `white idle ear-center seam (${x},${y}) 仍透明`);
  }
});

test('white idle top-of-head outline is continuous (no notch between the ears)', () => {
  // 回归（2026-10-12 用户实测）：idle 头顶两耳之间的深棕轮廓线在原素材中本身断裂
  // （x119..124、x137..138、x181..186 三处），绿底上呈锯齿状透绿缺口；
  // 封闭区射线判据检不到（缺口与背景连通），需按轮廓插值补全。
  const img = decodePNG(IDLE_FRAMES.white);
  // 断裂列的最上不透明像素必须是深棕轮廓（r<160），而非白毛/浅色
  for (const x of [119, 120, 121, 122, 123, 124, 137, 138, 181, 182, 183, 184, 185, 186]) {
    let top = -1;
    for (let y = 20; y < 140; y++) { if (alphaAt(img, x, y) >= 20) { top = y; break; } }
    assert.ok(top > 0, `white idle 头顶列 x=${x} 全透明`);
    const i = (top * img.w + x) * 4;
    assert.ok(img.px[i] < 160,
      `white idle 头顶列 x=${x} 轮廓缺失（top y=${top} 为浅色像素 rgb=${img.px[i]},${img.px[i + 1]},${img.px[i + 2]}）`);
  }
  // V 形缺口底部不允许残留封闭透明点
  for (const [x, y] of [[119, 81], [120, 81], [119, 82], [120, 82]]) {
    assert.ok(alphaAt(img, x, y) >= 20, `white idle 头顶缺口底部 (${x},${y}) 仍透明`);
  }
});

test('selected white-fur animation frames have no large enclosed transparent patches', () => {
  // 仅测目检确认属于白毛的暗边界分量；保留布偶 walk_1/walk_3 尾尖与奶牛 play 腿缝。
  const PATCHED_FRAMES = [
    ...Array.from({ length: 6 }, (_, i) => `assets/cat-cabin/cats/calico_walk/walk_${i + 1}.png`),
    ...['sleep', 'eat', 'play', 'groom', 'stretch'].map(a => `assets/cat-cabin/cats/calico_actions/${a}.png`),
    'assets/cat-cabin/cats/png/devon/actions/eat.png',
    'assets/cat-cabin/cats/png/devon/actions/play.png',
    'assets/cat-cabin/cats/png/devon/actions/groom.png',
    'assets/cat-cabin/cats/png/ragdoll/walk/walk_6.png',
    'assets/cat-cabin/cats/png/ragdoll/actions/play.png',
  ];
  for (const file of PATCHED_FRAMES) {
    const img = decodePNG(file);
    assert.equal(enclosedRegions(img, 400), 0,
      `${file}: 仍有 >=400px 封闭透明白毛区域`);
  }
});

test('park walk frames for the worst-hit breeds are solid too', () => {
  // 公园场景走路动画会切 walk 帧；抽查受害最重的三个品种（white/lion/munchkin）的 walk_1
  const WALK = {
    white: 'assets/cat-cabin/cats/png/white/walk/walk_1.png',
    lion: 'assets/cat-cabin/cats/png/lion/walk_png/walk_1.png',
    munchkin: 'assets/cat-cabin/cats/png/munchkin_v7/walk/walk_1.png',
  };
  for (const [breed, file] of Object.entries(WALK)) {
    const img = decodePNG(file);
    const body = opaqueCoverage(img, 0.30, 0.35, 0.70, 0.80);
    assert.ok(body >= 0.40, `${breed} walk_1: 躯干不透明占比 ${(body * 100).toFixed(1)}% < 40%（走路帧透明 bug 复发）`);
    assert.equal(unfilledWhiteFur(img), 0, `${breed} walk_1: 残留未填充白毛封闭区`);
  }
});

test('sprite and engine cache versions bumped after asset repair', () => {
  const src = fs.readFileSync(path.join(root, 'js/pet-renderer.js'), 'utf8');
  const m = src.match(/const SPRITE_VER = (\d+)/);
  assert.ok(m, 'pet-renderer.js 应有 SPRITE_VER 常量');
  assert.ok(Number(m[1]) >= 13,
    `素材已修复（覆盖 calico/tuxedo、munchkin、lion、tabby、russianblue、white 的透明毛发区域，white idle 另补头顶断裂轮廓），SPRITE_VER=${m[1]} 必须 >=13，否则线上 7 天缓存无法及时更新`);
  // 引擎脚本改动必须同步升 bridge 的 VER（线上 /js/* 缓存 7 天，见 tests/asset-cache-version.test.cjs）
  const bridge = fs.readFileSync(path.join(root, 'js/cat-cabin-bridge.js'), 'utf8');
  const bv = bridge.match(/var VER = '(\d{8}p\d+)'/);
  assert.ok(bv, 'cat-cabin-bridge.js 应有 VER 版本号');
  const html = fs.readFileSync(path.join(root, 'growth-schoolv3.html'), 'utf8');
  assert.ok(html.includes(`cat-cabin-bridge.js?v=${bv[1]}`),
    `growth-schoolv3.html 的 cat-cabin-bridge ?v= 必须与 bridge 内 VER（${bv[1]}）一致`);
});
