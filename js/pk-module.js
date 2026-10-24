/* 大学PK v2.0 integration. Based on the supplied pk-module.js (2026-09-14).
 * Main-site rankings omit metrics: selected schools use the existing read-only
 * /api/complaints/school endpoint. No database writes or third-party requests.
 */
var BL_DATA = Object.create(null);
var BL_PK_SCHOOL_A = '', BL_PK_SCHOOL_B = '';
var BL_PK_SCROLL_TIMER = null, BL_PK_REFRESH_TIMER = null, BL_PK_BAR_FRAME = null;
var BL_PK_OPEN = false, BL_PK_BUSY = false, BL_PK_VERSION = 0;
var BL_PK_SHARE_READY = false, BL_PK_SHARE_FILENAME = '', BL_PK_RETURN_FOCUS = null;
var BL_PK_SHARE_URL = 'https://www.dsxnb.com/';
function pkEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function pkNumber(value) {
  if (value == null || value === '') return null;
  var n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
}
function pkEntry(school) { return Object.prototype.hasOwnProperty.call(BL_DATA, school) ? BL_DATA[school] : null; }
function pkGetMetrics(school) { var d=pkEntry(school); return d ? d.metrics || {} : {}; }
function pkGetComments(school) { var d=pkEntry(school); return d ? d.comments || [] : []; }
function pkGetCount(school) { var d=pkEntry(school); return d ? d.count || 0 : 0; }
function getBlAvg(school) { var d=pkEntry(school); return d && d.sum ? pkNumber(d.sum.avg) || 0 : 0; }
function pkRankings() { return (typeof BL_ALL_RANK !== 'undefined' && BL_ALL_RANK.length ? BL_ALL_RANK : BL_RANK_LIST) || []; }
function pkNormalizeComments(comments) {
  return (Array.isArray(comments) ? comments : []).filter(function(c){return c.content || c.text;}).map(function(c){
    return {user:c.userName || c.user || '匿名蛋', text:c.content || c.text || ''};
  });
}
function buildBlPkData() {
  var previous = BL_DATA;
  BL_DATA = Object.create(null);
  pkRankings().forEach(function(item) {
    if (!item || typeof item.schoolName !== 'string') return;
    var old = previous[item.schoolName];
    BL_DATA[item.schoolName] = {
      metrics:item.metrics || (old && old.metrics) || {}, count:Number(item.count) || 0,
      comments:pkNormalizeComments((BL_WALL || []).filter(function(c){return c.schoolName === item.schoolName;})),
      sum:{avg:pkNumber(item.avgScore)}
    };
  });
  // Keep a selected, manually entered school available until detail refresh completes.
  [BL_PK_SCHOOL_A, BL_PK_SCHOOL_B].forEach(function(s){if(s && !pkEntry(s) && previous[s]) BL_DATA[s]=previous[s];});
}
function pkCompareSummary() {
  var result={aWin:0,bWin:0,compared:0};
  BL_METRICS.forEach(function(m){
    var a=pkNumber(pkGetMetrics(BL_PK_SCHOOL_A)[m.key]), b=pkNumber(pkGetMetrics(BL_PK_SCHOOL_B)[m.key]);
    if (!pkGetCount(BL_PK_SCHOOL_A) || !pkGetCount(BL_PK_SCHOOL_B) || a===null || b===null) return;
    result.compared++;
    if(a>b) result.aWin++; else if(b>a) result.bWin++;
  });
  return result;
}
function pkStopMotion() {
  if(BL_PK_SCROLL_TIMER !== null) cancelAnimationFrame(BL_PK_SCROLL_TIMER);
  if(BL_PK_BAR_FRAME !== null) cancelAnimationFrame(BL_PK_BAR_FRAME);
  BL_PK_SCROLL_TIMER = BL_PK_BAR_FRAME = null;
}
function pkStopRefresh() { clearTimeout(BL_PK_REFRESH_TIMER); BL_PK_REFRESH_TIMER=null; }
function openBlPkModal() {
  closeBlPkShareModal(); pkStopMotion(); pkStopRefresh(); ++BL_PK_VERSION;
  BL_PK_OPEN=true; BL_PK_BUSY=false; BL_PK_SCHOOL_A=''; BL_PK_SCHOOL_B='';
  BL_PK_RETURN_FOCUS=document.activeElement;
  buildBlPkData();
  ['A','B'].forEach(function(side){
    document.getElementById('blPkInput'+side).value='';
    document.getElementById('blPkDrop'+side).classList.remove('show');
  });
  var modal=document.getElementById('blPkModal'); modal.style.display='flex'; modal.classList.add('show');
  renderBlPkCompare(); document.getElementById('blPkInputA').focus();
}
function closeBlPkModal() {
  BL_PK_OPEN=false; BL_PK_BUSY=false; ++BL_PK_VERSION; pkStopMotion(); pkStopRefresh();
  var modal=document.getElementById('blPkModal'); modal.classList.remove('show'); modal.style.display='none';
  ['A','B'].forEach(function(side){document.getElementById('blPkDrop'+side).classList.remove('show');});
  closeBlPkShareModal();
  if(BL_PK_RETURN_FOCUS && BL_PK_RETURN_FOCUS.focus) BL_PK_RETURN_FOCUS.focus();
}
function searchBlPkSchool(side, keyword) {
  if(side!=='A' && side!=='B') return;
  var drop=document.getElementById('blPkDrop'+side), kw=String(keyword || '').trim().slice(0,100);
  drop.replaceChildren();
  var schools;
  if(!kw) {
    schools=pkRankings().slice().sort(function(a,b){return (Number(b.avgScore)||0)-(Number(a.avgScore)||0);})
      .slice(0,10).map(function(r){return r.schoolName;});
    var hint=document.createElement('div'); hint.className='bl-pk-dropdown-hint';hint.textContent='🔥 热门榜 · 按平均吐槽分排序';drop.appendChild(hint);
  } else {
    schools=Array.from(new Set((BL_SCHOOLS || []).concat(pkRankings().map(function(r){return r.schoolName;}))))
      .filter(function(s){return s.toLowerCase().includes(kw.toLowerCase());}).slice(0,8);
  }
  var manual=!!kw && schools.length===0;
  if(manual) schools=[kw];
  if(!schools.length){var empty=document.createElement('div');empty.className='bl-pk-dropdown-empty';empty.textContent='暂无学校数据，可输入学校名称';drop.appendChild(empty);}
  schools.forEach(function(s,i){
    var button=document.createElement('button');button.type='button';button.className='bl-pk-dropdown-item';
    button.textContent=(manual?'✨ 新增对比（不写入数据库） · ':(!kw?'#'+(i+1)+' · ':''))+blSchoolName(s);
    button.addEventListener('mousedown',function(e){e.preventDefault();});
    button.addEventListener('click',function(){selectBlPkSchool(side,s);});drop.appendChild(button);
  });
  drop.classList.add('show');
}
async function selectBlPkSchool(side, school) {
  if(!BL_PK_OPEN || (side!=='A' && side!=='B')) return;
  school=String(school || '').trim().slice(0,100); if(!school)return;
  if(side==='A') BL_PK_SCHOOL_A=school;else BL_PK_SCHOOL_B=school;
  document.getElementById('blPkInput'+side).value=school;
  document.getElementById('blPkDrop'+side).classList.remove('show');
  closeBlPkShareModal();
  return pkLoadSelected(false);
}
async function pkLoadSelected(background) {
  pkStopRefresh(); var version=++BL_PK_VERSION;
  var schools=Array.from(new Set([BL_PK_SCHOOL_A,BL_PK_SCHOOL_B].filter(Boolean)));
  if(!BL_PK_OPEN || !schools.length)return;
  if(!background){
    BL_PK_BUSY=true;pkStopMotion();document.getElementById('blPkShareTopBtn').style.display='none';
    document.getElementById('blPkCompare').innerHTML='<div class="bl-pk-loading" role="status"><span class="bl-pk-loading-spinner"></span>正在读取学校真实评价…</div>';
  }
  try {
    var responses=await Promise.all(schools.map(function(s){return apiGet('/api/complaints/school?name='+encodeURIComponent(s));}));
    if(!BL_PK_OPEN || version!==BL_PK_VERSION)return;
    if(responses.some(function(r){return r.code!==200 || !r.data;}))throw Error('School detail failed');
    responses.forEach(function(r,i){var d=r.data; BL_DATA[schools[i]]={metrics:d.metrics || {},count:Number(d.count)||0,
      sum:{avg:pkNumber(d.avgScore)},comments:pkNormalizeComments(d.comments)};});
    BL_PK_BUSY=false;renderBlPkCompare();
  } catch(e) {
    if(!BL_PK_OPEN || version!==BL_PK_VERSION)return;
    BL_PK_BUSY=false;pkStopMotion();document.getElementById('blPkShareTopBtn').style.display='none';
    document.getElementById('blPkCompare').innerHTML='<div class="bl-pk-empty" role="status">学校数据加载失败，未展示不完整对比。<br><button class="bl-pk-share-btn" onclick="pkLoadSelected(false)">重新加载 / 重试</button></div>';
  } finally {
    if(BL_PK_OPEN && !document.hidden && version===BL_PK_VERSION) BL_PK_REFRESH_TIMER=setTimeout(function(){
      BL_PK_REFRESH_TIMER=null;if(!document.hidden)return pkLoadSelected(true);
    },15000);
  }
}
function pkOpenSchool(side) { var school=side==='A'?BL_PK_SCHOOL_A:BL_PK_SCHOOL_B;closeBlPkModal();return showBlSchoolDetail(school); }
function renderBlPkCompare() {
  pkStopMotion();var wrap=document.getElementById('blPkCompare'); if(!wrap)return;
  var ready=BL_PK_SCHOOL_A && BL_PK_SCHOOL_B;
  document.getElementById('blPkShareTopBtn').style.display=ready?'flex':'none';
  if(!ready){wrap.innerHTML='<div class="bl-pk-empty"><div class="bl-pk-empty-icon">⚔️</div>请在上方搜索并选择两所大学<br>选择后自动展示16项真实评价</div>';return;}
  var result=pkCompareSummary(),aWin=result.aWin,bWin=result.bWin;
  var same=BL_PK_SCHOOL_A===BL_PK_SCHOOL_B;
  var label=same || (result.compared && aWin===bWin)?'🤝 势均力敌':!result.compared?'暂无可比数据':Math.max(aWin,bWin)>=12?'🔥 槽点碾压':Math.max(aWin,bWin)>=8?'💪 槽点明显更多':'⚡ 槽点接近';
  var nameA=pkEscape(blSchoolName(BL_PK_SCHOOL_A)),nameB=pkEscape(blSchoolName(BL_PK_SCHOOL_B));
  var html='<div class="bl-pk-bigscore">'+
    '<button class="bl-pk-bigscore-name left '+(aWin>=bWin?'winner':'loser')+'" onclick="pkOpenSchool(\'A\')">'+nameA+'</button>'+
    '<span class="bl-pk-bigscore-num left '+(aWin>=bWin?'winner':'')+'">'+aWin+'</span><span class="bl-pk-bigscore-colon">:</span>'+
    '<span class="bl-pk-bigscore-num right '+(bWin>=aWin?'winner':'')+'">'+bWin+'</span>'+
    '<button class="bl-pk-bigscore-name right '+(bWin>=aWin?'winner':'loser')+'" onclick="pkOpenSchool(\'B\')">'+nameB+'</button></div>'+
    '<div class="bl-pk-bigscore-sub"><strong>'+label+'</strong><br>数字表示吐槽分更高的指标数，不代表办学质量排名。<br>已比较 '+result.compared+'/16 项；分数越高，槽点越多。'+(same?' 同校对比，结果相同。':'')+'</div>'+
    '<div class="bl-pk-summary"><div class="bl-pk-summary-side left"><div class="bl-pk-summary-score">'+(pkGetCount(BL_PK_SCHOOL_A)?getBlAvg(BL_PK_SCHOOL_A).toFixed(1):'—')+'</div><div class="bl-pk-summary-label">综合吐槽分 · '+pkGetCount(BL_PK_SCHOOL_A)+'条评价</div></div><div class="bl-pk-summary-center">VS</div><div class="bl-pk-summary-side right"><div class="bl-pk-summary-score">'+(pkGetCount(BL_PK_SCHOOL_B)?getBlAvg(BL_PK_SCHOOL_B).toFixed(1):'—')+'</div><div class="bl-pk-summary-label">综合吐槽分 · '+pkGetCount(BL_PK_SCHOOL_B)+'条评价</div></div></div>';
  BL_METRICS.forEach(function(m){
    var a=pkGetCount(BL_PK_SCHOOL_A)?pkNumber(pkGetMetrics(BL_PK_SCHOOL_A)[m.key]):null;
    var b=pkGetCount(BL_PK_SCHOOL_B)?pkNumber(pkGetMetrics(BL_PK_SCHOOL_B)[m.key]):null;
    html+='<div class="bl-pk-metric-row"><div class="bl-pk-metric-left '+(a!==null&&b!==null&&a>b?'higher':'')+'">'+(a===null?'—':a.toFixed(1))+'<div class="bl-pk-bar-track"><div class="bl-pk-metric-bar-left" style="width:0%" data-pk-width="'+(a===null?0:a*10)+'"></div></div></div>'+
      '<div><div class="bl-pk-metric-name">'+pkEscape(m.name)+'</div><div class="bl-pk-metric-desc">'+pkEscape(m.desc)+'</div></div>'+
      '<div class="bl-pk-metric-right '+(a!==null&&b!==null&&b>a?'higher':'')+'">'+(b===null?'—':b.toFixed(1))+'<div class="bl-pk-bar-track"><div class="bl-pk-metric-bar-right" style="width:0%" data-pk-width="'+(b===null?0:b*10)+'"></div></div></div></div>';
  });
  html+='<div class="bl-pk-comments-wrap"><div class="bl-pk-comments-title">💬 最新吐槽 · 每15秒更新 · 悬停或按住暂停</div><div class="bl-pk-comments-grid">';
  ['A','B'].forEach(function(side){var school=side==='A'?BL_PK_SCHOOL_A:BL_PK_SCHOOL_B,cls=side==='A'?'left':'right';
    var comments=pkGetComments(school),items=comments.map(function(c){return '<div class="bl-pk-comment-item '+cls+'"><span class="bl-pk-comment-user">'+pkEscape(c.user)+'</span><span class="bl-pk-comment-text">'+pkEscape(c.text)+'</span></div>';}).join('');
    html+='<div class="bl-pk-comments-col"><div class="bl-pk-comments-school '+cls+'">'+pkEscape(blSchoolName(school))+'</div><div class="bl-pk-comments-scroll" id="blPkCommentsScroll'+side+'" tabindex="0" aria-label="学校最新吐槽">'+(items?'<div class="bl-pk-comments-track"><div>'+items+'</div><div aria-hidden="true">'+items+'</div></div>':'<div class="bl-pk-comment-empty">暂无吐槽</div>')+'</div></div>';
  });
  html+='</div></div>';wrap.innerHTML=html;
  BL_PK_BAR_FRAME=requestAnimationFrame(function(){BL_PK_BAR_FRAME=requestAnimationFrame(function(){
    BL_PK_BAR_FRAME=null;wrap.querySelectorAll('[data-pk-width]').forEach(function(el){el.style.width=el.getAttribute('data-pk-width')+'%';});
  });});
  startPkCommentsScroll();
}
function startPkCommentsScroll() {
  if(BL_PK_SCROLL_TIMER!==null)cancelAnimationFrame(BL_PK_SCROLL_TIMER);BL_PK_SCROLL_TIMER=null;
  if(!BL_PK_OPEN || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var states=[];
  ['A','B'].forEach(function(side){var box=document.getElementById('blPkCommentsScroll'+side);if(!box)return;
    var track=box.querySelector('.bl-pk-comments-track');if(!track)return;
    var state={box:box,track:track,pos:0,paused:false,speed:side==='A'?18:15};states.push(state);
    box.onpointerenter=box.onpointerdown=box.onfocus=function(){state.paused=true;};
    box.onpointerleave=box.onpointerup=box.onpointercancel=box.onblur=function(){state.paused=false;};
  });
  if(!states.length)return;
  var last=null;
  function frame(time){
    if(!BL_PK_OPEN || document.hidden){BL_PK_SCROLL_TIMER=null;return;}
    var delta=last===null?0:Math.min(time-last,64)/1000;last=time;
    states.forEach(function(s){var height=s.track.scrollHeight/2;
      if(!s.paused && height>s.box.clientHeight){s.pos=(s.pos+delta*s.speed)%height;s.track.style.transform='translateY(-'+s.pos+'px)';}
    });BL_PK_SCROLL_TIMER=requestAnimationFrame(frame);
  }
  BL_PK_SCROLL_TIMER=requestAnimationFrame(frame);
}
function closeBlPkShareModal() {
  var modal=document.getElementById('blPkShareModal');if(modal){modal.classList.remove('show');modal.style.display='none';}
}
function generatePkShareImg() {
  if(!BL_PK_OPEN || BL_PK_BUSY || !BL_PK_SCHOOL_A || !BL_PK_SCHOOL_B)return;
  BL_PK_SHARE_READY=false;
  try {
    drawPkShareCanvas();
    var canvas=document.getElementById('blPkShareCanvas'),image=document.getElementById('blPkShareImage');
    image.src=canvas.toDataURL('image/png');
    BL_PK_SHARE_FILENAME=('大学PK_'+BL_PK_SCHOOL_A+'_VS_'+BL_PK_SCHOOL_B).replace(/[\\/:*?"<>|]/g,'_')+'.png';
    BL_PK_SHARE_READY=true;
    var modal=document.getElementById('blPkShareModal');modal.style.display='flex';modal.classList.add('show');
    document.getElementById('blPkDownload').focus();
  } catch(e){toast('分享图生成失败，请重试');}
}
function downloadPkShareImg() {
  if(!BL_PK_SHARE_READY){toast('请先生成分享图');return;}
  var link=document.createElement('a');link.download=BL_PK_SHARE_FILENAME;
  link.href=document.getElementById('blPkShareImage').src;link.click();
}
function pkCanvasRound(ctx,x,y,w,h,r,fill) {
  ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fill();
}
function pkCanvasText(ctx,text,x,y,max,font,color) {
  ctx.font=font;ctx.fillStyle=color;var s=String(text);
  while(s.length>1 && ctx.measureText(s).width>max) s=s.slice(0,-2)+'…';
  ctx.fillText(s,x,y);
}
function drawPkShareCanvas() {
  var canvas=document.getElementById('blPkShareCanvas'),ctx=canvas.getContext('2d');canvas.width=750;canvas.height=1400;
  var styles=getComputedStyle(document.documentElement),a=styles.getPropertyValue('--pk-a').trim(),b=styles.getPropertyValue('--pk-b').trim();
  var ink=styles.getPropertyValue('--pk-text').trim(),cream='#FFFBF7';
  ctx.fillStyle=cream;ctx.fillRect(0,0,750,1400);ctx.textAlign='center';
  var glow=ctx.createLinearGradient(0,0,750,600);glow.addColorStop(0,'#FFE8EF');glow.addColorStop(1,'#F0E8FF');
  pkCanvasRound(ctx,24,24,702,500,30,glow);
  var tag=ctx.createLinearGradient(260,0,490,0);tag.addColorStop(0,b);tag.addColorStop(1,'#5E35B1');
  ctx.shadowColor='rgba(124,77,255,.22)';ctx.shadowBlur=18;pkCanvasRound(ctx,260,48,230,48,24,tag);ctx.shadowBlur=0;
  pkCanvasText(ctx,'EGG WORLD',375,80,200,'bold 24px Arial','#fff');
  pkCanvasText(ctx,'蛋蛋世界的大学PK',375,146,650,'bold 36px sans-serif',ink);
  pkCanvasText(ctx,'16项学生吐槽对比 · 非官方大学排名',375,183,650,'18px sans-serif',ink);
  function schoolName(s,x){
    var label=blSchoolName(s);pkCanvasText(ctx,label,x,239,290,'bold 21px sans-serif',ink);
  }
  schoolName(BL_PK_SCHOOL_A,190);schoolName(BL_PK_SCHOOL_B,560);
  var summary=pkCompareSummary();
  var big=ctx.createLinearGradient(120,0,640,0);big.addColorStop(0,a);big.addColorStop(1,b);
  ctx.shadowColor='rgba(93,64,55,.12)';ctx.shadowBlur=8;ctx.font='900 140px Arial';ctx.fillStyle=big;
  ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.strokeText(String(summary.aWin),240,390);ctx.fillText(summary.aWin,240,390);
  ctx.strokeText(String(summary.bWin),510,390);ctx.fillText(summary.bWin,510,390);ctx.shadowBlur=0;
  pkCanvasText(ctx,':',375,374,70,'bold 74px Arial',ink);
  pkCanvasText(ctx,BL_PK_SCHOOL_A===BL_PK_SCHOOL_B || (summary.compared && summary.aWin===summary.bWin)?'势均力敌':!summary.compared?'暂无可比数据':'槽点对决 · '+summary.compared+'项可比',375,454,650,'bold 27px sans-serif',ink);
  pkCanvasText(ctx,'数字为吐槽分更高的指标数；缺失数据不参与胜负',375,492,650,'17px sans-serif',ink);
  pkCanvasText(ctx,'综合吐槽分（0–10）',375,571,650,'bold 25px sans-serif',ink);
  ['A','B'].forEach(function(side){var s=side==='A'?BL_PK_SCHOOL_A:BL_PK_SCHOOL_B,x=side==='A'?60:420,color=side==='A'?a:b;
    pkCanvasText(ctx,pkGetCount(s)?getBlAvg(s).toFixed(1):'—',x+135,622,260,'bold 40px Arial',color);
    pkCanvasRound(ctx,x,641,270,18,9,'#eee6ed');if(pkGetCount(s)&&getBlAvg(s)>0){var w=Math.max(9,getBlAvg(s)*27);pkCanvasRound(ctx,x,641,w,18,Math.min(9,w/2),color);pkCanvasRound(ctx,x+2,643,Math.max(4,w-4),5,2,'rgba(255,255,255,.5)');}
    pkCanvasText(ctx,pkGetCount(s)+'条评价',x+135,687,260,'18px sans-serif',ink);
  });
  pkCanvasText(ctx,'核心指标 · 展示前8项 / 完整16项见网站',375,745,650,'bold 23px sans-serif',ink);
  BL_METRICS.slice(0,8).forEach(function(m,i){var y=782+i*54;
    pkCanvasRound(ctx,40,y,670,48,12,i%2?'#F0E8FF':'#FFE8EF');
    ctx.beginPath();ctx.fillStyle=i%2?b:a;ctx.arc(62,y+24,4,0,Math.PI*2);ctx.fill();
    pkCanvasText(ctx,m.name,375,y+31,350,'bold 18px sans-serif',ink);
    ['A','B'].forEach(function(side){var s=side==='A'?BL_PK_SCHOOL_A:BL_PK_SCHOOL_B,n=pkGetCount(s)?pkNumber(pkGetMetrics(s)[m.key]):null;
      pkCanvasText(ctx,n===null?'—':n.toFixed(1),side==='A'?112:638,y+32,80,'bold 25px Arial',side==='A'?a:b);
    });
  });
  var line=ctx.createLinearGradient(45,0,705,0);line.addColorStop(0,a);line.addColorStop(1,b);ctx.strokeStyle=line;ctx.lineWidth=2;
  for(var x=45;x<705;x+=18){ctx.beginPath();ctx.moveTo(x,1230);ctx.lineTo(x+10,1230);ctx.stroke();}
  ctx.textAlign='left';pkCanvasText(ctx,'www.dsxnb.com',52,1293,460,'bold 28px Arial',ink);
  pkCanvasText(ctx,'扫码进入蛋蛋世界 · 一起参与评价',52,1333,460,'19px sans-serif',ink);
  pkCanvasText(ctx,'数据随学生评价更新，仅供交流参考',52,1366,460,'16px sans-serif',ink);
  // Fixed homepage QR, generated locally; no CDN or external QR service dependency.
  var cell=3,size=BL_PK_QR_MATRIX.length*cell,qx=750-48-size,qy=1250;
  ctx.fillStyle='#fff';ctx.fillRect(qx,qy,size,size);ctx.fillStyle='#172235';
  BL_PK_QR_MATRIX.forEach(function(row,y){for(var x=0;x<row.length;x++)if(row[x]==='1')ctx.fillRect(qx+x*cell,qy+y*cell,cell,cell);});
  ctx.textAlign='center';pkCanvasText(ctx,'扫一扫',qx+size/2,1380,size,'16px sans-serif',ink);
}
document.addEventListener('keydown',function(e){
  if(!BL_PK_OPEN)return;
  var share=document.getElementById('blPkShareModal'),modal=share.style.display!=='none'?share:document.getElementById('blPkModal');
  if(e.key==='Escape'){e.preventDefault();if(modal===share){closeBlPkShareModal();document.getElementById('blPkShareTopBtn').focus();}else closeBlPkModal();}
  if(e.key==='Tab'){
    var focusable=Array.from(modal.querySelectorAll('button,input,[tabindex="0"]')).filter(function(el){return !el.disabled && el.getClientRects().length;});
    if(!focusable.length)return;var first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  }
});
document.addEventListener('click',function(e){if(!BL_PK_OPEN || !document.getElementById('blPkModal').contains(e.target))return;['A','B'].forEach(function(side){var input=document.getElementById('blPkInput'+side),drop=document.getElementById('blPkDrop'+side);if(e.target!==input && !drop.contains(e.target))drop.classList.remove('show');});});
document.addEventListener('visibilitychange',function(){if(!BL_PK_OPEN)return;if(document.hidden){pkStopMotion();pkStopRefresh();}else pkLoadSelected(true);});

// Generated with python-qrcode 8.2, M correction, four-module quiet zone.
var BL_PK_QR_MATRIX = ["000000000000000000000000000000000", "000000000000000000000000000000000", "000000000000000000000000000000000", "000000000000000000000000000000000", "000011111110110010101011111110000", "000010000010100110000010000010000", "000010111010101011001010111010000", "000010111010001011001010111010000", "000010111010101110101010111010000", "000010000010010011001010000010000", "000011111110101010101011111110000", "000000000000010001011000000000000", "000010011111100010101100101110000", "000011000100011011110101111100000", "000011100111011101010011010010000", "000000110001000000101001011110000", "000010010110101100000010000010000", "000011100100001010111100100100000", "000011001111111001110110111110000", "000010100100110010011101011010000", "000010010010101111111111101100000", "000000000000110101011000101100000", "000011111110111010001010100010000", "000010000010101101011000100000000", "000010111010101101011111100110000", "000010111010101011101010000110000", "000010111010011101000100111110000", "000010000010010111000001101110000", "000011111110111111001100010010000", "000000000000000000000000000000000", "000000000000000000000000000000000", "000000000000000000000000000000000", "000000000000000000000000000000000"];
