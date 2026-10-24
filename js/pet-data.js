// ============================================
// 猫咪数据配置 - 14只可爱猫咪（8普通 + 6稀有）
// 像素风 · 猫咪领养养成系统
// ============================================

window.PET_DATA = (function() {

  // 14只猫咪品种（8普通 + 6稀有）
  // 稀有品种只能通过繁育获得
  const CATS = [
    { id:'calico',   name:'三花猫',   price:100,  personality:'活泼好动', desc:'橘白黑三色，像小太阳一样温暖', sprite:{row:0, col:0}, rarity:'common' },
    { id:'orange',   name:'橘猫',     price:120,  personality:'贪吃憨厚', desc:'十橘九胖，还有一只特别胖', sprite:{row:0, col:1}, rarity:'common' },
    { id:'black',    name:'黑猫',     price:150,  personality:'神秘优雅', desc:'黑夜中的小精灵，带来好运', sprite:{row:0, col:2}, rarity:'common' },
    { id:'white',    name:'白猫',     price:150,  personality:'温柔安静', desc:'如雪般纯净的小天使', sprite:{row:0, col:3}, rarity:'common' },
    { id:'tuxedo',   name:'奶牛猫',   price:180,  personality:'调皮捣蛋', desc:'黑白分明的小恶魔，精力无限', sprite:{row:1, col:0}, rarity:'common' },
    { id:'russianblue', name:'蓝猫',     price:200,  personality:'软糯呆萌', desc:'英短蓝猫，圆脸蓝胖子', sprite:{row:1, col:1}, rarity:'common' },
    { id:'tabby',    name:'狸花猫',   price:220,  personality:'矫健灵动', desc:'中华田园猫的骄傲，聪明又强壮', sprite:{row:1, col:2}, rarity:'common' },
    { id:'ragdoll',  name:'布偶猫',   price:300,  personality:'粘人软萌', desc:'蓝眼睛重点色，布娃娃般柔软', sprite:{row:1, col:3}, rarity:'common' },
    // 稀有品种（只能通过繁育获得）
    { id:'munchkin', name:'矮脚努米特', price:500, personality:'圆滚滚萌', desc:'小短腿矮脚猫，跑起来像小肉球', sprite:{row:2, col:0}, rarity:'rare', rarityLevel:3, onlyFromBreeding:true },
    { id:'maine',    name:'缅因猫',   price:800,  personality:'威严温柔', desc:'森林猫之王，大体型蓬松毛发', sprite:{row:2, col:1}, rarity:'rare', rarityLevel:4, onlyFromBreeding:true },
    { id:'devon',    name:'德文卷毛猫', price:800, personality:'精灵古怪', desc:'卷毛大耳朵，像小精灵一样', sprite:{row:2, col:2}, rarity:'rare', rarityLevel:4, onlyFromBreeding:true },
    { id:'sphynx',   name:'斯芬克斯猫', price:1200, personality:'高冷独特', desc:'无毛猫，酷炫又粘人的特别存在', sprite:{row:2, col:3}, rarity:'rare', rarityLevel:5, onlyFromBreeding:true },
    { id:'lion',     name:'狮子猫',   price:800,  personality:'高贵典雅', desc:'长毛蓬松如狮，临清狮子猫', sprite:{row:3, col:0}, rarity:'rare', rarityLevel:4, onlyFromBreeding:true },
    { id:'bengal',   name:'孟加拉豹猫', price:1500, personality:'野性活泼', desc:'豹纹皮毛，像小豹子一样矫健', sprite:{row:3, col:1}, rarity:'rare', rarityLevel:5, onlyFromBreeding:true }
  ];

  // 食物配置
  const FOODS = [
    { id:'fish',        name:'小鱼干',     price:8,   hunger:25, happiness:5,  intimacy:2, emoji:'🐟' },
    { id:'cat_food',    name:'猫粮',       price:10,  hunger:30, happiness:3,  intimacy:2, emoji:'🥫' },
    { id:'chicken',     name:'鸡胸肉',     price:15,  hunger:35, happiness:10, intimacy:4, emoji:'🍗' },
    { id:'can',         name:'猫罐头',     price:25,  hunger:40, happiness:15, intimacy:6, emoji:'🥫' },
    { id:'treat',       name:'猫条',       price:12,  hunger:15, happiness:20, intimacy:5, emoji:'🍖' },
    { id:'shrimp',      name:'鲜虾',       price:20,  hunger:25, happiness:18, intimacy:5, emoji:'🦐' },
    { id:'egg',         name:'蛋黄',       price:5,   hunger:15, happiness:8,  intimacy:2, emoji:'🥚' },
    { id:'premium',     name:'豪华大餐',   price:50,  hunger:60, happiness:30, intimacy:10, emoji:'🍱' }
  ];

  // 玩具配置
  const TOYS = [
    { id:'ball',      name:'毛线球',   price:15,  happiness:20, intimacy:4,  emoji:'🧶' },
    { id:'feather',   name:'逗猫棒',   price:20,  happiness:25, intimacy:5,  emoji:'🪶' },
    { id:'mouse',     name:'小老鼠',   price:10,  happiness:15, intimacy:3,  emoji:'🐭' },
    { id:'box',       name:'纸箱子',   price:5,   happiness:30, intimacy:3,  emoji:'📦' },
    { id:'laser',     name:'激光笔',   price:30,  happiness:40, intimacy:8,  emoji:'🔴' },
    { id:'catnip',    name:'猫薄荷',   price:25,  happiness:50, intimacy:10, emoji:'🌿' }
  ];

  // 道具配置
  const ITEMS = [
    { id:'bed',        name:'猫窝',     price:80,   type:'bed',       effect:'sleepBonus',    emoji:'🛏️' },
    { id:'tree',       name:'猫爬架',   price:150,  type:'furniture', effect:'happinessBonus',emoji:'🌳' },
    { id:'fountain',   name:'饮水机',   price:100,  type:'furniture', effect:'healthBonus',   emoji:'💧' },
    { id:'brush',      name:'梳毛器',   price:20,   type:'tool',      effect:'grooming',      emoji:'🪮' },
    { id:'medicine',   name:'营养膏',   price:40,   type:'medicine',  effect:'energy',        emoji:'💊' }
  ];

  // 专注模式奖励配置
  const FOCUS_REWARDS = {
    baseCoinsPerMinute: 2,       // 每分钟基础金币
    bonusMultiplier: 1.5,        // 猫咪陪伴时的奖励倍率
    perfectBonus: 1.2,           // 完整完成专注的奖励倍率
    milestones: [
      { minutes: 25,  label:'番茄钟', bonus: 20 },
      { minutes: 45,  label:'深度专注', bonus: 50 },
      { minutes: 90,  label:'超长专注', bonus: 120 }
    ]
  };

  // 盲盒奖励配置（专注完成后开启）
  const BLIND_BOX = {
    tiers: [
      {
        id: 'common',
        name: '普通',
        color: '#9E9E9E',
        bgColor: '#F5F5F5',
        emoji: '📦',
        probability: 0.55,  // 55%
        coinRange: [10, 30],
        foodCount: [1, 2],   // 食物数量范围
        foodPriceRange: [5, 15],
        toyCount: [0, 1],
        toyPriceRange: [5, 15]
      },
      {
        id: 'rare',
        name: '稀有',
        color: '#2196F3',
        bgColor: '#E3F2FD',
        emoji: '🎁',
        probability: 0.28,  // 28%
        coinRange: [30, 80],
        foodCount: [1, 3],
        foodPriceRange: [10, 25],
        toyCount: [1, 2],
        toyPriceRange: [10, 25]
      },
      {
        id: 'epic',
        name: '史诗',
        color: '#9C27B0',
        bgColor: '#F3E5F5',
        emoji: '💎',
        probability: 0.13,  // 13%
        coinRange: [80, 200],
        foodCount: [2, 4],
        foodPriceRange: [15, 50],
        toyCount: [1, 3],
        toyPriceRange: [15, 30]
      },
      {
        id: 'legendary',
        name: '传说',
        color: '#FF9800',
        bgColor: '#FFF3E0',
        emoji: '👑',
        probability: 0.04,  // 4%
        coinRange: [200, 500],
        foodCount: [3, 5],
        foodPriceRange: [25, 50],
        toyCount: [2, 4],
        toyPriceRange: [20, 30]
      }
    ],
    // 专注时长对稀有度的加成（分钟越多，出好东西概率越高）
    durationBonus: {
      15: 0,    // 15分钟无加成
      25: 0.05, // 25分钟 +5%稀有度
      45: 0.12, // 45分钟 +12%
      60: 0.18, // 60分钟 +18%
      90: 0.3   // 90分钟 +30%
    }
  };

  // 每日签到配置
  const DAILY_CHECKIN = {
    // 连续7天的奖励
    rewards: [
      { day: 1, coins: 30,  type: 'coin', emoji: '💰' },
      { day: 2, coins: 50,  type: 'coin', emoji: '💰' },
      { day: 3, type: 'adoption_slot', emoji: '🎫', label: '领养名额+1' },
      { day: 4, coins: 80,  type: 'coin', emoji: '💰' },
      { day: 5, toy: 'mouse', count: 2, type: 'toy', emoji: '🐭' },
      { day: 6, coins: 120, type: 'coin', emoji: '💰' },
      { day: 7, coins: 200, food: 'premium_food', count: 2, type: 'slot', emoji: '🏠', label: '栏位+1' }
    ],
    // 断签后从第几天重新开始（超过24小时算断签）
    streakResetHours: 36
  };

  // 猫咪等级配置
  const LEVEL_CONFIG = {
    maxLevel: 10,
    // 每级所需亲密度（累计）
    expRequired: [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500, 5000],
    // 等级称号
    titles: [
      '', '小奶猫', '萌新猫', '乖巧猫', '亲密猫',
      '挚友猫', '家人猫', '灵魂伴侣', '神猫侠侣', '传说猫主', '猫仙'
    ],
    // 每级专注金币加成（在基础 1.5x 上额外增加）
    focusBonus: [0, 0.02, 0.05, 0.08, 0.12, 0.16, 0.2, 0.25, 0.3, 0.35, 0.45],
    // 每级繁育稀有度加成（珍稀+2%/级，传说+1%/级，从普通概率中扣除）
    breedingBonus: [
      { rare4: 0,    rare5: 0 },     // 0级（占位）
      { rare4: 0.02, rare5: 0.01 },  // Lv.1  珍稀+2%，传说+1%
      { rare4: 0.04, rare5: 0.02 },  // Lv.2  珍稀+4%，传说+2%
      { rare4: 0.06, rare5: 0.03 },  // Lv.3  珍稀+6%，传说+3%
      { rare4: 0.08, rare5: 0.04 },  // Lv.4  珍稀+8%，传说+4%
      { rare4: 0.10, rare5: 0.05 },  // Lv.5  珍稀+10%，传说+5%
      { rare4: 0.12, rare5: 0.06 },  // Lv.6  珍稀+12%，传说+6%
      { rare4: 0.14, rare5: 0.07 },  // Lv.7  珍稀+14%，传说+7%
      { rare4: 0.16, rare5: 0.08 },  // Lv.8  珍稀+16%，传说+8%
      { rare4: 0.18, rare5: 0.09 },  // Lv.9  珍稀+18%，传说+9%
      { rare4: 0.20, rare5: 0.10 }   // Lv.10 珍稀+20%，传说+10%
    ],
    // 解锁等级对应解锁的动作（额外动作，暂未实现）
    unlockedActions: {
      3: ['belly'],
      5: ['loaf'],
      7: ['roll'],
      9: ['dance']
    }
  };

  // 猫咪状态配置
  const CAT_CONFIG = {
    maxHunger: 100,
    maxHappiness: 100,
    maxEnergy: 100,
    hungerDecayPerHour: 6,      // 每小时饥饿下降
    happinessDecayPerHour: 4,   // 每小时心情下降
    energyDecayPerHour: 5,      // 每小时活力缓慢下降
    energyRecoverPerHour: 40,   // 睡觉时每小时活力恢复
    energyRecoverIdlePerHour: 8, // 清醒时每小时自然恢复少量活力
    hungerRecoverPerHour: 0,    // 睡觉时不消耗饥饿
    happinessRecoverSleep: 5,   // 睡觉时每小时心情恢复
    poopPerDay: 2,              // 每天产生几坨便便
    maxPoop: 6,                 // 便便上限
    poopHappinessPenalty: 2,    // 每坨便便让心情每小时多降多少
    // 活力增益系数：活力越高，互动收益越多
    energyBonusHigh: 1.5,       // 活力≥80时，收益1.5倍
    energyBonusMid: 1.0,        // 活力30-80时，收益1倍
    energyBonusLow: 0.6,        // 活力<30时，收益0.6倍
    lowMoodThreshold: 30        // 心情低于这个值会不开心
  };

  // 初始金币（够领养一只流浪猫+买一点食物）
  const INITIAL_COINS = 100;

  // 初始已解锁的猫咪（新用户需要去公园领养流浪猫）
  const INITIAL_UNLOCKED = [];

  // ============================================
  // 繁育系统配置
  // ============================================
  const BREEDING_CONFIG = {
    // 繁育所需金币
    cost: 100,
    // 繁育等待时间（毫秒）- 简化为即时，但保留配置
    gestationTime: 0,
    // 每胎生几只小猫
    kittensPerLitter: 2,
    // 小猫成熟所需时间（小时）- 从奶猫到成年猫
    maturationHours: 72,
    // 猫咪可繁育的最低成熟度等级
    minBreedingLevel: 3,
    // 盲盒领养价格
    blindAdoptPrice: 50,
    // 连续签到7天获得繁育券
    streakBreedingReward: true
  };

  // 繁育品种概率表
  // 规则：
  // - 普通+普通：大概率出普通，小概率变异出稀有3级（矮脚）
  // - 普通+稀有3级：中概率普通，中概率稀有3级，小概率稀有4级
  // - 普通+稀有4级：小概率普通，中概率稀有3-4级，小概率稀有5级
  // - 普通+稀有5级：低概率普通，中概率稀有4级，中概率稀有5级
  // - 稀有3级+稀有3级：大概率稀有3级，中概率稀有4级，小概率稀有5级
  // - 稀有3级+稀有4级：中概率稀有3级，大概率稀有4级，中概率稀有5级
  // - 稀有4级+稀有4级：大概率稀有4级，中概率稀有5级
  // - 稀有4级+稀有5级：中概率稀有4级，大概率稀有5级
  // - 稀有5级+稀有5级：必定稀有5级（两个品种随机）
  // - 同品种繁育：50%概率出同品种

  const BREEDING_TABLE = {
    // 按父母双方稀有度等级组合的概率分布
    // common = 普通(等级0), rare3 = 稀有3级, rare4 = 稀有4级, rare5 = 稀有5级
    '0_0': { // 普通 + 普通
      sameBreedChance: 0.5, // 同品种时50%出父母品种
      distribution: [
        { rarity: 'common', weight: 85 },   // 85% 普通品种
        { rarity: 'rare3',  weight: 12 },   // 12% 稀有3级（矮脚努米特）
        { rarity: 'rare4',  weight: 3  }    // 3%  稀有4级（缅因/德文/狮子猫）
      ]
    },
    '0_3': { // 普通 + 稀有3级
      sameBreedChance: 0.35,
      distribution: [
        { rarity: 'common', weight: 45 },   // 45% 普通
        { rarity: 'rare3',  weight: 40 },   // 40% 稀有3级
        { rarity: 'rare4',  weight: 13 },   // 13% 稀有4级
        { rarity: 'rare5',  weight: 2  }    // 2%  稀有5级
      ]
    },
    '0_4': { // 普通 + 稀有4级
      sameBreedChance: 0.25,
      distribution: [
        { rarity: 'common', weight: 20 },   // 20% 普通
        { rarity: 'rare3',  weight: 30 },   // 30% 稀有3级
        { rarity: 'rare4',  weight: 35 },   // 35% 稀有4级
        { rarity: 'rare5',  weight: 15 }    // 15% 稀有5级
      ]
    },
    '0_5': { // 普通 + 稀有5级
      sameBreedChance: 0.2,
      distribution: [
        { rarity: 'common', weight: 8 },    // 8%  普通
        { rarity: 'rare3',  weight: 15 },   // 15% 稀有3级
        { rarity: 'rare4',  weight: 42 },   // 42% 稀有4级
        { rarity: 'rare5',  weight: 35 }    // 35% 稀有5级
      ]
    },
    '3_3': { // 稀有3级 + 稀有3级
      sameBreedChance: 0.5,
      distribution: [
        { rarity: 'rare3', weight: 60 },    // 60% 稀有3级
        { rarity: 'rare4', weight: 30 },    // 30% 稀有4级
        { rarity: 'rare5', weight: 10 }     // 10% 稀有5级
      ]
    },
    '3_4': { // 稀有3级 + 稀有4级
      sameBreedChance: 0.4,
      distribution: [
        { rarity: 'rare3', weight: 25 },    // 25% 稀有3级
        { rarity: 'rare4', weight: 50 },    // 50% 稀有4级
        { rarity: 'rare5', weight: 25 }     // 25% 稀有5级
      ]
    },
    '3_5': { // 稀有3级 + 稀有5级
      sameBreedChance: 0.3,
      distribution: [
        { rarity: 'rare3', weight: 10 },    // 10% 稀有3级
        { rarity: 'rare4', weight: 45 },    // 45% 稀有4级
        { rarity: 'rare5', weight: 45 }     // 45% 稀有5级
      ]
    },
    '4_4': { // 稀有4级 + 稀有4级
      sameBreedChance: 0.5,
      distribution: [
        { rarity: 'rare4', weight: 65 },    // 65% 稀有4级
        { rarity: 'rare5', weight: 35 }     // 35% 稀有5级
      ]
    },
    '4_5': { // 稀有4级 + 稀有5级
      sameBreedChance: 0.4,
      distribution: [
        { rarity: 'rare4', weight: 30 },    // 30% 稀有4级
        { rarity: 'rare5', weight: 70 }     // 70% 稀有5级
      ]
    },
    '5_5': { // 稀有5级 + 稀有5级
      sameBreedChance: 0.6,
      distribution: [
        { rarity: 'rare5', weight: 100 }    // 100% 稀有5级
      ]
    }
  };

  // 各稀有度等级对应的具体品种列表（用于随机抽取具体品种）
  const RARITY_BREEDS = {
    'common': ['calico', 'orange', 'black', 'white', 'tuxedo', 'russianblue', 'tabby', 'ragdoll'],
    'rare3':  ['munchkin'],
    'rare4':  ['maine', 'devon', 'lion'],
    'rare5':  ['sphynx', 'bengal']
  };

  // ============================================
  // 猫咪公园（配对广场）配置
  // ============================================
  const CAT_PARK_CONFIG = {
    // 公园中展示的蛋蛋用户猫咪数量
    displayCount: 4,
    // 公园场景固定展示的他人用户猫数量（服务端 /scene 按用户去重抽取；与后端 SCENE_OTHERS_COUNT 一致）
    sceneOthersCount: 3,
    // 公园里的野猫数量（可以领养的流浪猫）
    strayCatCount: 2,
    // 野猫稀有度概率表（每只野猫独立抽取，抽卡概率）
    strayRarityTable: [
      { rarity: 'common', weight: 80 },   // 普通 80%
      { rarity: 'rare3',  weight: 16 },   // 稀有 16%
      { rarity: 'rare4',  weight: 3.5 },  // 珍稀 3.5%
      { rarity: 'rare5',  weight: 0.5 }   // 传说 0.5%（千分之五）
    ],
    // 公园刷新次数：每2小时恢复1次，最多储存5次
    refreshRegenHours: 2,
    refreshMaxCount: 5,
    // 刷新公园需要的金币
    refreshCost: 0, // 免费刷新
    // 申请繁育后对方响应时间（秒，模拟）
    responseTime: 5,
    // 同意繁育的概率（模拟其他蛋蛋用户）
    acceptProbability: 0.7,
    // 玩家同时最多放几只猫咪到公园溜达
    maxCatsInPark: 3,
    // 放上公园所需最低好感度等级（与后端 CatParkService.MIN_BREED_LEVEL=3 一致：
    // 能上公园的猫才谈得上被申请繁育，放置与繁育共用同一门槛，2026-10-12 补齐校验）
    minLevelInPark: 3,
    // 野猫领养价格（洗干净的费用）
    strayAdoptPrice: 50
  };

  // 领养名额配置
  const ADOPTION_CONFIG = {
    // 初始领养名额（每人默认可以领养几只普通猫）
    baseSlots: 1,
    // 累计签到多少天增加一个领养名额
    extraSlotAtCheckinDays: 30,
    // 最多领养名额
    maxSlots: 10,
    // 稀有品种只能繁育获得
    rareOnlyFromBreeding: true
  };

  // 蛋蛋世界用户的猫咪（模拟真实用户数据）
  // 这些是蛋蛋世界里其他用户养的猫咪
  const MOCK_PARK_CATS = [
    { catId: 'orange',      owner: '蛋蛋爱学习',  userId: 'u001', school: '郑州大学', level: 5, maturity: 'adult' },
    { catId: 'ragdoll',     owner: '棉花糖蛋',    userId: 'u002', school: '南方科技大学', level: 6, maturity: 'adult' },
    { catId: 'tabby',       owner: '虎斑蛋爸',    userId: 'u003', school: '清华大学', level: 4, maturity: 'adult' },
    { catId: 'black',       owner: '夜行者蛋',    userId: 'u004', school: '北京大学', level: 7, maturity: 'adult' },
    { catId: 'munchkin',    owner: '小短腿蛋',    userId: 'u005', school: '复旦大学', level: 5, maturity: 'adult' },
    { catId: 'russianblue', owner: '蓝胖子蛋',    userId: 'u006', school: '上海交通大学', level: 6, maturity: 'adult' },
    { catId: 'tuxedo',      owner: '奶牛控蛋',    userId: 'u007', school: '浙江大学', level: 4, maturity: 'adult' },
    { catId: 'white',       owner: '雪团团蛋',    userId: 'u008', school: '南京大学', level: 5, maturity: 'adult' },
    { catId: 'calico',      owner: '三花妹蛋',    userId: 'u009', school: '武汉大学', level: 3, maturity: 'adult' },
    { catId: 'devon',       owner: '卷毛党蛋',    userId: 'u010', school: '中国科学技术大学', level: 6, maturity: 'adult' },
    { catId: 'maine',       owner: '森林王蛋',    userId: 'u011', school: '哈尔滨工业大学', level: 7, maturity: 'adult' },
    { catId: 'lion',        owner: '狮子王蛋',    userId: 'u012', school: '西安交通大学', level: 6, maturity: 'adult' },
    { catId: 'sphynx',      owner: '无毛控蛋',    userId: 'u013', school: '华中科技大学', level: 8, maturity: 'adult' },
    { catId: 'bengal',      owner: '豹子头蛋',    userId: 'u014', school: '同济大学', level: 7, maturity: 'adult' },
    { catId: 'orange',      owner: '橘子酱蛋',    userId: 'u015', school: '北京航空航天大学', level: 5, maturity: 'adult' },
    { catId: 'ragdoll',     owner: '布偶控蛋',    userId: 'u016', school: '中山大学', level: 6, maturity: 'adult' },
    { catId: 'munchkin',    owner: '矮脚萌蛋',    userId: 'u017', school: '华南理工大学', level: 4, maturity: 'adult' },
    { catId: 'tabby',       owner: '狸花蛋',      userId: 'u018', school: '大连理工大学', level: 5, maturity: 'adult' },
    { catId: 'devon',       owner: '精灵蛋',      userId: 'u019', school: '东南大学', level: 6, maturity: 'adult' },
    { catId: 'black',       owner: '玄猫蛋',      userId: 'u020', school: '天津大学', level: 5, maturity: 'adult' }
  ];

  // 蛋蛋世界用户（用于搜索送猫）
  const MOCK_USERS = [
    { userId: 'u001', name: '蛋蛋爱学习', school: '郑州大学', avatar: '📚' },
    { userId: 'u002', name: '棉花糖蛋', school: '南方科技大学', avatar: '🍬' },
    { userId: 'u003', name: '虎斑蛋爸', school: '清华大学', avatar: '🐯' },
    { userId: 'u004', name: '夜行者蛋', school: '北京大学', avatar: '🌙' },
    { userId: 'u005', name: '小短腿蛋', school: '复旦大学', avatar: '🦴' },
    { userId: 'u006', name: '蓝胖子蛋', school: '上海交通大学', avatar: '🐳' },
    { userId: 'u007', name: '奶牛控蛋', school: '浙江大学', avatar: '🐮' },
    { userId: 'u008', name: '雪团团蛋', school: '南京大学', avatar: '❄️' },
    { userId: 'u009', name: '三花妹蛋', school: '武汉大学', avatar: '🌸' },
    { userId: 'u010', name: '卷毛党蛋', school: '中国科学技术大学', avatar: '🌀' },
    { userId: 'u011', name: '森林王蛋', school: '哈尔滨工业大学', avatar: '🌲' },
    { userId: 'u012', name: '狮子王蛋', school: '西安交通大学', avatar: '🦁' },
    { userId: 'u013', name: '无毛控蛋', school: '华中科技大学', avatar: '✨' },
    { userId: 'u014', name: '豹子头蛋', school: '同济大学', avatar: '🐆' },
    { userId: 'u015', name: '橘子酱蛋', school: '北京航空航天大学', avatar: '🍊' },
    { userId: 'u016', name: '布偶控蛋', school: '中山大学', avatar: '🧸' },
    { userId: 'u017', name: '矮脚萌蛋', school: '华南理工大学', avatar: '🐾' },
    { userId: 'u018', name: '狸花蛋', school: '大连理工大学', avatar: '🐟' },
    { userId: 'u019', name: '精灵蛋', school: '东南大学', avatar: '🧚' },
    { userId: 'u020', name: '玄猫蛋', school: '天津大学', avatar: '🔮' },
    { userId: 'u021', name: '学霸蛋', school: '清华大学', avatar: '🎓' },
    { userId: 'u022', name: '摸鱼蛋', school: '武汉大学', avatar: '🐠' },
    { userId: 'u023', name: '奶茶蛋', school: '浙江大学', avatar: '🧋' },
    { userId: 'u024', name: '熬夜蛋', school: '复旦大学', avatar: '🦉' },
    { userId: 'u025', name: '干饭蛋', school: '上海交通大学', avatar: '🍚' },
    { userId: 'u026', name: '躺平蛋', school: '南京大学', avatar: '🛌' },
    { userId: 'u027', name: '卷王蛋', school: '北京大学', avatar: '📖' },
    { userId: 'u028', name: '社恐蛋', school: '中国科学技术大学', avatar: '🙈' },
    { userId: 'u029', name: '健身蛋', school: '北京体育大学', avatar: '💪' },
    { userId: 'u030', name: '音乐蛋', school: '中央音乐学院', avatar: '🎵' },
    { userId: 'u031', name: '画画蛋', school: '中央美术学院', avatar: '🎨' },
    { userId: 'u032', name: '编程蛋', school: '浙江大学', avatar: '💻' },
    { userId: 'u033', name: '摄影蛋', school: '复旦大学', avatar: '📷' },
    { userId: 'u034', name: '游戏蛋', school: '上海交通大学', avatar: '🎮' },
    { userId: 'u035', name: '铲屎蛋', school: '华中农业大学', avatar: '🐈' },
  ];

  // ============================================
  // 稀有度配置（用于概率表展示和UI显示）
  // ============================================
  const RARITY_CONFIG = {
    common: { level: 0, name: '普通', color: '#757575', bgColor: '#F5F5F5' },
    rare3:  { level: 3, name: '稀有', color: '#FF9800', bgColor: '#FFF3E0' },
    rare4:  { level: 4, name: '珍稀', color: '#2196F3', bgColor: '#E3F2FD' },
    rare5:  { level: 5, name: '传说', color: '#E91E63', bgColor: '#FCE4EC' }
  };

  // ============================================
  // 猫咪栏位配置
  // ============================================
  const PEN_CONFIG = {
    initialLimit: 3,           // 初始栏位数量
    signDaysPerSlot: 7,        // 每累计签到N天增加1个栏位
    maxLimit: 20,              // 最大栏位上限
    donateReward: 20           // 送给家园的金币奖励
  };

  // ============================================
  // 新手任务配置
  // ============================================
  const NEWBIE_TASKS = [
    {
      id: 'newbie_post_tucao',
      name: '发布大学吐槽',
      desc: '在蛋蛋世界发布一条大学吐槽',
      reward: '可在猫咪公园领养1只流浪猫',
      rewardType: 'stray_adoption',
      checkKey: 'hasPostedTucao'
    },
    {
      id: 'newbie_post_or_claim_task',
      name: '发布或认领任务',
      desc: '在蛋蛋世界发布任务或认领任务',
      reward: '永久解锁「猫咪家园」',
      rewardType: 'unlock_home',
      checkKey: 'hasPostedOrClaimedTask'
    }
  ];

  // ============================================
  // 每日任务配置
  // ============================================
  const DAILY_TASKS = [
    {
      id: 'daily_invite',
      name: '邀请好友',
      desc: '邀请新用户加入蛋蛋世界',
      checkKey: 'dailyInviteCount',
      target: 1,
      reward: { type: 'random_food_toy', count: 2 }
    },
    {
      id: 'daily_gossip',
      name: '发布八卦打听',
      desc: '发布一条八卦打听',
      checkKey: 'dailyGossipCount',
      target: 1,
      reward: { type: 'random_food_toy', count: 2 }
    },
    {
      id: 'daily_post_task',
      name: '发布任务',
      desc: '发布一个任务',
      checkKey: 'dailyPostTaskCount',
      target: 1,
      reward: { type: 'random_food_toy', count: 2 }
    },
    {
      id: 'daily_claim_task',
      name: '认领任务',
      desc: '认领一个任务',
      checkKey: 'dailyClaimTaskCount',
      target: 1,
      reward: { type: 'random_food_toy', count: 2 }
    }
  ];

  // ============================================
  // 猫咪家园配置
  // ============================================
  const HOME_CONFIG = {
    listingFee: 0,              // 上架手续费（蛋蛋币）
    minPrice: 30,               // 最低定价
    maxPrice: 10000,            // 最高定价
    maxListingsPerUser: 5,      // 每人最多同时上架数量
    rareMinPriceMultiplier: {   // 稀有品种最低价格倍数
      rare3: 3,
      rare4: 5,
      rare5: 8
    }
  };

  // ============================================
  // 繁育系统配置更新
  // ============================================
  // 覆盖原 BREEDING_CONFIG 的部分字段
  const BREEDING_CONFIG_EXTRA = {
    minIntimacyLevel: 3,        // 最低亲密度等级（代替成熟度）
    selfBreedingKittens: 1,     // 自繁育生几只
    parkBreedingKittens: 2,     // 公园繁育生几只
    inbreedingGenerations: 3,   // 几代以内算近亲
    requireOppositeGender: true, // 需要异性才能繁育
    femaleCooldownDays: 7       // 母猫繁育冷却时间（天），公猫无限制
  };

  // ============================================
  // 专注模式奖励增强配置
  // ============================================
  const FOCUS_PET_REWARDS = {
    // 不同时长档位对应的奖励等级（影响食物玩具的价值）
    tiers: [
      { minutes: 15,  foodTier: 1, toyTier: 1, intimacy: 3 },
      { minutes: 25,  foodTier: 2, toyTier: 1, intimacy: 5 },
      { minutes: 45,  foodTier: 2, toyTier: 2, intimacy: 8 },
      { minutes: 60,  foodTier: 3, toyTier: 2, intimacy: 12 },
      { minutes: 90,  foodTier: 3, toyTier: 3, intimacy: 15 },
      { minutes: 120, foodTier: 4, toyTier: 3, intimacy: 20 }
    ]
  };

  // ===== 冒险系统配置 =====
  const ADVENTURE_CONFIG = {
    durationMinutes: 180, // 冒险时长：3小时
    locations: [
      {
        id: 'forest',
        name: '神秘森林',
        icon: '🌲',
        desc: '茂密的森林里藏着无数秘密和宝藏',
        intro: '你的猫咪决定去森林深处探险，那里据说有古老的树洞和神秘的光...',
        choices: [
          {
            id: 'path',
            question: '走到岔路口，左边是鲜花小径，右边是苔藓石阶，走哪边？',
            options: [
              { id: 'flower', text: '🌸 鲜花小径（闻起来甜甜的）' },
              { id: 'moss', text: '🍄 苔藓石阶（看起来很神秘）' }
            ]
          },
          {
            id: 'encounter',
            question: '森林深处遇到一只老松鼠，它在找东西，你要？',
            options: [
              { id: 'help', text: '🤝 帮忙一起找（要花点时间）' },
              { id: 'watch', text: '👀 悄悄跟着看看（省时间）' }
            ]
          }
        ],
        // 根据选择组合给奖励
        rewards: {
          'flower+help': {
            story: '你沿着鲜花小径走，遇到了老松鼠，帮它找到了丢失的橡果。松鼠感激地送了你一大包坚果和一个松果玩具！',
            foods: [{ id: 'fish', count: 2 }, { id: 'chicken', count: 1 }],
            toys: [{ id: 'ball', count: 1 }],
            intimacy: 15
          },
          'flower+watch': {
            story: '你沿着鲜花小径走，悄悄跟着老松鼠，发现了它藏食物的秘密基地！你拿了一些就悄悄溜了。',
            foods: [{ id: 'fish', count: 3 }],
            toys: [],
            intimacy: 5
          },
          'moss+help': {
            story: '你沿苔藓石阶往上，帮老松鼠找到了橡果。松鼠带你去看了它收藏的古老羽毛玩具！',
            foods: [{ id: 'chicken', count: 2 }],
            toys: [{ id: 'feather', count: 1 }, { id: 'mouse', count: 1 }],
            intimacy: 18
          },
          'moss+watch': {
            story: '你沿苔藓石阶往上，跟着松鼠发现了一个闪闪发光的洞穴，里面有奇怪的石头玩具。',
            foods: [{ id: 'fish', count: 1 }],
            toys: [{ id: 'ball', count: 2 }],
            intimacy: 8
          }
        }
      },
      {
        id: 'city',
        name: '城市冒险',
        icon: '🏙️',
        desc: '繁华城市的街角巷尾，充满了未知的奇遇',
        intro: '你的猫咪溜进了城市，那里有热闹的集市、神秘的后巷，还有很多鱼店...',
        choices: [
          {
            id: 'path',
            question: '到了城市，先去哪边转转？',
            options: [
              { id: 'market', text: '🐟 鱼市（闻起来超棒）' },
              { id: 'alley', text: '🌙 后巷（好像有什么动静）' }
            ]
          },
          {
            id: 'encounter',
            question: '遇到一只流浪猫在抢小朋友的零食，你要？',
            options: [
              { id: 'share', text: '🥰 把自己的分它一点' },
              { id: 'chase', text: '💨 赶紧溜走保命要紧' }
            ]
          }
        ],
        rewards: {
          'market+share': {
            story: '在鱼市你偷了几条鱼，路上遇到流浪猫，好心分了它一些。它告诉你一个藏猫粮的秘密地点！',
            foods: [{ id: 'fish', count: 2 }, { id: 'chicken', count: 2 }],
            toys: [{ id: 'mouse', count: 1 }],
            intimacy: 12
          },
          'market+chase': {
            story: '在鱼市大丰收！赶紧溜之大吉，满载而归~',
            foods: [{ id: 'fish', count: 4 }],
            toys: [],
            intimacy: 6
          },
          'alley+share': {
            story: '在后巷遇到流浪猫，你们分享了食物，成为了朋友。它送你一个从人类那"借"来的毛线球！',
            foods: [{ id: 'chicken', count: 1 }],
            toys: [{ id: 'ball', count: 1 }, { id: 'feather', count: 1 }],
            intimacy: 20
          },
          'alley+chase': {
            story: '后巷太危险了，你撒腿就跑。慌乱中撞到一个纸箱，里面居然有个玩具！',
            foods: [{ id: 'fish', count: 1 }],
            toys: [{ id: 'mouse', count: 1 }],
            intimacy: 3
          }
        }
      },
      {
        id: 'beach',
        name: '海边探险',
        icon: '🌊',
        desc: '金色沙滩和蔚蓝大海，等着被发现的秘密',
        intro: '你的猫咪来到了海边，咸咸的海风里有鱼的味道，还有贝壳的闪光...',
        choices: [
          {
            id: 'path',
            question: '到了海边，先去哪里？',
            options: [
              { id: 'sand', text: '🏖️ 沙滩（有好多贝壳）' },
              { id: 'rock', text: '🪨 礁石区（有小螃蟹）' }
            ]
          },
          {
            id: 'encounter',
            question: '发现一个被冲上岸的漂流瓶，里面好像有东西！',
            options: [
              { id: 'open', text: '📜 打开看看（万一是藏宝图）' },
              { id: 'leave', text: '🚶 算了不管（可能是陷阱）' }
            ]
          }
        ],
        rewards: {
          'sand+open': {
            story: '你在沙滩上捡到漂流瓶，里面真的有一张藏宝图！按照地图挖到了一箱鱼干和一个贝壳玩具！',
            foods: [{ id: 'fish', count: 3 }, { id: 'chicken', count: 1 }],
            toys: [{ id: 'ball', count: 1 }, { id: 'feather', count: 1 }],
            intimacy: 16
          },
          'sand+leave': {
            story: '你没管漂流瓶，在沙滩上晒了一下午太阳，捡了一些漂亮的贝壳就回家了。',
            foods: [{ id: 'fish', count: 2 }],
            toys: [{ id: 'ball', count: 1 }],
            intimacy: 10
          },
          'rock+open': {
            story: '在礁石区你抓到了好多小螃蟹，还打开了漂流瓶——是一家鱼店的优惠券！',
            foods: [{ id: 'fish', count: 2 }, { id: 'chicken', count: 2 }],
            toys: [{ id: 'mouse', count: 1 }],
            intimacy: 14
          },
          'rock+leave': {
            story: '你在礁石区抓了一下午螃蟹，玩得很开心。虽然没什么战利品，但心情超棒！',
            foods: [{ id: 'fish', count: 1 }],
            toys: [{ id: 'feather', count: 1 }],
            intimacy: 12
          }
        }
      }
    ]
  };

  return {
    CATS,
    FOODS,
    TOYS,
    ITEMS,
    FOCUS_REWARDS,
    BLIND_BOX,
    DAILY_CHECKIN,
    LEVEL_CONFIG,
    CAT_CONFIG,
    INITIAL_COINS,
    INITIAL_UNLOCKED,
    BREEDING_CONFIG,
    BREEDING_TABLE,
    RARITY_BREEDS,
    CAT_PARK_CONFIG,
    MOCK_PARK_CATS,
    MOCK_USERS,
    ADOPTION_CONFIG,
    RARITY_CONFIG,
    PEN_CONFIG,
    NEWBIE_TASKS,
    DAILY_TASKS,
    HOME_CONFIG,
    BREEDING_CONFIG_EXTRA,
    FOCUS_PET_REWARDS,
    ADVENTURE_CONFIG,
  };
})();
