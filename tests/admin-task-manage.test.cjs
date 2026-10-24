'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');
const mod=fs.readFileSync(path.join(root,'js','admin-task-manage.js'),'utf8');
const build=fs.readFileSync(path.join(root,'backend','build-release.ps1'),'utf8');

/* 任务管理页（仅主管理员）落成契约：主文件登记 5 处 + 外联模块 + 打包清单。
   漏任何一处都会：串页（不在 ADMIN_PAGES）/ 页面不渲染（无入口调用）/ 全量部署漏文件（清单）。 */

test('主文件存在 #page-taskmanage 区块且带渲染宿主',()=>{
  assert.match(html,/<section[^>]*id="page-taskmanage"/,'缺少 page-taskmanage 区块');
  assert.match(html,/id="taskManageHost"/,'缺少任务管理渲染宿主 #taskManageHost');
});

test('taskmanage 已在 ADMIN_PAGES 名单里',()=>{
  const m=html.match(/var ADMIN_PAGES\s*=\s*\[([^\]]*)\]/);
  assert.ok(m,'ADMIN_PAGES 未找到（被改名/改成非字面量时本测试需同步）');
  assert.ok(/'taskmanage'/.test(m[1]),'taskmanage 必须加进 ADMIN_PAGES，否则切页会串页');
});

test('主文件引入了 js/admin-task-manage.js（带 ?v= 版本号）',()=>{
  assert.match(html,/<script src="js\/admin-task-manage\.js\?v=[^"]+"><\/script>/,'未引入外联模块或缺少 ?v= 版本号');
});

test('go(id) 里调用了任务管理入口',()=>{
  assert.match(html,/id === 'taskmanage'[\s\S]*?window\.renderAdminTaskManage/,'go() 未调用 window.renderAdminTaskManage()');
});

test('打包清单包含 admin-task-manage.js',()=>{
  assert.ok(build.includes("'admin-task-manage.js'"),'backend/build-release.ps1 清单缺少 admin-task-manage.js');
});

test('模块暴露 window.renderAdminTaskManage 入口',()=>{
  assert.match(mod,/window\.renderAdminTaskManage\s*=/,'模块未暴露 window.renderAdminTaskManage');
});

test('模块没有使用原生 confirm( / alert(',()=>{
  assert.ok(!/\bconfirm\s*\(/.test(mod),'禁止使用原生 confirm()，请用自定义弹窗');
  assert.ok(!/\balert\s*\(/.test(mod),'禁止使用原生 alert()，请用自定义弹窗或 toast()');
});
