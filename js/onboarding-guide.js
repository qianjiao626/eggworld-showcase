/* ============================================================
   蛋蛋世界 - 新手引导 8 步浮层（外联 JS）
   依赖：onboarding-guide.css + 页面内 #onboardOverlay 结构
   入口：openOnboard()（由页面「📖 新手指引」按钮手动触发）
   ============================================================ */

var ONBOARD_STEPS = [
  {
    badge:'1 / 8',
    illust:{emoji:'🥚',bg:'linear-gradient(135deg,#FFF3E0,#FFE0B2)',decos:['✨','🎉','💫','⭐']},
    eggRow:[
      {img:'assets/char-eggy-study-v2.jpg',label:'学业蛋',color:'#E91E63',size:90},
      {img:'assets/char-eggy-job-v2.jpg',label:'就业蛋',color:'#2196F3',size:90},
      {img:'assets/char-eggy-side.jpg',label:'副业蛋',color:'#FFD700',size:90},
      {img:'assets/char-eggy-game.jpg',label:'游戏蛋',color:'#4CAF50',size:90}
    ],
    title:'欢迎来到蛋蛋世界！',
    desc:'这里是一个大学生互助成长社区。你可以发布任务、认领任务、赚蛋蛋币、攒经验值、解锁角色卡，还能吐槽大学食堂、和别的学校PK！',
    highlight:'💡 <b>核心理念</b>：每位同学都可以自由发布各种各样的任务——学习互助、生活帮忙、组队搭子，想发什么就发什么！',
    tags:[{t:'🎯 互助',c:'orange'},{t:'📈 成长',c:'green'},{t:'🎮 玩法',c:'purple'},{t:'💰 赚币',c:'blue'}]
  },
  {
    badge:'2 / 8',
    illust:{emoji:'📋',bg:'linear-gradient(135deg,#E8F5E9,#C8E6C9)',decos:['📝','✅','🤝','💪']},
    title:'四种任务类型，随心发布',
    desc:'你可以自由选择任务类型，每种类型的蛋蛋币流向不同：',
    tipList:[
      {icon:'👨‍🏫',bg:'#FDEDE6',text:'<b>教学型</b>：你教别人，学员付费给你。适合分享知识技能'},
      {icon:'🆘',bg:'#E0EFE3',text:'<b>求助型</b>：你出蛋蛋币悬赏，别人帮你办事。适合找人帮忙'},
      {icon:'🤝',bg:'#F3E5F5',text:'<b>组队型</b>：每人消耗报名费，全员≥4星退80%。适合找搭子一起干'},
      {icon:'🏆',bg:'#FBF3D9',text:'<b>奖励型</b>（仅蛋总可发）：蛋总出资奖励完成任务的同学'}
    ],
    highlight:'💡 <b>重点</b>：学生可以自由发布教学型、求助型、组队型任务，想发什么发什么！'
  },
  {
    badge:'3 / 8',
    illust:{emoji:'🏫',bg:'linear-gradient(135deg,#FCE4EC,#F8BBD0)',decos:['🔥','⚡','✨','📋']},
    title:'大学红黑榜 — 吐槽你的学校',
    desc:'在「大学红黑榜」模块，你可以给自己的学校打分吐槽！16项指标（食堂、管理、宿舍等），分数越高表示吐槽越狠。还能和别的学校PK！',
    tipList:[
      {icon:'📝',bg:'#FDEDE6',text:'参与吐槽 <b>+10 蛋蛋币 +10 经验</b>（每用户2次奖励机会）'},
      {icon:'🏆',bg:'#E0EFE3',text:'查看单项排名，看看哪个学校食堂最差/管理最严'},
      {icon:'⚔️',bg:'#F3E5F5',text:'大学PK：选两所学校对比各项吐槽分数'}
    ],
    highlight:'💡 吐槽是匿名的，昵称会脱敏显示（如"李*"）'
  },
  {
    badge:'4 / 8',
    illust:{emoji:'💬',bg:'linear-gradient(135deg,#E8F5E9,#C8E6C9)',decos:['🤔','💡','💰','🎯']},
    title:'蛋蛋要八卦 — 打听+答疑',
    desc:'在「蛋蛋要八卦」模块，你可以发布打听帖提问，设置悬赏蛋蛋币。被采纳的回答者获得悬赏金币！',
    tipList:[
      {icon:'❓',bg:'#FDEDE6',text:'发布打听需<b>扣蛋蛋币</b>作为悬赏，1个月无人回答自动退回'},
      {icon:'💬',bg:'#E0EFE3',text:'回答别人的问题，回答被采纳可获得<b>悬赏金币</b>'},
      {icon:'🔒',bg:'#F3E5F5',text:'打听是匿名的，保护提问者隐私'}
    ]
  },
  {
    badge:'5 / 8',
    illust:{emoji:'✏️',bg:'linear-gradient(135deg,#E3F2FD,#BBDEFB)',decos:['🎯','💡','🚀','⭐']},
    title:'发布任务超简单',
    desc:'点击页面顶部的「发布任务」按钮，填写任务名称、描述、奖励金额、技能分类和联系方式即可。提交后蛋总审核通过就会上线！',
    tipList:[
      {icon:'1️⃣',bg:'#FDEDE6',text:'填写任务名称和描述（写清楚你要教什么/帮什么/组什么队）'},
      {icon:'2️⃣',bg:'#E0EFE3',text:'设置奖励金额（教学型你赚币、求助型你花币、组队型每人消耗报名费）'},
      {icon:'3️⃣',bg:'#F3E5F5',text:'选择技能分类（学业技术/就业技能/副业技能/兴趣爱好等）'},
      {icon:'4️⃣',bg:'#FBF3D9',text:'填写联系方式（认领者可见，用于线下沟通）'}
    ],
    highlight:'💡 审核通过 <b>+5 经验值</b>，任务出现在对应模块的「蛋蛋发布」区'
  },
  {
    badge:'6 / 8',
    illust:{emoji:'🏪',bg:'linear-gradient(135deg,#FFF3E0,#FFE0B2)',decos:['👀','👆','🔖','🔄']},
    title:'逛广场，认领你感兴趣的任务',
    desc:'左侧导航栏可以切换不同模块：',
    tipList:[
      {icon:'🎯',bg:'#FDEDE6',text:'<b>活动广场</b>：所有任务汇总，点击「认领」即可参与'},
      {icon:'👨‍🏫',bg:'#E0EFE3',text:'<b>拜师学艺</b>：浏览教学型任务，付费学习新技能'},
      {icon:'🆘',bg:'#F3E5F5',text:'<b>蛋蛋要求助</b>：浏览求助型任务，帮忙赚取蛋蛋币'},
      {icon:'🤝',bg:'#FBF3D9',text:'<b>蛋蛋要组队</b>：浏览组队型任务，找搭子一起干'}
    ],
    highlight:'💡 认领后进入<b>待确认配对</b>状态，发布者确认后任务正式开始'
  },
  {
    badge:'7 / 8',
    illust:{emoji:'💰',bg:'linear-gradient(135deg,#FFF8E1,#FFECB3)',decos:['🪙','📈','⚡','🔓']},
    title:'蛋蛋币 & 经验值 & 角色卡',
    desc:'蛋蛋币是平台流通货币，通过任务赚取和消耗。经验值只增不减，决定等级提升。完成任务增加对应分类count，解锁和升级角色卡！',
    tipList:[
      {icon:'🪙',bg:'#FBF3D9',text:'<b>蛋蛋币</b>：求助型赚币、教学型花币赚币、组队型消耗报名费（≥4星退80%）'},
      {icon:'📈',bg:'#E0EFE3',text:'<b>经验值</b>：完成任务、签到、发布任务都能获得；解锁某分类角色后，完成<b>该分类任务</b>的经验奖励 ×1.2 加成'},
      {icon:'🎭',bg:'#F3E5F5',text:'<b>角色卡</b>：6大分类，完成任务解锁/升级，稀有度分为普通→稀有→史诗→传说'}
    ],
    highlight:'💡 解锁某分类角色后，完成<b>该分类任务</b>的经验奖励 ×1.2 倍加成（仅限完成任务经验）'
  },
  {
    badge:'8 / 8',
    illust:{emoji:'🎉',bg:'linear-gradient(135deg,#E3F2FD,#BBDEFB)',decos:['🚀','✨','🏆','⭐']},
    title:'准备好了吗？开始你的蛋蛋之旅！',
    desc:'现在你已经了解了蛋蛋世界的核心玩法。赶紧去发布你的第一个任务，或者认领一个感兴趣的任务开始吧！',
    highlight:'💡 <b>记住</b>：你可以自由发布各种各样的任务——教别人技能、找人帮忙、组队搭子，想发什么就发什么！',
    tags:[{t:'🚀 立即开始',c:'orange'},{t:'🎯 自由发布',c:'green'},{t:'💰 赚取蛋蛋币',c:'blue'},{t:'🎭 解锁角色',c:'purple'}],
    isLast:true
  }
];
var onboardStepIdx = 0;
var ONBOARD_DONE_KEY = 'ddsj_onboard_done';

function renderOnboardStep(){
  var s = ONBOARD_STEPS[onboardStepIdx];
  var body = document.getElementById('onboardBody');
  var html = '';
  /* 插画区 */
  var decos = (s.illust.decos || []).map(function(d){ return '<span class="ob-deco">' + d + '</span>'; }).join('');
  var illustContent = '';
  if(s.eggRow && s.eggRow.length){
    illustContent += '<div style="display:flex;align-items:flex-end;gap:8px;justify-content:center">';
    s.eggRow.forEach(function(egg, idx){
      illustContent += '<div style="text-align:center;animation:obFloat ' + (2.5 + idx*0.3) + 's ease-in-out infinite ' + (idx*0.2) + 's">';
      illustContent += '<div style="width:' + egg.size + 'px;height:' + egg.size + 'px;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.15);margin:0 auto 4px;border:3px solid ' + egg.color + '44;background:#fff">';
      if(egg.img){
        illustContent += '<img src="' + egg.img + '" style="width:100%;height:100%;object-fit:cover" alt="' + egg.label + '">';
      }else{
        illustContent += egg.icon;
      }
      illustContent += '</div>';
      illustContent += '<div style="font-size:11px;font-weight:700;color:' + egg.color + '">' + egg.label + '</div>';
      illustContent += '</div>';
      if(idx < s.eggRow.length - 1){
        illustContent += '<div style="color:rgba(0,0,0,.25);font-size:20px;font-weight:700;margin-bottom:' + (egg.size * 0.25) + 'px">→</div>';
      }
    });
    illustContent += '</div>';
  }else{
    illustContent = s.illust.emoji;
  }
  html += '<div class="onboard-illust" style="background:' + s.illust.bg + '">' + decos + illustContent + '</div>';
  /* 标题 */
  html += '<div class="onboard-title">' + s.title + '</div>';
  /* 描述 */
  if(s.desc) html += '<div class="onboard-desc">' + s.desc + '</div>';
  /* 提示列表 */
  if(s.tipList){
    html += '<div class="onboard-tip-list">';
    s.tipList.forEach(function(t){
      html += '<div class="onboard-tip-item"><div class="ob-icon" style="background:' + t.bg + '">' + t.icon + '</div><div>' + t.text + '</div></div>';
    });
    html += '</div>';
  }
  /* 高亮提示 */
  if(s.highlight) html += '<div class="onboard-highlight">' + s.highlight + '</div>';
  /* 标签 */
  if(s.tags){
    html += '<div class="onboard-tags">';
    s.tags.forEach(function(t){
      html += '<span class="onboard-tag ' + t.c + '">' + t.t + '</span>';
    });
    html += '</div>';
  }
  body.innerHTML = html;
  body.scrollTop = 0;
  /* 更新步骤徽章 */
  document.getElementById('onboardStepBadge').textContent = s.badge;
  /* 更新按钮 */
  var prevBtn = document.getElementById('onboardPrev');
  var nextBtn = document.getElementById('onboardNext');
  prevBtn.style.display = onboardStepIdx > 0 ? '' : 'none';
  if(s.isLast){
    nextBtn.textContent = '开始使用';
    nextBtn.onclick = function(){ closeOnboard(); if(typeof toast === 'function') toast('🎉 欢迎来到蛋蛋世界！'); };
  } else {
    nextBtn.textContent = '下一步';
    nextBtn.onclick = function(){ onboardNext(); };
  }
  /* 更新圆点 */
  var dotsHtml = '';
  for(var i=0; i<ONBOARD_STEPS.length; i++){
    dotsHtml += '<div class="onboard-dot' + (i === onboardStepIdx ? ' active' : '') + '" onclick="onboardGoto(' + i + ')"></div>';
  }
  document.getElementById('onboardDots').innerHTML = dotsHtml;
}
function onboardNext(){
  if(onboardStepIdx < ONBOARD_STEPS.length - 1){
    onboardStepIdx++;
    renderOnboardStep();
  }
}
function onboardPrev(){
  if(onboardStepIdx > 0){
    onboardStepIdx--;
    renderOnboardStep();
  }
}
function onboardGoto(idx){
  onboardStepIdx = idx;
  renderOnboardStep();
}
function openOnboard(){
  onboardStepIdx = 0;
  renderOnboardStep();
  var overlay = document.getElementById('onboardOverlay');
  overlay.style.display = 'flex';
}
function closeOnboard(){
  document.getElementById('onboardOverlay').style.display = 'none';
  try{ localStorage.setItem(ONBOARD_DONE_KEY,'1'); }catch(e){}
}
/* 不再自动弹出：改为用户点击页面上的「📖 新手指引」按钮调用 openOnboard() 手动打开。
   注意：页面内 login() 仍在调用本函数，因此必须保留（删掉会导致 ReferenceError）。 */
function openOnboardIfFirst(){
  /* no-op：保留空实现，仅用于兼容页面内的既有调用 */
}
