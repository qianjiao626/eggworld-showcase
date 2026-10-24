/* ============================================================
 * 「记住我」—— 下次登录免输入
 *
 * 两条机制（对应选定的「两者都做」）：
 *   1) 记住登录态：勾选后把 token 持久化到 localStorage，下次打开自动登录，完全不用输入。
 *      不保存密码本身，泄露风险低。
 *   2) 浏览器密码管理器：给登录框补上 name / autocomplete 并把输入区包成 <form>，
 *      便于浏览器识别为一次登录提交，从而提示保存、下次自动填充账号密码。
 *
 * 设计约束：不修改 growth-schoolv3.html 的内联逻辑。
 *   现有代码只读 sessionStorage.token，因此这里在页面脚本执行前把持久化 token
 *   还原进 sessionStorage；并通过「包装全局函数」在登录/退出后同步持久化状态。
 * ============================================================ */
(function () {
  'use strict';

  var TOKEN_KEY = 'egg_remember_token';   // localStorage：持久化的登录态
  var FLAG_KEY  = 'egg_remember_flag';    // localStorage：是否勾选过「记住我」
  var EMAIL_KEY = 'egg_remember_email';   // localStorage：记住的账号（邮箱）

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* 清除「记住我」相关记录 */
  function forgetRemembered() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(FLAG_KEY);
      localStorage.removeItem(EMAIL_KEY);
    } catch (e) {}
  }

  /* 解析 JWT 过期时间（毫秒）。解析失败返回 null */
  function jwtExpireAt(token) {
    try {
      var parts = String(token).split('.');
      if (parts.length < 2) return null;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var exp = JSON.parse(atob(b64)).exp;
      return exp ? exp * 1000 : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------------
   * 第一部分：在页面脚本执行前，把持久化登录态注入 sessionStorage
   * （必须尽早执行，才能被后文的 tryRestoreLogin() 读到）
   * ------------------------------------------------------------- */
  (function restoreRememberedSession() {
    try {
      if (lsGet(FLAG_KEY) !== '1') return;
      var token = lsGet(TOKEN_KEY);
      if (!token) return;
      var exp = jwtExpireAt(token);
      if (exp && exp <= Date.now()) {   // 已过期：清掉，避免每次打开都发一次无效请求
        forgetRemembered();
        return;
      }
      sessionStorage.setItem('token', token);
    } catch (e) {}
  })();

  /* ---------------------------------------------------------------
   * 包装全局函数：先执行原逻辑，结束后回调（可拿到返回值与实参）
   * 兼容 async 函数（返回 Promise 时等其 resolve）
   * ------------------------------------------------------------- */
  function wrap(name, after) {
    var original = window[name];
    if (typeof original !== 'function' || original.__lrWrapped) return;

    function runAfter(result, args) {
      if (!after) return;
      try { after(result, args); } catch (e) {}
    }

    var wrapped = function () {
      var args = arguments;
      var ret = original.apply(this, args);
      if (ret && typeof ret.then === 'function') {
        return ret.then(
          function (v) { runAfter(v, args); return v; },
          function (err) { runAfter(undefined, args); throw err; }
        );
      }
      runAfter(ret, args);
      return ret;
    };
    wrapped.__lrWrapped = true;
    window[name] = wrapped;
  }

  /* ---------------------------------------------------------------
   * 第二部分：DOM 就绪后接入 UI 与登录动作
   * ------------------------------------------------------------- */
  function setup() {
    var emailInput = document.getElementById('loginEmail');
    var pwdInput   = document.getElementById('loginPwd');
    if (!emailInput || !pwdInput) return;

    /* 输入区容器（两个输入行的父级）与其后的登录按钮 */
    var row       = emailInput.parentNode;
    var container = row ? row.parentNode : null;
    var btn       = container ? container.nextElementSibling : null;

    /* 1) 浏览器密码管理器识别所需属性 */
    emailInput.setAttribute('name', 'email');
    emailInput.setAttribute('autocomplete', 'username');
    pwdInput.setAttribute('name', 'password');
    pwdInput.setAttribute('autocomplete', 'current-password');

    /* 2) 动态插入「记住我」勾选框（不改 HTML） */
    var rememberChk = document.getElementById('loginRememberChk');
    if (!rememberChk && container) {
      var label = document.createElement('label');
      label.setAttribute('style',
        'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer;user-select:none');
      label.innerHTML =
        '<input type="checkbox" id="loginRememberChk" ' +
        'style="width:14px;height:14px;accent-color:var(--primary);cursor:pointer">' +
        '记住我，下次自动登录';
      container.appendChild(label);
      rememberChk = document.getElementById('loginRememberChk');
    }
    if (rememberChk && lsGet(FLAG_KEY) === '1') rememberChk.checked = true;

    /* 3) 曾勾选过则回填账号（密码交给浏览器密码管理器） */
    if (lsGet(FLAG_KEY) === '1' && !emailInput.value) {
      emailInput.value = lsGet(EMAIL_KEY) || '';
    }

    /* 4) 包成 <form>：让浏览器把「点击登录」识别为表单提交，从而提供保存密码 */
    if (container && btn && btn.tagName === 'BUTTON' && !document.getElementById('loginForm')) {
      var panel = container.parentNode;

      var form = document.createElement('form');
      form.id = 'loginForm';
      form.setAttribute('autocomplete', 'on');
      /* form 顶替了原输入区在 .auth-panel 中的位置，必须继承同样的布局属性：
         .auth-panel 是 align-items:center，子元素不会被拉伸，若 form 不设宽度就会收缩成
         内容宽度，导致 .login-btn{width:100%} 与输入区 width:100% 的样式失效（按钮变窄）。 */
      form.setAttribute('style',
        'width:100%;display:flex;flex-direction:column;align-items:center;gap:' +
        (window.getComputedStyle(panel).rowGap || '20px'));

      panel.insertBefore(form, container);
      form.appendChild(container);
      form.appendChild(btn);

      btn.setAttribute('type', 'submit');
      btn.removeAttribute('onclick');          // 改走 form 提交，避免重复触发
      pwdInput.removeAttribute('onkeydown');   // 移除内联处理器，改由下方监听接管

      /* 回车提交：不要依赖表单隐式提交（在弹窗结构里不可靠），显式接管。
         preventDefault 阻止隐式提交，保证只触发一次。 */
      pwdInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (typeof window.doStudentLogin === 'function') window.doStudentLogin();
      });
    }

    /* 5) 登录成功后持久化；退出登录 / 会话失效时清除 */
    wrap('doStudentLogin', function () {
      var token = sessionStorage.getItem('token');
      if (!token) return;                                  // 登录未成功
      var chk = document.getElementById('loginRememberChk');
      if (chk && chk.checked) {
        lsSet(TOKEN_KEY, token);
        lsSet(FLAG_KEY, '1');
        lsSet(EMAIL_KEY, emailInput.value.trim());
      } else {
        forgetRemembered();
      }
    });

    /* 管理台二次验证会重新签发 token，同步更新持久化值 */
    wrap('doAdminVerify', function () {
      var token = sessionStorage.getItem('token');
      if (token && lsGet(FLAG_KEY) === '1') lsSet(TOKEN_KEY, token);
    });

    /* 会话失效（401）：持久化 token 已不可用，清掉避免反复失败 */
    wrap('apiFetch', function (res) {
      if (res && res.code === 401) forgetRemembered();
    });

    /* 主动退出：清掉「记住我」；初始化时的 logout(true) 不清 */
    wrap('logout', function (res, args) {
      if (!args || !args[0]) forgetRemembered();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
