'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

/* 任务「技能证明图片」的前端契约（2026-10-07 新增功能）：
   1) 构件本身：有 id 才渲染、地址口径正确、取图失败有兜底；
   2) 主文件接线：发布表单能取图并回填 proofImageId；详情页把它渲染在「任务描述」之前；
   3) 手机端重排不许把这块弄丢（publish-mobile.js 是重建版式，不是挪节点）。 */

function loadComponent(){
  const exports={};
  const win={};
  const ctx={
    window:win,
    API_BASE:'',
    escapeHtml:s=>String(s===null||s===undefined?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    jsArgAttr:s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"),
    document:{getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({classList:{}})},
    console
  };
  ctx.window.open=()=>{};
  vm.createContext(ctx);
  vm.runInContext(read('js/task-detail-modal.js'),ctx);
  Object.assign(exports,win);
  return exports;
}

test('技能证明图片构件：没有 id 时整块不渲染',()=>{
  const {taskDetailProofHtml}=loadComponent();
  assert.equal(taskDetailProofHtml({imageId:''}),'');
  assert.equal(taskDetailProofHtml({imageId:null}),'');
  assert.equal(taskDetailProofHtml({imageId:'abc'}),'','非数字 id 一律不渲染，避免拼出坏地址');
  assert.equal(taskDetailProofHtml(),'');
});

test('技能证明图片构件：地址与文案口径正确',()=>{
  const {taskDetailProofHtml}=loadComponent();
  const html=taskDetailProofHtml({imageId:42,title:'教你做高数笔记'});
  assert.match(html,/技能证明图片/);
  assert.match(html,/src="\/api\/tasks\/proof-images\/42"/);
  assert.match(html,/data-proof-image-id="42"/);
  assert.match(html,/alt="发布者上传的技能证明图片：教你做高数笔记"/);
  assert.match(html,/onerror="onTaskProofImageError\(this\)"/,'图挂了要能兜底，不能留破图');
  assert.ok(html.indexOf('td-proof')<html.indexOf('td-proof-note'),'图在前、说明在后');
});

test('技能证明图片构件：标题里的引号不能逃出属性',()=>{
  const {taskDetailProofHtml}=loadComponent();
  const html=taskDetailProofHtml({imageId:7,title:'a" onload="alert(1)'});
  assert.ok(!/onload="alert/.test(html),'标题里的引号必须被转义');
});

test('审核中心：缩略模式显示缩略图 + 查看按钮，没传图时显式提示',()=>{
  const {taskDetailProofHtml}=loadComponent();
  const withImage=taskDetailProofHtml({imageId:42,title:'待审任务',compact:true});
  assert.match(withImage,/td-proof-inline/,'审核中心用缩略图行，不把待审列表撑开');
  assert.match(withImage,/src="\/api\/tasks\/proof-images\/42"/);
  assert.match(withImage,/查看证明图/);
  assert.ok(!/td-proof-note/.test(withImage),'缩略模式不需要详情页那句说明');
  assert.equal(taskDetailProofHtml({imageId:'',compact:true}),'<div class="td-proof-none">未上传证明图片</div>',
    '审核员要能看到「没传图」这件事，不能静默省略');
  assert.equal(taskDetailProofHtml({imageId:'',compact:false}),'','详情页仍然整块不渲染');
});

test('审核中心卡片与改稿对比都接入证明图构件',()=>{
  const html=read('growth-schoolv3.html');
  // 待审卡片：描述之后、操作按钮之前，展示「通过后会是哪张图」（有改稿时取改稿的值）
  assert.match(html,/'<div class="desc">' \+ escapeHtml\(\(rev \? rev\.description : task\.description\) \|\| ''\) \+ '<\/div>' \+[\s\S]{0,400}reviewProofHtml\(rev, task\)[\s\S]{0,200}<div class="foot">/,
    '待审卡片要在描述后展示证明图缩略图');
  assert.match(html,/function reviewProofHtml\(rev, task\)/,'卡片图片必须走 reviewProofHtml（改稿三态）');
  assert.match(html,/function buildReviewCard\(/,'审核中心卡片渲染函数仍在');
  // 改稿对比弹窗：独立容器 + 文案说明图片不参与改稿
  assert.match(html,/id="revisionDiffProof"/,'改稿对比弹窗要有证明图容器');
  assert.match(html,/技能证明图片：本次未改动|通过后换成下面这张|移除<\/b>证明图/,'审核员要看到「通过后会是哪张图」');
  assert.ok(!/REVISION_FIELDS[\s\S]{0,600}proofImageId/.test(html),'证明图不进改稿字段对比表（单独一块渲染）');
});

test('发布表单：取图区存在、上传接口与回填字段都对得上',()=>{
  const html=read('growth-schoolv3.html');
  assert.match(html,/id="publishProofWrap"/,'发布表单要有证明图取图区');
  assert.match(html,/id="publishProofInput"[^>]*accept="image\/jpeg,image\/png,image\/webp"/,'只接受三种图片格式');
  assert.match(html,/POST \/api\/tasks\/proof-images|'\/api\/tasks\/proof-images'/,'取图走 proof-images 上传接口');
  assert.match(html,/proofImageId: publishProofImageId \|\| null/,'发布请求要回填 proofImageId');
  assert.match(html,/clearPublishProofImage\(\);/,'发布成功后要清掉本次选择');
  assert.match(html,/function handlePublishProofPick\(/);
  assert.match(html,/function clearPublishProofImage\(/);
});

test('详情页：证明图渲染在「任务描述」之前（广场详情与我的任务详情都要）',()=>{
  const html=read('growth-schoolv3.html');
  // 广场详情：proofHtml 拼在 descHtml/reqHtml 之前
  assert.match(html,/proofHtml \+ descHtml \+ reqHtml/,'广场任务详情要把证明图排在描述之前');
  // 我的任务详情：myProofHtml 拼在 reqHtml 之前
  assert.match(html,/editActionHtml \+ myProofHtml \+ reqHtml/,'我的任务详情同样排在描述之前');
  // 卡片要把新字段带给详情页
  assert.match(html,/var proofAttr = task\.proofImageId \? ' data-proof-image-id="' \+ task\.proofImageId \+ '"' : ''/);
  assert.match(html,/contactAttr \+ reqAttr \+ proofAttr/);
});

test('手机端发布表单不许把证明图取图区丢掉',()=>{
  const js=read('js/publish-mobile.js');
  assert.match(js,/fieldOf\(kids, 'publishProofWrap'\)/,'手机端重排要先找到这块');
  assert.match(js,/if\(proofFld\) body\.appendChild\(fld\(proofFld\)\);/,'并且真的搬进新表单');
});

test('上传前压缩：长边 ≤1920、压到 2 MB 以内、透明图铺白底、失败有可读提示',()=>{
  const html=read('growth-schoolv3.html');
  // 目标必须小于线上 nginx 的 2 MB 请求体上限，否则网关先 413（本轮不动服务器 nginx）
  const cap=html.match(/var PROOF_MAX_BYTES = ([\d.]+) \* 1024 \* 1024;/);
  assert.ok(cap,'要有明确的压缩目标（MB）');
  assert.ok(Number(cap[1])<2,'压缩目标必须 <2 MB：线上 nginx 的 client_max_body_size 是 2m');
  assert.match(html,/var PROOF_MAX_EDGE = 1920;/,'长边上限 1920');
  assert.match(html,/Math\.min\(1, PROOF_MAX_EDGE \/ Math\.max\(w, h\)\)/,'按长边等比缩放');
  assert.match(html,/ctx\.fillStyle = '#ffffff'/,'JPEG 无透明通道：先铺白底，避免截图透明区变黑');
  assert.match(html,/toDataURL\('image\/webp'\)/,'支持 WebP 的平台优先 WebP');
  assert.match(html,/quality -= 0\.1/,'一次压不到目标就降质重试');
  // 接线：选图 → 压缩 → 上传压缩后的文件（multipart 带压缩后的文件名）
  assert.match(html,/compressPublishProofImage\(file\)/,'选图后要先压缩');
  assert.match(html,/uploadPublishProofImage\(out\.file, out\.name, out\.note\)/,'上传的是压缩后的文件');
  assert.match(html,/form\.append\('file', file, name \|\| file\.name \|\| 'proof\.jpg'\)/,'multipart 文件名跟着压缩结果');
  // 失败路径可读，不能让用户撞上 413 的模糊报错
  assert.match(html,/图片压缩后仍超过 2 MB，请换一张或先截图再传/);
  assert.match(html,/图片过大（超过 20 MB），请换一张/);
  // 证明图文案不能再承诺 5 MB（宿舍那份 5 MB 文案有 nginx 26m 例外，不在此列）
  assert.ok(!/用来证明你的技能或相关信息[\s\S]{0,120}5 MB/.test(html),'证明图文案要按 2 MB 压缩口径写');
});

test('外联版本号：改过的 js 必须升 ?v=（线上 /js/* 缓存 7 天）',()=>{
  const html=read('growth-schoolv3.html');
  for(const file of ['task-detail-modal.js','task-detail-modal.css']){
    const m=html.match(new RegExp('js/'+file.replace('.','\\.')+'\\?v=(\\d+)'));
    assert.ok(m,file+' 必须带 ?v= 版本号');
    assert.strictEqual(m[1],'20261008',file+' 本批又改了（审核中心接入证明图），版本号要跟着升级');
  }
  for(const file of ['publish-mobile.js','publish-mobile.css']){
    const m=html.match(new RegExp('js/'+file.replace('.','\\.')+'\\?v=(\\d+)'));
    assert.ok(m,file+' 必须带 ?v= 版本号');
    assert.notStrictEqual(m[1],'20260927',file+' 本批已改动，?v= 不能还是 20260927');
  }
});
