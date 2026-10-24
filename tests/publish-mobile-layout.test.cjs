'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'growth-schoolv3.html'),'utf8');
const js=fs.readFileSync(path.join(root,'js','publish-mobile.js'),'utf8');

/* 2026-10-08 真实缺陷：手机上发布任务看不到「技能证明图片」取图区。
   根因：移动端版式是**重建**（把桌面 DOM 的子块搬进 .pm-body），字段靠 fieldOf(kids,id) 找；
   而 fieldOf 原来只用 el.querySelector('#id') —— querySelector 只匹配**后代**，
   #publishProofWrap 自己就是那个 id（表单卡片的直接子元素），于是整块没被搬过去、在手机上消失。
   这里同时钉住：① fieldOf 必须匹配自身带 id 的元素 ② 所有 fieldOf 查询的 id 都必须真实存在。 */

function fieldOfFactory(){
  const start=js.indexOf('  function fieldOf(kids, id){');
  assert.ok(start>0,'js/publish-mobile.js 里找不到 fieldOf');
  const end=js.indexOf('\n  }',start)+4;
  const ctx={};
  vm.createContext(ctx);
  vm.runInContext(js.slice(start,end),ctx);
  return ctx.fieldOf;
}

test('fieldOf 必须匹配「自身就带这个 id」的字段块（移动端重建版式的根因）',()=>{
  const fieldOf=fieldOfFactory();
  const self={id:'publishProofWrap',querySelector:()=>null};          // 自身带 id，无后代
  const nested={id:'publishContactWrap',querySelector:s=>s==='#publishContact'?{}:null};
  const other={id:'x',querySelector:()=>null};
  assert.equal(fieldOf([nested,self,other],'publishProofWrap'),self,
    '自身带 id 的元素必须能被找到，否则移动端会把这一块整块丢掉');
  assert.equal(fieldOf([self,nested,other],'publishContact'),nested,'后代带 id 的老路径也要继续有效');
  assert.equal(fieldOf([self,other],'nope'),null,'找不到要返回 null（调用方用 if 兜底）');
});

test('fieldOf 查询的每个 id 都必须在主文件里真实存在',()=>{
  const ids=Array.from(js.matchAll(/fieldOf\(kids,\s*'([^']+)'\)/g),m=>m[1]);
  assert.ok(ids.length>=8,'fieldOf 调用数量异常：'+ids.length);
  for(const id of ids){
    assert.ok(html.includes('id="'+id+'"'),'js/publish-mobile.js 查询了不存在的 id：'+id+'（字段被改名/删除后移动端会静默丢块）');
  }
});

test('证明图取图区是表单卡片的直接子元素（因此必须走「自身 id」这条路）',()=>{
  const m=/\n {12}<div id="publishProofWrap">/.exec(html);
  assert.ok(m,'#publishProofWrap 的层级变了：若不再自己带 id，请同步更新本测试与 fieldOf 注释');
  assert.match(js,/var proofFld = fieldOf\(kids, 'publishProofWrap'\)/,'移动端必须显式搬一次证明图字段');
  assert.match(js,/if\(proofFld\) body\.appendChild\(fld\(proofFld\)\)/,'搬到移动版式里才会显示');
});

test('改动 js/publish-mobile.js 必须同步升 ?v= 版本号',()=>{
  const m=/<script src="js\/publish-mobile\.js\?v=(\d{8})"><\/script>/.exec(html);
  assert.ok(m,'主文件里必须有带 ?v=YYYYMMDD 的 publish-mobile.js 引用（/js/* 缓存 7 天）');
  assert.ok(Number(m[1])>=20261008,'本次修了 publish-mobile.js，?v= 必须升到 20261008 或更晚，否则手机仍跑旧脚本');
});
