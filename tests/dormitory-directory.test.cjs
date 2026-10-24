const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('growth-schoolv3.html', 'utf8');
const script = fs.readFileSync('js/dormitory.js', 'utf8');
const schoolSource = fs.readFileSync('js/bl-schools.js', 'utf8');

function createDormitorySandbox(sourceUrl) {
  const listeners = {};
  const nodes = {
    dormitoryDetailTitle: { textContent: '' },
    dormitoryDetailBody: { innerHTML: '' }
  };
  const sandbox = {
    console,
    API_BASE: '',
    USER: { registered: true },
    sessionStorage: { getItem: () => null },
    URL,
    document: {
      getElementById: (id) => nodes[id] || null,
      addEventListener: (type, handler) => { listeners[type] = handler; }
    },
    fetch: () => Promise.resolve({
      json: () => Promise.resolve({
        code: 200,
        data: {
          occupancy: '4人',
          roomConfiguration: '4人间',
          sourceUrl,
          sourceYear: 2026,
          verificationStatus: 'verified',
          images: []
        }
      })
    })
  };
  sandbox.window = sandbox;
  vm.runInNewContext(script, sandbox, { filename: 'js/dormitory.js' });
  return { sandbox, nodes, listeners };
}

async function waitForRender() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('gossip page links to dormitory directory and independent review route', () => {
  assert.match(html, /id="gossip-open-dormitories"/);
  assert.match(html, /id="page-dormitory-review"/);
  assert.match(html, /dormitories','dormitory-review/);
});

test('dormitory directory renders 2361 official campus school names with display prefix', () => {
  assert.match(script, /BL_SCHOOLS/);
  assert.match(script, /蛋蛋世界的/);
  assert.match(schoolSource, /BL_SCHOOLS/);
});

test('dormitory upload enforces five files and a 5 MB per-image browser limit', () => {
  assert.match(script, /5\s*\*\s*1024\s*\*\s*1024/);
  assert.match(script, /files\.length > MAX_FILES/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test('dormitory profile ignores unsafe source URLs without throwing', async () => {
  const { sandbox, nodes } = createDormitorySandbox('javascript:alert(1)');
  sandbox.loadDormitoryProfile('天津农学院');
  await waitForRender();
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /safeHttpUrl is not defined/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /查看资料来源/);
});

test('dormitory profile keeps http(s) source URLs', async () => {
  const { sandbox, nodes } = createDormitorySandbox('https://example.com/dormitory');
  sandbox.loadDormitoryProfile('天津农学院');
  await waitForRender();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /查看资料来源/);
  assert.match(nodes.dormitoryDetailBody.innerHTML, /https:\/\/example\.com\/dormitory/);
});

test('review queue exposes moderation actions and dedicated reviewer-only image route', () => {
  assert.match(script, /data-review="approve"/);
  assert.match(script, /data-review="reject"/);
  assert.ok(script.includes('/api/dormitories/review/images/'));
  assert.match(script, /createObjectURL/);
  assert.doesNotMatch(script, /uploaderId/);
  assert.match(script, /safeHttpUrl/);
});

test('dormitory migration defines additive tables and a syntactically complete idempotent seed upsert', () => {
  const migration = fs.readFileSync('backend/sql/migrate-dormitory-directory.sql', 'utf8');
  for (const table of ['dormitory_profiles', 'dormitory_reviewers', 'dormitory_images']) {
    assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
  }
  assert.match(migration, /ON DUPLICATE KEY UPDATE school_name = VALUES\(school_name\);/);
  assert.doesNotMatch(migration, /,\s*ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(migration, /\b(?:ALTER|DROP|TRUNCATE)\s+TABLE\b/i);
});

test('empty profile keeps an honest original cover rather than a fake dorm photo', async () => {
  const { sandbox, nodes } = createDormitorySandbox('');
  sandbox.loadDormitoryProfile('北京大学');
  await waitForRender();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /dormitory-cover/);
  assert.match(nodes.dormitoryDetailBody.innerHTML, /非宿舍实拍/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /<figure class="dormitory-image"/);
});

test('cover escapes school names from the directory and profile', async () => {
  const { sandbox, nodes } = createDormitorySandbox('');
  sandbox.loadDormitoryProfile('<img src=x onerror=alert(1)>');
  await waitForRender();
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /<img src=x/);
  assert.match(nodes.dormitoryDetailBody.innerHTML, /&lt;img/);
});

test('dormitory text submissions require a school and reviewer approval', () => {
  assert.match(html, /id="dormitoryNoteContent"/);
  assert.match(html, /id="dormitoryNoteSubmit"/);
  assert.match(html, /id="dormitoryReviewNotes"/);
  assert.match(script, /\/api\/dormitories\/notes/);
  assert.match(script, /\/api\/dormitories\/review\/notes\/pending/);
});

test('all schools remain browsable through load-more pagination', () => {
  assert.match(script, /visibleSchoolCount \+= 80/);
  assert.match(script, /id=\"dormitoryShowMore/);
});

test('approved text escapes content and untrusted links are filtered', () => {
  assert.match(script, /escapeHtml\(item\.content\)/);
  assert.match(script, /safeHttpUrl\(item\.sourceUrl\)/);
  assert.match(script, /selectedSchool !== school/);
});

test('migration stores optional location on images and moderated text', () => {
  const migration = fs.readFileSync('backend/sql/migrate-dormitory-content.sql', 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS dormitory_notes/);
  assert.match(migration, /ALTER TABLE dormitory_images[\s\S]*ADD COLUMN campus[\s\S]*ADD COLUMN building/);
  assert.match(migration, /source_url VARCHAR\(1000\) NULL/);
});

test('national sourcing ledger covers every school without claiming candidate links are hosted photos', () => {
  const csv = fs.readFileSync('tasks/2026-09-25_高校宿舍采集台账.csv', 'utf8').trim().split(/\r?\n/);
  assert.equal(csv.length - 1, 2361);
  assert.equal(csv.filter((line) => line.includes(',已入站,')).length, 0);
});

test('offline profile still shows honest cover and localized retry message', async () => {
  const { sandbox, nodes } = createDormitorySandbox('');
  sandbox.fetch = () => Promise.reject(new Error('Failed to fetch'));
  sandbox.loadDormitoryProfile('北京大学');
  await waitForRender();
  assert.match(nodes.dormitoryDetailBody.innerHTML, /非宿舍实拍/);
  assert.match(nodes.dormitoryDetailBody.innerHTML, /暂时无法读取资料/);
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /Failed to fetch/);
});

test('photo rendering labels missing location and hides broken images', () => {
  assert.match(script, /image\.campus \|\| '校区未提供'/);
  assert.match(script, /image\.building \|\| '楼号未提供'/);
  assert.match(script, /dormitory-image-failed/);
});

test('relative source URLs are rejected rather than resolved against the site', async () => {
  const { sandbox, nodes } = createDormitorySandbox('/api/dormitories/notes');
  sandbox.loadDormitoryProfile('天津农学院');
  await waitForRender();
  assert.doesNotMatch(nodes.dormitoryDetailBody.innerHTML, /查看资料来源/);
});

test('cancelled photo rejection does not submit a moderation decision', () => {
  const { sandbox, listeners } = createDormitorySandbox('');
  let submitted = 0;
  sandbox.prompt = () => null;
  sandbox.apiPost = () => { submitted++; return Promise.resolve({ code: 200 }); };
  const button = { getAttribute: (key) => key === 'data-review' ? 'reject' : '19' };
  listeners.click({ target: {
    id: '',
    closest: (selector) => selector === '[data-review]' ? button : null
  } });
  assert.equal(submitted, 0);
});

test('verified building facts are scoped, show unknown fields and escape source data', async () => {
  const { sandbox, nodes } = createDormitorySandbox('');
  sandbox.DORMITORY_FACTS = {
    '宁德师范学院': [{
      campus: '东侨校区', building: '9号楼', scope: '2025级',
      occupancy: '4或6人间', bedType: '', bathroom: '',
      sourceUrl: 'https://youth.ndnu.edu.cn/info/1019/8104.htm', sourceYear: 2025,
      sourceTitle: '<img src=x onerror=alert(1)>'
    }]
  };
  sandbox.loadDormitoryProfile('宁德师范学院');
  await waitForRender();
  const markup = nodes.dormitoryDetailBody.innerHTML;
  for (const part of ['东侨校区', '9号楼', '4或6人间', '床型待核实', '卫浴待核实', '2025']) {
    assert.ok(markup.includes(part), `${part} missing`);
  }
  assert.ok(markup.includes('&lt;img'), 'source title escaped');
  assert.ok(!markup.includes('<img src=x'), 'no injected html');
  sandbox.loadDormitoryProfile('北京大学');
  await waitForRender();
  assert.ok(!nodes.dormitoryDetailBody.innerHTML.includes('9号楼'), 'school records isolated');
});

test('verified text survives API failure without claiming an interior photo', async () => {
  const { sandbox, nodes } = createDormitorySandbox('');
  sandbox.DORMITORY_FACTS = { '宁德师范学院': [{
    campus: '东侨校区', building: '1号楼', scope: '2025年校团委介绍',
    bedType: '上床下桌', sourceUrl: 'https://youth.ndnu.edu.cn/info/1019/8104.htm', sourceYear: 2025
  }] };
  sandbox.fetch = () => Promise.reject(new Error('offline'));
  sandbox.loadDormitoryProfile('宁德师范学院');
  await waitForRender();
  const markup = nodes.dormitoryDetailBody.innerHTML;
  assert.ok(markup.includes('上床下桌'), 'static verified facts are independent of API');
  assert.ok(markup.includes('暂时无法读取'), 'dynamic data failure is disclosed');
  assert.ok(!markup.includes('已核实内部实拍'), 'text is not photography');
});
test('an unsourced school stays explicitly unverified when dynamic API is unavailable', async () => {
  const { sandbox, nodes } = createDormitorySandbox('');
  sandbox.DORMITORY_FACTS = { '宁德师范学院': [{ campus: '东侨校区', building: '1号楼', bedType: '上床下桌' }] };
  sandbox.fetch = () => Promise.reject(new Error('offline'));
  sandbox.loadDormitoryProfile('北京大学');
  await waitForRender();
  const markup = nodes.dormitoryDetailBody.innerHTML;
  assert.ok(markup.includes('该校暂无预置宿舍描述'), 'explicitly state the evidence gap');
  assert.ok(markup.includes('动态内容'), 'do not hide the API failure');
  assert.ok(!markup.includes('上床下桌'), 'facts from another school must not leak');
});

test('text submissions are capped at 200 characters on the page and in JavaScript', () => {
  assert.match(html, /id="dormitoryNoteContent" maxlength="200"/);
  assert.match(script, /snapshot\.content\.trim\(\)\.length > 200\b/);
  assert.match(script, /1–200 字内容/);
});
test('third-party dorm facts disclose unverified status and accessed date without claiming official verification', async () => {
  const { sandbox, nodes } = createDormitorySandbox('');
  sandbox.DORMITORY_FACTS = { '北京大学': [{
    campus: '校区未注明', building: '楼号未注明', scope: '来源未注明具体楼栋',
    occupancy: '4人间', sourceType: 'third_party', sourceTitle: '第三方报道',
    sourceUrl: 'https://example.org/report', sourceYear: 2025, accessedAt: '2026-09-25'
  }] };
  sandbox.loadDormitoryProfile('北京大学');
  await waitForRender();
  const markup = nodes.dormitoryDetailBody.innerHTML;
  assert.match(markup, /第三方资料·待核实/);
  assert.match(markup, /2026-09-25查阅/);
  assert.match(markup, /第三方报道/);
  assert.doesNotMatch(markup, /学校资料 · 2025/);
});
test('201-character note is blocked before API while 200 characters can be submitted', async () => {
  const { sandbox, nodes, listeners } = createDormitorySandbox('');
  sandbox.loadDormitoryProfile('北京大学');
  await waitForRender();
  nodes.dormitoryNoteContent = { value: '甲'.repeat(201) };
  nodes.dormitoryNoteStatus = { textContent: '' };
  nodes.dormitoryNoteSource = { value: '' };
  nodes.dormitoryNoteCampus = { value: '' };
  nodes.dormitoryNoteBuilding = { value: '' };
  let calls = 0;
  sandbox.fetch = (_url, options) => { if (options?.method === 'POST') calls++; return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ code: 200 }) }); };
  const event = { target: { id: 'dormitoryNoteSubmit', closest: () => null } };
  listeners.click(event);
  assert.equal(calls, 0);
  assert.match(nodes.dormitoryNoteStatus.textContent, /1–200/);
  nodes.dormitoryNoteContent.value = '甲'.repeat(200);
  listeners.click(event);
  assert.equal(calls, 1);
});

test('dormitory text form advertises the 5-coin approval reward in UI and success message', () => {
  assert.match(html, /文字介绍审核通过后公开，并奖励 5 个蛋蛋币/);
  assert.match(script, /并奖励 5 个蛋蛋币/);
});

test('career test is hidden from the workbench, page script and APIs stay', () => {
  // 2026-10-07：职业测评从工作台隐藏（左侧入口 + 面板移除），脚本与接口保留以便随时放出。
  assert.doesNotMatch(html, /data-lab-item="career"/);
  assert.doesNotMatch(html, /data-lab-panel="career"/);
  assert.match(html, /js\/career-test\.js/);
  const js = fs.readFileSync('js/career-test.js', 'utf8');
  assert.match(js, /\/api\/career-test\/questions/);
  assert.match(js, /\/api\/career-test\/generate/);
  assert.match(js, /\/api\/career-test\/history/);
  assert.match(html, /careerTestLoad/);
});

test('pet system is hidden from the workbench, page script and APIs stay', () => {
  assert.doesNotMatch(html, /data-lab-item="pet"/);
  assert.doesNotMatch(html, /data-lab-panel="pet"/);
  assert.match(html, /js\/pet-system\.js/);
  assert.match(html, /petSystemLoad/);
  const js = fs.readFileSync('js/pet-system.js', 'utf8');
  assert.match(js, /\/api\/pets\/shop/);
  assert.match(js, /\/api\/pets\/buy/);
  assert.match(js, /\/api\/pets\/hatch/);
  assert.match(js, /\/api\/pets\/' \+ petId \+ '\/feed/);
});

test('dormitory upload reports 413 and non-JSON errors instead of generic network error', () => {
  const script = fs.readFileSync('js/dormitory.js', 'utf8');
  assert.match(script, /response\.status === 413/);
  assert.match(script, /服务器拒绝了这次上传/);
  assert.match(script, /JSON\.parse\(await response\.text\(\)\)/);
  assert.doesNotMatch(script, /\.catch\(function \(\) \{ if \(status\) status\.textContent = '网络异常，上传失败，请稍后重试。'; \}\)/);
});
