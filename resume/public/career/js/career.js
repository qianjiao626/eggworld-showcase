const xhr = new XMLHttpRequest();
/* 报告接口：线上同域（nginx /api/ → 8090）；本地联调走 8080，
   与主站一致支持 window.EGGWORLD_API_BASE 临时改端口。 */
const API_BASE = (window.EGGWORLD_API_BASE !== undefined)
    ? window.EGGWORLD_API_BASE
    : ((location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:8080' : '');
let questionType = "";
let questionNumber = 0;
let questionIndex = 1;  // starts from 1
let questionList = [];
let answers = new Map(); // key starts from 1
let chargeMeta = null;   // 价格 / 余额 / 今日剩余次数
let payConfirmed = false; // 「生成报告」第二步确认
let reportRequestId = ""; // 幂等键：一次点击重试不重复扣费

function token() {
    try { return sessionStorage.getItem('token') || ''; } catch (e) { return ''; }
}

function init() {
    xhr.open("GET", "../questionnaires/career_question.xml", true);
    xhr.onreadystatechange = AnalysisXML;
    xhr.send(null);
    loadChargeMeta();
}

/* 开始答题时先取一次价格/余额/次数，用于按钮下方提示与二次确认文案 */
async function loadChargeMeta() {
    const hint = document.getElementById('charge-hint');
    if (!token()) {
        if (hint) hint.textContent = '请先从蛋蛋世界登录后再生成报告';
        return;
    }
    try {
        const res = await fetch(API_BASE + '/api/resume/career/meta', {
            headers: { Authorization: 'Bearer ' + token() }
        });
        const json = await res.json();
        if (!json || json.code !== 200) return;
        chargeMeta = json.data;
        if (hint) {
            if (chargeMeta.chargeEnabled === false) {
                hint.textContent = '本次测评免费';
            } else {
                hint.textContent = '生成报告将消耗 ' + chargeMeta.analyzeCost + ' 蛋蛋币'
                    + '（当前余额 ' + chargeMeta.balance
                    + (chargeMeta.dailyLimit > 0 ? '，今日剩余 ' + chargeMeta.todayLeft + ' 次' : '')
                    + '）';
            }
        }
        /* 价格回来得比题库晚时，刷新最后一题按钮上的金额 */
        if (questionNumber > 0) updateQuestion();
    } catch (e) { /* 提示失败不影响答题 */ }
}

function AnalysisXML() {
    if (xhr.readyState === 4 && xhr.status === 200) {
        const xmlDoc = xhr.responseXML;
        if (!xmlDoc) return;
        questionType = xmlDoc.getElementsByTagName("questionnaire")[0].getAttribute("type");
        questionList = xmlDoc.getElementsByTagName("question");
        questionNumber = questionList.length;
        document.getElementById("progress-bar-text").innerText = "已完成 0/" + questionNumber + " 题";
        updateProgressBar();
        document.getElementById("list-question-number").innerText = questionNumber;
        for (let i = 0; i < questionNumber; i++) { addQuestionToList(i); }
        updateQuestionList();
        jumpToQuestion(questionIndex);
    }
}

function addQuestionToList(index) {
    const list = document.getElementById("question-list");
    let innerHTML = "<div onclick=\"jumpToQuestion(" + (index + 1) + ")\">";
    innerHTML += "<span class=\"material-symbols-outlined text-[20px] text-gray-300\">circle</span>"
    innerHTML += "<span class=\"text-sm font-medium lg:block hidden\">第 " + (index + 1) + " 题</span>";
    innerHTML += "<span class=\"text-sm font-medium lg:hidden\">" + (index + 1) + "</span>";
    innerHTML += "</div>";
    list.innerHTML += innerHTML;
}

function updateQuestionList() {
    const list = document.getElementById("question-list");
    const div = list.getElementsByTagName("div");
    for (let i = 0; i < div.length; i++) {
        if (i + 1 === questionIndex) {
            div[i].className = "flex items-center gap-3 px-3 py-2 rounded-xl bg-primary text-white cursor-default";
        } else if (answers.has(i + 1)) {
            div[i].className = "flex items-center gap-3 px-3 py-2 rounded-xl bg-primary/10 text-primary cursor-pointer";
        } else {
            div[i].className = "flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-100";
        }
    }
}

function updateQuestion() {
    const question = questionList[questionIndex - 1];
    document.getElementById("question-part-id-text").innerText = "Part " + question.getAttribute("partID") + ": " + question.getAttribute("partText");
    document.getElementById("question-stem").innerText = "第 " + questionIndex + " 题 : " + question.getElementsByTagName("stem")[0].textContent;
    const options = question.getElementsByTagName("option");
    const optionsDiv = document.getElementById("question-options");
    optionsDiv.innerHTML = "";
    if (question.getAttribute("type") === "radio") {
        for (const option of options) {
            let inner = "<label class=\"group flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-solid border-gray-100 p-5 transition-all hover:border-primary/50\">";
            inner += "<input class=\"h-6 w-6\" name=\"option\" type=\"radio\" />";
            inner += "<p class=\"text-base font-bold\">" + option.textContent + "</p></label>";
            optionsDiv.innerHTML += inner;
        }
    } else {
        let inner = "<input class=\"w-full rounded-2xl border-2 border-gray-100 p-4\" list=\"datalist\" placeholder=\"选择专业...\">";
        inner += "<datalist id=\"datalist\">";
        for (const option of options) inner += "<option value=\"" + option.textContent + "\">";
        inner += "</datalist>";
        optionsDiv.innerHTML += inner;
    }
    document.getElementById("previous-button").style.visibility = questionIndex === 1 ? "hidden" : "visible";
    document.getElementById("next-button").innerHTML = questionIndex === questionNumber
        ? (chargeMeta && chargeMeta.chargeEnabled !== false
            ? '生成报告 · ' + chargeMeta.analyzeCost + ' 蛋蛋币'
            : '生成报告')
        : '下一题';
    if (answers.has(questionIndex)) {
        const inputs = optionsDiv.getElementsByTagName("input");
        if (question.getAttribute("type") === "radio") inputs[answers.get(questionIndex) - 1].checked = true;
        else inputs[0].value = answers.get(questionIndex);
    }
}

function updateProgressBar() {
    const progress = answers.size / questionNumber * 100;
    document.getElementById("progress-bar").style.width = progress + "%";
    document.getElementById("progress-percentage").innerText = Math.round(progress) + "%";
    document.getElementById("progress-bar-text").innerText = "已完成 " + answers.size + "/" + questionNumber + " 题";
}

function saveCurrentAnswer() {
    const currentQ = questionList[questionIndex - 1];
    if (!currentQ) return false;
    const inputs = document.getElementById("question-options").getElementsByTagName("input");
    if (currentQ.getAttribute("type") === "radio") {
        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i].checked) {
                answers.set(questionIndex, i + 1);
                return true;
            }
        }
    } else if (inputs[0] && inputs[0].value.trim()) {
        answers.set(questionIndex, inputs[0].value.trim());
        return true;
    }
    answers.delete(questionIndex);
    return false;
}

function jumpToQuestion(index) {
    saveCurrentAnswer();
    questionIndex = index;
    updateQuestionList();
    updateQuestion();
    updateProgressBar();
}

function previousQuestion() { if (questionIndex > 1) jumpToQuestion(questionIndex - 1); }

function nextQuestion() {
    if (!saveCurrentAnswer()) {
        careerAlert('请先完成当前题目', { title: '还没选完' });
        return;
    }
    if (questionIndex !== questionNumber) {
        payConfirmed = false;
        jumpToQuestion(questionIndex + 1);
        return;
    }
    /* 最后一题：先确认扣费，再第二次点击才真正生成（避免误触直接扣币） */
    if (!payConfirmed) {
        confirmPayment();
        return;
    }
    submitAnswers();
}

/* 生成报告前的二次确认：把价格 / 余额 / 今日次数说清楚 */
function confirmPayment() {
    if (!token()) {
        careerAlert('请先从蛋蛋世界登录后再生成报告。', {
            title: '请先登录',
            actionLabel: '去蛋蛋世界登录',
            onAction: function () { location.href = '/#workshop'; }
        });
        return;
    }
    if (!chargeMeta) {
        careerAlert('正在读取价格，请稍后重试', { title: '价格还没读到' });
        loadChargeMeta();
        return;
    }
    if (chargeMeta.dailyLimit > 0 && chargeMeta.todayLeft <= 0) {
        careerAlert('今天的测评次数已用完，明天再来～', { title: '今日次数已用完' });
        return;
    }
    const btn = document.getElementById('next-button');
    if (chargeMeta.chargeEnabled === false) {
        payConfirmed = true;
        btn.innerHTML = '确认生成报告（免费）';
        return;
    }
    if (Number(chargeMeta.balance) < Number(chargeMeta.analyzeCost)) {
        careerAlert('本次报告需要 ' + chargeMeta.analyzeCost + ' 蛋蛋币，当前余额 '
            + chargeMeta.balance + '。先在蛋蛋世界做任务、发布求助赚币，再回来生成。', {
            title: '蛋蛋币不足',
            actionLabel: '去蛋蛋世界赚币',
            onAction: function () { location.href = '/#workshop'; }
        });
        return;
    }
    payConfirmed = true;
    btn.innerHTML = '确认扣除 ' + chargeMeta.analyzeCost + ' 币并生成';
}

function newRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now() + '-' + Math.random().toString(16).slice(2);
}

function submitAnswers() {
    if (answers.size !== questionNumber) {
        careerAlert('请完成全部题目后再生成报告', { title: '还有题目没答' });
        return;
    }
    const arr = [];
    for (let i = 1; i <= questionNumber; i++) arr.push(answers.get(i) || "");
    if (!reportRequestId) reportRequestId = newRequestId();

    /* 用轻遮罩等待，保留答题现场：余额/次数不足时关掉提示就能继续，不用重答 */
    const overlay = document.createElement('div');
    overlay.className = 'cr-loading';
    overlay.innerHTML = '<div class="cr-loading-box"><div class="cr-spinner"></div><p>正在生成深度测评报告…</p></div>';
    document.body.appendChild(overlay);
    const finish = function () { if (overlay.parentNode) overlay.remove(); };

    fetch(API_BASE + '/api/resume/career/report', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token()
        },
        body: JSON.stringify({ answers: arr, requestId: reportRequestId })
    })
    .then(async res => {
        const json = await res.json().catch(() => null);
        if (!json) throw Object.assign(new Error('服务暂时不可用，请稍后重试'), { code: 0 });
        if (json.code !== 200) {
            throw Object.assign(new Error(json.msg || '报告生成失败'), { code: json.code });
        }
        return json.data;
    })
    .then(data => {
        finish();
        const banner = '<div class="cd-banner">'
            + '<span>报告已生成，并保存到「测评报告」</span>'
            + '<a href="/rs/career/reports.html">查看记录 →</a></div>';
        document.getElementById('main').innerHTML = banner + data.html;
        document.body.classList.add('career-report-page');
        if (window.CareerReportShare) window.CareerReportShare.mount(data.recordId);
        window.scrollTo(0, 0);
    })
    .catch(err => {
        finish();
        console.error('Submission Error:', err);
        document.body.classList.remove('career-report-page');
        payConfirmed = false;
        const code = err && err.code;
        if (code === 401 || code === 402 || code === 429) {
            careerAlert(err.message, {
                title: code === 402 ? '蛋蛋币不足' : code === 429 ? '今日次数已用完' : '请先登录',
                actionLabel: code === 401 ? '去蛋蛋世界登录' : '知道了',
                onAction: code === 401 ? function () { location.href = '/#workshop'; } : null
            });
            return;
        }
        careerAlert(err && err.message ? err.message : '报告生成失败，请重试', {
            title: '生成失败',
            actionLabel: '重试',
            onAction: submitAnswers
        });
    });
}

function downloadPDF() {
    window.print();
}
