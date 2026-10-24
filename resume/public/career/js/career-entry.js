/* 「开始测评」入口：先校验登录 / 余额 / 今日次数，并在按钮上直接显示价格。
   真正扣费发生在答题页最后一题（二次确认后生成报告），失败会自动退款。 */
(function () {
  'use strict';

  var API_BASE = (window.EGGWORLD_API_BASE !== undefined)
    ? window.EGGWORLD_API_BASE
    : ((location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8080' : '');

  function token() {
    try { return sessionStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  async function fetchMeta() {
    var res = await fetch(API_BASE + '/api/resume/career/meta', {
      headers: { Authorization: 'Bearer ' + token() }
    });
    var json = await res.json();
    if (!json || json.code !== 200) throw new Error((json && json.msg) || '暂时无法读取价格');
    return json.data;
  }

  function setLabel(link, text, dim) {
    link.textContent = text;
    link.classList.toggle('opacity-50', !!dim);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var link = document.getElementById('start-assessment');
    if (!link) return;

    if (!token()) {
      setLabel(link, '开始测评 · 请先登录', true);
    } else {
      fetchMeta().then(function (d) {
        if (d.dailyLimit > 0 && d.todayLeft <= 0) {
          setLabel(link, '今日次数已用完', true);
        } else if (d.chargeEnabled === false) {
          setLabel(link, '开始测评 · 免费', false);
        } else if (Number(d.balance) < Number(d.analyzeCost)) {
          setLabel(link, '开始测评 · 蛋蛋币不足', true);
        } else {
          setLabel(link, '开始测评 · ' + d.analyzeCost + ' 蛋蛋币', false);
        }
      }).catch(function () { /* 价格读取失败时保留原文案 */ });
    }

    link.addEventListener('click', async function (e) {
      e.preventDefault();
      if (!token()) {
        careerAlert('请先从蛋蛋世界登录后再开始测评。', {
          title: '请先登录',
          actionLabel: '去蛋蛋世界登录',
          onAction: function () { location.href = '/#workshop'; }
        });
        return;
      }
      var d;
      try {
        d = await fetchMeta();
      } catch (err) {
        careerAlert(err.message || '网络不太稳，请稍后再试', { title: '暂时无法开始' });
        return;
      }
      if (d.dailyLimit > 0 && d.todayLeft <= 0) {
        careerAlert('今天的测评次数已用完，明天再来～', { title: '今日次数已用完' });
        return;
      }
      if (d.chargeEnabled !== false && Number(d.balance) < Number(d.analyzeCost)) {
        careerAlert('本次测评需要 ' + d.analyzeCost + ' 蛋蛋币，当前余额 ' + d.balance
          + '。先在蛋蛋世界做任务、发布求助赚币，再回来测。', {
          title: '蛋蛋币不足',
          actionLabel: '去蛋蛋世界赚币',
          onAction: function () { location.href = '/#workshop'; }
        });
        return;
      }
      location.href = 'html/career.html';
    });
  });
})();
