/* ============================================================
   大学吐槽榜 —— 「修改吐槽」（外联 JS）
   需求：吐槽之后还能回来修改自己每个维度的评分。

   做法（不改主 HTML）：
     · 在「✍️ 参与吐槽」**右侧**注入一个**小一号的次要按钮**「✏️ 修改吐槽」，
       不抢主按钮的视觉焦点（主按钮更大、橙色渐变，位于左侧）
     · 点击后拉 /api/complaints/mine：
         - 未登录 → 引导注册
         - 无记录 → 友好提示（不透传后端报错原文）
         - 1 条   → 直接进入修改
         - 多条   → 弹出选择框（每人上限 2 条，所以最多两项）
     · 修改复用页面已有的吐槽表单（16 个滑块 + 留言框）：
         回填原评分、锁定学校（评分可改、学校不可改）
     · 保存走 PUT /api/complaints/{id}：只改评分与留言，
       不发奖励、不占用「每人 2 次」的奖励次数
   ============================================================ */
(function () {
  'use strict';

  var editingId = null;
  var SUBMIT_TEXT = '🚀 提交吐槽！';
  var busy = false;

  function isEditing() { return editingId != null; }

  function sliders() {
    return document.querySelectorAll('#blRatingItems .bl-tousu-slider');
  }

  function collectMetrics() {
    var m = {};
    Array.prototype.forEach.call(sliders(), function (s) {
      m[s.getAttribute('data-metric')] = parseInt(s.value, 10) || 0;
    });
    return m;
  }

  function submitBtn() {
    return document.querySelector('#tousuFormModal .bl-tousu-submit');
  }

  function setSubmitText(t) {
    var b = submitBtn();
    if (b) b.textContent = t;
  }

  function shortDate(s) {
    return s ? String(s).replace('T', ' ').slice(0, 10) : '';
  }

  /* ---------- 样式（只作用于本文件注入的元素，不影响主站） ---------- */
  function injectStyle() {
    if (document.getElementById('blEditTousuStyle')) return;
    var css =
      /* 次要按钮：小一号 + 浅描边，弱化，突出右侧的主按钮 */
      '#blEditTousuBtn{flex:none;padding:7px 13px;border-radius:11px;' +
        'border:1.5px solid #FFE0B2;background:#FFFBF6;color:#C97B4A;' +
        'font-size:12.5px;font-weight:600;line-height:1;cursor:pointer;' +
        'display:inline-flex;align-items:center;gap:4px;white-space:nowrap;' +
        'transition:all .18s ease}' +
      '#blEditTousuBtn:hover{background:#FFF4E6;border-color:#FFB74D;color:#B9673A;transform:translateY(-1px)}' +
      '#blEditTousuBtn:active{transform:translateY(0)}' +
      '#blEditTousuBtn[disabled]{opacity:.55;cursor:default;transform:none}' +
      /* 选择框 */
      '#blPickComplaintModal .bl-pick-list{padding:2px 20px 20px;display:flex;flex-direction:column;gap:10px}' +
      '#blPickComplaintModal .bl-pick-tip{font-size:12px;color:#A1887F;padding:0 20px 10px;line-height:1.5}' +
      '#blPickComplaintModal .bl-pick-item{display:flex;align-items:center;gap:12px;width:100%;' +
        'padding:13px 15px;border-radius:14px;border:1.5px solid #FFE6CC;background:#fff;' +
        'cursor:pointer;transition:all .18s ease;text-align:left;font-family:inherit}' +
      '#blPickComplaintModal .bl-pick-item:hover{border-color:#FFB74D;background:#FFFBF6;' +
        'transform:translateY(-1px);box-shadow:0 6px 16px rgba(255,138,101,.18)}' +
      '#blPickComplaintModal .bl-pick-school{flex:1;min-width:0;font-size:14px;font-weight:700;color:#5D4037;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#blPickComplaintModal .bl-pick-score{flex:none;padding:4px 11px;border-radius:999px;' +
        'background:linear-gradient(135deg,#FFB74D,#FF8A65);color:#fff;font-size:12px;font-weight:800}' +
      '#blPickComplaintModal .bl-pick-date{flex:none;font-size:11px;color:#BCAAA4}';
    var st = document.createElement('style');
    st.id = 'blEditTousuStyle';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- 进入 / 退出修改模式 ---------- */
  function openEdit(item) {
    var modal = document.getElementById('tousuFormModal');
    if (!modal || !item) return;
    editingId = item.id;

    if (typeof renderBlRatingItems === 'function') renderBlRatingItems();   // 重建滑块（初值 0）

    /* 学校锁定为原值（本次只改评分） */
    window.BL_SELECTED_SCHOOL = item.schoolName;
    var si = document.getElementById('blSchoolSearch');
    if (si) {
      si.value = item.schoolName || '';
      si.readOnly = true;
      si.style.opacity = '.6';
    }

    /* 回填 16 维评分 */
    var m = item.metrics || {};
    Array.prototype.forEach.call(sliders(), function (s) {
      var v = m[s.getAttribute('data-metric')];
      v = (v == null ? 0 : v);
      s.value = v;
      var label = s.parentNode ? s.parentNode.querySelector('.bl-tousu-rating-val') : null;
      if (label) label.textContent = v;
    });

    /* 回填留言 */
    var ta = document.getElementById('blComment');
    if (ta) ta.value = item.content || '';

    /* 文案提示 */
    var hint = document.getElementById('tousuRemainHint');
    if (hint) hint.textContent = '正在修改你在这所学校的评分：改完点保存即生效（不再发放奖励）';
    setSubmitText('💾 保存修改');

    modal.style.display = '';
    modal.classList.add('show');
  }

  function resetEditState() {
    editingId = null;
    var si = document.getElementById('blSchoolSearch');
    if (si) {
      si.readOnly = false;
      si.style.opacity = '';
    }
    setSubmitText(SUBMIT_TEXT);
  }

  /* ---------- 多条记录时的选择框 ---------- */
  function ensurePicker() {
    var ov = document.getElementById('blPickComplaintModal');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'blPickComplaintModal';
    ov.className = 'rank-modal-overlay';
    ov.style.display = 'none';
    ov.addEventListener('click', function (e) { if (e.target === ov) hidePicker(); });
    document.body.appendChild(ov);
    return ov;
  }

  function hidePicker() {
    var ov = document.getElementById('blPickComplaintModal');
    if (ov) {
      ov.classList.remove('show');
      ov.style.display = 'none';
    }
  }

  function showPicker(list) {
    var ov = ensurePicker();
    var rows = list.map(function (it, i) {
      return '<button type="button" class="bl-pick-item" data-idx="' + i + '">' +
        '<span class="bl-pick-school">' + escapeHtml(it.schoolName || '未知学校') + '</span>' +
        '<span class="bl-pick-score">均分 ' + (it.score == null ? '-' : it.score) + '</span>' +
        '<span class="bl-pick-date">' + shortDate(it.createdAt) + '</span>' +
      '</button>';
    }).join('');

    ov.innerHTML =
      '<div class="bl-tousu-modal" style="max-width:440px;width:calc(100% - 40px)">' +
        '<div class="bl-tousu-close" data-close="1">×</div>' +
        '<div class="bl-tousu-header"><span class="bl-tousu-egg">✏️</span>' +
        '<span class="bl-tousu-title">修改哪一条吐槽？</span></div>' +
        '<div class="bl-pick-tip">你共有 ' + list.length + ' 条吐槽记录，选择要修改的那一条。</div>' +
        '<div class="bl-pick-list">' + rows + '</div>' +
      '</div>';
    ov.style.display = '';
    ov.classList.add('show');

    var closeEl = ov.querySelector('[data-close]');
    if (closeEl) closeEl.addEventListener('click', hidePicker);
    Array.prototype.forEach.call(ov.querySelectorAll('[data-idx]'), function (b) {
      b.addEventListener('click', function () {
        var item = list[parseInt(b.getAttribute('data-idx'), 10)];
        hidePicker();
        openEdit(item);
      });
    });
  }

  /* ---------- 入口点击：所有异常都给"人话"提示，不透传后端原文 ---------- */
  async function onClickEntry() {
    if (busy) return;
    if (!(window.USER && USER.registered)) {
      toast('请先注册你的蛋蛋～');
      if (typeof openRegModal === 'function') openRegModal();
      return;
    }

    var btn = document.getElementById('blEditTousuBtn');
    var oldText = btn ? btn.textContent : '';
    busy = true;
    if (btn) { btn.disabled = true; btn.textContent = '读取中…'; }

    var res;
    try {
      res = await apiGet('/api/complaints/mine');
    } finally {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }

    if (res && res.code === 401) {
      toast('请先登录后再修改～');
      return;
    }
    if (!res || res.code !== 200 || !Array.isArray(res.data)) {
      /* 后端异常/接口未就绪等：不把原始信息抛给用户 */
      toast('暂时读取不到你的吐槽记录，请稍后再试～');
      return;
    }

    var list = res.data;
    if (list.length === 0) {
      toast('你还没有吐槽记录，先点「参与吐槽」吧～');
      return;
    }
    if (list.length === 1) {
      openEdit(list[0]);
      return;
    }
    showPicker(list);
  }

  /* ---------- 主按钮左侧注入次要按钮 ---------- */
  function injectEntry() {
    if (document.getElementById('blEditTousuBtn')) return;
    var primary = document.querySelector('.bl-btn-tousu');
    if (!primary || !primary.parentNode) return;
    var btn = document.createElement('button');
    btn.id = 'blEditTousuBtn';
    btn.type = 'button';
    btn.textContent = '✏️ 修改吐槽';
    btn.addEventListener('click', onClickEntry);
    /* 插在主按钮之后：参与吐槽在左、修改吐槽在右 */
    primary.parentNode.insertBefore(btn, primary.nextSibling);
  }

  /* ---------- 包装工具：原函数执行完（含 async）后回调 ---------- */
  function wrapAfter(name, after) {
    var original = window[name];
    if (typeof original !== 'function' || original.__ceWrapped) return;
    var wrapped = function () {
      var ret = original.apply(this, arguments);
      var run = function () { try { after(); } catch (e) {} };
      if (ret && typeof ret.then === 'function') return ret.then(function (v) { run(); return v; });
      run();
      return ret;
    };
    wrapped.__ceWrapped = true;
    window[name] = wrapped;
  }

  /* ---------- 提交按钮：修改模式下改为「保存」 ---------- */
  function patchSubmit() {
    var original = window.submitTousu;
    if (typeof original !== 'function' || original.__ceWrapped) return;

    var wrapped = function () {
      if (!isEditing()) return original.apply(this, arguments);   // 正常提交，保持原逻辑

      var id = editingId;
      var metrics = collectMetrics();
      var ta = document.getElementById('blComment');
      var content = ta ? ta.value.trim() : '';

      return apiPut('/api/complaints/' + id, { metrics: metrics, content: content })
        .then(function (res) {
          if (!res || res.code !== 200) {
            toast('保存失败，请稍后再试～');
            return;
          }
          resetEditState();
          closeTousuForm();
          if (typeof renderBlacklistAll === 'function') renderBlacklistAll();
          toast('评分已更新，感谢你的补充～');
        });
    };
    wrapped.__ceWrapped = true;
    window.submitTousu = wrapped;
  }

  function setup() {
    injectStyle();
    injectEntry();
    patchSubmit();
    /* 关闭表单时恢复文案与学校输入（避免影响下一次正常吐槽） */
    wrapAfter('closeTousuForm', resetEditState);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
