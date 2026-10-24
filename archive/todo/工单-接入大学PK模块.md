# 工单：接入大学PK模块 v2.0 + UI美化

> **状态**: 待开发 | **创建日期**: 2026-09-14 | **来源**: D:\桌面文件\大学PK模块_v2.0\ | **预估工时**: 1天

---

## 📋 需求目标

将独立的「大学PK模块 v2.0」接入蛋蛋世界主站的大学黑榜页面，并对其 UI 进行美化升级。

**接入后效果**：用户打开大学黑榜 → 看到工具栏新增「⚔️ 大学PK」按钮 → 点击弹出 PK 弹窗 → 选两所学校 → 16项指标逐项对比 + 实时吐槽滚动弹幕 → 可生成分享图下载。

---

## 🏗️ 前置分析

### PK模块现状（4个独立文件）
- `pk-module.html` — 入口按钮 + PK弹窗 + 分享图弹窗 HTML
- `pk-module.css` — 全部样式（125行，硬编码色值）
- `pk-module.js` — 全部逻辑（645行，依赖 `BL_DATA` 全局对象）
- `README.md` — 部署文档

### 与主站的关键差异

| 维度 | PK模块 | 主站现有 |
|------|--------|---------|
| 数据来源 | 前端内存 `BL_DATA` 对象 | 后端API + `BL_RANK_LIST` 缓存 |
| 颜色体系 | `#FF6B9D` / `#7C4DFF` 硬编码 | `:root` CSS变量体系 |
| 吐槽数据 | `BL_DATA[school].comments` | `BL_WALL` 数组（字段名不同） |
| 学校显示名 | `blSchoolName()` | 同，已存在 |

**结论**：不能直接复制粘贴。需要做数据适配层 + 颜色变量化 + 结构嵌入。

---

## 📁 涉及文件

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `eggworld/growth-schoolv3.html` | ✏️ 大幅修改 | 1个文件搞定全部（HTML+CSS+JS 集中追加） |
| 2 | `大学PK模块_v2.0/pk-module.css` | 👁️ 参考 | 不改，只是引用源 |
| 3 | `大学PK模块_v2.0/pk-module.js` | 👁️ 参考 | 不改，只是引用源 |
| 4 | `大学PK模块_v2.0/pk-module.html` | 👁️ 参考 | 不改，只是引用源 |
| 5 | `eggworld/js/pk-module.js` | ✨ 新建（可选） | 若拆出外联JS则新建；也可以全写进 growth-schoolv3.html |

> **建议方案**：因为改动量大且含数据适配层，建议新建 `eggworld/js/pk-module.js` 外联文件，CSS 和 HTML 仍写进主文件。

---

## 一、数据适配层（最优先，决定能否跑通）

### 1.1 创建 BL_DATA 构建函数

PK模块所有逻辑依赖 `BL_DATA` 对象（格式: `{学校名: {metrics:{}, count, comments:[], sum:{}}}`）。主站没有这个对象，需要在 PK 初始化时从主站数据构建。

**在主站 `renderBlacklistAll()` 函数末尾（BL_RANK_LIST 构建完成后）调用 `buildBlPkData()`**：

```javascript
// 新增函数：从主站 BL_RANK_LIST + BL_WALL 构建 PK 所需的 BL_DATA
function buildBlPkData() {
  BL_DATA = {};
  (BL_RANK_LIST || []).forEach(function(item) {
    var school = item.schoolName;
    BL_DATA[school] = {
      metrics: item.metrics || {},
      count: item.count || 0,
      comments: (BL_WALL || []).filter(function(c) { return c.schoolName === school; })
                .map(function(c) { return { user: c.userName || '匿名蛋', text: c.content || '' }; }),
      sum: {} // PK模块 share canvas 中查 sum.avg
    };
    // 计算平均分供 PK 评星用
    if (item.avgScore != null) BL_DATA[school].sum.avg = +item.avgScore;
  });
}

// 新增函数：替代 getBlAvg，从 BL_DATA 或 BL_RANK_LIST 取值
function getBlAvg(school) {
  if (BL_DATA && BL_DATA[school] && BL_DATA[school].sum.avg != null) return BL_DATA[school].sum.avg;
  var found = (BL_RANK_LIST || []).find(function(r) { return r.schoolName === school; });
  return found && found.avgScore != null ? +found.avgScore : 0;
}
```

### 1.2 修改 PK 模块中的数据读取

全局搜索 PK JS 中的 `BL_DATA[BL_PK_SCHOOL_A]` 和 `BL_DATA[BL_PK_SCHOOL_B]`，改为安全读取宏：

```javascript
// 在 pk 模块开头定义辅助函数
function pkGetMetrics(school) {
  return (BL_DATA && BL_DATA[school]) ? (BL_DATA[school].metrics || {}) : {};
}
function pkGetComments(school) {
  return (BL_DATA && BL_DATA[school]) ? (BL_DATA[school].comments || []) : [];
}
function pkGetCount(school) {
  return (BL_DATA && BL_DATA[school]) ? (BL_DATA[school].count || 0) : 0;
}
```

然后 JS 中：
```javascript
// 原：var va = BL_DATA[BL_PK_SCHOOL_A].metrics[m.key] || 0;
// 改：var va = pkGetMetrics(BL_PK_SCHOOL_A)[m.key] || 0;
```

---

## 二、HTML 插入（3处）

### 2.1 入口按钮

在 `#page-blacklist` section 内的 `.bl-toolbar` 中，现有搜索框和"参与吐槽"按钮之间插入：

```html
<button class="bl-btn-pk" onclick="openBlPkModal()">
  <span>⚔️</span><span>大学PK</span>
</button>
```

### 2.2 PK弹窗

在 `#page-blacklist` section 闭合标签后、下一个 page section 之前插入完整的 `#blPkModal` div。

结构：
```
<div class="rank-modal-overlay" id="blPkModal" style="display:none" onclick="if(event.target===this)closeBlPkModal()">
  <div class="rank-modal bl-pk-modal">
    <!-- 标题栏 + 分享按钮 -->
    <!-- 搜索行（A方 + VS + B方） -->
    <!-- 对比内容区（动态渲染） -->
  </div>
</div>
```

> 完整 HTML 结构参见源文件 `大学PK模块_v2.0\pk-module.html`。

### 2.3 分享图弹窗

在 `#blSchoolDetailModal` 附近插入：

```html
<div class="rank-modal-overlay" id="blPkShareModal" style="display:none" onclick="if(event.target===this)document.getElementById('blPkShareModal').style.display='none'">
  <div class="rank-modal bl-share-modal">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 0">
      <h3 style="font-size:18px;font-weight:800">📸 大学PK结果</h3>
      <button class="rank-modal-close" onclick="document.getElementById('blPkShareModal').style.display='none'">&times;</button>
    </div>
    <div class="bl-share-modal-body">
      <div class="bl-share-img-wrap"><canvas id="blPkShareCanvas"></canvas></div>
      <p class="bl-share-tip">长按图片保存，分享给朋友</p>
      <button class="btn btn-primary" onclick="downloadPkShareImg()">💾 下载图片</button>
    </div>
  </div>
</div>
```

---

## 三、CSS 合并 + UI美化（核心美化工作）

### 3.1 设计令牌 — 定义 CSS 变量

在 `:root` 块中追加 PK 专用变量（约第 51 行）：

```css
/* ===== PK模块 · 设计令牌 ===== */
--pk-a: #FF6B9D;        /* 大学A 主色（粉） */
--pk-a-dark: #FF3D7A;   /* 大学A 深色（胜方高亮） */
--pk-a-light: #FFE8EF;  /* 大学A 浅色底 */
--pk-b: #7C4DFF;        /* 大学B 主色（紫） */
--pk-b-dark: #5E35B1;   /* 大学B 深色 */
--pk-b-light: #F0E8FF;  /* 大学B 浅色底 */
--pk-bg: linear-gradient(135deg, #FFF5F7 0%, #FFF9F0 50%, #F3E5F5 100%);
--pk-border: #F5E6D3;
--pk-text: #5D4037;      /* 正文深棕 */
--pk-muted: rgba(93,64,55,.45);
--pk-shadow: 0 24px 64px rgba(93,64,55,.18);
```

### 3.2 现有样式逐个美化改造

以下每个改造点对应源文件 `pk-module.css` 中的代码，输出时**全部改用 CSS 变量**。

#### ① 入口按钮 — 增强视觉层次

```css
/* 原：单一紫色渐变 → 美化为：双层渐变 + 发光边框 */
.bl-btn-pk {
  flex: none;
  padding: 12px 24px;
  border-radius: 16px;
  border: none;
  background: linear-gradient(135deg, var(--pk-b), var(--pk-b-dark));
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all .25s var(--bounce);
  box-shadow: 0 4px 12px rgba(94,53,177,.3);
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  overflow: hidden;
}
.bl-btn-pk::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(255,255,255,.15), transparent 60%);
  pointer-events: none;
}
.bl-btn-pk:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(94,53,177,.45), 0 0 0 3px rgba(124,77,255,.15);
}
```

#### ② PK弹窗 — 增加微质感

```css
.bl-pk-modal {
  width: 780px;                /* 原760→780 稍微放宽 */
  max-width: 94vw;
  max-height: 90vh;
  background: var(--pk-bg);
  border-radius: 24px;
  border: 1px solid var(--pk-border);
  box-shadow: var(--pk-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: pkModalIn .35s var(--bounce);  /* 新增：弹窗入场动画 */
}
@keyframes pkModalIn {
  from { opacity: 0; transform: scale(.92) translateY(16px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

#### ③ 搜索输入框 — 增加聚焦态动效

```css
.bl-pk-school-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 14px;
  border: 2px solid var(--pk-border);
  background: #fff;
  color: var(--pk-text);
  font-size: 14px;
  outline: none;
  transition: all .25s ease;
  box-sizing: border-box;
}
.bl-pk-school-input:focus {
  border-color: var(--pk-b);
  box-shadow: 0 0 0 4px rgba(124,77,255,.08), 0 2px 8px rgba(124,77,255,.1);  /* 增强发光 */
}
```

#### ④ 下拉选项 — 增加顺序编号 + 微动效

```css
.bl-pk-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  max-height: 200px;
  overflow-y: auto;
  border-radius: 14px;              /* 原12→14 */
  background: #fff;
  border: 1px solid var(--pk-border);
  z-index: 10;
  display: none;
  box-shadow: 0 12px 32px rgba(93,64,55,.12);  /* 原8/24→12/32 增强阴影 */
  animation: pkDropIn .2s ease;      /* 新增：下拉入场 */
}
@keyframes pkDropIn {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

#### ⑤ 大比分数字 — 增加光泽动画

```css
/* 原渐变固定 → 美化：增加光泽扫过 + 数字微动 */
.bl-pk-bigscore-num {
  font-size: 72px;            /* 原64→72 更震撼 */
  font-weight: 900;
  line-height: 1;
  position: relative;
  animation: pkScoreIn .5s var(--bounce);  /* 新增 */
}
@keyframes pkScoreIn {
  from { transform: scale(.5); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
.bl-pk-bigscore-num.left {
  background: linear-gradient(135deg, var(--pk-a), #FF8E53);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
.bl-pk-bigscore-num.right {
  background: linear-gradient(135deg, var(--pk-b), var(--pk-b-dark));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

#### ⑥ 指标对比行 — 进度条增加条纹纹理

```css
.bl-pk-metric-bar-left {
  height: 10px;                        /* 原8→10 */
  border-radius: 5px;
  background: linear-gradient(90deg, var(--pk-a), #FF8E53);
  background-size: 200% 100%;          /* 新增：渐变动画 */
  transition: width .6s cubic-bezier(.4,0,.2,1);  /* 原.4s→.6s 更丝滑 */
  position: relative;
  overflow: hidden;
}
.bl-pk-metric-bar-left::after {        /* 新增：光泽条纹 */
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    -45deg, transparent, transparent 4px, rgba(255,255,255,.2) 4px, rgba(255,255,255,.2) 8px
  );
  border-radius: 5px;
}
.bl-pk-metric-bar-right {
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--pk-b), var(--pk-b-dark));
  transition: width .6s cubic-bezier(.4,0,.2,1);
  position: relative;
  overflow: hidden;
}
.bl-pk-metric-bar-right::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    -45deg, transparent, transparent 4px, rgba(255,255,255,.2) 4px, rgba(255,255,255,.2) 8px
  );
  border-radius: 5px;
}
```

#### ⑦ 吐槽滚动弹幕 — 增加毛玻璃效果

```css
.bl-pk-comments-wrap {
  margin-top: 16px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(124,77,255,.03);
  backdrop-filter: blur(8px);            /* 新增：毛玻璃 */
  border: 1px solid rgba(124,77,255,.08); /* 新增：微边框 */
}
.bl-pk-comments-scroll {
  height: 140px;                          /* 原120→140 */
  overflow: hidden;
  position: relative;
  mask-image: linear-gradient(            /* 新增：上下渐变遮罩 */
    to bottom, transparent 0%, black 10%, black 90%, transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom, transparent 0%, black 10%, black 90%, transparent 100%
  );
}
```

#### ⑧ 分享图弹窗 — Canvas 预览优化

```css
.bl-share-modal {
  width: 440px;                      /* 原420→440 */
  max-width: 94vw;
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  animation: pkModalIn .35s var(--bounce);
}
.bl-share-img-wrap {
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 16px;
  background: #f0f0f5;               /* 原#f5f5f7→稍深 */
  max-height: 520px;                  /* 原500→520 */
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0,0,0,.08);  /* 新增 */
}
```

#### ⑨ 新增：loading 态

```css
/* 选中学校后数据未就绪时的骨架屏 */
.bl-pk-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  flex-direction: column;
  gap: 12px;
  color: var(--pk-muted);
  font-size: 14px;
}
.bl-pk-loading-spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--pk-border);
  border-top-color: var(--pk-b);
  border-radius: 50%;
  animation: pkSpin .8s linear infinite;
}
@keyframes pkSpin { to { transform: rotate(360deg); } }
```

#### ⑩ 移动端适配增强

```css
@media(max-width:768px) {
  .bl-pk-modal { width: 96vw; max-height: 92vh; border-radius: 18px; }
  .bl-pk-search-row { flex-direction: column; gap: 8px; }
  .bl-pk-vs { align-self: center; padding: 4px 0; }
  .bl-pk-bigscore-num { font-size: 48px; }     /* 小屏缩小 */
  .bl-pk-metric-row { grid-template-columns: 1fr auto 1fr; gap: 4px; }
}
```

### 3.3 样式合并位置

所有 CSS 追加到主文件 `<style>` 标签中「大学黑榜样式」注释之后（约第 921 行），按以下分组标注：

```css
/* ===== 大学PK模块 · 设计令牌 ===== */
/* ===== 大学PK模块 · 入口按钮 ===== */
/* ===== 大学PK模块 · 弹窗容器 ===== */
/* ===== 大学PK模块 · 搜索与下拉 ===== */
/* ===== 大学PK模块 · 大比分显示 ===== */
/* ===== 大学PK模块 · 指标对比行 ===== */
/* ===== 大学PK模块 · 吐槽滚动弹幕 ===== */
/* ===== 大学PK模块 · 分享按钮与弹窗 ===== */
/* ===== 大学PK模块 · 空状态与Loading ===== */
/* ===== 大学PK模块 · 移动端适配 ===== */
```

---

## 四、JS 合并 + 改造（6项修改）

### 4.1 文件组织方案

**方案A（推荐）**：新建 `eggworld/js/pk-module.js`，在 growth-schoolv3.html 中引用：
```html
<script src="js/pk-module.js"></script>
```
放在其他外联 JS 引用之后、主 script 之前。

**方案B**：全部直接写入 growth-schoolv3.html 的 `<script>` 标签中。

### 4.2 必须修改的代码位置

从源文件 `大学PK模块_v2.0\pk-module.js` 复制后，做以下6项改造：

| # | 位置 | 改造内容 |
|---|------|---------|
| 1 | 文件开头 | 追加 `var BL_DATA = {};` 声明 + 新增 `buildBlPkData()` 和 `getBlAvg()` |
| 2 | `searchBlPkSchool()` | 排行榜从 `BL_DATA` keys → 改为从 `BL_RANK_LIST` 排序取值 |
| 3 | `renderBlPkCompare()` | 所有 `BL_DATA[学校].metrics[key]` → 改为 `pkGetMetrics(学校)[key]` |
| 4 | `renderBlPkCompare()` | 吐嘈数据来源 `BL_DATA[学校].comments` → 改为 `pkGetComments(学校)` |
| 5 | `startPkCommentsScroll()` | 使用 `requestAnimationFrame` 替代 `setInterval`（性能优化） |
| 6 | `drawPkShareCanvas()` | 标题文字改为"蛋蛋世界的大学PK"，网址使用 `www.dsxnb.com` |

### 4.3 调用时机

在主站 `renderBlacklistAll()` 返回后调用 `buildBlPkData()`：

```javascript
// 在 renderBlacklistAll 末尾 BL_RANK_LIST 赋值后追加：
BL_RANK_LIST = ...; // 现有代码
buildBlPkData();     // 新增：构建PK模块所需数据结构
```

### 4.4 函数命名空间

所有 PK 模块函数保持 `BlPk` 前缀，避免与主站函数冲突。检查项：
- `openBlPkModal` / `closeBlPkModal` ✅
- `searchBlPkSchool` ✅
- `renderBlPkCompare` ✅
- `generatePkShareImg` / `downloadPkShareImg` ✅

---

## 五、Canvas 分享图美化（画出来的图也要好看）

除了 `pk-module.js` 已有的 Canvas 绘制代码（750x1400），额外美化以下部分：

| 美化项 | 说明 |
|--------|------|
| 顶部 EGG WORLD 标签 | 增加圆角胶囊 + 阴影，背景用 `--pk-b` 渐变 |
| 大比分数字 | 字体增大到 140px，增加渐变色 + 阴影描边 |
| 综合分对比条 | 绘制圆角进度条（用 `roundRect` 或 arcTo），加玻璃质感高光 |
| 8项指标区 | 隔行交替浅粉/浅紫色底色，当前项加圆点指示器 |
| 底部分隔线 | 虚线改为渐变虚线（分段 stroke），更有设计感 |
| 底部二维码占位 | 添加 80x80 白色方框 + "扫一扫" 文字提示 |
| 整体配色 | 背景从纯白 → 微奶油色 `#FFFBF7`，增加柔和感 |

**Canvas 尺寸保持 750x1400**，比例适合手机分享。

---

## 六、待确认问题

1. **PK模块颜色方案**：建议保留粉(#FF6B9D) vs 紫(#7C4DFF)的双色对决体系，不与主站青绿色体系合并。这样 PK 场景视觉更有"对抗感"。是否同意？
2. **分享图二维码**：Canvas右下角预留二维码位置，用白色占位框即可，还是需要生成真实二维码？
3. **PK弹窗里的校名**：继续使用 `blSchoolName()` 加"蛋蛋世界的"前缀，还是换成真实校名？

---

## 七、验证清单

### 基础功能
- [ ] 大学黑榜工具栏显示「⚔️ 大学PK」按钮
- [ ] 点击按钮弹出 PK 弹窗（带入场动画）
- [ ] 搜索框空值时显示 Top10 热门排行榜
- [ ] 搜索学校支持模糊匹配 + 手动新增
- [ ] 选中两所学校后自动渲染对比结果
- [ ] 大比分数字正确显示 + 胜负高亮
- [ ] 16项指标逐项对比 + 进度条动画
- [ ] 底部吐槽弹幕自动滚动 + hover 暂停
- [ ] 点击校名跳转到详情弹窗（PK弹窗自动关闭）
- [ ] 分享按钮生成 Canvas 图片
- [ ] 下载图片功能正常

### UI美化
- [ ] 按钮 hover 有发光边框效果
- [ ] 进度条条纹纹理可见
- [ ] 吐槽弹幕有渐变遮罩
- [ ] 所有动画流畅（60fps）
- [ ] 移动端布局不崩（768px 断点）
- [ ] 分享图 Canvas 样式美观

### 数据与边界
- [ ] 无吐槽数据的学校弹幕显示"暂无吐槽"
- [ ] 自己PK自己 → 显示"势均力敌"标签
- [ ] 快速切换学校不报错
- [ ] 弹窗关闭后清理定时器

---

## 八、改造工作量

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| HTML合并 | 3处HTML插入 | 轻（约60行复制） |
| CSS合并+美化 | 125行→约200行（含新增动画/loading/条纹） | 中 |
| JS 数据适配 | 构建 BL_DATA + 修改数据读取调用 | 中（约50行新增+30处改） |
| JS 合并 | 645行→主文件（含性能优化） | 轻（复制+替换） |
| Canvas美化 | drawPkShareCanvas 图像优化 | 轻（约20处样式调整） |
| 验证 | 按清单逐项测试 | 中 |
| **总计** | | **约半天到一天** |