const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('js/dormitory.js', 'utf8');
const appHtml = fs.readFileSync('growth-schoolv3.html', 'utf8');
const factsScript = fs.readFileSync('js/dormitory-facts.js', 'utf8');
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (code = 200, data = {}, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ code, data }), text: async () => JSON.stringify({ code, data }) });
function installSharedApiLayer(sandbox) {
  const start = appHtml.indexOf('async function apiFetch(method, path, body){');
  const end = appHtml.indexOf('/* ===== State', start);
  assert.ok(start >= 0 && end > start, 'shared API layer should be present in the page');
  vm.runInNewContext(appHtml.slice(start, end), sandbox, { filename: 'growth-schoolv3.html API layer' });
  assert.equal(typeof sandbox.apiPost, 'function');
}
function page() {
  const listeners = {}, nodes = {}, posts = [];
  const storage = new Map([['token', 'test-token']]);
  for (const id of ['dormitoryDetailTitle', 'dormitoryDetailBody', 'dormitoryPhotoInput', 'dormitoryPhotoCampus', 'dormitoryPhotoBuilding', 'dormitoryUploadButton', 'dormitoryUploadStatus', 'dormitoryNoteContent', 'dormitoryNoteCampus', 'dormitoryNoteBuilding', 'dormitoryNoteSource', 'dormitoryNoteSubmit', 'dormitoryNoteStatus']) {
    nodes[id] = { id, value: '', textContent: '', innerHTML: '', disabled: false, files: [], setAttribute() {}, insertAdjacentHTML(_where, html) { this.innerHTML += html; } };
  }
  nodes.dormitoryPhotoInput.files = [{ name: 'room.png', size: 100, type: 'image/png' }];
  nodes.dormitoryPhotoInput.value = 'room.png';
  nodes.dormitoryNoteContent.value = '四人间，具体楼栋请以学校分配为准。';
  const sandbox = {
    console, URL, USER: { registered: true }, API_BASE: '',
    sessionStorage: { getItem: key => storage.get(key) || null, removeItem: key => storage.delete(key) },
    document: { getElementById: id => nodes[id] || null, addEventListener: (type, fn) => { listeners[type] = fn; } },
    FormData: class { constructor() { this.data = []; } append(k, v) { this.data.push([k, v]); } get(k) { return this.data.find(([key]) => key === k)?.[1]; } getAll(k) { return this.data.filter(([key]) => key === k).map(([, value]) => value); } },
    fetch: (_url, options) => { if (options?.method === 'POST') posts.push(options); return Promise.resolve(response()); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(script, sandbox);
  const click = id => listeners.click({ target: { id, closest: () => null } });
  sandbox.loadDormitoryProfile('北京大学');
  return { sandbox, nodes, posts, click };
}

test('photo upload locks concurrent submissions and unlocks after success', async () => {
  const { sandbox, nodes, posts, click } = page(); await tick();
  const pending = deferred();
  sandbox.fetch = (_url, options) => { posts.push(options); return pending.promise; };
  click('dormitoryUploadButton'); click('dormitoryUploadButton');
  assert.equal(posts.length, 1);
  assert.equal(nodes.dormitoryUploadButton.disabled, true);
  assert.equal(nodes.dormitoryPhotoInput.disabled, true);
  assert.equal(posts[0].body.get('school'), '北京大学');
  pending.resolve(response()); await tick();
  assert.equal(nodes.dormitoryUploadButton.disabled, false);
  assert.equal(nodes.dormitoryPhotoInput.disabled, false);
  assert.equal(nodes.dormitoryPhotoInput.value, '');
  assert.match(nodes.dormitoryUploadStatus.textContent, /北京大学.*已提交/);
});

test('photo failure preserves selection, gives uncertain-result guidance, and permits manual retry', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  sandbox.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  click('dormitoryUploadButton'); await tick();
  assert.equal(nodes.dormitoryPhotoInput.value, 'room.png');
  assert.equal(nodes.dormitoryUploadButton.disabled, false);
  assert.match(nodes.dormitoryUploadStatus.textContent, /先.*上传记录/);
  sandbox.fetch = () => Promise.resolve(response());
  click('dormitoryUploadButton'); await tick();
  assert.match(nodes.dormitoryUploadStatus.textContent, /已提交/);
});

for (const httpStatus of [401, 403, 413, 500]) test(`HTTP ${httpStatus} never clears files or reports success, even with a misleading JSON success code`, async () => {
  const { sandbox, nodes, click } = page(); await tick();
  sandbox.fetch = () => Promise.resolve(response(200, {}, httpStatus));
  click('dormitoryUploadButton'); await tick();
  assert.equal(nodes.dormitoryPhotoInput.value, 'room.png');
  assert.equal(nodes.dormitoryUploadButton.disabled, false);
  assert.doesNotMatch(nodes.dormitoryUploadStatus.textContent, /已提交/);
});

test('empty images are rejected before upload', async () => {
  const { nodes, posts, click } = page(); await tick();
  nodes.dormitoryPhotoInput.files[0].size = 0;
  click('dormitoryUploadButton');
  assert.equal(posts.length, 0);
  assert.match(nodes.dormitoryUploadStatus.textContent, /空|损坏/);
});

test('an old upload cannot clear a new school/photo draft', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  const pending = deferred();
  sandbox.fetch = (_url, options) => options?.method === 'POST' ? pending.promise : Promise.resolve(response());
  click('dormitoryUploadButton');
  sandbox.loadDormitoryProfile('兰州大学');
  nodes.dormitoryPhotoInput.files = [{ name: 'new.png', size: 101, type: 'image/png' }];
  nodes.dormitoryPhotoInput.value = 'new.png';
  pending.resolve(response()); await tick();
  assert.equal(nodes.dormitoryPhotoInput.value, 'new.png');
  assert.match(nodes.dormitoryUploadStatus.textContent, /北京大学/);
});

test('notes suppress double click, retain changed drafts and unlock', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  const pending = deferred(); let calls = 0;
  sandbox.fetch = (_url, options) => {
    if (options?.method === 'POST') { calls++; return pending.promise; }
    return Promise.resolve(response());
  };
  click('dormitoryNoteSubmit'); click('dormitoryNoteSubmit');
  assert.equal(calls, 1);
  assert.equal(nodes.dormitoryNoteSubmit.disabled, true);
  assert.equal(nodes.dormitoryNoteContent.disabled, true);
  nodes.dormitoryNoteContent.value = '新的文字草稿';
  sandbox.loadDormitoryProfile('兰州大学');
  pending.resolve(response()); await tick();
  assert.equal(nodes.dormitoryNoteContent.value, '新的文字草稿');
  assert.equal(nodes.dormitoryNoteSubmit.disabled, false);
  assert.equal(nodes.dormitoryNoteContent.disabled, false);
  assert.match(nodes.dormitoryNoteStatus.textContent, /北京大学.*已提交/);
});

test('note failure retains the draft and unlocks for manual retry', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  sandbox.fetch = () => Promise.reject(new Error('offline'));
  click('dormitoryNoteSubmit'); await tick();
  assert.match(nodes.dormitoryNoteContent.value, /四人间/);
  assert.equal(nodes.dormitoryNoteSubmit.disabled, false);
  assert.match(nodes.dormitoryNoteStatus.textContent, /先.*投稿记录/);
});

for (const scenario of [
  { name: 'HTTP 500 with a misleading JSON success code', status: 500, json: async () => ({ code: 200, data: {} }) },
  { name: 'HTTP 200 with a non-JSON response', status: 200, json: async () => { throw new Error('not JSON'); } }
]) test(`text submission never treats ${scenario.name} as success`, async () => {
  const { sandbox, nodes, click } = page(); await tick();
  installSharedApiLayer(sandbox);
  sandbox.fetch = () => Promise.resolve({
    ok: scenario.status >= 200 && scenario.status < 300,
    status: scenario.status,
    json: scenario.json,
    text: async () => '<html>gateway error</html>'
  });
  click('dormitoryNoteSubmit'); await tick();
  assert.equal(nodes.dormitoryNoteContent.value, '四人间，具体楼栋请以学校分配为准。');
  assert.equal(nodes.dormitoryNoteSubmit.disabled, false);
  assert.doesNotMatch(nodes.dormitoryNoteStatus.textContent, /已提交/);
  assert.match(nodes.dormitoryNoteStatus.textContent, /未确认成功/);
});

test('A -> B -> A navigation ignores both late profile and late notes from the first A', async () => {
  const { sandbox, nodes } = page(); await tick();
  const oldProfile = deferred(); let calls = 0;
  sandbox.fetch = () => ++calls === 1 ? oldProfile.promise : Promise.resolve(response(200, { facilities: '新资料' }));
  sandbox.loadDormitoryProfile('北京大学');
  sandbox.loadDormitoryProfile('兰州大学');
  sandbox.loadDormitoryProfile('北京大学');
  await tick();
  oldProfile.resolve(response(200, { facilities: '过期资料' })); await tick();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /新资料/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /过期资料/);
  const oldNotes = deferred(); calls = 0;
  sandbox.apiGet = () => ++calls === 1 ? oldNotes.promise : Promise.resolve({ code: 200, data: [{ content: '新文字' }] });
  sandbox.loadDormitoryProfile('北京大学'); await tick();
  sandbox.loadDormitoryProfile('兰州大学');
  sandbox.loadDormitoryProfile('北京大学'); await tick();
  oldNotes.resolve({ code: 200, data: [{ content: '过期文字' }] }); await tick();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /新文字/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /过期文字/);
});

test('approved notes remain readable when profile API fails', async () => {
  const { sandbox, nodes } = page(); await tick();
  sandbox.fetch = () => Promise.reject(new Error('profile offline'));
  sandbox.apiGet = () => Promise.resolve({ code: 200, data: [{ content: '仍能读取的审核文字' }] });
  sandbox.loadDormitoryProfile('北京大学'); await tick();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /仍能读取的审核文字/);
});

test('source content is readable inline, escaped, with optional provenance instead of a required redirect', async () => {
  const { sandbox, nodes } = page(); await tick();
  sandbox.DORMITORY_FACTS = { '北京大学': [{ sourceType: 'third_party', description: '已有摘要', sourceContent: ['本科生住在校内。', '<img src=x onerror=alert(1)>'], sourceTitle: '阳光高考', sourceUrl: 'https://example.com/original' }] };
  sandbox.loadDormitoryProfile('北京大学'); await tick();
  const markup = nodes.dormitoryDetailBody.innerHTML;
  assert.match(markup, /信源内容（页内阅读）/);
  assert.match(markup, /本科生住在校内。/);
  assert.match(markup, /&lt;img/);
  assert.doesNotMatch(markup, /<img src=x/);
  assert.match(markup, /<details[^>]*class="dormitory-source-details"/);
  assert.ok(markup.indexOf('本科生住在校内。') < markup.indexOf('<details'));
});

test('PKU has a substantive, locally recorded source account with honest evidence limits', () => {
  const sandbox = {}; sandbox.window = sandbox; vm.runInNewContext(factsScript, sandbox);
  const pku = sandbox.DORMITORY_FACTS['北京大学'][0];
  assert.ok(Array.isArray(pku.sourceContent), 'source paragraphs, not only an external URL');
  assert.match(pku.sourceContent.join(' '), /本科生.*校内/);
  assert.match(pku.sourceContent.join(' '), /4人|四人/);
  assert.match(pku.sourceContent.join(' '), /未.*(床型|卫浴)/);
  assert.equal(pku.accessedAt, '2026-09-25', 'do not turn historical evidence into a fresh verification');
});


for (const kind of ['photo', 'note']) {
  const button = kind === 'photo' ? 'dormitoryUploadButton' : 'dormitoryNoteSubmit';
  const draft = kind === 'photo' ? 'dormitoryPhotoInput' : 'dormitoryNoteContent';
  const status = kind === 'photo' ? 'dormitoryUploadStatus' : 'dormitoryNoteStatus';
  for (const failure of ['non-JSON', 'business failure', 'synchronous fetch throw']) {
    test(`${kind} ${failure} retains the draft, unlocks, and never automatically retries`, async () => {
      const { sandbox, nodes, click } = page(); await tick();
      const original = nodes[draft].value; let calls = 0;
      sandbox.fetch = () => {
        calls++;
        if (failure === 'synchronous fetch throw') throw new Error('fetch unavailable');
        if (failure === 'business failure') return Promise.resolve(response(400));
        return Promise.resolve({ ok: true, status: 200, text: async () => '<html>error</html>' });
      };
      click(button); await tick();
      assert.equal(calls, 1);
      assert.equal(nodes[draft].value, original);
      assert.equal(nodes[button].disabled, false);
      assert.equal(nodes[draft].disabled, false);
      assert.match(nodes[status].textContent, /未确认成功/);
      assert.doesNotMatch(nodes[status].textContent, /已提交/);
      sandbox.fetch = () => { calls++; return Promise.resolve(response()); };
      click(button); await tick();
      assert.equal(calls, 2, 'only a new manual submission retries the write');
      assert.match(nodes[status].textContent, /已提交/);
      assert.equal(nodes[draft].value, '');
    });
  }

  test(`${kind} submission cannot clear an unchanged draft after A -> B -> A navigation`, async () => {
    const { sandbox, nodes, click } = page(); await tick();
    const pending = deferred(), original = nodes[draft].value;
    sandbox.fetch = (_url, options) => options?.method === 'POST' ? pending.promise : Promise.resolve(response());
    click(button);
    sandbox.loadDormitoryProfile('兰州大学');
    sandbox.loadDormitoryProfile('北京大学'); await tick();
    pending.resolve(response()); await tick();
    assert.equal(nodes[draft].value, original);
    assert.equal(nodes[button].disabled, false);
    assert.match(nodes[status].textContent, /北京大学.*已提交/);
  });

  const fields = kind === 'photo' ? ['dormitoryPhotoCampus', 'dormitoryPhotoBuilding'] : ['dormitoryNoteCampus', 'dormitoryNoteBuilding', 'dormitoryNoteSource'];
  for (const field of fields) test(`${kind} submission cannot clear a draft whose ${field} changed`, async () => {
    const { sandbox, nodes, click } = page(); await tick();
    const pending = deferred(), original = nodes[draft].value;
    sandbox.fetch = () => pending.promise;
    click(button);
    nodes[field].value = 'https://example.org/new-source';
    pending.resolve(response()); await tick();
    assert.equal(nodes[draft].value, original);
    assert.equal(nodes[button].disabled, false);
  });

  test(`guests cannot submit ${kind} drafts`, async () => {
    const { sandbox, nodes, posts, click } = page(); await tick();
    sandbox.USER = { registered: false };
    click(button); await tick();
    assert.equal(posts.length, 0);
    assert.match(nodes[status].textContent, /登录/);
  });
}

for (const httpStatus of [401, 403, 413, 429, 500]) test(`note HTTP ${httpStatus} preserves the draft despite a JSON success code`, async () => {
  const { sandbox, nodes, click } = page(); await tick();
  sandbox.fetch = () => Promise.resolve(response(200, {}, httpStatus));
  click('dormitoryNoteSubmit'); await tick();
  assert.match(nodes.dormitoryNoteContent.value, /四人间/);
  assert.equal(nodes.dormitoryNoteSubmit.disabled, false);
  assert.doesNotMatch(nodes.dormitoryNoteStatus.textContent, /已提交/);
  if (httpStatus === 401) {
    assert.equal(sandbox.sessionStorage.getItem('token'), null);
    assert.match(nodes.dormitoryNoteStatus.textContent, /重新登录/);
  }
});

test('note success submits the exact school and trimmed draft with JSON/auth headers', async () => {
  const { sandbox, nodes, posts, click } = page(); await tick();
  sandbox.API_BASE = 'https://local-api.invalid';
  nodes.dormitoryNoteCampus.value = ' 主校区 ';
  nodes.dormitoryNoteBuilding.value = ' 1号楼 ';
  nodes.dormitoryNoteSource.value = ' https://example.org/source ';
  nodes.dormitoryNoteContent.value = ' 四人间 ';
  let requestedUrl;
  sandbox.fetch = (url, options) => { requestedUrl = url; posts.push(options); return Promise.resolve(response()); };
  click('dormitoryNoteSubmit'); await tick();
  assert.equal(requestedUrl, 'https://local-api.invalid/api/dormitories/notes');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].headers['Content-Type'], 'application/json');
  assert.equal(posts[0].headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(posts[0].body), { school: '北京大学', campus: '主校区', building: '1号楼', content: '四人间', sourceUrl: 'https://example.org/source' });
  assert.equal(nodes.dormitoryNoteContent.value, '');
  assert.match(nodes.dormitoryNoteStatus.textContent, /审核通过.*5 个蛋蛋币/);
});

test('photo multipart keeps all five files and lets the browser set its boundary', async () => {
  const { nodes, posts, click } = page(); await tick();
  const files = Array.from({ length: 5 }, (_, i) => ({ name: `room${i}.png`, size: 5 * 1024 * 1024, type: 'image/png' }));
  nodes.dormitoryPhotoInput.files = files;
  nodes.dormitoryPhotoCampus.value = ' 主校区 ';
  nodes.dormitoryPhotoBuilding.value = ' 1号楼 ';
  click('dormitoryUploadButton'); await tick();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.getAll('files'), files);
  assert.equal(posts[0].body.get('campus'), '主校区');
  assert.equal(posts[0].body.get('building'), '1号楼');
  assert.equal(posts[0].headers.Authorization, 'Bearer test-token');
  assert.equal(posts[0].headers['Content-Type'], undefined);
});

for (const scenario of [
  { name: 'six images', files: Array.from({ length: 6 }, () => ({ size: 10, type: 'image/png' })), message: /最多.*5/ },
  { name: 'oversized image', files: [{ size: 5 * 1024 * 1024 + 1, type: 'image/png' }], message: /5 MB/ },
  { name: 'unsupported file type', files: [{ size: 10, type: 'text/html' }], message: /JPG、PNG、WebP/ }
]) test(`${scenario.name} are blocked before uploading`, async () => {
  const { nodes, posts, click } = page(); await tick();
  nodes.dormitoryPhotoInput.files = scenario.files;
  click('dormitoryUploadButton'); await tick();
  assert.equal(posts.length, 0);
  assert.equal(nodes.dormitoryUploadButton.disabled, false);
  assert.match(nodes.dormitoryUploadStatus.textContent, scenario.message);
});

for (const scenario of [
  { field: 'dormitoryNoteCampus', value: '甲'.repeat(101), message: /100/ },
  { field: 'dormitoryNoteBuilding', value: '甲'.repeat(101), message: /100/ },
  { field: 'dormitoryNoteSource', value: 'https://example.org/' + 'a'.repeat(1000), message: /1000/ },
  { field: 'dormitoryNoteSource', value: 'javascript:alert(1)', message: /HTTP\(S\)/ }
]) test(`note rejects invalid ${scenario.field} (${scenario.value.length} characters) before submitting`, async () => {
  const { nodes, posts, click } = page(); await tick();
  nodes[scenario.field].value = scenario.value;
  click('dormitoryNoteSubmit'); await tick();
  assert.equal(posts.length, 0);
  assert.match(nodes.dormitoryNoteStatus.textContent, scenario.message);
});

test('late profile and notes failures do not replace the currently selected school', async () => {
  const { sandbox, nodes } = page(); await tick();
  const oldProfile = deferred(); let calls = 0;
  sandbox.fetch = () => ++calls === 1 ? oldProfile.promise : Promise.resolve(response(200, { facilities: '新学校资料' }));
  sandbox.loadDormitoryProfile('北京大学');
  sandbox.loadDormitoryProfile('兰州大学'); await tick();
  oldProfile.reject(new Error('late profile failure')); await tick();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /新学校资料/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /暂时无法读取资料/);
  sandbox.fetch = () => Promise.resolve(response(200, { facilities: '新学校资料' }));
  const oldNotes = deferred(); calls = 0;
  sandbox.apiGet = () => ++calls === 1 ? oldNotes.promise : Promise.resolve({ code: 200, data: [{ content: '新学校文字' }] });
  sandbox.loadDormitoryProfile('北京大学'); await tick();
  sandbox.loadDormitoryProfile('兰州大学'); await tick();
  oldNotes.reject(new Error('late notes failure')); await tick();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /新学校文字/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /文字资料读取失败/);
});

for (const failure of ['rejected promise', 'business failure', 'malformed data']) test(`mine ${failure} is an error, not an empty history`, async () => {
  const { sandbox, nodes } = page(); await tick();
  nodes.dormitoryMyUploads = { textContent: '', innerHTML: '' };
  nodes.dormitoryMyNotes = { textContent: '', innerHTML: '' };
  installSharedApiLayer(sandbox);
  sandbox.fetch = () => failure === 'rejected promise' ? Promise.reject(new Error('offline')) : Promise.resolve(response(failure === 'business failure' ? 500 : 200, {}));
  sandbox.renderDormitoryMine(); await tick();
  for (const id of ['dormitoryMyUploads', 'dormitoryMyNotes']) {
    assert.match(nodes[id].textContent, /读取失败/);
    assert.doesNotMatch(nodes[id].innerHTML + nodes[id].textContent, /你还没有/);
  }
});

test('approved notes read errors do not claim there are no approved notes', async () => {
  const { sandbox, nodes } = page(); await tick();
  sandbox.apiGet = () => Promise.resolve({ code: 500, data: [] });
  sandbox.loadDormitoryProfile('北京大学'); await tick();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /文字资料读取失败/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /暂无已审核文字/);
});

test('Lanzhou source account is inline and does not turn its page update into a dorm renovation date', () => {
  const sandbox = {}; sandbox.window = sandbox; vm.runInNewContext(factsScript, sandbox);
  const row = sandbox.DORMITORY_FACTS['兰州大学'][0];
  assert.ok(Array.isArray(row.sourceContent));
  assert.match(row.sourceContent.join(' '), /四人|4人/);
  assert.match(row.sourceContent.join(' '), /上床下桌/);
  assert.match(row.sourceContent.join(' '), /公共|公厕|公浴/);
  assert.equal(row.accessedAt, '2026-09-25');
  assert.match(row.sourceYearLabel, /页面更新/);
});

test('sources without recorded content keep the summary instead of fabricating a full article', async () => {
  const { sandbox, nodes } = page(); await tick();
  sandbox.DORMITORY_FACTS = { '北京大学': [{ sourceType: 'third_party', description: '已有历史摘要', sourceTitle: '摘要来源', sourceUrl: 'javascript:alert(1)' }] };
  sandbox.loadDormitoryProfile('北京大学'); await tick();
  const markup = nodes.dormitoryDetailBody.innerHTML;
  assert.match(markup, /已有历史摘要/);
  assert.doesNotMatch(markup, /信源内容（页内阅读）|javascript:|查看原始来源/);
});


test('a late note 401 must not remove the token from a newer login', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  const pending = deferred(); let token = 'old-token';
  sandbox.sessionStorage = { getItem: () => token, removeItem: () => { token = null; } };
  sandbox.fetch = () => pending.promise;
  click('dormitoryNoteSubmit');
  token = 'new-login-token';
  pending.resolve(response(200, {}, 401)); await tick();
  assert.equal(token, 'new-login-token');
  assert.match(nodes.dormitoryNoteContent.value, /四人间/);
  assert.equal(nodes.dormitoryNoteSubmit.disabled, false);
});

test('a photo 401 clears only the expired token and keeps the selected files', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  sandbox.fetch = () => Promise.resolve(response(200, {}, 401));
  click('dormitoryUploadButton'); await tick();
  assert.equal(sandbox.sessionStorage.getItem('token'), null);
  assert.equal(nodes.dormitoryPhotoInput.value, 'room.png');
  assert.equal(nodes.dormitoryUploadButton.disabled, false);
  assert.match(nodes.dormitoryUploadStatus.textContent, /重新登录/);
});

test('a late photo 401 must not remove the token from a newer login', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  const pending = deferred(); let token = 'old-token';
  sandbox.sessionStorage = { getItem: () => token, removeItem: () => { token = null; } };
  sandbox.fetch = () => pending.promise;
  click('dormitoryUploadButton');
  token = 'new-login-token';
  pending.resolve(response(200, {}, 401)); await tick();
  assert.equal(token, 'new-login-token');
  assert.equal(nodes.dormitoryPhotoInput.value, 'room.png');
  assert.equal(nodes.dormitoryUploadButton.disabled, false);
});


function addMinePanels(nodes) {
  for (const id of ['dormitoryMyUploads', 'dormitoryMyNotes']) {
    let markup = '';
    nodes[id] = {
      get innerHTML() { return markup; }, set innerHTML(value) { markup = value; },
      get textContent() { return markup; }, set textContent(value) { markup = value; }
    };
  }
}

for (const button of ['dormitoryUploadButton', 'dormitoryNoteSubmit']) test(button + ' 401 does not start anonymous history requests that can invalidate the next login', async () => {
  const { sandbox, nodes, click } = page(); await tick();
  addMinePanels(nodes);
  installSharedApiLayer(sandbox);
  sandbox.toast = () => {};
  let token = 'expired-token'; const reads = [], pending = deferred();
  sandbox.sessionStorage = { getItem: () => token, removeItem: () => { token = null; } };
  sandbox.fetch = (url, options) => {
    if (options?.method === 'POST') return Promise.resolve(response(401, null, 401));
    reads.push({ url, options });
    return pending.promise;
  };
  click(button); await tick();
  assert.equal(token, null, 'only the expired submitting session is cleared');
  token = 'new-login-token';
  pending.resolve(response(401, null, 401)); await tick();
  assert.equal(token, 'new-login-token', 'the whole POST -> history refresh chain preserves the new login');
  assert.equal(reads.length, 0, 'protected history is not requested without a token');
  assert.equal(nodes[button].disabled, false);
  assert.equal(nodes.dormitoryPhotoInput.value, 'room.png');
  assert.match(nodes.dormitoryNoteContent.value, /四人间/);
  assert.match(nodes.dormitoryMyUploads.textContent, /登录/);
  assert.match(nodes.dormitoryMyNotes.textContent, /登录/);
});

for (const lateResult of ['401', 'success', 'network failure']) test('late personal history ' + lateResult + ' cannot change a newer login or its records', async () => {
  const { sandbox, nodes } = page(); await tick();
  addMinePanels(nodes);
  installSharedApiLayer(sandbox);
  sandbox.toast = () => {};
  let token = 'old-token'; const pending = deferred();
  sandbox.sessionStorage = { getItem: () => token, removeItem: () => { token = null; } };
  sandbox.fetch = (_url, options) => {
    if (options.headers.Authorization === 'Bearer old-token') return pending.promise;
    return Promise.resolve(response(200, [{ schoolName: 'New account school', content: 'New account note', status: 'pending' }]));
  };
  sandbox.renderDormitoryMine();
  token = 'new-token';
  sandbox.renderDormitoryMine(); await tick();
  if (lateResult === 'network failure') pending.reject(new Error('offline'));
  else pending.resolve(lateResult === '401' ? response(401, null, 401) : response(200, [{ schoolName: 'Old account school', content: 'Old account note', status: 'approved' }]));
  await tick();
  assert.equal(token, 'new-token');
  for (const id of ['dormitoryMyUploads', 'dormitoryMyNotes']) {
    assert.match(nodes[id].innerHTML, /New account school/);
    assert.doesNotMatch(nodes[id].innerHTML, /Old account|读取失败/);
  }
});

test('an older same-session history refresh cannot overwrite newer records', async () => {
  const { sandbox, nodes } = page(); await tick();
  addMinePanels(nodes);
  installSharedApiLayer(sandbox);
  const pending = deferred(); let calls = 0;
  sandbox.fetch = () => ++calls <= 2 ? pending.promise : Promise.resolve(response(200, [{ schoolName: 'Latest school', content: 'Latest note', status: 'pending' }]));
  sandbox.renderDormitoryMine();
  sandbox.renderDormitoryMine(); await tick();
  pending.resolve(response(200, [])); await tick();
  for (const id of ['dormitoryMyUploads', 'dormitoryMyNotes']) assert.match(nodes[id].innerHTML, /Latest school/);
});

test('history HTTP 500 is never rendered as an empty successful history', async () => {
  const { sandbox, nodes } = page(); await tick();
  addMinePanels(nodes);
  installSharedApiLayer(sandbox);
  sandbox.fetch = () => Promise.resolve(response(200, [], 500));
  sandbox.renderDormitoryMine(); await tick();
  for (const id of ['dormitoryMyUploads', 'dormitoryMyNotes']) {
    assert.match(nodes[id].textContent, /读取失败/);
    assert.doesNotMatch(nodes[id].innerHTML, /你还没有/);
  }
});
