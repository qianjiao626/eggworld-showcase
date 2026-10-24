const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('growth-schoolv3.html','utf8');
const expected={
 F1:["'<div class=\"td-title\">' + escapeHtml(name)"],
 F2:['escapeHtml(descEl.textContent)'],
 F3:["escapeHtml(requirements).replace(/\\n/g,'<br>')"],
 F4:["escapeHtml(task.requirements).replace(/\\n/g,'<br>')"],
 F5:['+ escapeHtml(a.authorNickname) +'],
 F6:["escapeHtml(c.userName || '匿名蛋')"],
 F7:["'<div class=\"podium-name\">' + escapeHtml(u.name)"],
 F8:["'<span class=\"rank-name\">' + escapeHtml(u.name)"],
 F9:["escapeHtml((i.inviteeNickname || '?').charAt(0))"],
 F10:["escapeHtml(i.inviteeNickname || '未知')"],
 F11:["escapeHtml(u.mbtiType || '—')"],
 F12:["cat.icon + ' ' + escapeHtml(sub)"],
 F13:["escapeHtml(catName) + (sub ? ' · ' + escapeHtml(sub) : '')"],
 F14:["inviteGossipUser(\\'' + jsArgAttr(a.author)"],
 F15:["publishFromSkill(\\'' + jsArgAttr(s)"],
 F16:["removeSkill(\\'' + jsArgAttr(s)"],
 F17:["title=\"点击发布「' + escapeHtml(s) + '」教学任务\">💰 ' + escapeHtml(s)"],
 F18:["'<span class=\"st\">' + escapeHtml(s)","'<span class=\"user-egg-skill-tag\">💪 ' + escapeHtml(s)"],
 F19:["showUserEggModal(\\'' + jsArgAttr(name)"],
 F20:["showBlSchoolDetail(\\'' + jsArgAttr(r.school)"],
 F21:["closeBlMetricRank();showBlSchoolDetail(\\'' + jsArgAttr(r.school)"],
 F22:["return '✨ 新增「' + escapeHtml(q) + '」为新学校'"],
 F23:["'_blank', 'noopener,noreferrer'"],
};
for(const [id,needles] of Object.entries(expected))test(id+' production sinks are encoded',()=>{
 for(const needle of needles)assert.ok(html.includes(needle),needle);
 const counts={F7:2,F8:2,F12:2,F23:2};
 if(counts[id])assert.equal(html.split(needles[0]).length-1,counts[id]);
});
test('refund is not score-gated or immediate; three-day window remains',()=>{
 assert.equal(/互评均分≥4|互评≥4|均分\s*≥4|未及时互评按默认\s*4\s*分结算/.test(html),false,'no score-gated refund copy');
 assert.ok(html.includes('3 天互评期结束后退还'));
 assert.equal(html.split('出资已退还。').length-1,2);
 assert.equal(html.split('3 天后退还 80% 出资').length-1,3);
});
test('all inline scripts parse',()=>{
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
});
test('jsArgAttr returns escaped content without wrapper quotes',()=>{
 const ctx={};vm.createContext(ctx);
 for(const name of ['escapeHtml','jsArgAttr']){
  const start=html.indexOf('  function '+name+'(');const end=html.indexOf('\n  }',start)+4;
  vm.runInContext(html.slice(start,end),ctx);
 }
 assert.equal(ctx.jsArgAttr('plain'),'plain');
 assert.equal(ctx.jsArgAttr("x\\')\"<&"),'x\\\\\\&#39;)&quot;&lt;&amp;');
});
test('related skill invitation and task metadata use proper encoding',()=>{
 assert.ok(html.includes("toggleInviteTaskSkill(\\'' + jsArgAttr(s)"));
 assert.ok(html.includes("' data-skill-sub=\"' + escapeHtml(sub)"));
});

test('team banner does not promise funds immediately after confirmation',()=>{assert.equal(html.includes('双方确认完成后蛋蛋币到账'),false);});

test('completed team note preserves both roles and the settled flag',()=>{
 const ctx={};vm.createContext(ctx);
 const start=html.indexOf('  function myTaskNote('),end=html.indexOf('\n  }',start)+4;
 vm.runInContext(html.slice(start,end),ctx);
 for(const isPublisher of [true,false]){
  assert.equal(ctx.myTaskNote({taskType:'team',settled:1},{},isPublisher,'completed'),'出资已退还。');
  assert.equal(ctx.myTaskNote({taskType:'team',settled:0},{},isPublisher,'completed'),'参与方互评中，3 天互评期结束后退还 80% 出资；互评结果仅影响口碑值。');
 }
});

test('legacy team confirmation copy never promises immediate or full reward payout',()=>{
 const start=html.indexOf('  function teamConfirmComplete('),end=html.indexOf('\n  }',start)+4;
 const body=html.slice(start,end);
 assert.equal(body.includes("+ reward +"),false,'team refund copy must not promise the full reward');
 assert.equal(html.includes('认领者已提交完成，确认后即可结算。'),false);
 assert.ok(body.includes('3 天互评期结束后退还 80% 出资'));
});
