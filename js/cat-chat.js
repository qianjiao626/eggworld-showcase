/* ============================================
   猫咪文字陪伴系统
   - 对话气泡组件
   - 主动搭话系统
   - 专注陪伴文案
   - 故事事件系统
   ============================================ */

(function () {
  'use strict';

  // ========== 文案池 ==========
  const CHAT_POOL = {
    // 打招呼 / 欢迎回来
    greeting: {
      morning: [
        '喵～早上好呀！你今天起得真早✨',
        '早安喵～新的一天开始啦！',
        '你醒啦喵？我已经等你好久了～',
        '太阳晒屁股啦喵！快起来陪我玩～'
      ],
      afternoon: [
        '喵～下午好呀！',
        '你回来啦喵？我正想你呢～',
        '下午啦喵，要不要摸我一下下？',
        '欢迎回来喵～（蹭蹭）'
      ],
      evening: [
        '晚上好喵～今天过得怎么样？',
        '你回来啦！我都想你一天了喵🥺',
        '傍晚啦喵，一起放松一下吧～',
        '喵～天黑了，你要陪我玩吗？'
      ],
      night: [
        '这么晚还不睡喵？',
        '唔...你还在忙吗喵？',
        '夜猫子喵～我陪你！',
        '都深夜了喵，早点睡好不好？'
      ]
    },

    // 喂食反馈
    feed: {
      normal: [
        '好好吃喵！谢谢你～',
        '嗯嗯嗯！这个超好吃的喵！',
        '我吃得饱饱的喵～',
        '你对我最好了喵！💕'
      ],
  full: [
        '唔...我已经吃不下了喵',
        '肚子鼓鼓的喵...',
        '再吃就要变成小肥猫了喵',
        '今天已经吃很多啦喵'
      ],
      favorite: [
        '哇！这是我最喜欢的味道喵！',
        '太好吃了喵！你怎么知道我喜欢这个？',
        '幸福喵～✨',
        '爱你喵！！'
      ]
    },

    // 玩耍反馈
    play: {
      normal: [
        '好玩好玩喵！',
        '再来再来喵～',
        '你好厉害喵！',
        '喵喵喵！接住了！'
      ],
      tired: [
        '呼...有点累了喵',
        '歇一下下喵...',
        '你体力好好喵，我跟不上了',
        '舌头都伸出来了喵～'
      ]
    },

    // 逗猫/抚摸反馈
    pet: {
      low: [
        '喵？你在摸我吗？',
        '唔...还行吧喵',
        '别碰我肚子喵！',
        '喵呜～'
      ],
      normal: [
        '呼噜呼噜～',
        '好舒服喵～',
        '再摸摸这里喵～',
        '你手法不错嘛喵😌'
      ],
      high: [
        '最爱你了喵💕',
        '不要停喵～',
        '呼噜呼噜呼噜～',
        '你是全世界最好的人类喵！'
      ]
    },

    // 睡觉相关
    sleep: {
      goSleep: [
        '晚安喵～做个好梦😴',
        '我去睡啦喵，你也早点休息～',
        '困困喵...晚安💤',
        '睡啦睡啦喵，明天见～'
      ],
      wakeUp: [
        '唔...醒了喵？',
        '睡得好饱喵～',
        '啊～伸个懒腰喵',
        '你叫醒我的吗喵？'
      ],
      sleeping: [
        'zzz...',
        '（睡得正香喵）',
        '呼噜...呼噜...',
        '...喵？（梦话）'
      ]
    },

    // 饿了主动说
    hungry: [
      '肚子咕咕叫了喵...',
      '什么时候吃饭呀喵？',
      '喵～我饿了',
      '猫粮猫粮！我要猫粮喵！',
      '你看我的肚子都扁了喵'
    ],

    // 无聊主动说
    bored: [
      '好无聊喵～陪我玩嘛',
      '你在忙什么呀喵？',
      '不理我了吗喵...',
      '喵～看我看我！',
      '我们来玩游戏好不好喵？'
    ],

    // 开心主动说
    happy: [
      '今天超开心的喵！',
      '有你陪着真好喵～',
      '喵呜～幸福！',
      '你笑一个嘛喵😺',
      '我最喜欢你了喵💕'
    ],

    // 长时间不理
    ignore: [
      '喵...你都不理我',
      '你是不是忘了还有一只猫呀？',
      '我要生气了喵！😾',
      '再不理我我就走了喵...',
      '喵呜～你看看我嘛'
    ],

    // 随机闲聊
    random: [
      '你知道吗？猫一天要睡16个小时喵',
      '我的尾巴不受控制了喵！',
      '外面好像有鸟叫声喵',
      '你今天有没有想我喵？',
      '我刚才做了一个梦喵',
      '你的手好温暖喵～',
      '喵～我是不是世界上最可爱的猫？',
      '我闻到好吃的味道了喵！',
      '你在看什么呀喵？我也要看！',
      '喵...肚子好胀，今天吃多了'
    ]
  };

  // ========== 专注模式陪伴文案 ==========
  const FOCUS_CHAT = {
    start: [
      '加油喵！我就在旁边陪着你～',
      '开始专注啦喵，我会安安静静的',
      '你认真的样子好帅/美喵～',
      '我就在旁边舔毛，不打扰你喵'
    ],
    quarter: [
      '已经过了1/4啦喵，继续加油！',
      '你好专注喵...',
      '（安静地看着你）',
      '专注的样子真好看喵～'
    ],
    half: [
      '一半啦喵！你超棒的！',
      '累不累呀？再坚持一下下喵',
      '要不要休息一下眼睛喵？',
      '已经一半了喵，时间过得好快'
    ],
    threeQuarter: [
      '快到啦喵！再加把劲！',
      '你真的好厉害喵，能坚持这么久',
      '马上就要结束了喵～',
      '加油加油喵！💪'
    ],
    nearEnd: [
      '就快到了喵！',
      '最后几分钟了喵，冲啊！',
      '你做到了喵！就差一点点！',
      '我都开始佩服你了喵'
    ],
    complete: [
      '太厉害了喵！你完成了！🎉',
      '棒棒棒！奖励你摸摸我喵～',
      '你超棒的！我就知道你可以喵',
      '完成啦！辛苦啦喵💕'
    ],
    giveup: [
      '没关系喵，下次再加油～',
      '累了就休息一下嘛喵',
      '你已经很棒了喵，不要有压力',
      '那我们去玩吧喵～'
    ]
  };

  // ========== 故事事件库 ==========
  const STORY_EVENTS = [
    {
      id: 'cockroach_gift',
      title: '神秘的礼物',
      trigger: { intimacyMin: 30, random: 0.3 },
      text: '你的猫叼着一只蟑螂，得意洋洋地放在你脚边，抬头亮晶晶地看着你，好像在等你夸奖。',
      options: [
        {
          text: '生气批评：「不许叼虫子！」',
          effect: { happiness: -10, trust: -5 },
          result: '猫被你吓得退了一步，委屈地把蟑螂推到一边，低着头走开了。'
        },
        {
          text: '温柔夸奖：「你真棒，谢谢你的礼物～」',
          effect: { happiness: 15, trust: 10, intimacy: 5 },
          result: '猫开心地呼噜起来，尾巴竖得高高的。它觉得自己是世界上最厉害的猎手！'
        },
        {
          text: '哭笑不得：默默把蟑螂丢掉',
          effect: { happiness: 0, trust: 0 },
          result: '你趁猫不注意，偷偷把蟑螂丢进了垃圾桶。猫歪着头看你，好像在疑惑礼物去哪了。'
        }
      ]
    },
    {
      id: 'rain_window',
      title: '雨天的窗边',
      trigger: { random: 0.4 },
      text: '外面下起了淅淅沥沥的雨。你的猫跳到窗台上，安安静静地望着窗外，偶尔回头看你一眼。',
      options: [
        {
          text: '走过去陪它一起看雨',
          effect: { trust: 10, intimacy: 8, happiness: 5 },
          result: '你坐在窗边，猫轻轻靠在你手边。一人一猫就这样静静地看着雨，时间好像变慢了。'
        },
        {
          text: '拿玩具吸引它的注意力',
          effect: { happiness: 5, trust: 0 },
          result: '你摇了摇逗猫棒，猫看了看窗外又看了看你，最后还是跳下来陪你玩了。'
        },
        {
          text: '让它自己待着',
          effect: { happiness: 0, trust: 2 },
          result: '你继续忙自己的事。过了一会儿，猫自己跳下来，蜷在你脚边睡着了。'
        }
      ]
    },
    {
      id: 'broken_vase',
      title: '碎掉的花瓶',
      trigger: { happinessMin: 50, random: 0.25 },
      text: '"啪！" 一声巨响，你跑过去一看，桌上的花瓶碎了一地，你的猫缩在墙角，耳朵耷拉着，不敢看你。',
      options: [
        {
          text: '大声训斥：「你怎么这么调皮！」',
          effect: { happiness: -15, trust: -10 },
          result: '猫吓得缩得更紧了，尾巴夹在腿中间。之后好几天它都不敢跳上桌子。'
        },
        {
          text: '先检查它有没有受伤',
          effect: { trust: 15, intimacy: 10, happiness: 5 },
          result: '你蹲下来轻轻把猫抱起来检查，发现它爪子被划了一小道。你心疼地给它吹了吹，猫把头埋进你怀里。'
        },
        {
          text: '无奈地收拾：「下次小心点啊」',
          effect: { happiness: -3, trust: 5 },
          result: '你叹了口气，开始收拾碎片。猫小心翼翼地走过来，用头蹭了蹭你的手，好像在道歉。'
        }
      ]
    },
    {
      id: 'hiding_spot',
      title: '捉迷藏',
      trigger: { intimacyMin: 20, random: 0.3 },
      text: '你回到家，发现猫不在平时睡觉的地方。找了半天，最后在衣柜最里面的一堆衣服里发现了它，它正用亮晶晶的眼睛看着你。',
      options: [
        {
          text: '把它抱出来教训一顿',
          effect: { happiness: -10, trust: -5 },
          result: '你把猫从衣柜里拎出来，它很不情愿地叫着，好像在说"我还没玩够呢喵"。'
        },
        {
          text: '陪它玩捉迷藏',
          effect: { happiness: 15, trust: 8, intimacy: 5 },
          result: '你假装没看见它，转身走开，然后突然回头"喵！"了一声。猫吓得跳了起来，然后兴奋地追着你跑。'
        },
        {
          text: '把衣柜门关小一点，留个缝',
          effect: { trust: 10, happiness: 5 },
          result: '你没有打扰它，只是把柜门留了一条缝让它能出来。过了一会儿，猫自己慢悠悠地走出来，好像什么都没发生。'
        }
      ]
    },
    {
      id: 'stray_cat_visit',
      title: '不速之客',
      trigger: { trustMin: 40, random: 0.2 },
      text: '今天窗户外面蹲着一只流浪猫，你的猫坐在窗台里面，隔着玻璃和那只猫对视。它回头看了你一眼，又转过头去继续看。',
      options: [
        {
          text: '开窗让流浪猫进来',
          effect: { happiness: -5, trust: 5 },
          result: '你打开窗户，流浪猫小心翼翼地进来了。你的猫先是炸毛，然后好奇地凑上去闻了闻。最后两只猫保持着安全距离，互不打扰。'
        },
        {
          text: '把窗帘拉上，不让它们看',
          effect: { happiness: -8, trust: -3 },
          result: '你拉上窗帘，猫不满地叫了一声，跳下来蹲在窗帘旁边，好像还想偷偷看。'
        },
        {
          text: '拿点猫粮喂窗外的猫',
          effect: { happiness: 3, trust: 8, intimacy: 5 },
          result: '你拿了一小碗猫粮放在窗外。你的猫蹲在旁边看着，好像在观察你喂别的猫。从那以后，流浪猫经常来窗台等你。'
        }
      ]
    },
    {
      id: 'nightmare',
      title: '噩梦',
      trigger: { random: 0.2 },
      text: '半夜你被一阵呜呜声吵醒，开灯一看，你的猫缩在角落，毛都炸起来了，眼睛睁得大大的，好像做了噩梦。',
      options: [
        {
          text: '把它抱起来轻轻安抚',
          effect: { trust: 15, intimacy: 12, happiness: 10 },
          result: '你把猫抱在怀里，轻轻摸着它的头。猫的身体还在抖，但慢慢地安静下来，把头埋进你臂弯里睡着了。'
        },
        {
          text: '开灯陪它坐一会儿',
          effect: { trust: 8, happiness: 5 },
          result: '你开着台灯，坐在地上陪它。猫小心翼翼地走过来，在你脚边趴下，但还是有点惊魂未定。'
        },
        {
          text: '翻个身继续睡',
          effect: { trust: -5, happiness: -3 },
          result: '你太困了，翻了个身又睡着了。不知道过了多久，猫轻轻跳上床，在你脚边蜷成一团。'
        }
      ]
    },
    {
      id: 'paper_box',
      title: '纸箱的诱惑',
      trigger: { random: 0.35 },
      text: '你刚拆完快递，把空纸箱放在地上。你的猫立刻冲了过来，在纸箱旁边转来转去，试探性地把爪子伸进去。',
      options: [
        {
          text: '帮它把纸箱改造成猫窝',
          effect: { happiness: 20, trust: 10, intimacy: 8 },
          result: '你在纸箱上开了几个洞，铺了件旧T恤。猫钻进去试了试，满意地呼噜起来。接下来的一周它都住在里面。'
        },
        {
          text: '把纸箱丢掉',
          effect: { happiness: -8 },
          result: '你把纸箱丢了。猫蹲在垃圾桶旁边看了好久，最后闷闷不乐地走开了。'
        },
        {
          text: '把纸箱留着，逗它玩',
          effect: { happiness: 12, trust: 5 },
          result: '你把纸箱放着，猫立刻钻了进去。你在外面轻轻戳纸箱，猫在里面扑来扑去，玩得不亦乐乎。'
        }
      ]
    },
    {
      id: 'sick_feeling',
      title: '不对劲',
      trigger: { healthMax: 70, random: 0.15 },
      text: '你发现今天猫有点不对劲——它没怎么吃东西，也不怎么动，平时最爱玩的逗猫棒放在面前也不理。',
      options: [
        {
          text: '带它去看医生',
          effect: { health: 20, trust: 15, happiness: -5 },
          result: '你赶紧带猫去了宠物医院。医生说只是有点小感冒，吃点药就好。虽然猫在医院吓得发抖，但回家后很快就恢复了精神。'
        },
        {
          text: '观察一天再说',
          effect: { health: -5, trust: 5 },
          result: '你决定先观察一下。第二天猫好像好了一点，但还是没什么精神。你有点后悔没早点带它去看。'
        },
        {
          text: '给它做点好吃的',
          effect: { happiness: 5, health: 0 },
          result: '你给猫开了个最贵的罐头，它闻了闻，勉强吃了两口。虽然没怎么吃，但它知道你在关心它。'
        }
      ]
    }
  ];

  // ========== 状态 ==========
  let chatTimer = null;
  let lastChatTime = 0;
  let currentEvent = null;
  let focusMilestoneHit = { q1: false, q2: false, q3: false, q4: false };

  // ========== 工具函数 ==========
  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getState() {
    return window.PET_ENGINE ? window.PET_ENGINE.getState() : null;
  }

  function getCurrentCat() {
    const state = getState();
    if (!state) return null;
    const cat = state.cats[state.currentCatIndex];
    return cat || null;
  }

  function getMoodLevel() {
    const cat = getCurrentCat();
    if (!cat) return 'normal';
    const happy = cat.happiness || 50;
    const intimacy = cat.intimacy || 0;
    if (happy < 30 || intimacy < 10) return 'low';
    if (happy > 70 && intimacy > 50) return 'high';
    return 'normal';
  }

  function getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'afternoon';
    if (h >= 17 && h < 22) return 'evening';
    return 'night';
  }

  // ========== 对话气泡组件 ==========
  function createChatBubble() {
    if (document.getElementById('catChatBubble')) return;
    const bubble = document.createElement('div');
    bubble.id = 'catChatBubble';
    bubble.className = 'cat-chat-bubble';
    bubble.innerHTML = `
      <div class="chat-bubble-inner">
        <span class="chat-bubble-text" id="chatBubbleText"></span>
      </div>
      <div class="chat-bubble-tail"></div>
    `;
    bubble.style.display = 'none';
    // 追加到 cat-display-box 里面
    const displayBox = document.querySelector('.cat-display-box');
    if (displayBox) {
      displayBox.appendChild(bubble);
    }
  }

  function showChat(text, duration) {
    createChatBubble();
    const bubble = document.getElementById('catChatBubble');
    const textEl = document.getElementById('chatBubbleText');
    if (!bubble || !textEl) return;

    textEl.textContent = text;
    bubble.style.display = 'block';
    // 触发动画
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');

    lastChatTime = Date.now();

    if (duration && duration > 0) {
      if (chatTimer) clearTimeout(chatTimer);
      chatTimer = setTimeout(() => {
        hideChat();
      }, duration);
    }
  }

  function hideChat() {
    const bubble = document.getElementById('catChatBubble');
    if (!bubble) return;
    bubble.classList.remove('show');
    setTimeout(() => {
      if (bubble) bubble.style.display = 'none';
    }, 300);
  }

  // ========== 主动搭话系统 ==========
  function pickGreeting() {
    const timeOfDay = getTimeOfDay();
    return rand(CHAT_POOL.greeting[timeOfDay]);
  }

  function pickIdleChat() {
    const cat = getCurrentCat();
    if (!cat) return rand(CHAT_POOL.random);

    const happy = cat.happiness || 50;
    const hunger = cat.hunger || 50;
    const isSleeping = cat.isSleeping;

    if (isSleeping) {
      return rand(CHAT_POOL.sleep.sleeping);
    }

    // 饿了优先说饿
    if (hunger < 30 && Math.random() < 0.5) {
      return rand(CHAT_POOL.hungry);
    }

    // 心情差说无聊
    if (happy < 40 && Math.random() < 0.4) {
      return rand(CHAT_POOL.bored);
    }

    // 心情好说开心
    if (happy > 75 && Math.random() < 0.35) {
      return rand(CHAT_POOL.happy);
    }

    // 随机闲聊
    return rand(CHAT_POOL.random);
  }

  function triggerGreeting() {
    const text = pickGreeting();
    showChat(text, 4000);
  }

  function triggerIdleChat() {
    // 专注模式下不触发闲聊
    const state = getState();
    if (state && state.focus && state.focus.isActive) return;

    const text = pickIdleChat();
    showChat(text, 3500);
  }

  // 启动主动搭话定时器
  function startChatLoop() {
    if (chatTimer) clearInterval(chatTimer);
    // 每 30~60 秒随机触发一次闲聊
    setInterval(() => {
      // 不在猫页面不触发
      const catPage = document.getElementById('pageCat');
      if (!catPage || catPage.style.display === 'none') return;

      // 专注中不触发
      const state = getState();
      if (state && state.focus && state.focus.isActive) return;

      // 刚说过话不重复
      if (Date.now() - lastChatTime < 15000) return;

      // 50% 概率说点什么
      if (Math.random() < 0.5) {
        triggerIdleChat();
      }
    }, 30000);
  }

  // ========== 专注陪伴 ==========
  function triggerFocusChat(stage) {
    const pool = FOCUS_CHAT[stage];
    if (!pool || pool.length === 0) return;
    const text = rand(pool);
    showChat(text, 4000);
  }

  // 专注进度检查（由外部 tick 调用）
  function checkFocusMilestones(elapsedMinutes, totalMinutes) {
    if (totalMinutes <= 0) return;
    const pct = elapsedMinutes / totalMinutes;

    if (!focusMilestoneHit.q1 && pct >= 0.25 && pct < 0.35) {
      focusMilestoneHit.q1 = true;
      triggerFocusChat('quarter');
    } else if (!focusMilestoneHit.q2 && pct >= 0.5 && pct < 0.6) {
      focusMilestoneHit.q2 = true;
      triggerFocusChat('half');
    } else if (!focusMilestoneHit.q3 && pct >= 0.75 && pct < 0.85) {
      focusMilestoneHit.q3 = true;
      triggerFocusChat('threeQuarter');
    } else if (!focusMilestoneHit.q4 && pct >= 0.9) {
      focusMilestoneHit.q4 = true;
      triggerFocusChat('nearEnd');
    }
  }

  function resetFocusMilestones() {
    focusMilestoneHit = { q1: false, q2: false, q3: false, q4: false };
  }

  // ========== 故事事件系统 ==========
  function getAvailableEvents() {
    const cat = getCurrentCat();
    if (!cat) return [];

    return STORY_EVENTS.filter(ev => {
      const t = ev.trigger || {};
      if (t.intimacyMin && (cat.intimacy || 0) < t.intimacyMin) return false;
      if (t.trustMin && (cat.trust || 0) < t.trustMin) return false;
      if (t.happinessMin && (cat.happiness || 50) < t.happinessMin) return false;
      if (t.healthMax && (cat.health || 100) > t.healthMax) return false;
      // 已经触发过的事件 24 小时内不重复
      if (cat.lastStoryEvents && cat.lastStoryEvents[ev.id]) {
        const last = cat.lastStoryEvents[ev.id];
        if (Date.now() - last < 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }

  function pickRandomEvent() {
    const available = getAvailableEvents();
    if (available.length === 0) return null;

    // 按权重随机（每个事件有自己的 random 概率系数）
    const weighted = [];
    available.forEach(ev => {
      const weight = (ev.trigger && ev.trigger.random) ? ev.trigger.random * 100 : 30;
      for (let i = 0; i < weight; i++) weighted.push(ev);
    });

    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  function showStoryEvent(event) {
    currentEvent = event;
    // 创建事件弹窗
    let modal = document.getElementById('storyEventModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'storyEventModal';
      modal.className = 'story-event-modal';
      modal.innerHTML = `
        <div class="story-event-mask"></div>
        <div class="story-event-card" onclick="event.stopPropagation()">
          <div class="story-event-emoji">💭</div>
          <div class="story-event-title" id="storyEventTitle"></div>
          <div class="story-event-text" id="storyEventText"></div>
          <div class="story-event-options" id="storyEventOptions"></div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('.story-event-mask').onclick = () => {
        // 不允许点背景关闭，必须选一个
      };
    }

    document.getElementById('storyEventTitle').textContent = event.title;
    document.getElementById('storyEventText').textContent = event.text;

    const optionsEl = document.getElementById('storyEventOptions');
    optionsEl.innerHTML = event.options.map((opt, idx) => `
      <button class="story-event-option" data-idx="${idx}">
        ${opt.text}
      </button>
    `).join('');

    optionsEl.querySelectorAll('.story-event-option').forEach(btn => {
      btn.onclick = () => handleEventChoice(parseInt(btn.dataset.idx));
    });

    modal.style.display = 'flex';
  }

  function handleEventChoice(idx) {
    if (!currentEvent) return;
    const option = currentEvent.options[idx];
    if (!option) return;

    // 记录变化前的数值
    const before = {};
    if (window.PET_ENGINE) {
      const state = getState();
      const cat = state.cats[state.currentCatIndex];
      if (cat) {
        before.happiness = cat.happiness || 50;
        before.hunger = cat.hunger || 50;
        before.health = cat.health !== undefined ? cat.health : 100;
        before.trust = cat.trust || 50;
        before.intimacy = cat.intimacy || 0;
      }
    }

    // 应用效果
    if (option.effect && window.PET_ENGINE) {
      const state = getState();
      const cat = state.cats[state.currentCatIndex];
      if (cat) {
        const CONFIG = window.PET_ENGINE.CONFIG || {};
        const maxHappy = CONFIG.maxHappiness || 100;
        const maxHunger = CONFIG.maxHunger || 100;
        const maxHealth = 100;
        const maxTrust = 100;

        if (option.effect.happiness) {
          cat.happiness = Math.max(0, Math.min(maxHappy, (cat.happiness || 50) + option.effect.happiness));
        }
        if (option.effect.hunger) {
          cat.hunger = Math.max(0, Math.min(maxHunger, (cat.hunger || 50) + option.effect.hunger));
        }
        if (option.effect.health) {
          cat.health = Math.max(0, Math.min(maxHealth, (cat.health !== undefined ? cat.health : 100) + option.effect.health));
        }
        if (option.effect.trust) {
          cat.trust = Math.max(0, Math.min(maxTrust, (cat.trust || 50) + option.effect.trust));
        }
        if (option.effect.intimacy) {
          // 调用引擎的 addIntimacy 方法（带等级检查）
          if (typeof window.PET_ENGINE.addIntimacy === 'function') {
            window.PET_ENGINE.addIntimacy(state.currentCatIndex, option.effect.intimacy);
          } else {
            cat.intimacy = Math.max(0, (cat.intimacy || 0) + option.effect.intimacy);
          }
        }
        // 记录事件触发时间
        if (!cat.lastStoryEvents) cat.lastStoryEvents = {};
        cat.lastStoryEvents[currentEvent.id] = Date.now();
        window.PET_ENGINE.save();
      }
    }

    // 计算数值变化
    const changes = [];
    if (option.effect) {
      const labels = [
        { key: 'happiness', label: '😊 心情', icon: '' },
        { key: 'hunger',    label: '🍖 饱食', icon: '' },
        { key: 'trust',     label: '💝 信任', icon: '' },
        { key: 'health',    label: '❤️ 健康', icon: '' },
        { key: 'intimacy',  label: '💕 亲密度', icon: '' }
      ];
      labels.forEach(l => {
        const val = option.effect[l.key];
        if (val && val !== 0) {
          const sign = val > 0 ? '+' : '';
          const color = val > 0 ? 'up' : 'down';
          changes.push(`<span class="effect-change ${color}">${l.label} ${sign}${val}</span>`);
        }
      });
    }
    const changesHtml = changes.length > 0
      ? `<div class="story-event-changes">${changes.join('')}</div>`
      : '';

    // 显示结果
    const optionsEl = document.getElementById('storyEventOptions');
    if (optionsEl) {
      optionsEl.innerHTML = `
        <div class="story-event-result">${option.result}</div>
        ${changesHtml}
        <button class="story-event-close-btn" id="storyEventCloseBtn">知道了</button>
      `;
      const closeBtn = document.getElementById('storyEventCloseBtn');
      if (closeBtn) {
        closeBtn.onclick = closeStoryEvent;
      }
    }

    // 刷新UI
    if (window.PET_UI && typeof window.PET_UI.render === 'function') {
      setTimeout(() => window.PET_UI.render(), 300);
    }
  }

  function closeStoryEvent() {
    const modal = document.getElementById('storyEventModal');
    if (modal) modal.style.display = 'none';
    currentEvent = null;
  }

  // 尝试触发一个随机事件
  function tryTriggerStoryEvent() {
    const event = pickRandomEvent();
    if (event) {
      showStoryEvent(event);
      return true;
    }
    return false;
  }

  // ========== 对外 API ==========
  window.CAT_CHAT = {
    // 对话气泡
    showChat: showChat,
    hideChat: hideChat,

    // 主动搭话
    triggerGreeting: triggerGreeting,
    triggerIdleChat: triggerIdleChat,
    startChatLoop: startChatLoop,

    // 行为反馈（喂食/玩耍/抚摸后调用）
    onFeed: function (isFull, isFavorite) {
      let pool;
      if (isFavorite) pool = CHAT_POOL.feed.favorite;
      else if (isFull) pool = CHAT_POOL.feed.full;
      else pool = CHAT_POOL.feed.normal;
      showChat(rand(pool), 3000);
    },
    onPlay: function (isTired) {
      const pool = isTired ? CHAT_POOL.play.tired : CHAT_POOL.play.normal;
      showChat(rand(pool), 3000);
    },
    onPet: function () {
      const level = getMoodLevel();
      const pool = CHAT_POOL.pet[level] || CHAT_POOL.pet.normal;
      showChat(rand(pool), 3000);
    },
    onSleep: function (isGoingToSleep) {
      const pool = isGoingToSleep ? CHAT_POOL.sleep.goSleep : CHAT_POOL.sleep.wakeUp;
      showChat(rand(pool), 3000);
    },

    // 专注陪伴
    onFocusStart: function () {
      resetFocusMilestones();
      triggerFocusChat('start');
    },
    onFocusTick: function (elapsedMinutes, totalMinutes) {
      checkFocusMilestones(elapsedMinutes, totalMinutes);
    },
    onFocusComplete: function () {
      triggerFocusChat('complete');
    },
    onFocusGiveUp: function () {
      triggerFocusChat('giveup');
    },

    // 故事事件
    showStoryEvent: showStoryEvent,
    tryTriggerStoryEvent: tryTriggerStoryEvent,
    closeStoryEvent: closeStoryEvent,
    getAvailableEvents: getAvailableEvents
  };

  // 自动初始化：页面加载后启动聊天循环
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
      startChatLoop();
    }, 2000);
  });

})();
