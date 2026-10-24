const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');

/* 页面切换契约：go(id) → hideAllPages() 只摘 ADMIN_PAGES ∪ STUDENT_PAGES 里页面的 .active。
   不在名单里的页面被访问一次后就永远带着 .active，会叠在之后每一个页面上
   （2026-09-21「聊天室治理」串页事故：ADMIN_PAGES 漏了 chatadmin，点一次后三个卡片出现在所有界面）。 */

const listOf=name=>{
  const m=html.match(new RegExp('var '+name+'\\s*=\\s*\\[([^\\]]*)\\]'));
  assert.ok(m,name+' 未找到（变量被改名/改成非字面量时本测试需要同步）');
  return [...m[1].matchAll(/'([a-z]+)'/g)].map(x=>x[1]);
};
const known=new Set([...listOf('ADMIN_PAGES'),...listOf('STUDENT_PAGES')]);
const sections=[...new Set([...html.matchAll(/<section[^>]*id="page-([a-z]+)"/g)].map(m=>m[1]))];

test('每个 page-* 区块都在切页名单里',()=>{
  assert.ok(sections.length >= 10, '没解析到 page 区块，选择器可能已过期');
  const missing=sections.filter(p=>!known.has(p)).sort();
  assert.deepEqual(missing,[],'以下页面不在 ADMIN_PAGES / STUDENT_PAGES 里，访问一次后会永久点亮：'+missing.join(', '));
});

test('管理端页面归 ADMIN_PAGES、学生端页面归 STUDENT_PAGES',()=>{
  const admin=listOf('ADMIN_PAGES');
  assert.ok(admin.includes('chatadmin'),'chatadmin 必须在 ADMIN_PAGES（否则导航高亮会算到 studentNav）');
  assert.ok(!admin.includes('lab'),'lab 是学生端页面');
});
