const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

/* 备用全量打包脚本 backend/build-release.ps1 的前端外联清单契约。
   清单是硬编码的：html 里引用了新的 js/ 资源却忘了加进清单时，全量打包出的线上包会少文件（404）。
   标准脚本 build-deploy.ps1 按 git 差异拷贝，不受此清单影响。 */

const manifestLine=read('backend/build-release.ps1').split(/\r?\n/).find(l=>l.includes('foreach ($ext in @('));
const manifest=new Set([...manifestLine.matchAll(/'([^']+)'/g)].map(m=>m[1]));
// 引用可能带缓存版本号（?v=YYYYMMDD）：只取到 ? 之前，仍按「文件名」与清单比对
const referenced=[...new Set([...read('growth-schoolv3.html').matchAll(/(?:src|href)="js\/([^"?]+)/g)].map(m=>m[1]))];

test('打包清单覆盖 html 引用的全部前端外联文件',()=>{
  assert.ok(manifestLine,'build-release.ps1 里找不到外联文件清单');
  const missing=referenced.filter(f=>!manifest.has(f)).sort();
  assert.deepEqual(missing,[],'被 html 引用但不在 build-release.ps1 清单里：'+missing.join(', '));
});

test('清单里的每个文件都真实存在',()=>{
  const absent=[...manifest].filter(f=>!fs.existsSync(path.join(root,'js',f))).sort();
  assert.deepEqual(absent,[],'清单引用了不存在的文件：'+absent.join(', '));
});
