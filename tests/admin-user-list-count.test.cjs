const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('growth-schoolv3.html','utf8');

/* 用户管理页列表契约：
   · 角标与「共 N 条」必须取后端 total，不能拿当前页行数当总数
     （线上事故：库里 153 个用户，角标显示 100 —— 前端只取一页 100 条）
   · 状态筛选（全部 / 正常 / 已封禁）与翻页都要落到后端查询参数上，
     否则「已封禁」只能筛到当前页里的那几个人 */

function slice(startMarker,endMarker){
  const start=html.indexOf(startMarker);
  assert.ok(start>=0, startMarker+' 未找到（代码被改名/搬位置时本测试要同步）');
  const end=html.indexOf(endMarker,start);
  assert.ok(end>start, endMarker+' 未找到');
  return html.slice(start,end);
}

const row=id=>({id:id,nickname:'蛋蛋'+id,email:'egg'+id+'@example.com',exp:10,points:1,reputation:5,role:'student',banned:0});
const rows=n=>Array.from({length:n},(_,i)=>row(i+1));
const pageTotal=(records,total)=>({records:records,total:total});

function setup(pagesByNo){
  const list={innerHTML:''}, count={textContent:''}, pager={innerHTML:''};
  const els={usersTableBody:list,usersCount:count,usersPager:pager};
  const urls=[];
  const ctx={
    document:{getElementById:id=>els[id]||null,querySelectorAll:()=>[]},
    apiGet:async url=>{
      urls.push(url);
      const m=/[?&]page=(\d+)/.exec(url);
      return {code:200,data:pagesByNo[m?m[1]:'1']||pageTotal([],0)};
    },
    getLevel:()=>({name:'蛋壳',min:0,max:100}),
    escapeHtml:s=>String(s==null?'':s)
  };
  vm.createContext(ctx);
  vm.runInContext(slice('  /* ===== Render Users ===== */','  /* ===== 管理端：查看用户详情'),ctx);
  vm.runInContext(slice('  /* 通用分页条','  /* ===== tab1 总览'),ctx);
  vm.runInContext(slice('  /* 状态筛选 chip','  /* ===== User Detail Modal'),ctx);
  return {ctx,list,count,pager,urls};
}

/** filterUsers 不返回 Promise（点击处理器），等一轮宏任务让渲染跑完 */
const flush=()=>new Promise(r=>setTimeout(r,0));

test('角标与「共 N 条」取后端 total：153 个用户不再显示成 100',async()=>{
  const {ctx,list,count,pager,urls}=setup({'1':pageTotal(rows(20),153)});
  await ctx.renderUsers();

  assert.equal(count.textContent,153);
  assert.match(pager.innerHTML,/共 153 条/);
  assert.match(urls[0],/[?&]page=1&size=20/);
  // 列表本身只渲染当前页的 20 行
  assert.equal(list.innerHTML.match(/class="trow"/g).length,20);
});

test('翻页请求带上 page，角标仍是总数',async()=>{
  const {ctx,count,pager,urls}=setup({'1':pageTotal(rows(20),153),'2':pageTotal(rows(20),153)});
  await ctx.renderUsers();
  ctx.setUserPage(2);
  await flush();

  assert.match(urls[1],/[?&]page=2&size=20/);
  assert.equal(count.textContent,153);
  assert.match(pager.innerHTML,/第 2 \/ 8 页/);
});

test('重复点同一个页码不重复请求',async()=>{
  const {ctx,urls}=setup({'1':pageTotal(rows(20),153)});
  await ctx.renderUsers();
  await ctx.setUserPage(1);
  assert.equal(urls.length,1);
});

test('「已封禁 / 正常」chip 交后端过滤并回到第 1 页',async()=>{
  const {ctx,urls}=setup({'1':pageTotal(rows(20),153),'3':pageTotal(rows(20),153)});
  await ctx.renderUsers();
  ctx.setUserPage(3);
  await flush();

  ctx.filterUsers('banned');
  await flush();
  assert.match(urls[2],/[?&]page=1&size=20/);
  assert.match(urls[2],/&status=banned/);

  // 再点一次「已封禁」：状态没变，不该再发请求
  ctx.filterUsers('banned');
  await flush();
  assert.equal(urls.length,3);

  // 回到「全部」：不带 status 参数
  ctx.filterUsers('all');
  await flush();
  assert.equal(urls.length,4);
  assert.ok(urls[3].indexOf('status=')<0);
});

test('切排序回到第 1 页并带上 sort 参数',async()=>{
  const {ctx,urls}=setup({'1':pageTotal(rows(20),153),'3':pageTotal(rows(20),153)});
  await ctx.renderUsers();
  ctx.setUserPage(3);
  await flush();

  ctx.setUserSort('invite_desc');
  await flush();
  assert.match(urls[2],/[?&]page=1&size=20/);
  assert.match(urls[2],/&sort=invite_desc/);
});

test('工作台「今日新增」下钻的 createdFrom 仍随分页请求下发',async()=>{
  const {ctx,urls}=setup({'1':pageTotal(rows(3),3)});
  ctx.userCreatedFrom='2026-09-21T00:00:00';
  await ctx.renderUsers();
  assert.match(urls[0],/createdFrom=2026-09-21T00%3A00%3A00/);
});

test('停在越界页码（末页被删空）时退回最后一个有效页',async()=>{
  const {ctx,list,urls}=setup({'9':pageTotal([],153),'8':pageTotal(rows(13),153)});
  ctx.userPage=9;
  await ctx.renderUsers();

  assert.equal(urls.length,2);
  assert.match(urls[0],/[?&]page=9&size=20/);
  assert.match(urls[1],/[?&]page=8&size=20/);
  assert.match(list.innerHTML,/蛋蛋1/);
});
