'use strict';
/*
 * 学生工坊「大师兄简历」入口契约（2026-10-15，改为整页跳转方案）。
 *
 * 简历站是独立整页应用（resume/ 静态导出到同域 /rs/）。工坊卡片点击后**同标签跳转**
 * 到 /rs/，站点自带「返回蛋蛋世界」；不在蛋蛋世界内做嵌入适配。
 * 同源同标签的好处：蛋蛋世界的登录 token（sessionStorage）可直接复用，AI 对标不用二次登录。
 *
 * 这里钉住四件事，任何一处漏改都会表现为「点卡片没反应」「整页跳转后回不来」或「线上少文件」：
 *   ① 主文件不再有嵌入用的页面区块 / 路由钩子 / bridge 引用
 *   ② 工坊注册表里卡片跳转到 rs/
 *   ③ 简历站仍是静态导出到 /rs，且带返回入口
 *   ④ 本地前端服务托管 /rs（否则本地点进去 404）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('growth-schoolv3.html');
const registry = read('js/student-workshop.js');
const css = read('js/student-workshop.css');

test('主文件里已经没有嵌入方案留下的页面区块与路由钩子', () => {
  assert.ok(!/id="page-resumestudio"/.test(html), '不应再有 #page-resumestudio 页面区块');
  assert.ok(!/resumeStudioEnter/.test(html), '不应再有 resumeStudioEnter 路由钩子');
  assert.ok(!/resume-studio-bridge/.test(html), '不应再引用已删除的 resume-studio-bridge.js');
  assert.ok(!/resumeStudioHost/.test(html), '不应再有 iframe 宿主容器');
});

test('resumestudio 已从 STUDENT_PAGES / 移动端 alias / topbar 规则里移除', () => {
  const m = html.match(/var STUDENT_PAGES\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, '未找到 STUDENT_PAGES');
  assert.ok(!/'resumestudio'/.test(m[1]), 'STUDENT_PAGES 不应再含 resumestudio');

  const alias = html.match(/data-page="plaza" data-alias="([^"]+)"/);
  assert.ok(alias, '未找到移动端广场组入口');
  assert.ok(!alias[1].split(',').includes('resumestudio'), 'data-alias 不应再含 resumestudio');

  assert.ok(!/:is\([^)]*#page-resumestudio/.test(html), 'topbar 规则不应再引用 #page-resumestudio');
});

test('工坊注册表里「大师兄简历」卡片是同标签跳转到 rs/', () => {
  assert.ok(/id:\s*'resumestudio'/.test(registry), '注册表缺少 resumestudio 卡片');
  assert.ok(/name:\s*'大师兄简历'/.test(registry), '卡片标题应为「大师兄简历」');
  assert.ok(
    /id:\s*'resumestudio'[\s\S]{0,320}?open:\s*function \(\) \{ window\.location\.href = 'rs\/\?v=[^']+'; \}/.test(registry),
    "卡片 open 应同标签跳转到 'rs/?v=<版本>'（带版本串才能绕过 /rs/ 下 HTML 的 7 天缓存）"
  );
  assert.ok(!/go\('resumestudio'\)/.test(registry), '不应再走蛋蛋世界内部路由');
});

test('工坊样式里不再有 iframe 宿主/状态层', () => {
  assert.ok(!/#resumeStudioHost/.test(css), '不应再有 iframe 宿主样式');
  assert.ok(!/\.rs-frame/.test(css), '不应再有 iframe 样式');
});

test('简历子模块仍是仓库内源码 + 静态导出到 /rs', () => {
  assert.ok(fs.existsSync(path.join(root, 'resume', 'src', 'app', 'page.tsx')), 'resume 源码应在仓库内');
  const cfg = read('resume/next.config.js');
  assert.ok(/output:\s*["']export["']/.test(cfg), 'resume/next.config.js 必须 output: export');
  assert.ok(/basePath:\s*["']\/rs["']/.test(cfg), 'basePath 必须是 /rs');
  assert.ok(/trailingSlash:\s*true/.test(cfg), 'trailingSlash 必须为 true');
  assert.ok(!fs.existsSync(path.join(root, 'resume', 'src', 'app', 'api')), '静态导出不支持 API Route');
});

test('简历站侧栏有「返回蛋蛋世界」，且身份/AI 走同源 token', () => {
  const sidebar = read('resume/src/components/Sidebar.tsx');
  assert.ok(/返回蛋蛋世界/.test(sidebar), '简历站必须有返回入口');
  assert.ok(/href="\/"/.test(sidebar), '返回入口应指向蛋蛋世界首页 /（不能走 basePath）');

  const site = read('resume/src/lib/site.ts');
  assert.ok(/sessionStorage\.getItem\("token"\)/.test(site), '应复用蛋蛋世界同源的登录 token');
  assert.ok(/apiBase/.test(site), '应复用主站的 API base 规则');

  const eggUser = read('resume/src/lib/egg-user.ts');
  assert.ok(/\/api\/users\/me/.test(eggUser), '身份应通过 /api/users/me 换取');
  assert.ok(!/postMessage/.test(eggUser), '整页跳转方案不需要 postMessage');
});

test('简历站内部跳转走 Next 路由，且侧栏选中态先去掉部署前缀', () => {
  const create = read('resume/src/app/resume/create/page.tsx');
  assert.ok(!/window\.location\.href\s*=\s*["']\/resume["']/.test(create),
    '不能手写 window.location 跳到站内路径（会丢 /rs 前缀，直接 404）');
  assert.ok(/router\.push\("\/resume"\)/.test(create), '站内跳转应走 router.push');

  const sidebar = read('resume/src/components/Sidebar.tsx');
  assert.ok(/BASE_PATH/.test(sidebar), '侧栏应先用 BASE_PATH 归一当前路径');
  assert.ok(/currentPath === item\.href/.test(sidebar), '选中态应比较归一后的路径');
});

test('「写简历 → 帮我深度评审」会把草稿带进改简历页', () => {
  const create = read('resume/src/app/resume/create/page.tsx');
  assert.ok(/localStorage\.setItem\(userScopedKey\("diagnosis_resume_data"\)/.test(create),
    '写简历应把结构化草稿写入按用户隔离的 diagnosis_resume_data');

  const optimize = read('resume/src/app/resume/page.tsx');
  assert.ok(/localStorage\.getItem\(draftKey\)/.test(optimize), '改简历应读取这份草稿');
  assert.ok(/resumeDataToText/.test(optimize), '改简历应把结构化草稿拍平成纯文本');

  const helper = read('resume/src/lib/resume-text.ts');
  for (const section of ['核心能力', '教育经历', '实习经历', '项目经验', '技能与工具']) {
    assert.ok(helper.includes(section), '拍平结果应包含「' + section + '」');
  }
});

test('简历计费与历史记录：价格/预扣/退款/幂等与余额展示都接后端', () => {
  const sql = read('backend/sql/migrate-resume.sql');
  assert.ok(/resume_drafts/.test(sql) && /resume_analyses/.test(sql), '需要草稿与对标两张历史表');
  assert.ok(/UNIQUE KEY uk_resume_analyses_request/.test(sql), '对标记录要有 requestId 唯一键（幂等）');

  const service = read('backend/src/main/java/com/eggworld/service/ResumeService.java');
  const settings = read('backend/src/main/java/com/eggworld/service/AppSettingsService.java');
  assert.ok(/analyze-cost/.test(settings), '默认价格应回落到配置');
  assert.ok(/changeBalance\(userId, -cost/.test(service), '应先预扣蛋蛋币');
  assert.ok(/refund/.test(service), 'AI 失败要全额退款');
  assert.ok(/request_id/.test(service), '按 requestId 做幂等');

  const controller = read('backend/src/main/java/com/eggworld/controller/ResumeController.java');
  for (const path of ['/meta', '/analyze', '/analyses', '/drafts']) {
    assert.ok(controller.includes('"' + path), '缺少接口 ' + path);
  }

  const optimize = read('resume/src/app/resume/page.tsx');
  assert.ok(/\/api\/resume\/meta/.test(optimize), '改简历页应取价格与余额');
  assert.ok(/requestId/.test(optimize), '对标请求要带 requestId');
  assert.ok(/open_analysis_id/.test(optimize), '改简历页应读取 open_analysis_id 并载入那次记录');

  const historyPage = read('resume/src/app/resume/history/page.tsx');
  assert.ok(/\/api\/resume\/analyses/.test(historyPage), '历史对标页应拉取历史记录');
  assert.ok(/open_analysis_id/.test(historyPage), '点历史记录应把 id 交给改简历页');

  const create = read('resume/src/app/resume/create/page.tsx');
  assert.ok(/\/api\/resume\/drafts/.test(create), '写简历页应保存/列出历史草稿');

  const sidebar = read('resume/src/components/Sidebar.tsx');
  assert.ok(/蛋蛋币/.test(sidebar) && /points/.test(sidebar), '侧栏用户信息应显示余额');
  assert.ok(/href: "\/resume\/history"/.test(sidebar), '「历史对标」应是侧栏（最左侧）导航入口');
  const home = read('resume/src/app/page.tsx');
  assert.ok(/蛋蛋币/.test(home) && /points/.test(home), '简历站首页用户信息应显示余额');
});

test('扣币与提示都用站内弹窗（不再用浏览器原生 alert）', () => {
  const optimize = read('resume/src/app/resume/page.tsx');
  assert.ok(!/alert\(/.test(optimize), '改简历页不应再用原生 alert');
  assert.ok(/<Dialog/.test(optimize), '应渲染自定义 Dialog');
  assert.ok(/onConfirm: \(\) => runAnalyze\(token\)/.test(optimize), '点了确认才发起扣费请求');
  assert.ok(/bill: charging \? \{ cost/.test(optimize), '收费时确认弹窗要写明本次消耗与当前余额');

  const dialog = read('resume/src/components/Dialog.tsx');
  assert.ok(/role="dialog"/.test(dialog) && /aria-modal/.test(dialog), '弹窗需要无障碍语义');
  assert.ok(/Escape/.test(dialog), '支持 Esc 关闭');
  assert.ok(/dialog-panel/.test(dialog), '面板使用站内动效类');

  const create = read('resume/src/app/resume/create/page.tsx');
  assert.ok(!/alert\(/.test(create), '写简历页不应再用原生 alert');
  assert.ok(/<Dialog/.test(create), '写简历页也应使用自定义 Dialog');
});

test('简历站首页没有占位死链（href="#"）', () => {
  const page = read('resume/src/app/page.tsx');
  assert.ok(!/href="#"/.test(page), '首页不应再有 href="#" 的占位入口（「开始找方向」已下线）');
});

test('本地前端服务托管 /rs，否则本地点卡片会 404', () => {
  const dev = read('start-frontend.cjs');
  assert.ok(/startsWith\('\/rs\/'\)/.test(dev), 'start-frontend.cjs 的白名单应放行 /rs/');
  assert.ok(/RESUME_OUT/.test(dev), 'start-frontend.cjs 应把 /rs/** 映射到 resume/out');
  assert.ok(/isDirectory\(\)/.test(dev), '目录路由要按 index.html 解析');
});

test('页面引用的外联资源都带缓存版本号', () => {
  assert.ok(/js\/student-workshop\.js\?v=\d/.test(html), 'js/student-workshop.js 必须带 ?v= 版本号');
  assert.ok(/js\/student-workshop\.css\?v=\d/.test(html), 'js/student-workshop.css 必须带 ?v= 版本号');
});

test('简历站的个人数据按用户隔离，换账号不串数据', () => {
  const site = read('resume/src/lib/site.ts');
  assert.ok(/userScopedKey/.test(site) && /currentUserId/.test(site),
    '应按 token 里的用户 id 隔离本地缓存');

  const optimize = read('resume/src/app/resume/page.tsx');
  assert.ok(/userScopedKey/.test(optimize), '草稿键要按用户隔离');
  assert.ok(/if \(!draft\) return;/.test(optimize), '没有草稿时保持空白（侧栏直接进入不带上次内容）');
  assert.ok(!/localStorage\.getItem\("user_resume"\)/.test(optimize), '不再回放单独保存的简历原文');
  assert.ok(!/localStorage\.setItem\([^)]*user_resume/.test(optimize), '不再把简历原文存到本地');
  assert.ok(/userScopedKey\("open_analysis_id"\)/.test(optimize), '历史回填键也要按用户隔离');

  const create = read('resume/src/app/resume/create/page.tsx');
  assert.ok(/userScopedKey\("diagnosis_resume_data"\)/.test(create), '草稿交接键要按用户隔离');

  const history = read('resume/src/app/resume/history/page.tsx');
  assert.ok(/userScopedKey\("open_analysis_id"\)/.test(history), '历史页写回填键也要按用户隔离');
});

test('「开始搞简历」直接进入岗位大类，不再经过行业选择页', () => {
  const create = read('resume/src/app/resume/create/page.tsx');
  assert.ok(/useState\(1\)/.test(create), '初始步骤应为岗位大类');
  assert.ok(!/你想去哪个行业/.test(create), '行业选择页已移除');
  assert.ok(/请选择岗位大类/.test(create), '保留岗位大类页');
  assert.ok(!/setStep\(0\)/.test(create), '不应再回到行业选择');
  assert.ok(/之前的简历/.test(create), '历史草稿入口要保留在岗位大类页');
});

test('工坊软件的「返回蛋蛋世界」统一回学生工坊，不回首页', () => {
  const files = [
    'resume/src/app/page.tsx',
    'resume/src/components/Sidebar.tsx',
    'resume/public/career/index.html',
    'resume/public/career/report.html',
    'resume/public/career/reports.html',
    'resume/public/career/js/career-entry.js',
    'backend/src/main/resources/resume/career/career-report.html',
  ];
  for (const file of files) {
    assert.ok(read(file).includes('/#workshop'), file + ' 的返回链接应带 #workshop');
  }
  /* 找方向的三个页面：返回入口在标题左侧（与简历站一致） */
  for (const file of [
    'resume/public/career/index.html',
    'resume/public/career/reports.html',
    'resume/public/career/report.html',
  ]) {
    const src = read(file);
    assert.ok(src.indexOf('/#workshop') < src.indexOf('大师兄牛啵'),
      file + ' 的「返回蛋蛋世界」应在左侧（标题之前）');
  }
  assert.ok(/location\.hash === '#workshop'/.test(html), '主站应识别 #workshop');
  assert.ok(/go\('workshop'\)/.test(html), '识别后应打开学生工坊页');
});

test('「找方向」职业测评抽到学生工坊，与大师兄简历并列', () => {
  const workshop = read('js/student-workshop.js');
  assert.ok(/name: '大师兄找方向'/.test(workshop), '学生工坊应有职业测评入口');
  assert.ok(/window\.location\.href = 'rs\/career\/\?v=[^']+'/.test(workshop),
    '工坊卡片应整页跳转到 /rs/career/?v=<版本>（带版本串绕过 HTML 缓存）');
  assert.ok(/name: '大师兄简历'/.test(workshop), '应与大师兄简历并列');

  const home = read('resume/src/app/page.tsx');
  assert.ok(!/BASE_PATH \+ "\/career\/"/.test(home), '简历站首页不再重复放职业测评卡');

  const landing = read('resume/public/career/index.html');
  assert.ok(/html\/career\.html/.test(landing), '找方向落地页应能进入答题页');
  assert.ok(/career-entry\.js/.test(landing) && /start-assessment/.test(landing),
    '开始测评按钮应带价格提示/登录校验');
  assert.ok(/返回蛋蛋世界/.test(landing), '职业测评独立入口应有返回蛋蛋世界');

  const reports = read('resume/public/career/reports.html');
  assert.ok(/report-list\.js/.test(reports), '测评报告列表应是独立静态页');
  const listJs = read('resume/public/career/js/report-list.js');
  assert.ok(/\/api\/resume\/career\/reports/.test(listJs), '报告列表应拉取历史记录');
  assert.ok(/report\.html\?id=/.test(listJs), '点记录应打开报告查看页');

  const js = read('resume/public/career/js/career.js');
  assert.ok(/career_question\.xml/.test(js), '答题页应读取题库');
  assert.ok(/\/api\/resume\/career\/report/.test(js), '报告接口应走 Spring Boot');
  assert.ok(/Authorization/.test(js), '生成报告要带登录态');
  assert.ok(/requestId/.test(js), '生成报告要带幂等键');
  assert.ok(/career\/reports\.html/.test(js), '生成成功要能跳到报告记录');

  const careerPage = read('resume/public/career/html/career.html');
  assert.ok(careerPage.includes('href="../index.html"'), '答题页要有返回找方向首页的入口');
  assert.ok(careerPage.includes('href="../reports.html"'), '答题页的「我的报告」必须是可点击链接');

  const controller = read('backend/src/main/java/com/eggworld/controller/ResumeController.java');
  for (const path of ['/career/meta', '/career/report', '/career/reports']) {
    assert.ok(controller.includes('"' + path), '后端缺少职业测评接口 ' + path);
  }

  const service = read('backend/src/main/java/com/eggworld/service/CareerReportService.java');
  assert.ok(/career_map\.xml/.test(service) && /career\.md/.test(service), '报告依赖匹配规则与素材');
  assert.ok(/changeBalance\(userId, -cost/.test(service), '职业测评应先预扣蛋蛋币');
  assert.ok(/refund/.test(service), '失败要退款');
  assert.ok(/career_reports/.test(service), '报告要落库留档');

  const config = read('backend/src/main/java/com/eggworld/config/WebMvcConfig.java');
  assert.ok(!/\/api\/resume\/career\/report/.test(config), '报告接口必须登录后调用');

  const sidebar = read('resume/src/components/Sidebar.tsx');
  assert.ok(!/career-reports/.test(sidebar), '职业测评已抽离，简历侧栏不再挂测评报告');
});

test('学生工坊排序：管理员可调整，学生按保存顺序渲染', () => {
  const ws = read('js/student-workshop.js');
  assert.ok(/\/api\/workshop\/order/.test(ws), '工坊应按后端保存的顺序渲染');
  assert.ok(/getStudentWorkshopFeatures/.test(ws), '后台排序需要功能清单');
  assert.ok(/orderedFeatures/.test(ws), '应有「保存顺序 + 新功能补末尾」的合并逻辑');

  const admin = read('js/admin-settings.js');
  assert.ok(/\/api\/admin\/settings\/workshop/.test(admin), '后台应有工坊排序接口');
  assert.ok(/data-order-up/.test(admin) && /data-order-down/.test(admin), '排序卡应有上移/下移按钮');

  const controller = read('backend/src/main/java/com/eggworld/controller/AdminSettingsController.java');
  assert.ok(/@GetMapping\("\/workshop"\)/.test(controller)
    && /@PutMapping\("\/workshop"\)/.test(controller), '后台排序接口必须存在');

  const publicController = read('backend/src/main/java/com/eggworld/controller/WorkshopController.java');
  assert.ok(/\/order/.test(publicController), '公开读取顺序接口');

  const config = read('backend/src/main/java/com/eggworld/config/WebMvcConfig.java');
  assert.ok(/\/api\/workshop\/order/.test(config), '公开顺序接口应允许匿名访问');
});

test('系统设置：后台可配置是否收费 / 单价 / 每日次数，业务侧实时读取', () => {
  const sql = read('backend/sql/migrate-app-settings.sql');
  for (const key of ['resume.charge_enabled', 'resume.analyze_cost', 'resume.daily_limit']) {
    assert.ok(sql.includes(key), '缺少配置项 ' + key);
  }

  const careerSql = read('backend/sql/migrate-career-reports.sql');
  assert.ok(/career_reports/.test(careerSql), '需要职业测评报告记录表');
  for (const key of ['career.charge_enabled', 'career.analyze_cost', 'career.daily_limit']) {
    assert.ok(careerSql.includes(key), '缺少职业测评配置项 ' + key);
  }

  const controller = read('backend/src/main/java/com/eggworld/controller/AdminSettingsController.java');
  assert.ok(/@AdminOnly/.test(controller), '系统设置接口必须仅主管理员可用');
  assert.ok(/@GetMapping\("\/resume"\)/.test(controller) && /@PutMapping\("\/resume"\)/.test(controller),
    '需要读取与保存两个接口');
  assert.ok(/@GetMapping\("\/career"\)/.test(controller) && /@PutMapping\("\/career"\)/.test(controller),
    '职业测评也要有读取与保存接口');

  const settings = read('backend/src/main/java/com/eggworld/service/AppSettingsService.java');
  assert.ok(/chargeEnabled/.test(settings) && /dailyLimit/.test(settings), '设置需包含收费开关与每日次数');
  assert.ok(/effectiveCost/.test(settings), '免费时实际扣费应为 0');
  assert.ok(/careerSettings\(\)/.test(settings), '职业测评配置也要实时读取');

  const service = read('backend/src/main/java/com/eggworld/service/ResumeService.java');
  assert.ok(/settingsService\.resumeSettings\(\)/.test(service), '计费应每次实时读取后台配置');
  assert.ok(/429/.test(service), '超过每日次数应返回 429');
  assert.ok(/countToday/.test(service), '每日次数按自然日统计成功记录');

  const web = read('js/admin-settings.js');
  assert.ok(/\/api\/admin\/settings\/resume/.test(web), '后台设置页应调用系统设置接口');
  assert.ok(/\/api\/admin\/settings\/career/.test(web), '后台设置页应有职业测评配置卡');
  assert.ok(html.includes('data-page="settings"') && html.includes('id="page-settings"'),
    '后台应有系统设置入口与页面区块');
  assert.ok(/js\/admin-settings\.js/.test(html), '主文件应引入 js/admin-settings.js');
  assert.ok(/admin-settings\.js/.test(read('backend/build-release.ps1')), '全量打包清单要包含 admin-settings.js');

  const resumePage = read('resume/src/app/resume/page.tsx');
  assert.ok(/chargeEnabled/.test(resumePage) && /todayLeft/.test(resumePage),
    '简历站应展示免费状态与今日剩余次数');
});

test('职业测评报告：深色档案版式，不再有卡通头像 / 虚线占位卡', () => {
  const tpl = read('backend/src/main/resources/resume/career/career-report.html');
  assert.ok(/class="career-dossier"/.test(tpl), '报告应使用档案版式容器');
  assert.ok(tpl.includes('{{REPORTS}}') && tpl.includes('{{DATE}}'), '模板占位符必须保留');
  assert.ok(tpl.includes('{{USER}}'), '抬头用用户名占位，替代头像');
  assert.ok(!/default-avatar/.test(tpl), '报告不再使用头像图');
  assert.ok(/PREPARED FOR/.test(tpl) && /cd-owner-name/.test(tpl), '抬头应印「档案持有人 + 用户名」');
  assert.ok(!/border-dashed/.test(tpl), '报告不再使用虚线占位卡');
  assert.ok(!/rounded-3xl/.test(tpl), '报告不再使用大圆角卡片');
  assert.ok(tpl.includes('/#workshop'), '报告仍要能返回学生工坊');
  assert.ok(tpl.includes('/rs/resume/create'), '报告底部保留去写简历的入口');
  assert.ok(/去蛋蛋世界发布求助任务，学习岗位经验技能/.test(tpl), '下一步建议要加发布求助入口');
  assert.ok(tpl.indexOf('/#publish-help') < tpl.indexOf('/rs/resume/create'),
    '发布求助入口要排在写简历前面');
  assert.ok(/location\.hash === '#publish-help'/.test(html)
    && /goPublish\('help', null, 'helpplaza'\)/.test(html),
    '主站要支持 #publish-help 直接打开求助发布页');

  const css = read('resume/public/career/css/career-report.css');
  assert.ok(/\.career-dossier\s*\{/.test(css), '缺少报告样式作用域');
  assert.ok(/--cd-brass/.test(css), '报告使用黄铜强调色');
  assert.ok(/Noto Serif SC/.test(css), '标题使用衬线字体');
  assert.ok(/counter\(cd-path, decimal-leading-zero\)/.test(css), '路径区块要有 PATH 编号');
  assert.ok(/@media print/.test(css), '导出 PDF 需要打印样式');
  assert.ok(/\.cd-banner/.test(css), '报告上方的状态条与档案同色系');
  assert.ok(/\.cd-body > h1/.test(css), '「基础总结 / 发展路径」等一级分节要有排版');
  assert.ok(/cd-next-actions/.test(css) && /cd-cta--ghost/.test(css),
    '下一步两条建议要有主次层级（主按钮 + 描边按钮）');
  assert.ok(/body\.career-report-page/.test(css), '查看报告时整页应为深色');
  assert.ok(/career-report-page/.test(read('resume/public/career/report.html')),
    '报告查看页 body 应带深色页面类');
  assert.ok(/classList\.add\('career-report-page'\)/.test(read('resume/public/career/js/career.js')),
    '答题页生成报告后应把整页切成深色');

  for (const page of ['resume/public/career/report.html', 'resume/public/career/html/career.html']) {
    assert.ok(/career-report\.css\?v=/.test(read(page)), page + ' 应加载报告样式');
  }
  assert.ok(/cd-banner/.test(read('resume/public/career/js/report-view.js')), '历史报告状态条应使用新样式');
  assert.ok(/cd-banner/.test(read('resume/public/career/js/career.js')), '生成成功提示应使用新样式');
});

test('大师兄简历：移动端顶栏 + 页面不再被侧栏挤扁', () => {
  const sidebar = read('resume/src/components/Sidebar.tsx');
  assert.ok(/md:w-64/.test(sidebar), '桌面端保留 256px 侧栏');
  assert.ok(/grid-cols-3/.test(sidebar) && /md:flex-col/.test(sidebar),
    '移动端导航改成三栏横排');
  assert.ok(/md:hidden/.test(sidebar), '移动端顶栏与桌面侧栏分开渲染');

  for (const page of [
    'resume/src/app/resume/page.tsx',
    'resume/src/app/resume/create/page.tsx',
    'resume/src/app/resume/history/page.tsx',
    'resume/src/app/tracker/page.tsx',
  ]) {
    const src = read(page);
    assert.ok(/flex-col md:flex-row/.test(src), page + ' 外壳要能在窄屏改为纵向');
    assert.ok(/md:h-screen/.test(src), page + ' 固定高度只留给桌面');
  }

  const rewrite = read('resume/src/app/resume/page.tsx');
  assert.ok(/w-full md:w-1\/2/.test(rewrite), '简历录入区移动端占满整行');
  assert.ok(/hidden lg:flex w-64/.test(rewrite), '右侧专家服务在窄屏收起');

  const globals = read('resume/src/app/globals.css');
  assert.ok(/@media screen and \(max-width: 767px\)[\s\S]*overflow-y: auto/.test(globals),
    '移动端要允许页面滚动（body 默认 overflow:hidden）');
  assert.ok(/\.resume-canvas-fit[\s\S]*zoom: 0\.58/.test(globals), 'A4 预览在窄屏等比缩小');
  assert.ok(/resume-canvas-fit/.test(read('resume/src/app/resume/create/page.tsx')), '预览画布挂上缩放类');
});

test('职业测评统一深色皮肤：入口 / 答题 / 记录与报告同一套语言', () => {
  for (const page of [
    'resume/public/career/index.html',
    'resume/public/career/html/career.html',
    'resume/public/career/reports.html',
  ]) {
    const src = read(page);
    assert.ok(/<html class="dark"/.test(src), page + ' 需要 dark 模式');
    assert.ok(/career-theme\.css\?v=/.test(src), page + ' 需要加载深色皮肤');
  }

  const theme = read('resume/public/career/css/career-theme.css');
  assert.ok(/html\.dark body[\s\S]*#0a0c11/.test(theme), '页面底色统一为墨黑');
  assert.ok(/\.text-primary[\s\S]*#e8d5ae/.test(theme), '亮蓝主色收拢为黄铜');
  assert.ok(/border-radius: 2px/.test(theme), '卡片改为细线直角');
  assert.ok(/career-hero/.test(theme) && /career-hero/.test(read('resume/public/career/index.html')),
    '入口首屏用同一套深色档案底板');
  assert.ok(/Noto Serif SC/.test(theme), '标题统一衬线');
});

test('职业测评的提示统一用主题化弹窗，余额不足有明确提醒', () => {
  const dialog = read('resume/public/career/js/career-dialog.js');
  assert.ok(/window\.careerAlert/.test(dialog), '需要可复用的主题化提示框');
  assert.ok(/alertdialog/.test(dialog), '弹窗需要无障碍语义');

  const entry = read('resume/public/career/js/career-entry.js');
  const career = read('resume/public/career/js/career.js');
  assert.ok(!/\balert\(/.test(entry) && !/\balert\(/.test(career), '不得再使用原生 alert');
  assert.ok(/蛋蛋币不足/.test(entry) && /蛋蛋币不足/.test(career), '余额不足要有专门提醒');
  assert.ok(/当前余额/.test(entry) && /当前余额/.test(career), '提醒里要说明还差多少');
  assert.ok(/开始测评 · 蛋蛋币不足/.test(entry), '落地页按钮要先给出余额不足状态');
  assert.ok(/cr-loading/.test(career), '生成报告时用轻遮罩，保留答题现场');

  for (const page of ['resume/public/career/index.html', 'resume/public/career/html/career.html']) {
    assert.ok(/career-dialog\.js/.test(read(page)), page + ' 应加载提示框脚本');
  }
  assert.ok(/\.cr-dialog/.test(read('resume/public/career/css/career.css')), '提示框样式要随页面加载');
});

test('报告分享：抬头入口 + 链接/长图两种方式 + 公开只读页', () => {
  const share = read('resume/public/career/js/report-share.js');
  assert.ok(/data-share="link"/.test(share) && /data-share="image"/.test(share), '同时提供链接与长图');
  assert.ok(/\/share'/.test(share), '分享链接走后端接口');
  assert.ok(/method: 'DELETE'/.test(share), '支持撤销分享');
  assert.ok(/html2canvas/.test(share), '长图用客户端渲染');
  assert.ok(/cd-btn--primary/.test(share), '入口做成主按钮，与保存 PDF 并列');
  assert.ok(/copyText\(url\)\.then/.test(share), '生成链接后自动写入剪贴板');
  assert.ok(/已复制分享链接/.test(share), '链接复制成功用轻提示，不再展示长链接');
  assert.ok(/data-view="preview"/.test(share) && /cd-preview/.test(share), '长图要有独立预览视图');
  assert.ok(/返回分享方式/.test(share), '预览可返回分享方式');
  assert.ok(/ClipboardItem/.test(share), '长图也要能直接写入剪贴板');
  assert.ok(/data-copy-image/.test(share) && /data-download-image/.test(share),
    '长图保留复制 / 下载两个兜底按钮');
  assert.ok(/is-capturing/.test(share), '长图捕获前降级复杂背景');
  assert.ok(/\.career-dossier\.is-capturing/.test(read('resume/public/career/css/career-report.css')),
    '降级样式要真正生效（纯色底、去渐变）');
  assert.ok(/\.cd-modal\s*\{[^}]*--cd-brass/s.test(read('resume/public/career/css/career-report.css')),
    '弹窗挂在 body 下，必须自带一份颜色变量（否则主按钮看不见）');

  assert.ok(/CareerReportShare\.mount\(data\.recordId\)/.test(read('resume/public/career/js/career.js')),
    '答题页生成报告后挂载分享入口');
  assert.ok(/CareerReportShare\.mount\(d\.id \|\| id\)/.test(read('resume/public/career/js/report-view.js')),
    '历史报告查看页也要挂载分享入口');
  assert.ok(/report-share\.js/.test(read('resume/public/career/report.html'))
    && /report-share\.js/.test(read('resume/public/career/html/career.html')), '两页都要加载分享脚本');

  const page = read('resume/public/career/share.html');
  assert.ok(/share-view\.js/.test(page), '公开分享页要有独立渲染脚本');
  assert.ok(/name="robots" content="noindex"/.test(page), '分享页不应被搜索引擎收录');
  const view = read('resume/public/career/js/share-view.js');
  assert.ok(/\/api\/resume\/career\/shared\//.test(view), '公开页读取分享接口');
  assert.ok(!/Authorization/.test(view), '公开分享不携带登录态');
  assert.ok(/downloadPDF/.test(view), '分享页里保存 PDF 仍可用');

  const controller = read('backend/src/main/java/com/eggworld/controller/ResumeController.java');
  assert.ok(/@PostMapping\("\/career\/reports\/\{id\}\/share"\)/.test(controller), '缺少创建分享接口');
  assert.ok(/@DeleteMapping\("\/career\/reports\/\{id\}\/share"\)/.test(controller), '缺少撤销分享接口');
  assert.ok(/@GetMapping\("\/career\/shared\/\{token\}"\)/.test(controller), '缺少公开读取接口');

  const config = read('backend/src/main/java/com/eggworld/config/WebMvcConfig.java');
  assert.ok(/\/api\/resume\/career\/shared\//.test(config), '公开分享接口必须免登录放行');

  const sql = read('backend/sql/migrate-career-share.sql');
  assert.ok(/share_token/.test(sql) && /uk_career_reports_share/.test(sql), '分享令牌与唯一键');
  assert.ok(/shared_at/.test(sql), '记录首次分享时间');
  assert.ok(/share_token/.test(read('backend/sql/migrate-career-reports.sql')), '新库建表也要带分享列');
});
