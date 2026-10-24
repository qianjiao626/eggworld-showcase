const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

/* 猫咪图鉴展示 · 回归测试（2026-10-12 优化批次）
   钉住四件事，防止改回去：
   ① 图鉴卡片照片绘制锚点 = canvas 几何中心（旧代码 +4 下移导致「照片偏下」）；
   ② 旧「图鉴标签页」死代码（renderCollectionTab/renderCollectionRow/doAdopt）与其
      同名片段样式块已删除——该块以同名 .collection-card 覆盖弹窗卡片（aspect-ratio
      失效、稀有度配色丢失），是「照片偏下」排查中确认的真实缺陷源；
   ③ 弹窗展示层修复在位：方卡比例取消（内容裁切）、网格行高不被 flex:1+stretch 压扁、
      假可点（无 handler 的 cursor:pointer + hover 位移）移除；
   ④ 无障碍：canvas 带 role=img + aria-label，子标签带 role/tabindex/aria-selected。 */

const ui = fs.readFileSync('js/pet-ui.js', 'utf8');
const engineCss = fs.readFileSync('js/pet-module.css', 'utf8');
const cabinCss = fs.readFileSync('js/cat-cabin.css', 'utf8');

test('图鉴照片绘制在 canvas 几何中心（无 +4 下移）', () => {
  assert.match(
    ui,
    /drawCat\(ctx, breedId, canvas\.width \/ 2, canvas\.height \/ 2, 88/,
    'renderCollectionGrid 的 drawCat 锚点必须是几何中心（height / 2，不带偏移）'
  );
  assert.doesNotMatch(ui, /canvas\.height \/ 2 \+ 4/, '「+4 下移」不得回归（照片偏下缺陷）');
});

test('旧图鉴标签页死代码与同名样式块已删除', () => {
  assert.doesNotMatch(ui, /function renderCollectionTab/, 'renderCollectionTab 是零调用死代码，不得复活');
  assert.doesNotMatch(ui, /function renderCollectionRow/, 'renderCollectionRow 是零调用死代码，不得复活');
  // 死代码专属选择器（弹窗版不使用这些类名）
  for (const sel of ['.collection-header', '.collection-tip', '.collection-section-title',
                     '.collection-card-canvas-wrap', '.collection-card-rarity-tag', '.info-card {']) {
    assert.ok(!engineCss.includes(sel), `pet-module.css 不应残留死代码选择器 ${sel}`);
  }
});

test('图鉴弹窗展示层修复在位（cat-cabin.css 覆盖层）', () => {
  assert.match(cabinCss, /\.collection-modal \.collection-card\s*\{[^}]*aspect-ratio:\s*auto/,
    '方卡 aspect-ratio:1 会把「已拥有」行裁没，必须保持 auto');
  assert.match(cabinCss, /\.collection-modal \.collection-grid\s*\{[^}]*flex:\s*1 0 auto/,
    '网格必须 basis auto + 不收缩，否则「全部」tab 行高被压扁裁切');
  assert.match(cabinCss, /\.collection-modal \.collection-grid\s*\{[^}]*align-content:\s*start/,
    '行高不得被 stretch 均摊');
  assert.match(cabinCss, /\.collection-modal \.collection-card,[^}]*\.collection-card:hover\s*\{[^}]*cursor:\s*default/,
    '无点击行为的卡片不得保留假可点指针');
});

test('图鉴无障碍：canvas 与子标签语义在位', () => {
  assert.match(ui, /collection-cat-canvas"[^>]*role="img"[^>]*aria-label/, '猫咪 canvas 必须有替代文本');
  assert.match(ui, /collection-tab active"[^>]*role="tab"[^>]*tabindex="0"[^>]*aria-selected="true"/, '子标签必须是可聚焦 tab');
  assert.match(ui, /addEventListener\('keydown'[\s\S]{0,120}Enter/, '子标签需支持键盘激活');
});
