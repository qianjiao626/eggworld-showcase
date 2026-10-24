/* 爆料模块与打听悬赏相互隔离；所有请求复用页面的 token 与 JSON 客户端。 */
(function (global) {
  'use strict';
  var listPage = 1, listPages = 1, commentsPage = 1, commentPages = 1;
  var openId = null, publishing = false, commenting = false, reviewing = false;
  function el(id) { return document.getElementById(id); }
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); }
  function lines(value) { return escape(value).replace(/\r?\n/g, '<br>'); }
  function signedIn() { return !!(global.sessionStorage && global.sessionStorage.getItem('token')); }
  function date(value) { return escape(String(value || '').replace('T',' ').slice(0,16)); }
  function idOf(value) { var n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
  function responseMessage(res, fallback) { return (res && res.msg) || fallback; }
  function status(id, message) { var node = el(id); if (node) node.textContent = message; }
  function loginPrompt() {
    status('reportStatus', '请先登录后再发布或互动');
    if (typeof global.openLoginModal === 'function') global.openLoginModal();
  }
  function renderCard(r) {
    var id = idOf(r.id), anon = r.anonymous === true || Number(r.anonymous) === 1;
    return '<article class="report-card"><button type="button" class="report-card-open" data-report-action="detail" data-id="' + id + '">' +
      '<span class="report-card-meta">' + (anon ? '🎭 匿名爆料' : '🥚 ' + escape(r.publisherNickname || '已注销用户')) + ' · ' + date(r.createdAt) + '</span>' +
      '<strong>' + escape(r.title) + '</strong><span class="report-preview">' + escape(String(r.content || '').slice(0, 180)) + '</span>' +
      '<span class="report-card-meta">❤️ ' + (Number(r.likes) || 0) + ' · 💬 ' + (Number(r.commentCount) || 0) +
      ' · ' + (r.rewardStatus === 'settled' ? '平台奖励 ' + (Number(r.rewardAmount) || 0) + ' 金币' : '奖励待定') + '</span></button></article>';
  }
  async function load() {
    var result = await global.apiGet('/api/gossip/reports?page=' + listPage + '&size=20');
    if (result.code !== 200) { status('reportStatus', responseMessage(result,'爆料暂时无法加载')); return; }
    listPages = Math.max(1, Number(result.data.pages) || 1);
    var items = result.data.records || [];
    el('reportCards').innerHTML = items.length ? items.map(renderCard).join('') : '<p class="report-empty">还没有公开爆料，来留下第一条吧。</p>';
    status('reportPageLabel', '第 ' + listPage + ' / ' + listPages + ' 页');
  }
  function selectTab(tab) {
    var reports = tab === 'reports';
    el('gossipAskPane').hidden = reports; el('gossipReportPane').hidden = !reports;
    el('reportTabAsk').setAttribute('aria-selected', String(!reports));
    el('reportTabReports').setAttribute('aria-selected', String(reports));
    if (reports) load();
  }
  async function checkText(text) {
    return global.apiPost('/api/gossip/reports/check-text', {text: text});
  }
  async function submit() {
    if (publishing) return;
    if (!signedIn()) { loginPrompt(); return; }
    var title = el('reportTitle').value.trim(), content = el('reportContent').value.trim();
    if (!title || !content || title.length > 120 || content.length > 2000) { status('reportStatus','请填写标题（最多120字）与正文（最多2000字）'); return; }
    publishing = true; el('reportSubmit').disabled = true;
    try {
      status('reportStatus','正在校验文字…');
      var pre = await checkText(title + '\n' + content);
      if (pre.code !== 200) { status('reportStatus',responseMessage(pre,'内容校验失败，草稿已保留')); return; }
      var res = await global.apiPost('/api/gossip/reports', {title:title,content:content,anonymous:!!el('reportAnonymous').checked});
      if (res.code !== 200) { status('reportStatus',responseMessage(res,'提交失败，草稿已保留')); return; }
      el('reportTitle').value = ''; el('reportContent').value = '';
      el('reportAnonymous').checked = false;
      status('reportStatus','提交成功；普通用户的爆料通过审核后才会公开。');
      listPage = 1; await load();
    } catch (error) { status('reportStatus','网络出错，草稿已保留，请稍后重试'); }
    finally { publishing = false; el('reportSubmit').disabled = false; }
  }
  async function detail(id) {
    id = idOf(id); if (!id) return;
    var res = await global.apiGet('/api/gossip/reports/' + id);
    if (res.code !== 200) { status('reportStatus',responseMessage(res,'爆料已下架')); await load(); return; }
    var r = res.data, anon = r.anonymous === true || Number(r.anonymous) === 1;
    openId = id; commentsPage = 1;
    el('reportCards').hidden = true; el('reportDetails').hidden = false;
    el('reportDetails').innerHTML = '<button type="button" data-report-action="back">← 返回爆料区</button>' +
      '<article class="report-detail-card"><h2>' + escape(r.title) + '</h2><div class="report-card-meta">' +
      (anon ? '匿名爆料' : escape(r.publisherNickname)) + ' · ' + date(r.createdAt) + '</div><p>' + lines(r.content) + '</p>' +
      '<button type="button" data-report-action="like" data-id="' + id + '">❤️ ' + (Number(r.likes) || 0) + (Number(r.liked) ? ' · 已点赞' : ' · 点赞') + '</button></article>' +
      '<h3>评论</h3><div id="reportComments" aria-live="polite"></div>' +
      '<div class="report-pagination"><button type="button" data-report-action="comments-prev">上一页</button><span id="reportCommentsPage"></span><button type="button" data-report-action="comments-next">下一页</button></div>' +
      '<div class="report-comment-form"><label>留下你的评论（仅文字）<textarea id="reportCommentText" maxlength="500" rows="3"></textarea></label>' +
      '<button type="button" id="reportCommentSubmit" data-report-action="comment">提交评论</button><span id="reportCommentStatus" role="status"></span></div>';
    await loadComments();
  }
  async function loadComments() {
    var res = await global.apiGet('/api/gossip/reports/' + openId + '/comments?page=' + commentsPage + '&size=20');
    if (res.code !== 200) { status('reportCommentStatus', responseMessage(res,'评论加载失败')); return; }
    commentPages = Math.max(1,Number(res.data.pages) || 1);
    var rows = res.data.records || [];
    el('reportComments').innerHTML = rows.length ? rows.map(function(c) {
      return '<div class="report-comment"><b>' + escape(c.authorNickname || '已注销用户') + '</b><time>' + date(c.createdAt) + '</time><p>' + lines(c.content) + '</p></div>';
    }).join('') : '<p class="report-empty">暂无评论</p>';
    status('reportCommentsPage','第 ' + commentsPage + ' / ' + commentPages + ' 页');
  }
  async function comment(id) {
    if (commenting) return;
    if (!signedIn()) { loginPrompt(); status('reportCommentStatus','请先登录再评论'); return; }
    var input = el('reportCommentText'), btn = el('reportCommentSubmit');
    var text = input.value.trim();
    if (!text || text.length > 500) { status('reportCommentStatus','评论需为 1～500 字'); return; }
    commenting = true; btn.disabled = true;
    try {
      var pre = await checkText(text);
      if (pre.code !== 200) { status('reportCommentStatus',responseMessage(pre,'文字校验失败，草稿已保留')); return; }
      var res = await global.apiPost('/api/gossip/reports/' + id + '/comments',{content:text});
      if (res.code !== 200) { status('reportCommentStatus',responseMessage(res,'提交失败，草稿已保留')); return; }
      input.value = ''; status('reportCommentStatus','评论已发布');
      commentsPage = 1; await loadComments();
    } catch (error) { status('reportCommentStatus','网络出错，草稿已保留'); }
    finally { commenting = false; btn.disabled = false; }
  }
  async function like(id) {
    if (!signedIn()) { loginPrompt(); return; }
    var res = await global.apiPost('/api/gossip/reports/' + id + '/like',{});
    if (res.code !== 200) { status('reportCommentStatus',responseMessage(res,'点赞失败')); return; }
    await detail(id);
  }
  function safeReason(value) { return value && value.trim().slice(0,500); }
  function pendingCard(r) {
    var id = idOf(r.id), waiting = r.status === 'pending';
    return '<article class="report-manage-card"><h4>' + escape(r.title) + ' <small>#' + id + '</small></h4>' +
      '<span>实际发布者：' + escape(r.publisherNickname) + ' · ' + (r.anonymous ? '前台匿名' : '前台实名') + '</span><p>' + lines(r.content) + '</p>' +
      '<label>平台奖励（0～10000）<input type="number" min="0" max="10000" step="1" value="0" data-report-reward="' + id + '"></label>' +
      (waiting ? '<label>驳回原因<input maxlength="500" data-report-reason="' + id + '" placeholder="驳回时必填"></label>' : '<span>管理员直接发布 · 仅另一管理员可决定奖励</span>') +
      '<div class="report-manage-actions"><button type="button" data-report-action="' + (waiting ? 'approve' : 'settle') + '" data-id="' + id + '">' + (waiting ? '审核通过并结算' : '结算奖励') + '</button>' +
      (waiting ? '<button type="button" data-report-action="reject" data-id="' + id + '">驳回</button>' : '') + '</div></article>';
  }
  function historyCard(r) {
    var id = idOf(r.id), statusName = {published:'公开',hidden:'已隐藏',deleted:'已删除',rejected:'已驳回',pending:'待审核'}[r.status] || escape(r.status);
    return '<article class="report-manage-card"><h4>' + escape(r.title) + ' <small>#' + id + ' · ' + statusName + '</small></h4>' +
      '<span>实际发布者：' + escape(r.publisherNickname) + '</span><p>' + lines(r.content) + '</p>' +
      '<label>处理原因<input data-report-modreason="' + id + '" maxlength="500" placeholder="隐藏 / 删除原因"></label>' +
      '<div class="report-manage-actions"><button type="button" data-report-action="admin-comments" data-id="' + id + '">查看 / 处理评论</button>' +
      (r.status === 'published' ? '<button type="button" data-report-action="hide" data-id="' + id + '">隐藏</button>' : '') +
      (r.status === 'published' || r.status === 'hidden' ? '<button type="button" data-report-action="delete" data-id="' + id + '">删除</button>' : '') + '</div></article>';
  }
  async function loadAdmin() {
    var pending = await global.apiGet('/api/admin/gossip-reports/pending');
    if (pending.code !== 200) { el('reportAdminList').textContent=responseMessage(pending,'无法读取待审核爆料'); return; }
    el('reportAdminList').innerHTML = pending.data.length ? pending.data.map(pendingCard).join('') : '<p class="report-empty">暂无待审核或待结算爆料</p>';
    var history = await global.apiGet('/api/admin/gossip-reports');
    el('reportAdminHistory').innerHTML = history.code === 200 ?
      ((history.data || []).length ? history.data.map(historyCard).join('') : '<p class="report-empty">暂无爆料记录</p>') : escape(responseMessage(history,'读取失败'));
  }
  async function review(id, action) {
    if (reviewing) return;
    var input = document.querySelector('[data-report-reward="' + id + '"]');
    var reasonInput = document.querySelector('[data-report-reason="' + id + '"]');
    var amount = input ? Number(input.value) : 0, reason = safeReason(reasonInput && reasonInput.value);
    if (action !== 'reject' && (input.value.trim() === '' || !Number.isInteger(amount) || amount < 0 || amount > 10000)) { status('reportStatus','请输入 0～10000 的整数奖励'); global.toast('请输入 0～10000 的整数奖励'); return; }
    if (action === 'reject' && !reason) { global.toast('请填写驳回原因'); return; }
    reviewing = true;
    try {
      var res = await global.apiPost('/api/admin/gossip-reports/' + id + '/' + (action === 'settle' ? 'settle-reward' : action),
        action === 'reject' ? {reason:reason} : {amount:amount});
      if (res.code !== 200) { global.toast(responseMessage(res,'处理失败，请重试')); return; }
      global.toast('处理成功'); await loadAdmin(); await load();
    } catch (e) { global.toast('网络错误，请重试'); }
    finally { reviewing = false; }
  }
  async function moderate(id, action, commentTarget) {
    if (reviewing) return;
    var field = document.querySelector((commentTarget ? '[data-comment-reason="' : '[data-report-modreason="') + id + '"]');
    var reason = safeReason(field && field.value);
    if (!reason) { global.toast('请先填写处理原因'); return; }
    reviewing = true;
    try {
      var url = commentTarget ? '/api/admin/gossip-report-comments/' : '/api/admin/gossip-reports/';
      var res = await global.apiPost(url + id + '/' + action, {reason:reason});
      if (res.code !== 200) { global.toast(responseMessage(res,'处理失败')); return; }
      global.toast('处理成功');
      if (commentTarget) await adminComments(commentTarget); else { await loadAdmin(); await load(); }
    } finally { reviewing = false; }
  }
  async function adminComments(reportId) {
    var res = await global.apiGet('/api/admin/gossip-reports/' + reportId + '/comments');
    if (res.code !== 200) { global.toast(responseMessage(res,'评论读取失败')); return; }
    el('reportAdminComments').innerHTML = '<h4>爆料 #' + reportId + ' 的评论治理</h4>' +
      ((res.data || []).length ? res.data.map(function(c) {
        var id = idOf(c.id);
        return '<div class="report-manage-card"><b>' + escape(c.authorNickname) + '</b> · ' + escape(c.status) + '<p>' + lines(c.content) + '</p>' +
          '<input maxlength="500" data-comment-reason="' + id + '" placeholder="处理原因（必填）">' +
          (c.status === 'visible' ? '<button type="button" data-report-action="comment-hide" data-id="' + id + '" data-report="' + reportId + '">隐藏</button>' : '') +
          (c.status === 'visible' || c.status === 'hidden' ? '<button type="button" data-report-action="comment-delete" data-id="' + id + '" data-report="' + reportId + '">删除</button>' : '') + '</div>';
      }).join('') : '<p>暂无评论</p>');
  }
  function init() {
    var form = el('reportForm'); if (form) form.addEventListener('submit',function(event){ event.preventDefault(); submit(); });
    document.addEventListener('click',function(event) {
      if (event.target.closest('[data-page="reviewcenter"]')) return loadAdmin();
      var target = event.target.closest('[data-report-action]'); if (!target) return;
      var action = target.getAttribute('data-report-action'), id = idOf(target.getAttribute('data-id'));
      if (action === 'tab-ask' || action === 'tab-reports') return selectTab(action === 'tab-ask' ? 'ask' : 'reports');
      if (action === 'back') { el('reportDetails').hidden=true; el('reportCards').hidden=false; load(); return; }
      if (action === 'prev' && listPage > 1) { listPage--; load(); return; }
      if (action === 'next' && listPage < listPages) { listPage++; load(); return; }
      if (action === 'comments-prev' && commentsPage > 1) { commentsPage--; loadComments(); return; }
      if (action === 'comments-next' && commentsPage < commentPages) { commentsPage++; loadComments(); return; }
      if (action === 'admin-load') return loadAdmin();
      if (action === 'comment') return comment(openId);
      if (!id) return;
      if (action === 'detail') return detail(id);
      if (action === 'like') return like(id);
      if (action === 'approve' || action === 'settle' || action === 'reject') return review(id,action);
      if (action === 'hide' || action === 'delete') return moderate(id,action,null);
      if (action === 'admin-comments') return adminComments(id);
      if (action === 'comment-hide' || action === 'comment-delete') return moderate(id,action.slice(8),idOf(target.getAttribute('data-report')));
    });
  }
  global.GossipReports = {escape:escape,renderCard:renderCard,submit:submit,comment:comment,load:load,loadAdmin:loadAdmin,selectTab:selectTab};
  document.addEventListener('DOMContentLoaded',init);
})(window);
