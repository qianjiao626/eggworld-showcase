const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('growth-schoolv3.html');
const deadlineScheduler=read('backend/src/main/java/com/eggworld/job/DeadlineScheduler.java');
const refundScheduler=read('backend/src/main/java/com/eggworld/job/RefundScheduler.java');
const taskService=read('backend/src/main/java/com/eggworld/service/TaskService.java');
const claimService=read('backend/src/main/java/com/eggworld/service/ClaimService.java');

/* 组队任务「人没满就找不到」修复的前后端口径契约。
   用户反馈：组队任务有人报名、发布者尚未选人，报名截止一到就从广场消失。
   最终口径（方案 A）：组队 = 长期招募
     ① 组队没有报名截止（effectiveSignupDeadline 对 team 返回 null）
     ② 没满员就一直留在广场、一直可报名（大厅 + 我的任务都可见）
     ③ 只有两条路径让组队离开招募：满员转 full、超过 90 天兜底
   前端 signupDeadlineOf 是后端口径的镜像，必须同步，否则「看得见拦不住」。 */

test('组队型没有报名截止（唯一口径函数对 team 返回 null）',()=>{
  const start=taskService.indexOf('public static LocalDateTime effectiveSignupDeadline');
  assert.ok(start>0,'effectiveSignupDeadline 不存在');
  const body=taskService.slice(start,taskService.indexOf('\n    }\n',start));
  assert.match(body,/"team"\.equals\(task\.getTaskType\(\)\)\)\s*return null/,
    '组队必须直接返回 null（长期招募）');
  // 必须在「填了 signupDeadline 就用它」之前返回，否则历史数据里的显式截止会生效
  const teamIdx=body.indexOf('"team".equals');
  const explicitIdx=body.indexOf('getSignupDeadline() != null');
  assert.ok(teamIdx>0 && explicitIdx>teamIdx,
    '组队的 null 判断必须早于显式截止判断，否则库里存量截止仍会生效');
});

test('认领不再按报名截止拦截组队任务',()=>{
  const start=claimService.indexOf('LocalDateTime signupDeadline = TaskService.effectiveSignupDeadline');
  assert.ok(start>0,'ClaimService 未使用统一口径');
  // 规则收敛在唯一口径函数里，ClaimService 不应再自己写 team 例外
  const body=claimService.slice(start-400,start+200);
  assert.equal(/if\s*\(\s*!isTeam\s*\)/.test(body),false,
    '不应在 ClaimService 里重复 team 例外（规则只定义一次）');
  assert.ok(claimService.includes('throw new BusinessException("报名已截止")'),
    '教学/求助仍必须被截止拦截');
});

test('前端 signupDeadlineOf 与后端一致：组队返回空',()=>{
  const start=html.indexOf('  function signupDeadlineOf(task, taskType){');
  assert.ok(start>0,'signupDeadlineOf 不存在');
  const body=html.slice(start,html.indexOf('\n  }',start));
  assert.match(body,/=== 'team'\)\s*return '';/,'组队必须返回空串（无截止）');
  const teamIdx=body.indexOf("=== 'team'");
  const explicitIdx=body.indexOf('task.signupDeadline');
  assert.ok(teamIdx>0 && explicitIdx>teamIdx,
    '组队的空值判断必须早于显式截止判断');
});

test('兜底天数常量存在且为 90 天',()=>{
  assert.match(taskService,/TEAM_RECRUIT_FALLBACK_DAYS\s*=\s*90\s*;/,
    'TaskService.TEAM_RECRUIT_FALLBACK_DAYS 必须是 90');
});

test('组队走独立兜底分支，不被「长期有效」分支跳过',()=>{
  assert.ok(deadlineScheduler.includes('expireTeam'),
    'DeadlineScheduler 必须有组队专用分支');
  const scan=deadlineScheduler.indexOf('public void scanSignupDeadlines');
  const body=deadlineScheduler.slice(scan,deadlineScheduler.indexOf('private boolean remind',scan));
  assert.match(body,/"team"\.equals\(task\.getTaskType\(\)\)[\s\S]{0,200}expireTeam\(task\)/,
    '组队必须在主循环里先分流到 expireTeam，否则 deadline==null 会被 continue 跳过');
  // 分流必须发生在取 deadline 之前
  assert.ok(body.indexOf('expireTeam')<body.indexOf('effectiveSignupDeadline'),
    '组队分流必须早于 effectiveSignupDeadline 调用');
});

test('兜底只按 90 天下架，与候选池是否有报名无关',()=>{
  const start=deadlineScheduler.indexOf('private boolean expireTeam');
  assert.ok(start>0,'expireTeam 不存在');
  const body=deadlineScheduler.slice(start,deadlineScheduler.indexOf('private boolean expire(',start));
  assert.ok(body.includes('TEAM_RECRUIT_FALLBACK_DAYS'),'必须用兜底天数');
  assert.ok(body.includes('expireIfApproved'),'超期后应下架');
  assert.ok(body.includes('frozenAmountOf'),'下架应退回出资');
  assert.equal(body.includes('hasCandidates'),false,
    '不应再依赖候选池判据（组队语义是「没满员就长期招募」）');
});

test('求助型仍按 3 天无人认领自动退回，组队型已移出该定时任务',()=>{
  assert.match(refundScheduler,/AUTO_REFUND_DAYS\s*=\s*3\s*;/,'求助型仍是 3 天');
  const start=refundScheduler.indexOf('List<Task> expired = taskMapper.selectList');
  const query=refundScheduler.slice(start,refundScheduler.indexOf('int handled',start));
  assert.ok(query.includes('"help"'),'查询必须含求助型');
  assert.equal(query.includes('"team"'),false,'组队型必须移出 3 天自动退回');
});

/* ---------- 可见性：没招满时大厅 + 我的任务都能看到 ---------- */

test('大厅仍查询 approved，招募中的组队任务不会消失',()=>{
  const start=html.indexOf('async function fetchPlazaInto');
  const body=html.slice(start,html.indexOf('\n  }',html.indexOf('hidePlazaLoading',start)));
  assert.ok(body.includes("status=approved"),'大厅必须查询 approved 状态');
});

test('组队任务不再被前端自动退回扫描判死',()=>{
  const start=html.indexOf('  function scanAndRefundExpiredTasks(');
  const body=html.slice(start,html.indexOf('return refundedCount',start));
  assert.ok(body.includes("['helpUserList']"),'扫描列表应只含求助列表');
  assert.equal(body.includes('teamUserList'),false,'扫描列表不应含组队列表');
  assert.equal(body.includes("=== 'team'"),false,'不应再有组队退款分支');
});

test('我的任务不过滤状态，组队任务始终在列',()=>{
  assert.ok(html.includes("readAll('/api/tasks/my-published')"),'我的任务须拉我发布的全部任务');
  assert.ok(html.includes("readAll('/api/tasks/my-claimed')"),'我的任务须拉我认领的全部任务');
  // approved 的组队任务必须落进「进行中/待处理」，不能落进「已过期」
  const start=html.indexOf('  function taskStageOf(task, t, isPublisher){');
  const body=html.slice(start,html.indexOf('\n  }',start));
  assert.ok(body.includes("if(st === 'approved')"),'approved 必须有明确归组');
  assert.equal(/if\(st === 'team'\)\s*return 'expired'/.test(body),false,
    '组队不得归入已过期组');
});

test('组队卡片/详情不再显示「长期有效」，改为招募中口径',()=>{
  assert.ok(html.includes('招募中'),'组队应显示招募中');
  const start=html.indexOf('    var openEndedTag = taskTypeKey === ');
  assert.ok(start>0,'缺少按类型区分的无截止文案');
  const body=html.slice(start,start+500);
  assert.ok(body.includes("taskTypeKey === 'team'"),'组队应单列文案');
  assert.ok(body.includes('长期招募'),'组队文案应说明长期招募');
});

test('组队任务详情倒计时已移除',()=>{
  const start=html.indexOf('    /* 求助任务无人认领时显示自动退回倒计时');
  const body=html.slice(start,start+400);
  assert.ok(body.includes("if(taskType === 'help' && claimed === 0 && !isExpired)"),
    '倒计时条件应只对求助型生效');
});

test('求助型倒计时口径未被误改',()=>{
  assert.match(html,/var AUTO_REFUND_DAYS = 3;/,'求助仍是 3 天');
  assert.ok(html.includes('你发布的求助任务「'),'求助退款文案应保留');
});

test('蛋蛋币消耗途径文案不再承诺组队 3 天自动退回',()=>{
  assert.equal(html.includes('组队/求助 3 天无人响应自动退回'),false,
    '静态文案必须与后端规则一致');
  assert.ok(html.includes('求助 3 天无人认领自动退回（组队改为长期招募）'),
    '应给出组队的新口径');
});