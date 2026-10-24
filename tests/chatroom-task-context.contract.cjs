const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('growth-schoolv3.html');
const js=read('js/chatroom.js');
const css=read('js/chatroom.css');
const ctrl=read('backend/src/main/java/com/eggworld/controller/ChatController.java');
const ctxSvc=read('backend/src/main/java/com/eggworld/service/ChatContextService.java');
const vo=read('backend/src/main/java/com/eggworld/dto/ChatConversationContextVO.java');

/* 2026-09-27 聊天室换肤（三栏任务群）的契约：
   ① 后端补 GET /api/chat/conversations/{id}/context（关联任务 + 成员任务角色）
   ② 前端右栏「关联任务 / 群成员 / 提交与确认」全部吃服务端数据，前端不自行推断角色
   ③ 配色改用原型的紫色系，但变量必须限定作用域：主站 :root 已有同名 --primary
   ④ 架构不对等的既有约束（归档只读、泡点、撤回、未读）不得被这次换肤改坏 */

/* ---------- ① 后端：context 接口 ---------- */

test('context 接口挂在会话资源下，且只对会话成员开放',()=>{
  assert.match(ctrl,/@GetMapping\("\/conversations\/\{id\}\/context"\)/,'必须新增 context 路由');
  assert.match(ctrl,/contextService\.context\(UserContext\.userId\(\), id\)/,'必须传当前登录用户');
  assert.match(ctxSvc,/permissionService\.requireMember\(conversationId, userId\)/,'必须先校验会话成员身份');
});

test('context 按 conversation_id 反查任务，没有关联任务时 task 为 null',()=>{
  assert.match(ctxSvc,/Task::getConversationId, conversationId/,'必须按 tasks.conversation_id 反查');
  assert.match(ctxSvc,/if \(task != null\) \{[\s\S]*?vo\.setTask\(/,'无任务时必须跳过 setTask（保持 null）');
  assert.match(vo,/private TaskBrief task;/);
});

test('成员任务角色：发布者标 publisher，有认领记录的标 claimer，旁观者为 null',()=>{
  const i=ctxSvc.indexOf('private List<ChatConversationContextVO.MemberVO> members(');
  assert.ok(i>0,'未找到成员装配方法');
  const body=ctxSvc.slice(i,ctxSvc.indexOf('\n    private ChatConversationContextVO.TaskBrief',i));
  assert.match(body,/setTaskRole\("publisher"\)/);
  assert.match(body,/setTaskRole\("claimer"\)/);
  // 不能写成「非发布者一律 claimer」：任务群是公开群，误入的路人会显示成学员
  assert.ok(body.includes('if (claim != null)'),'claimer 必须由认领记录决定，不能只看「不是发布者」');
  assert.match(body,/setClaimStatus\(claim\.getStatus\(\)\)/,'要把认领状态一并回传（前端据它决定能不能点提交/确认）');
});

test('context 回传 readOnly，供前端渲染归档只读态',()=>{
  assert.match(ctxSvc,/vo\.setReadOnly\(/);
  assert.match(vo,/private Integer readOnly;/);
});

/* ---------- ② 前端：右栏吃服务端数据 ---------- */

test('前端拉取 context 并渲染任务卡 / 成员 / 状态胶囊',()=>{
  assert.match(js,/function loadContext\(conversationId\)/);
  assert.match(js,/'\/api\/chat\/conversations\/'\+conversationId\+'\/context'/);
  assert.match(js,/renderTaskCard\(/);
  assert.match(js,/renderMembers\(/);
  assert.match(js,/renderTaskStatus\(/);
  assert.match(html,/id="chatroomTaskCard"/);
  assert.match(html,/id="chatroomMemberList"/);
  assert.match(html,/id="chatroomTaskStatus"/);
});

test('提交 / 确认按钮接现有任务接口：教学求助逐个确认、组队走整体确认',()=>{
  assert.match(js,/"\/api\/tasks\/"\+ctx\.task\.id\+"\/submit"/);
  assert.match(js,/\/api\/tasks\/"\+ctx\.task\.id\+"\/claims\/"\+pending\.claimerId\+"\/confirm"/);
  assert.match(js,/\/api\/tasks\/"\+ctx\.task\.id\+"\/confirm"/);
  // 二次确认弹窗必须成对存在（提交 / 确认归档）
  assert.match(html,/id="chatroomSubmitModal"/);
  assert.match(html,/id="chatroomConfirmModal"/);
  assert.match(html,/确认后当前专属群聊将立即转为「只读归档」状态/,'确认前必须预告归档');
});

test('换肤不动既有交互：归档替换输入区、泡点、撤回、未读入口都还在',()=>{
  assert.match(html,/id="chatroomComposer"/);
  assert.match(html,/id="chatroomArchivedNote"/);
  assert.match(js,/syncArchiveState\(fresh\);/);
  assert.match(js,/function renderReward\(/);
  assert.match(js,/"撤回"/);
  assert.match(js,/window\.chatroomUnreadOf=unreadOf;/);
  // 移动端列表 ⇄ 详情仍是 chat-open 开关，移动端浏览器用例依赖它
  assert.match(js,/shell\.classList\.add\('chat-open'\)/);
  assert.match(css,/\.chatroom-shell\.chat-open \.chatroom-main-panel\{transform:translateX\(0\)\}/);
});

/* ---------- ③ 配色作用域 ---------- */

test('🔴 配色变量必须限定在聊天室作用域内，绝不写进 :root',()=>{
  // 主站 :root 已有 --primary/--ink/--muted；若在 chatroom.css 的 :root 覆盖会波及全站
  const rootBlocks=[...css.matchAll(/:root\s*\{[^}]*\}/g)].map(m=>m[0]);
  assert.equal(rootBlocks.length,0,'chatroom.css 不允许出现 :root 变量块，实际 '+rootBlocks.length+' 处');
  assert.match(css,/\.chatroom-shell,\s*\.chatroom-modal,?\s*\.chat-admin-grid\{/,'变量应声明在聊天室作用域选择器上');
  assert.match(css,/--cr-accent:var\(--primary,#1B3A5B\)/,'主色应取主站的藏青 --primary');
});

test('换肤保留受契约保护的布局与滚动约束',()=>{
  // 2026-09-27 重构：外壳铺满工作区（视口 - 主区剩余 padding 24），三栏 310 / 1fr / 280
  assert.match(css,/\.chatroom-shell\{[^}]*height:calc\(100vh - 24px\)/);
  assert.match(css,/\.chatroom-shell\{[^}]*grid-template-columns:310px minmax\(0,1fr\) 280px/);
  assert.match(css,/\.chatroom-messages\{[^}]*min-height:0/);
  assert.match(html,/chatroom-messages-wrap/);
  assert.match(html,/id="chatroomJump"/);
});

test('配色跟随主站令牌，不再维护独立色板',()=>{
  // 站内已有 :root 令牌，聊天室只引用（带兜底值）：主题一改，工作台自动跟随
  assert.match(css,/--cr-canvas:var\(--bg,#F5F1E8\)/,'中栏画布应为主站页面暖底');
  assert.match(css,/--cr-rail:var\(--rule,#E8E2D2\)/,'两侧栏用更深一档暖底，三栏分区才明显');
  assert.match(css,/--cr-ink:var\(--ink,#1B2A4A\)/);
  assert.match(css,/--cr-border:var\(--border,#E2DCC8\)/);
  assert.match(css,/--cr-cta:linear-gradient\(135deg,#4ECDC4,#45B7D1\)/,'主操作按钮应与主站 .btn-primary 同款');
});
