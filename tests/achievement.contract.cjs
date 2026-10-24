// Static contract checks supplement, never replace, achievement.browser.cjs / MySQL IT.
//
// 2026-09-18 更新：成就系统暂时下线（线上库未执行 migrate-achievement.sql）。
// 本文件改为校验「下线状态」：SQL 整节注释、后端代码已抽离、前端不再加载。
// 恢复成就系统时，请把本文件回退到 git 历史里「下线前」的版本。
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const exists=p=>fs.existsSync(path.join(root,p));
const sql=read('backend/sql/migrate-achievement.sql');
const init=read('backend/sql/init.sql');
const html=read('growth-schoolv3.html');
// 去掉 HTML 注释后再断言「未加载」：注释里保留了恢复用的引用清单
const htmlLive=html.replace(/<!--[\s\S]*?-->/g,'');

test('achievement migration is fully commented out and cannot run',()=>{
 // 整节注释：不应存在任何可执行的 DDL/DML 语句
 assert.doesNotMatch(sql,/^\s*(?:CREATE|INSERT|SELECT|ALTER|DROP|UPDATE|DELETE|USE|TRUNCATE)\b/m);
 assert.match(sql,/【暂时下线/);
});

test('achievement seed data is preserved inside comments for later restore',()=>{
 // 注释里仍保留 24 称号 / 30 成就，恢复时取消注释即可
 assert.equal((sql.match(/^-- \('t-/gm)||[]).length,24);
 assert.equal((sql.match(/^-- \('ach_/gm)||[]).length,30);
 assert.equal((sql.match(/^-- CREATE TABLE IF NOT EXISTS/gm)||[]).length,4);
});

test('init SQL no longer creates or drops achievement tables',()=>{
 assert.doesNotMatch(init,/^\s*DROP TABLE IF EXISTS (?:user_equip|user_achievements|achievements|titles);/m);
 assert.doesNotMatch(init,/^\s*CREATE TABLE (?:IF NOT EXISTS )?(?:user_equip|user_achievements|achievements|titles)\b/m);
 assert.doesNotMatch(init,/^\s*INSERT INTO (?:titles|achievements)\b/m);
 // 注释里保留恢复说明
 assert.match(init,/【暂时下线，整节已注释】/);
});

test('backend achievement code is moved out of the compiled source tree',()=>{
 for(const p of [
   'backend/achievement-pending/service/AchievementService.java',
   'backend/achievement-pending/service/DecoService.java',
   'backend/achievement-pending/controller/AchievementController.java',
   'backend/achievement-pending/controller/DecoResponseAdvice.java',
   'backend/achievement-pending/mapper/UserEquipMapper.java',
   'backend/achievement-pending/common/DecoConstants.java'
 ]) assert.ok(exists(p),p+' should be parked outside src/');
 for(const p of [
   'backend/src/main/java/com/eggworld/service/AchievementService.java',
   'backend/src/main/java/com/eggworld/service/DecoService.java',
   'backend/src/main/java/com/eggworld/controller/AchievementController.java',
   'backend/src/main/java/com/eggworld/controller/DecoResponseAdvice.java'
 ]) assert.ok(!exists(p),p+' should no longer be compiled');
});

test('frontend no longer loads achievement page or decoration resources',()=>{
 for(const p of ['js/deco.css','js/deco.js','js/deco-integration.js','js/achievement-page.css','js/achievement-page.js']){
   assert.ok(exists(p),p+' should be kept for later restore');
   assert.doesNotMatch(htmlLive,new RegExp('<(?:script src|link rel="stylesheet" href)="'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"'),p+' must not be loaded');
 }
 // 成就页 DOM 与解锁弹窗已抽离
 assert.doesNotMatch(html,/id="page-achievements"/);
 assert.doesNotMatch(html,/id="achUnlockModal"/);
 // 路由仍拦住直接进入
 assert.match(html,/if\(id === 'achievements'\)\{ toast\('成就殿堂暂未开放'\); return; \}/);
});

test('deco.js remains exactly the authoritative ticket 5.3 code',()=>{
 const ticket=read('TODO/工单-成就特效系统.md');
 const section=ticket.slice(ticket.indexOf('### 5.3'),ticket.indexOf('### 5.4'));
 const code=section.match(/```(?:javascript|js)\s*\n([\s\S]*?)```/);
 assert.ok(code);assert.equal(read('js/deco.js').trim(),code[1].trim());
});

test('production decoration stylesheet excludes preview theme and gallery rules',()=>{
 const css=read('js/deco.css');
 assert.doesNotMatch(css,/:root|\.gitem\b|(?:^|\n)\s*(?:body|h1|h2|\.card|\.stage|\.pickers|\.gallery|\.note)\s*\{/m);
 for(const size of ['xs','sm','md','lg'])assert.ok(css.includes('.deco-'+size));
 assert.ok(css.includes('.fx-field'));assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('body.fx-off'));
});
