const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('growth-schoolv3.html', 'utf8');
function setup(records) {
  const wall = {innerHTML:''};
  const ctx = {
    GOSSIP_POSTS:[], currentGossipCat:'all', currentGossipFilter:'latest', USER:{points:0},
    document:{getElementById:id => id === 'gossipWall' ? wall : null},
    apiGet:async()=>({code:200,data:{records}}), getTagColorByName:()=> 'pink',
    // Avatar rendering is outside this count-only unit test; real deco DOM is covered by achievement.browser.cjs.
    decoWrap:avatar=>avatar,
    formatNotifTime:()=> '刚刚', escapeHtml:s=>String(s), jsArgAttr:s=>String(s)
  };
  const start = html.indexOf('  var GOSSIP_TAG_ICON =');
  const end = html.indexOf('  /* ===== 给所有广场的发布者头像和名称添加点击查看资料功能 ===== */',start);
  assert.ok(start >= 0 && end > start);
  vm.createContext(ctx); vm.runInContext(html.slice(start,end),ctx);
  return {ctx,wall};
}
const post = {id:1,title:'专业书要从学校买吗',tag:'校园',bounty:10};
test('list displays server count 3 even though list API omits answer details',async()=>{
  const {ctx,wall}=setup([{...post,answerCount:3,answers:null}]);
  await ctx.renderGossipWall();
  assert.match(wall.innerHTML, /<span>3 回答<\/span>/);
  assert.equal(ctx.GOSSIP_POSTS[0].answerCount,3);
});
test('server count takes priority over an empty or partial answer array',async()=>{
  const {ctx,wall}=setup([{...post,answerCount:6,answers:[{id:1}]}]);
  await ctx.renderGossipWall(); assert.match(wall.innerHTML, /<span>6 回答<\/span>/);
});
test('explicit zero remains zero',async()=>{
  const {ctx,wall}=setup([{...post,answerCount:0}]);
  await ctx.renderGossipWall(); assert.match(wall.innerHTML, /<span>0 回答<\/span>/);
});
test('older detail payload without count falls back to supplied answer details',async()=>{
  const {ctx,wall}=setup([{...post,answers:[{id:1},{id:2},{id:3}]}]);
  await ctx.renderGossipWall(); assert.match(wall.innerHTML, /<span>3 回答<\/span>/);
});
test('empty payload has zero answers',async()=>{
  const {ctx,wall}=setup([post]);
  await ctx.renderGossipWall(); assert.match(wall.innerHTML, /<span>0 回答<\/span>/);
});
test('reloading wall after another answer updates server count from 3 to 4',async()=>{
  const {ctx,wall}=setup([{...post,answerCount:3}]);
  await ctx.renderGossipWall(); assert.match(wall.innerHTML, /<span>3 回答<\/span>/);
  ctx.apiGet=async()=>({code:200,data:{records:[{...post,answerCount:4}]}});
  await ctx.renderGossipWall(); assert.match(wall.innerHTML, /<span>4 回答<\/span>/);
});
