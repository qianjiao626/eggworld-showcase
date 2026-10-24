/* ============================================================
   蛋蛋世界 · 实验室.beta「职业测评」（外联 JS）
   · 题目来自后端 /api/career-test/questions（19 题，照搬大师兄简历网题库）
   · 完成后 POST /api/career-test/generate 生成报告（后端扣 50 蛋蛋币并落库）
   · 支持查看历史报告 / 单份报告详情
   挂载方式：暴露 window.careerTestLoad / careerTestShowHistory / careerTestReset
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var state = { loaded: false, questions: null, answers: {}, index: 0, cost: 50, reportHtml: null };

  function el(id) { return document.getElementById(id); }
  function api(path, method, body) {
    var headers = {};
    var token = sessionStorage.getItem('token');
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body != null) headers['Content-Type'] = 'application/json';
    return fetch((window.API_BASE || '') + path, { method: method || 'GET', headers: headers, body: body == null ? undefined : JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function load() {
    if (state.loaded) return render();
    var body = el('careerTestBody');
    if (body) body.innerHTML = '<div class="career-test-empty">正在加载题目…</div>';
    return api('/api/career-test/questions').then(function (res) {
      if (!res || res.code !== 200 || !Array.isArray(res.data)) throw new Error((res && res.msg) || '题目加载失败');
      state.questions = res.data;
      state.loaded = true;
      return api('/api/career-test/meta').then(function (m) {
        if (m && m.code === 200 && m.data && m.data.cost) state.cost = m.data.cost;
        render();
      }).catch(function () { render(); });
    }).catch(function (e) {
      if (body) body.innerHTML = '<div class="career-test-empty">题目加载失败：' + esc(e.message) + '</div>';
    });
  }

  function render() {
    var body = el('careerTestBody');
    if (!body) return;
    var qs = state.questions || [];
    var i = state.index;
    var q = qs[i];
    if (!q) { body.innerHTML = '<div class="career-test-empty">暂无题目</div>'; return; }
    var done = Object.keys(state.answers).length;
    var opts = (q.options || []).map(function (o, idx) {
      var checked = state.answers[q.id] == (idx + 1) ? ' checked' : '';
      var inputType = q.type === 'datalist' ? 'text' : 'radio';
      if (inputType === 'radio') {
        return '<label class="career-opt"><input type="radio" name="careerOpt" value="' + (idx + 1) + '"' + checked + '><span>' + esc(o) + '</span></label>';
      }
      return '<input class="career-datalist" list="careerMajors" value="' + esc(state.answers[q.id] || '') + '" placeholder="选择或输入专业…"><datalist id="careerMajors">' + (q.options || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
    }).join('');
    body.innerHTML =
      '<div class="career-progress"><div class="career-progress-bar" style="width:' + Math.round(done / qs.length * 100) + '%"></div></div>' +
      '<div class="career-progress-text">已完成 ' + done + '/' + qs.length + ' 题 · Part ' + esc(q.part) + ' ' + esc(q.partText) + '</div>' +
      '<div class="career-q"><h4>第 ' + (i + 1) + ' 题：' + esc(q.stem) + '</h4><div class="career-opts" id="careerOpts">' + opts + '</div></div>' +
      '<div class="career-actions">' +
        (i > 0 ? '<button type="button" class="btn btn-ghost" onclick="careerTestPrev()">上一题</button>' : '') +
        (i < qs.length - 1
          ? '<button type="button" class="btn btn-primary" onclick="careerTestNext()">下一题</button>'
          : '<button type="button" class="btn btn-primary" onclick="careerTestGenerate()">生成报告（' + state.cost + ' 蛋蛋币）</button>') +
      '</div>';
  }

  function saveCurrent() {
    var q = state.questions[state.index];
    if (!q) return false;
    if (q.type === 'datalist') {
      var inp = document.querySelector('.career-datalist');
      if (inp && inp.value.trim()) { state.answers[q.id] = inp.value.trim(); return true; }
      delete state.answers[q.id]; return false;
    }
    var sel = document.querySelector('input[name="careerOpt"]:checked');
    if (sel) { state.answers[q.id] = sel.value; return true; }
    delete state.answers[q.id]; return false;
  }

  function next() { if (!saveCurrent()) { toast('请先选择答案'); return; } state.index = Math.min(state.index + 1, state.questions.length - 1); render(); }
  function prev() { saveCurrent(); state.index = Math.max(state.index - 1, 0); render(); }

  function generate() {
    if (!saveCurrent()) { toast('请先选择答案'); return; }
    var qs = state.questions;
    if (Object.keys(state.answers).length !== qs.length) { toast('请完成全部题目'); return; }
    if (!window.USER || !window.USER.registered) { toast('请先登录'); return; }
    if (!window.confirm('生成报告将消耗 ' + state.cost + ' 蛋蛋币，确定继续？')) return;
    var answers = qs.map(function (q) { return state.answers[q.id] || ''; });
    var body = el('careerTestBody');
    body.innerHTML = '<div class="career-test-empty">正在生成深度测评报告…</div>';
    api('/api/career-test/generate', 'POST', { answers: answers }).then(function (res) {
      if (!res || res.code !== 200) throw new Error((res && res.msg) || '生成失败');
      return api('/api/career-test/reports/' + res.data.recordId).then(function (d) {
        if (!d || d.code !== 200) throw new Error((d && d.msg) || '报告读取失败');
        state.reportHtml = d.data.report_html;
        if (window.USER) window.USER.points = (window.USER.points || 0) - state.cost;
        renderReport(d.data);
      });
    }).catch(function (e) {
      body.innerHTML = '<div class="career-test-empty">报告生成失败：' + esc(e.message) + ' <button type="button" class="btn btn-ghost" onclick="careerTestReset()">返回答题</button></div>';
    });
  }

  function renderReport(record) {
    var body = el('careerTestBody');
    body.innerHTML =
      '<div class="career-report-head"><button type="button" class="btn btn-ghost" onclick="careerTestReset()">重新测评</button>' +
      '<button type="button" class="btn btn-ghost" onclick="careerTestShowHistory()">历史报告</button></div>' +
      '<div class="career-report markdown-content">' + (record.report_html || '<p>（报告为空）</p>') + '</div>';
  }

  function showHistory() {
    if (!window.USER || !window.USER.registered) { toast('请先登录'); return; }
    var body = el('careerTestBody');
    body.innerHTML = '<div class="career-test-empty">正在加载历史报告…</div>';
    api('/api/career-test/history').then(function (res) {
      if (!res || res.code !== 200) throw new Error((res && res.msg) || '加载失败');
      var rows = res.data || [];
      if (!rows.length) { body.innerHTML = '<div class="career-test-empty">还没有历史报告，先去做一次测评吧。 <button type="button" class="btn btn-primary" onclick="careerTestReset()">开始测评</button></div>'; return; }
      body.innerHTML = '<div class="career-report-head"><button type="button" class="btn btn-ghost" onclick="careerTestReset()">返回测评</button></div>' +
        '<div class="career-history">' + rows.map(function (r) {
          return '<button type="button" class="career-history-item" onclick="careerTestOpen(' + r.id + ')">' +
            '<span class="career-history-date">' + esc(String(r.created_at || '').replace('T', ' ').slice(0, 19)) + '</span>' +
            '<span class="career-history-cost">消耗 ' + esc(r.cost) + ' 币</span><span class="career-history-arrow">查看 →</span></button>';
        }).join('') + '</div>';
    }).catch(function (e) {
      body.innerHTML = '<div class="career-test-empty">加载失败：' + esc(e.message) + '</div>';
    });
  }

  function open(id) {
    var body = el('careerTestBody');
    api('/api/career-test/reports/' + id).then(function (d) {
      if (!d || d.code !== 200) throw new Error((d && d.msg) || '读取失败');
      renderReport(d.data);
    }).catch(function (e) { body.innerHTML = '<div class="career-test-empty">读取失败：' + esc(e.message) + '</div>'; });
  }

  function reset() { state.index = 0; state.answers = {}; if (state.questions) render(); else load(); }
  function toast(msg) { if (typeof window.toast === 'function') window.toast(msg); else window.alert(msg); }

  window.careerTestLoad = load;
  window.careerTestNext = next;
  window.careerTestPrev = prev;
  window.careerTestGenerate = generate;
  window.careerTestShowHistory = showHistory;
  window.careerTestOpen = open;
  window.careerTestReset = reset;

  document.addEventListener('DOMContentLoaded', function () { /* 进入实验室面板时再加载，见 growth-schoolv3 的 switchLabItem */ });
})();
