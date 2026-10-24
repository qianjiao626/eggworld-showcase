// ============================================
// 猫咪引擎 - 状态管理、领养、专注计时
// ============================================

window.PET_ENGINE = (function() {
  const { CATS, FOODS, TOYS, ITEMS, FOCUS_REWARDS, BLIND_BOX, CAT_CONFIG, INITIAL_UNLOCKED,
          BREEDING_CONFIG, BREEDING_CONFIG_EXTRA, BREEDING_TABLE, RARITY_BREEDS, CAT_PARK_CONFIG,
          MOCK_PARK_CATS, MOCK_USERS, ADOPTION_CONFIG, PEN_CONFIG, HOME_CONFIG,
          NEWBIE_TASKS, DAILY_TASKS, FOCUS_PET_REWARDS, RARITY_CONFIG } = window.PET_DATA;

  const SAVE_KEY = 'eggworld_cat_save';

  let state = null;

  // 服务端公园场景猫（他人用户猫）：运行时缓存，不落档。
  // 每次进公园 / 轮询由 bridge 从 GET /api/cat-park/scene 拉取后写入（setParkSceneCats）。
  // 场景固定展示 = 2 只本地流浪猫（抽卡领养玩法，不动）+ 这 3 只他人用户猫；
  // 玩家自己放到公园的猫不进入自己的场景（仅对其他用户可见）。
  let serverSceneCats = [];

  // ===== 初始化 =====
  function init() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      try {
        state = JSON.parse(saved);
        // 数据迁移：补齐旧版本缺少的字段
        migrateState();
      } catch (e) {
        state = createInitialState();
      }
    } else {
      state = createInitialState();
    }
    // 离线更新
    updateAllCats();
    save();
  }

  // 数据迁移：兼容旧版本存档
  function migrateState() {
    const now = Date.now();
    
    // 签到系统
    if (!state.checkin) {
      state.checkin = {
        lastCheckinDate: '',
        streakDays: 0,
        totalCheckins: 0
      };
    }
    
    // 成熟度等级系统（每只猫）- 替换原亲密度系统
    state.cats.forEach(cat => {
      // 基础状态字段（旧版本可能缺少）
      if (cat.hunger === undefined || cat.hunger === null) cat.hunger = 80;
      if (cat.happiness === undefined || cat.happiness === null) cat.happiness = 80;
      if (cat.energy === undefined || cat.energy === null) cat.energy = 100;
      if (cat.poopCount === undefined) cat.poopCount = 0;
      if (cat.lastPoopTime === undefined) cat.lastPoopTime = now;
      if (cat.isSleeping === undefined) cat.isSleeping = false;
      if (cat.gender === undefined) cat.gender = Math.random() < 0.5 ? 'male' : 'female';
      if (cat.maturity === undefined) cat.maturity = cat.intimacy || 50;
      if (cat.maturityLevel === undefined) {
        // 根据亲密度推算成熟等级
        if ((cat.level || 1) >= 3) cat.maturityLevel = 3; // 成年猫
        else if ((cat.level || 1) >= 2) cat.maturityLevel = 2; // 幼猫
        else cat.maturityLevel = 1; // 奶猫
      }
      if (cat.totalMaturity === undefined) cat.totalMaturity = cat.totalIntimacy || 50;
      if (cat.canBreed === undefined) cat.canBreed = cat.maturityLevel >= 3;
      if (cat.breedingCount === undefined) cat.breedingCount = 0;
      if (cat.lastBreedingTime === undefined) cat.lastBreedingTime = 0;
      if (cat.isNewborn === undefined) cat.isNewborn = false;
      if (cat.birthTime === undefined) cat.birthTime = cat.adoptedTime || now;
      if (cat.parentIds === undefined) cat.parentIds = [];
      if (cat.parentUids === undefined) cat.parentUids = [];
      if (cat.uid === undefined) cat.uid = uniqueCatUid(cat.adoptedTime || now);
      if (cat.childrenUids === undefined) cat.childrenUids = [];
      // 历任主人记录
      if (cat.ownerHistory === undefined) {
        cat.ownerHistory = [];
        // 如果有ownerName，说明是领养的公园猫，把原主人加入历史
        if (cat.ownerName && cat.ownerName !== state.userName) {
          cat.ownerHistory.push({
            name: cat.ownerName,
            time: cat.adoptedTime || cat.birthTime || now,
            type: 'adopt'
          });
        }
      }
      // 兼容旧字段（好感度系统与成熟度系统分离）
      // 旧版本中 level 实际是成熟度等级，不是好感度等级
      if (cat.intimacy === undefined) {
        // 旧数据：用成熟度值的一部分作为初始好感度（最多给100，相当于Lv.2）
        cat.intimacy = Math.min(100, cat.maturity || 0);
      }
      // 好感度等级唯一由好感度值按权威阈值重算（自愈：市场购买曾把成熟度等级误写进 level，
      // 导致 getLevelInfo 出现 intimacy-下一级阈值 为负的显示）
      sanitizeIntimacyFields(cat);
    });

    // 繁育记录
    if (state.breedingHistory === undefined) state.breedingHistory = [];

    // 「用户猫上公园」的唯一权威标志是猫实例上的 inPark（uid 级，服务端 reconcile 读它投影公园名录）。
    // 旧版影子字段 catsInPark 存数组下标，删猫/换设备后会漂移导致「公园里显示的猫对不上」，
    // 2026-10-14 废除：老档按下标补写一次 inPark（仅当猫自身没有该标志），随后删除影子字段，
    // 随下一次回写自愈；新档不再包含该字段。
    if (Array.isArray(state.catsInPark)) {
      state.cats.forEach(function (c, i) {
        if (c.inPark === undefined) c.inPark = state.catsInPark.indexOf(i) >= 0;
      });
      delete state.catsInPark;
    }
    // 2026-10-12 补好感度门槛：Lv.3 才能放公园（与繁育门槛同源）；门槛上线前
    // 放上去的低等级猫在这里一并收回家，服务端 reconcile 随回写自动下架。
    enforceParkLevelGate();

    // 额外领养名额（签到第3天等奖励发放，独立于累计签到天数计算）
    if (state.adoptionBonusSlots === undefined) state.adoptionBonusSlots = 0;

    // 公园刷新次数（每2小时恢复1次，最多储存5次）
    if (!state.parkRefresh) {
      state.parkRefresh = {
        count: CAT_PARK_CONFIG.refreshMaxCount,
        lastRegenTime: Date.now()
      };
    }

    // 公园当前批次（野猫+蛋蛋用户的猫，持久化，点"换一批"才重新抽）
    if (!state.parkBatch) state.parkBatch = null;

    // 领养名额系统
    if (state.adoptionSlots === undefined) {
      // 计算可用领养名额
      const totalCheckinDays = state.checkin?.totalDays || 0;
      const extraSlots = Math.floor(totalCheckinDays / ADOPTION_CONFIG.extraSlotAtCheckinDays);
      state.adoptionSlots = Math.min(ADOPTION_CONFIG.maxSlots, ADOPTION_CONFIG.baseSlots + extraSlots + (state.adoptionBonusSlots || 0));
    }
    // 已用掉的领养名额（领养了几只普通猫）
    if (state.adoptedCount === undefined) {
      // 从已有猫咪中统计普通品种数量
      state.adoptedCount = state.cats.filter(cat => {
        const catData = CATS.find(c => c.id === cat.catId);
        return catData && catData.rarity === 'common';
      }).length;
    }
    
    // 累计统计
    if (state.totalCoinsEarned === undefined) state.totalCoinsEarned = 0;
    if (state.totalFocusMinutes === undefined) state.totalFocusMinutes = 0;
    
    // 专注系统
    if (!state.focus) {
      state.focus = {
        isActive: false,
        startTime: 0,
        totalMinutes: 0,
        targetMinutes: 25,
        earnedCoins: 0,
        completedSessions: 0
      };
    }

    // 送猫记录
    if (!state.sentCats) state.sentCats = [];
    if (!state.receivedCats) state.receivedCats = [];

    // 性别系统：为旧猫补充随机性别
    state.cats.forEach(cat => {
      if (!cat.gender) {
        cat.gender = Math.random() < 0.5 ? 'male' : 'female';
      }
    });

    // 家园上架列表
    if (!state.homeListings) state.homeListings = [];

    // 新手任务
    if (!state.newbieTasks) state.newbieTasks = {};

    // 每日任务
    if (!state.dailyTasks) state.dailyTasks = {};
    if (!state.lastDailyResetDate) state.lastDailyResetDate = '';
  }

  function createInitialState() {
    const now = Date.now();
    const cats = [];

    // 初始赠送的猫咪
    INITIAL_UNLOCKED.forEach(catId => {
      cats.push(createCat(catId, now));
    });

    return {
      coins: 0,   // P2 金币合并：coins 是真实蛋蛋币余额的镜像，由 bridge 从服务端拉取覆盖；不再有默认赠送
      cats: cats,
      currentCatIndex: 0,
      inventory: {
        foods: {},
        toys: {},
        items: {}
      },
      focus: {
        isActive: false,
        startTime: 0,
        totalMinutes: 0,
        targetMinutes: 25,
        earnedCoins: 0,
        completedSessions: 0
      },
      checkin: {
        lastCheckinDate: '',     // 上次签到日期 YYYY-MM-DD
        streakDays: 0,           // 连续签到天数
        totalCheckins: 0         // 累计签到次数
      },
      breedingHistory: [],       // 繁育记录
      adoptionSlots: ADOPTION_CONFIG.baseSlots,  // 可用领养名额
      adoptionBonusSlots: 0,     // 额外领养名额（签到奖励等）
      adoptedCount: 0,           // 已领养普通猫数量
      parkRefresh: {             // 公园刷新次数（每2小时+1，上限5）
        count: CAT_PARK_CONFIG.refreshMaxCount,
        lastRegenTime: now
      },
      parkBatch: null,           // 公园当前批次（刷新才重抽）
      lastUpdateTime: now,
      totalFocusMinutes: 0,
      totalCoinsEarned: 0,
      // 家园上架列表
      homeListings: [],
      // 新手任务
      newbieTasks: {},
      // 每日任务
      dailyTasks: {},
      lastDailyResetDate: ''
    };
  }

  function createCat(catId, now, options = {}) {
    const catData = CATS.find(c => c.id === catId);
    const isKitten = options.isKitten || false;
    // 生成唯一实例ID（时间戳+随机数，与本档已有猫去重，保证不重复）
    const uid = options.uid || uniqueCatUid(now);
    // 性别：随机 male 或 female
    const gender = options.gender || (Math.random() < 0.5 ? 'male' : 'female');
    return {
      uid: uid,              // 唯一实例ID（用于族谱追溯）
      catId: catId,
      name: catData.name,
      gender: gender,        // 性别：'male'(弟弟) / 'female'(妹妹)
      hunger: isKitten ? 60 : 80,
      happiness: isKitten ? 60 : 80,
      energy: isKitten ? 80 : 100,
      poopCount: 0,
      lastPoopTime: now,
      isSleeping: false,
      sleepStartTime: 0,
      adoptedTime: now,
      lastUpdateTime: now,
      totalPlayMinutes: 0,
      totalFeedCount: 0,
      // 成熟度系统（年龄成长：奶猫→幼猫→成年）
      maturity: isKitten ? 0 : 50,  // 成熟度值 0-100
      maturityLevel: isKitten ? 1 : 3, // 成熟等级：1=奶猫, 2=幼猫, 3=成年猫
      totalMaturity: isKitten ? 0 : 50, // 累计成熟度
      // 好感度系统（玩家与猫的感情：Lv.1~Lv.10）
      // 新领养的猫好感度从0开始，需要通过喂食、玩耍、陪伴来培养
      intimacy: 0,           // 好感度值
      level: 1,              // 好感度等级（Lv.1起步）
      totalIntimacy: 0,      // 累计好感度
      // 繁育相关
      canBreed: !isKitten,  // 是否可以繁育
      breedingCount: 0,     // 繁育次数
      lastBreedingTime: 0,  // 上次繁育时间
      // 小猫出生信息
      isNewborn: isKitten,  // 是否是新生小猫
      birthTime: isKitten ? now : 0,
      parentIds: options.parentIds || [],     // 父母品种ID（兼容旧数据）
      parentUids: options.parentUids || [],   // 父母实例ID（用于族谱追溯）
      parentOwnerNames: options.parentOwnerNames || [], // 父母主人名称
      ownerName: options.ownerName || '我',    // 猫的主人名称
      childrenUids: options.childrenUids || [], // 子女实例ID
      inPark: false              // 是否在公园（uid 级权威标志，服务端 reconcile 投影公园名录读它）
    };
  }

  // 实例 uid 防碰撞：uid 是 park_cats 唯一键 (owner_user_id, cat_uid) 的成员，
  // 同毫秒连续创建若随机段撞号，两只猫会在公园投影里塌缩成一行 → 生成时与本档已有猫去重重摇。
  function uniqueCatUid(now) {
    let uid = 'cat_' + now + '_' + Math.random().toString(36).substr(2, 6);
    while (state.cats.some(c => c.uid === uid)) {
      uid = 'cat_' + now + '_' + Math.random().toString(36).substr(2, 6);
    }
    return uid;
  }

  // ===== 保存/加载 =====
  function save() {
    state.lastUpdateTime = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    /* 迁移到蛋蛋世界：可选服务端同步钩子（js/cat-cabin-bridge.js 注入），
       每次存档变化时通知同步层做防抖回写；未注入时零开销。 */
    if (typeof window.__catCabinOnSave === 'function') window.__catCabinOnSave(state);
  }

  function getState() {
    return state;
  }

  function getCurrentCat() {
    return state.cats[state.currentCatIndex];
  }

  function getCatData(catId) {
    return CATS.find(c => c.id === catId);
  }

  function selectCat(index) {
    if (index >= 0 && index < state.cats.length) {
      state.currentCatIndex = index;
      save();
      return true;
    }
    return false;
  }

  // ===== 领养猫咪 =====
  function adoptCat(catId) {
    const catData = CATS.find(c => c.id === catId);
    if (!catData) return { success: false, msg: '猫咪不存在' };

    // 检查是否已领养
    if (state.cats.some(c => c.catId === catId)) {
      return { success: false, msg: '已经领养这只猫咪啦~' };
    }

    if (!spendCoins(catData.price, 'adopt', catId)) {
      return { success: false, msg: '蛋蛋币不够哦~' };
    }
    const newCat = createCat(catId, Date.now());
    state.cats.push(newCat);
    state.currentCatIndex = state.cats.length - 1;

    save();
    return { success: true, msg: `🎉 成功领养了${catData.name}！`, cat: newCat };
  }

  function isCatAdopted(catId) {
    return state.cats.some(c => c.catId === catId);
  }

  // 测试模式免费领养 adoptCatFree 已移除（P2 金币合并后绕过扣费即增发漏洞）

  // 根据活力获取互动收益倍率
  // 活力越高，互动获得的亲密度和心情越多
  function getEnergyBonus(energy) {
    if (energy >= 80) return CAT_CONFIG.energyBonusHigh || 1.5;
    if (energy >= 30) return CAT_CONFIG.energyBonusMid || 1.0;
    return CAT_CONFIG.energyBonusLow || 0.6;
  }

  // ===== 喂食 =====
  function feedCat(catIndex, foodId) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    const food = FOODS.find(f => f.id === foodId);
    if (!food) return { success: false, msg: '食物不存在' };

    // 检查背包
    if (!state.inventory.foods[foodId] || state.inventory.foods[foodId] <= 0) {
      return { success: false, msg: '没有这个食物啦~' };
    }

    if (cat.isSleeping) {
      return { success: false, msg: '猫咪在睡觉呢，别打扰它~' };
    }

    state.inventory.foods[foodId]--;
    cat.hunger = Math.min(CAT_CONFIG.maxHunger, cat.hunger + food.hunger);
    
    // 心情收益受活力影响
    const energyBonus = getEnergyBonus(cat.energy);
    const happinessGain = Math.floor(food.happiness * energyBonus);
    cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + happinessGain);
    cat.totalFeedCount++;
    
    // 喂食增加亲密度
    const intimacyGain = Math.floor((food.intimacy || 2) * energyBonus);
    const intimacyLevelUp = addIntimacy(catIndex, intimacyGain);
    
    // 喂食增加成熟度（按食物价格计算，最低5点，受活力加成）
    const baseMaturity = Math.max(5, Math.floor(food.price / 2));
    const maturityGain = Math.floor(baseMaturity * energyBonus);
    const levelUp = addMaturity(catIndex, maturityGain);

    // 吃完产生便便的概率（简化处理：每次喂食有30%概率产生1坨）
    if (Math.random() < 0.3 && cat.poopCount < CAT_CONFIG.maxPoop) {
      cat.poopCount++;
    }

    save();
    return { 
      success: true, 
      msg: `吃了${food.name}，好满足~`, 
      maturityGain: maturityGain, 
      levelUp: levelUp,
      intimacyGain: intimacyGain,
      intimacyLevelUp: intimacyLevelUp,
      energyBonus: energyBonus
    };
  }

  // ===== 玩耍 =====
  function playWithCat(catIndex, toyId) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    const toy = TOYS.find(t => t.id === toyId);
    if (!toy) return { success: false, msg: '玩具不存在' };

    // 检查背包
    if (!state.inventory.toys[toyId] || state.inventory.toys[toyId] <= 0) {
      return { success: false, msg: '没有这个玩具啦~' };
    }

    if (cat.isSleeping) {
      return { success: false, msg: '猫咪在睡觉呢，别打扰它~' };
    }

    // 活力太低也能玩，只是收益降低（移除了活力门槛）
    const energyBonus = getEnergyBonus(cat.energy);

    state.inventory.toys[toyId]--;
    const bonuses = getItemBonuses();
    const happinessGain = Math.floor(toy.happiness * bonuses.playBonus * energyBonus);
    cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + happinessGain);
    cat.energy = Math.max(0, cat.energy - 10);
    cat.hunger = Math.max(0, cat.hunger - 5);
    cat.totalPlayMinutes += 5;
    
    // 玩耍增加亲密度
    const intimacyGain = Math.floor((toy.intimacy || 3) * energyBonus * bonuses.playBonus);
    const intimacyLevelUp = addIntimacy(catIndex, intimacyGain);
    
    // 玩耍增加成熟度（按玩具价格计算，最低8点，受活力加成）
    const baseMaturity = Math.max(8, Math.floor(toy.price * 0.8));
    const maturityGain = Math.floor(baseMaturity * energyBonus * bonuses.playBonus);
    const levelUp = addMaturity(catIndex, maturityGain);

    save();
    return { 
      success: true, 
      msg: `和${toy.name}玩得好开心！${bonuses.playBonus > 1 ? '（猫爬架加成✨）' : ''}${energyBonus > 1 ? '（活力满满✨）' : energyBonus < 1 ? '（有点累了...）' : ''}`,
      maturityGain: maturityGain,
      levelUp: levelUp,
      intimacyGain: intimacyGain,
      intimacyLevelUp: intimacyLevelUp,
      energyBonus: energyBonus
    };
  }

  // ===== 抚摸/逗猫 =====
  const DAILY_PET_LIMIT = 20; // 每日逗猫上限次数
  function petCat(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    if (cat.isSleeping) {
      return { success: false, msg: '猫咪在睡觉呢，别打扰它~' };
    }

    // 每日逗猫次数限制
    const today = new Date().toDateString();
    if (!cat.dailyPetDate || cat.dailyPetDate !== today) {
      cat.dailyPetDate = today;
      cat.dailyPetCount = 0;
    }
    if (cat.dailyPetCount >= DAILY_PET_LIMIT) {
      // 达到上限后，逗猫只加一点心情，不加亲密度
      const energyBonus = getEnergyBonus(cat.energy);
      const happinessGain = Math.floor(2 * energyBonus);
      cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + happinessGain);
      cat.energy = Math.max(0, cat.energy - 1);
      save();
      return { 
        success: true, 
        msg: '今天已经撸够啦~猫咪满足地眯了眯眼 😌', 
        levelUp: null,
        maturityGain: 0,
        isLimitReached: true
      };
    }

    const energyBonus = getEnergyBonus(cat.energy);
    const happinessGain = Math.floor(5 * energyBonus);
    cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + happinessGain);
    cat.energy = Math.max(0, cat.energy - 2);
    
    // 逗猫增加亲密度（亲密等级，玩家与猫的羁绊）
    const intimacyGain = Math.floor(3 * energyBonus);
    const levelUp = addIntimacy(catIndex, intimacyGain);
    cat.dailyPetCount++;
    
    save();
    return { 
      success: true, 
      msg: '咕噜咕噜~ 好舒服~', 
      levelUp: levelUp,
      intimacyGain: intimacyGain,
      energyBonus: energyBonus,
      remainingPets: DAILY_PET_LIMIT - cat.dailyPetCount
    };
  }

  // ===== 亲密度与等级系统（兼容旧接口） =====
  // 把任意值钳到 [lo,hi] 的整数；非数字/NaN/Infinity 一律按 lo
  function clampInt(v, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, Math.round(v)));
  }

  // 好感度等级 = intimacy 在 LEVEL_CONFIG.expRequired 上的档位。
  // 语义与 addIntimacy 的升级判定完全一致：等级 L 成立 ⇔ intimacy < expRequired[L]
  // （即跨过 expRequired[L-1] 门槛才升到 L），保证重算与游玩升级互不漂移。
  function computeIntimacyLevel(intimacy) {
    const { LEVEL_CONFIG } = window.PET_DATA;
    if (!LEVEL_CONFIG) return 1;
    for (let i = 1; i < LEVEL_CONFIG.maxLevel; i++) {
      if (intimacy < LEVEL_CONFIG.expRequired[i]) return i;
    }
    return LEVEL_CONFIG.maxLevel;
  }

  // 净化单只猫的好感度数值：负数/NaN 钳到 0，等级按好感度值重算（自愈脏存档）。
  // 好感度上不封顶（超过满级阈值仍合法增长），只保证 ≥0 且 level 与 intimacy 一致。
  function sanitizeIntimacyFields(cat) {
    if (typeof cat.intimacy !== 'number' || !isFinite(cat.intimacy) || cat.intimacy < 0) cat.intimacy = 0;
    if (typeof cat.totalIntimacy !== 'number' || !isFinite(cat.totalIntimacy) || cat.totalIntimacy < cat.intimacy) {
      cat.totalIntimacy = cat.intimacy;
    }
    cat.level = computeIntimacyLevel(cat.intimacy);
  }

  // 归一化全部猫咪的好感度数值（供存档 hydrate 后调用，服务端/旧客户端脏数据自愈）
  function sanitizeCats() {
    if (!state || !state.cats) return;
    state.cats.forEach(sanitizeIntimacyFields);
    // 服务端旧档可能存着门槛上线前放上去的低等级猫，hydrate 后一并收回家
    enforceParkLevelGate();
  }

  // 放上公园的好感度门槛（Lv.3，与繁育门槛同源）：不达标却标记在公园的猫收回家。
  // 公园放置唯一事实源 = 猫实例的 inPark 标志（旧影子字段 catsInPark 下标已废除）。
  function enforceParkLevelGate() {
    if (!state || !state.cats) return;
    const minLv = CAT_PARK_CONFIG.minLevelInPark || 3;
    state.cats.forEach(function (c) {
      if (c.inPark && (c.level || 1) < minLv) c.inPark = false;
    });
  }

  function addIntimacy(catIndex, amount) {
    const cat = state.cats[catIndex];
    if (!cat) return null;

    cat.intimacy += amount;
    cat.totalIntimacy += amount;

    // 检测升级
    let leveledUp = null;
    const { LEVEL_CONFIG } = window.PET_DATA;
    
    while (cat.level < LEVEL_CONFIG.maxLevel && 
           cat.intimacy >= LEVEL_CONFIG.expRequired[cat.level]) {
      cat.level++;
      leveledUp = {
        newLevel: cat.level,
        title: LEVEL_CONFIG.titles[cat.level],
        bonus: LEVEL_CONFIG.focusBonus[cat.level]
      };
    }

    return leveledUp;
  }

  function getLevelInfo(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat) return null;
    
    const { LEVEL_CONFIG } = window.PET_DATA;
    const currentExp = cat.intimacy;
    const currentLevelExp = LEVEL_CONFIG.expRequired[cat.level - 1] || 0;
    const nextLevelExp = LEVEL_CONFIG.expRequired[cat.level] || currentExp;
    const progress = cat.level >= LEVEL_CONFIG.maxLevel 
      ? 100 
      : Math.min(100, ((currentExp - currentLevelExp) / (nextLevelExp - currentLevelExp)) * 100);

    return {
      level: cat.level,
      title: LEVEL_CONFIG.titles[cat.level] || '',
      intimacy: cat.intimacy,
      totalIntimacy: cat.totalIntimacy,
      progress: progress,
      nextLevelExp: nextLevelExp,
      currentLevelExp: currentLevelExp,
      focusBonus: LEVEL_CONFIG.focusBonus[cat.level] || 0,
      isMaxLevel: cat.level >= LEVEL_CONFIG.maxLevel
    };
  }

  // ===== 冒险系统 =====
  // 开始冒险
  function startAdventure(catIndex, locationId, choices) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };
    if (cat.isSleeping) return { success: false, msg: '猫咪在睡觉，不能出门冒险~' };
    if (cat.adventure && cat.adventure.active) return { success: false, msg: '猫咪已经在冒险中了！' };

    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    if (!ADVENTURE_CONFIG) return { success: false, msg: '冒险配置未加载' };

    const location = ADVENTURE_CONFIG.locations.find(l => l.id === locationId);
    if (!location) return { success: false, msg: '冒险地点不存在' };

    const durationMs = ADVENTURE_CONFIG.durationMinutes * 60 * 1000;
    const now = Date.now();

    cat.adventure = {
      active: true,
      locationId: locationId,
      choices: choices, // { path: 'flower', encounter: 'help' }
      startTime: now,
      endTime: now + durationMs,
      completed: false,
      rewardClaimed: false
    };

    // 冒险中猫咪活力会缓慢消耗
    cat.energy = Math.max(0, cat.energy - 5);

    save();
    return { success: true, msg: '猫咪出发去冒险啦！' };
  }

  // 获取冒险进度
  function getAdventureProgress(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat || !cat.adventure || !cat.adventure.active) return null;

    const now = Date.now();
    const adv = cat.adventure;
    const total = adv.endTime - adv.startTime;
    const elapsed = now - adv.startTime;
    const progress = Math.min(100, (elapsed / total) * 100);
    const remainingMs = Math.max(0, adv.endTime - now);
    const completed = now >= adv.endTime;

    return {
      active: adv.active,
      locationId: adv.locationId,
      choices: adv.choices,
      startTime: adv.startTime,
      endTime: adv.endTime,
      progress: progress,
      remainingMs: remainingMs,
      completed: completed,
      rewardClaimed: adv.rewardClaimed
    };
  }

  // 领取冒险奖励
  function claimAdventureReward(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat || !cat.adventure || !cat.adventure.active) {
      return { success: false, msg: '没有进行中的冒险' };
    }

    const now = Date.now();
    if (now < cat.adventure.endTime) {
      return { success: false, msg: '冒险还没结束呢~' };
    }

    if (cat.adventure.rewardClaimed) {
      return { success: false, msg: '奖励已经领过啦' };
    }

    const ADVENTURE_CONFIG = window.PET_DATA && window.PET_DATA.ADVENTURE_CONFIG;
    const location = ADVENTURE_CONFIG.locations.find(l => l.id === cat.adventure.locationId);
    if (!location) return { success: false, msg: '冒险地点不存在' };

    // 组合选择的key
    const choiceKeys = location.choices.map(c => cat.adventure.choices[c.id] || '');
    const rewardKey = choiceKeys.join('+');
    const reward = location.rewards[rewardKey];

    if (!reward) {
      return { success: false, msg: '奖励配置错误' };
    }

    // 添加食物（背包唯一权威是全局 state.inventory；猫实例没有 inventory 字段，
    // 写 cat.inventory 会抛 TypeError 导致奖励漏发 + 猫咪永久卡在冒险中 —— 2026-10-12 回归）
    if (reward.foods) {
      reward.foods.forEach(f => {
        if (!state.inventory.foods[f.id]) state.inventory.foods[f.id] = 0;
        state.inventory.foods[f.id] += f.count;
      });
    }

    // 添加玩具
    if (reward.toys) {
      reward.toys.forEach(t => {
        if (!state.inventory.toys[t.id]) state.inventory.toys[t.id] = 0;
        state.inventory.toys[t.id] += t.count;
      });
    }

    // 增加好感度
    if (reward.intimacy) {
      addIntimacy(catIndex, reward.intimacy);
    }

    // 冒险结束，猫咪心情提升
    cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + 15);

    cat.adventure.rewardClaimed = true;
    cat.adventure.active = false;
    cat.adventure.completed = true;

    save();

    return {
      success: true,
      msg: '冒险完成！',
      story: reward.story,
      foods: reward.foods || [],
      toys: reward.toys || [],
      intimacy: reward.intimacy || 0
    };
  }

  // ===== 清理便便 =====
  function cleanPoop(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    if (cat.poopCount <= 0) {
      return { success: false, msg: '干干净净的，没有便便~' };
    }

    const cleaned = cat.poopCount;
    cat.poopCount = 0;
    cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + cleaned * 3);

    save();
    return { success: true, cleaned: cleaned, msg: `🧹 清理了 ${cleaned} 坨便便！` };
  }

  // ===== 睡觉/唤醒 =====
  function toggleSleep(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    if (cat.isSleeping) {
      // 叫醒 - 随时可以叫醒，没有活力门槛
      // 先根据当前活力判断反馈，再修改状态
      let msg = '喵呜~ 睡醒啦！';
      if (cat.energy >= 80) msg = '喵~ 精神满满！';
      else if (cat.energy >= 50) msg = '嗯... 醒啦~';
      else msg = '喵呜... 还想睡...';
      
      cat.isSleeping = false;
      cat.sleepStartTime = 0;
      save();
      return { success: true, msg: msg };
    } else {
      // 让猫睡觉 - 活力满也可以选择睡觉（提前储备）
      cat.isSleeping = true;
      cat.sleepStartTime = Date.now();
      save();
      return { success: true, msg: '晚安~ 做个好梦💤' };
    }
  }

  // ===== 购买食物 =====
  function buyFood(foodId, count = 1) {
    const food = FOODS.find(f => f.id === foodId);
    if (!food) return { success: false, msg: '食物不存在' };

    const totalPrice = food.price * count;
    if (!spendCoins(totalPrice, 'buy_food', foodId)) {
      return { success: false, msg: '蛋蛋币不够哦~' };
    }
    state.inventory.foods[foodId] = (state.inventory.foods[foodId] || 0) + count;

    save();
    return { success: true, msg: `购买了 ${count} 个${food.name}！` };
  }

  // ===== 购买玩具 =====
  function buyToy(toyId, count = 1) {
    const toy = TOYS.find(t => t.id === toyId);
    if (!toy) return { success: false, msg: '玩具不存在' };

    const totalPrice = toy.price * count;
    if (!spendCoins(totalPrice, 'buy_toy', toyId)) {
      return { success: false, msg: '蛋蛋币不够哦~' };
    }
    state.inventory.toys[toyId] = (state.inventory.toys[toyId] || 0) + count;

    save();
    return { success: true, msg: `购买了 ${count} 个${toy.name}！` };
  }

  // ===== 金币（P2 完全合并：coins = 真实蛋蛋币余额的镜像） =====
  // 本地只做乐观变更，随后由 js/cat-cabin-bridge.js 调后端 /earn /spend，
  // 用服务端返回的权威余额校正 state.coins（扣币失败回滚、赚币按服务端实发额）。
  function addCoins(amount, reason, opts) {
    state.coins += amount;
    state.totalCoinsEarned += amount;
    save();
    if (window.__catCabinCoins) window.__catCabinCoins.earned(reason || 'checkin', opts || {});
  }

  function spendCoins(amount, reason, refId) {
    if (state.coins < amount) return false;
    state.coins -= amount;
    save();
    if (window.__catCabinCoins) window.__catCabinCoins.spent(amount, reason || 'adopt', refId || null);
    return true;
  }

  // ===== 盲盒系统 =====
  function openBlindBox(focusMinutes) {
    const tiers = BLIND_BOX.tiers;
    
    // 计算时长加成
    let bonus = 0;
    const bonusKeys = Object.keys(BLIND_BOX.durationBonus).map(Number).sort((a, b) => b - a);
    for (const min of bonusKeys) {
      if (focusMinutes >= min) {
        bonus = BLIND_BOX.durationBonus[min];
        break;
      }
    }

    // 抽取稀有度（带时长加成：升级概率）
    let rand = Math.random();
    let tierIndex = 0;
    let cumulative = 0;
    
    // 先按基础概率抽
    for (let i = 0; i < tiers.length; i++) {
      cumulative += tiers[i].probability;
      if (rand <= cumulative) {
        tierIndex = i;
        break;
      }
    }
    
    // 应用加成：有 bonus 概率升级一级
    if (tierIndex < tiers.length - 1 && Math.random() < bonus) {
      tierIndex++;
    }
    
    const tier = tiers[tierIndex];
    
    // 生成奖励内容（盲盒不给金币，只给猫粮、玩具和亲密度）
    const foods = [];
    const toys = [];
    
    // 随机食物（数量加倍，因为没有金币了）
    const foodCount = (tier.foodCount[0] + Math.floor(Math.random() * (tier.foodCount[1] - tier.foodCount[0] + 1))) * 2;
    const foodPool = FOODS.filter(f => f.price >= tier.foodPriceRange[0] && f.price <= tier.foodPriceRange[1]);
    if (foodPool.length > 0) {
      for (let i = 0; i < foodCount; i++) {
        const food = foodPool[Math.floor(Math.random() * foodPool.length)];
        const existing = foods.find(f => f.id === food.id);
        if (existing) existing.count++;
        else foods.push({ ...food, count: 1 });
        state.inventory.foods[food.id] = (state.inventory.foods[food.id] || 0) + 1;
      }
    }
    
    // 随机玩具（数量加倍）
    const toyCount = (tier.toyCount[0] + Math.floor(Math.random() * (tier.toyCount[1] - tier.toyCount[0] + 1))) * 2;
    const toyPool = TOYS.filter(t => t.price >= tier.toyPriceRange[0] && t.price <= tier.toyPriceRange[1]);
    if (toyPool.length > 0) {
      for (let i = 0; i < toyCount; i++) {
        const toy = toyPool[Math.floor(Math.random() * toyPool.length)];
        const existing = toys.find(t => t.id === toy.id);
        if (existing) existing.count++;
        else toys.push({ ...toy, count: 1 });
        state.inventory.toys[toy.id] = (state.inventory.toys[toy.id] || 0) + 1;
      }
    }
    
    // 盲盒也增加亲密度（根据稀有度）
    let intimacyGain = 0;
    const cat = getCurrentCat();
    if (cat) {
      intimacyGain = tier.intimacyGain || (tierIndex + 1) * 5;
      addIntimacy(state.currentCatIndex, intimacyGain);
    }
    
    save();
    
    return {
      tier: tier,
      coins: 0,
      foods: foods,
      toys: toys,
      intimacyGain: intimacyGain,
      isUpgrade: tierIndex > 0 && bonus > 0
    };
  }

  // ===== 每日签到 =====
  function getTodayStr() {
    const now = new Date();
    return now.getFullYear() + '-' + 
           String(now.getMonth() + 1).padStart(2, '0') + '-' + 
           String(now.getDate()).padStart(2, '0');
  }

  function canCheckIn() {
    const today = getTodayStr();
    return state.checkin.lastCheckinDate !== today;
  }

  function getCheckinInfo() {
    const { DAILY_CHECKIN } = window.PET_DATA;
    const today = getTodayStr();
    const canCheck = state.checkin.lastCheckinDate !== today;
    
    // 断签判定：按「自然日」连续（与后端 checkin_streak 口径一致）。
    // 旧实现按距上次签到时刻的小时差（streakResetHours=36）判定，会把连续签到误判断签：
    // 如昨天 09:00 签、今天 23:00 打开，间隔 38h > 36h → 进度被错误重置为第 1 天。
    // 回归（2026-10-11）：只有「上次签到日」早于「昨天」才算断签。
    let streakDays = state.checkin.streakDays;
    if (state.checkin.lastCheckinDate && streakDays > 0 && state.checkin.lastCheckinDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.getFullYear() + '-' +
             String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
             String(yesterday.getDate()).padStart(2, '0');
      if (state.checkin.lastCheckinDate < yesterdayStr) {
        streakDays = 0; // 断签了（中间至少隔了一整天没签）
      }
    }

    const nextDay = (streakDays % 7) + 1;
    const todayReward = DAILY_CHECKIN.rewards[nextDay - 1];

    return {
      canCheckIn: canCheck,
      streakDays: streakDays,
      totalCheckins: state.checkin.totalCheckins,
      nextDay: nextDay,
      todayReward: todayReward,
      allRewards: DAILY_CHECKIN.rewards
    };
  }

  function doCheckin() {
    const { DAILY_CHECKIN, FOODS, TOYS, CATS } = window.PET_DATA;
    const info = getCheckinInfo();
    
    if (!info.canCheckIn) {
      return { success: false, msg: '今天已经签到过啦~' };
    }

    const today = getTodayStr();
    const reward = info.todayReward;
    
    // 更新连续签到天数
    state.checkin.streakDays = info.streakDays + 1;
    state.checkin.lastCheckinDate = today;
    state.checkin.totalCheckins++;

    // 发放奖励
    const rewards = { coins: 0, foods: [], toys: [], cat: null };
    
    if (reward.coins) {
      addCoins(reward.coins, 'checkin', { slotFull: false });
      rewards.coins = reward.coins;
    }
    
    if (reward.food && reward.count) {
      const food = FOODS.find(f => f.id === reward.food);
      if (food) {
        state.inventory.foods[reward.food] = (state.inventory.foods[reward.food] || 0) + reward.count;
        rewards.foods.push({ ...food, count: reward.count });
      }
    }
    
    if (reward.toy && reward.count) {
      const toy = TOYS.find(t => t.id === reward.toy);
      if (toy) {
        state.inventory.toys[reward.toy] = (state.inventory.toys[reward.toy] || 0) + reward.count;
        rewards.toys.push({ ...toy, count: reward.count });
      }
    }

    // 第3天：野猫领养名额+1（受上限约束）
    if (reward.type === 'adoption_slot') {
      if (getAdoptionSlots().total < ADOPTION_CONFIG.maxSlots) {
        state.adoptionBonusSlots = (state.adoptionBonusSlots || 0) + 1;
        rewards.adoptionSlot = true;
      } else {
        // 名额已满，折算成金币
        addCoins(100, 'checkin', { slotFull: true });
        rewards.coins += 100;
        rewards.adoptionSlotFull = true;
      }
    }
    
    // 检查这次签到是否刚好解锁了新栏位
    const { PEN_CONFIG } = window.PET_DATA;
    const oldSlotCount = Math.floor((state.checkin.totalCheckins - 1) / PEN_CONFIG.signDaysPerSlot);
    const newSlotCount = Math.floor(state.checkin.totalCheckins / PEN_CONFIG.signDaysPerSlot);
    const slotIncreased = newSlotCount > oldSlotCount;
    
    save();
    
    return {
      success: true,
      day: info.nextDay,
      streakDays: state.checkin.streakDays,
      reward: reward,
      rewards: rewards,
      slotIncreased: slotIncreased,
      msg: `🎉 第 ${info.nextDay} 天签到成功！`
    };
  }

  // ===== 专注模式 =====
  function startFocus(targetMinutes) {
    if (state.focus.isActive) {
      return { success: false, msg: '已经在专注中啦~' };
    }

    state.focus.isActive = true;
    state.focus.startTime = Date.now();
    state.focus.targetMinutes = targetMinutes;
    state.focus.earnedCoins = 0;

    save();
    return { success: true, msg: '开始专注！猫咪会陪着你的~' };
  }

  function getFocusProgress() {
    if (!state.focus.isActive) return { progress: 0, remaining: 0, earned: 0 };

    const elapsed = Date.now() - state.focus.startTime;
    const elapsedMinutes = elapsed / 60000;
    const progress = Math.min(1, elapsedMinutes / state.focus.targetMinutes);
    const remaining = Math.max(0, state.focus.targetMinutes * 60 - elapsed / 1000);
    
    // 计算当前获得的亲密度（每分钟1点，有猫咪陪伴加成）
    let intimacyGain = 0;
    const cat = getCurrentCat();
    if (cat && !cat.isSleeping) {
      let bonus = FOCUS_REWARDS.bonusMultiplier;
      const levelInfo = getLevelInfo(state.currentCatIndex);
      if (levelInfo) {
        bonus += levelInfo.focusBonus / 100;
      }
      intimacyGain = Math.floor(elapsedMinutes * (1 + bonus));
    } else {
      intimacyGain = Math.floor(elapsedMinutes);
    }

    return {
      progress: progress,
      elapsedMinutes: elapsedMinutes,
      remainingSeconds: remaining,
      intimacyGain: intimacyGain,
      targetMinutes: state.focus.targetMinutes
    };
  }

  function stopFocus(completed) {
    if (!state.focus.isActive) {
      return { success: false, msg: '没有在专注中~' };
    }

    const elapsed = Date.now() - state.focus.startTime;
    const elapsedMinutes = elapsed / 60000;

    // 专注不再获得金币，只获得猫粮、道具和亲密度
    const earnedCoins = 0;

    // 猫咪陪伴加成（影响亲密度和道具质量）
    const cat = getCurrentCat();
    let focusBonus = 0;
    if (cat && !cat.isSleeping) {
      focusBonus = FOCUS_REWARDS.bonusMultiplier;
      const levelInfo = getLevelInfo(state.currentCatIndex);
      if (levelInfo) {
        focusBonus += levelInfo.focusBonus / 100;
      }
    }

    // 统计专注数据
    state.totalFocusMinutes += elapsedMinutes;
    state.focus.isActive = false;
    state.focus.totalMinutes += elapsedMinutes;

    // 专注后猫咪消耗活力，但增加心情和亲密度
    let focusLevelUp = null;
    let intimacyGain = 0;
    if (cat && !cat.isSleeping) {
      cat.energy = Math.max(0, cat.energy - 5);
      cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + 10);
      // 专注陪伴增加亲密度（每分钟1点，有加成）
      intimacyGain = Math.floor(elapsedMinutes * (1 + focusBonus));
      focusLevelUp = addIntimacy(state.currentCatIndex, intimacyGain);
    }

    // 完成专注：奖励猫粮和玩具（按档位匹配品质）
    let bonusReward = { foods: [], toys: [] };
    if (completed && elapsedMinutes >= state.focus.targetMinutes) {
      const targetMin = state.focus.targetMinutes;

      // 按专注时长匹配档位
      const tiers = FOCUS_PET_REWARDS.tiers;
      let matchedTier = tiers[0];
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (targetMin >= tiers[i].minutes) {
          matchedTier = tiers[i];
          break;
        }
      }

      // 根据档位的 foodTier/toyTier 确定价格范围
      // foodTier: 1=便宜(5-15), 2=中等(10-25), 3=较贵(20-40), 4=豪华(25-60)
      const foodTierRanges = {
        1: [5, 15],
        2: [10, 25],
        3: [20, 40],
        4: [25, 60]
      };
      const toyTierRanges = {
        1: [5, 15],
        2: [10, 25],
        3: [20, 40],
        4: [25, 50]
      };

      const foodRange = foodTierRanges[matchedTier.foodTier] || [5, 15];
      const toyRange = toyTierRanges[matchedTier.toyTier] || [5, 15];

      // 奖励数量（按时长递增）
      let foodCount, toyCount;
      if (targetMin >= 90) {
        foodCount = 3 + Math.floor(Math.random() * 2);
        toyCount = 1 + Math.floor(Math.random() * 2);
      } else if (targetMin >= 45) {
        foodCount = 2 + Math.floor(Math.random() * 2);
        toyCount = Math.random() < 0.6 ? 1 : 0;
      } else {
        foodCount = 1 + Math.floor(Math.random() * 2);
        toyCount = Math.random() < 0.3 ? 1 : 0;
      }

      // 随机猫粮（按档位价格范围）
      const foodPool = FOODS.filter(f => f.price >= foodRange[0] && f.price <= foodRange[1]);
      const actualFoodPool = foodPool.length > 0 ? foodPool : FOODS;
      for (let i = 0; i < foodCount; i++) {
        const food = actualFoodPool[Math.floor(Math.random() * actualFoodPool.length)];
        const existing = bonusReward.foods.find(f => f.id === food.id);
        if (existing) existing.count++;
        else bonusReward.foods.push({ ...food, count: 1 });
        state.inventory.foods[food.id] = (state.inventory.foods[food.id] || 0) + 1;
      }

      // 随机玩具（按档位价格范围）
      if (toyCount > 0) {
        const toyPool = TOYS.filter(t => t.price >= toyRange[0] && t.price <= toyRange[1]);
        const actualToyPool = toyPool.length > 0 ? toyPool : TOYS;
        for (let i = 0; i < toyCount; i++) {
          const toy = actualToyPool[Math.floor(Math.random() * actualToyPool.length)];
          const existing = bonusReward.toys.find(t => t.id === toy.id);
          if (existing) existing.count++;
          else bonusReward.toys.push({ ...toy, count: 1 });
          state.inventory.toys[toy.id] = (state.inventory.toys[toy.id] || 0) + 1;
        }
      }

      state.focus.completedSessions++;
    }

    save();
    
    let msg;
    if (completed && elapsedMinutes >= state.focus.targetMinutes) {
      const foodNames = bonusReward.foods.map(f => `${f.emoji}${f.name}×${f.count}`).join(' ');
      const toyNames = bonusReward.toys.map(t => `${t.emoji}${t.name}×${t.count}`).join(' ');
      const rewardParts = [];
      if (foodNames) rewardParts.push(foodNames);
      if (toyNames) rewardParts.push(toyNames);
      if (intimacyGain > 0) rewardParts.push(`💕 亲密度+${intimacyGain}`);
      msg = `🎉 专注完成！获得 ${rewardParts.join(' + ')}~`;
    } else {
      msg = `专注了 ${Math.floor(elapsedMinutes)} 分钟~ ${intimacyGain > 0 ? `亲密度+${intimacyGain}` : ''}`;
    }
    
    return {
      success: true,
      earnedCoins: 0,
      minutes: Math.floor(elapsedMinutes),
      completed: completed && elapsedMinutes >= state.focus.targetMinutes,
      bonusReward: bonusReward,
      intimacyGain: intimacyGain,
      levelUp: focusLevelUp,
      msg: msg
    };
  }

  // ===== 离线更新 =====
  function updateAllCats() {
    const now = Date.now();
    const bonuses = getItemBonuses();

    state.cats.forEach(cat => {
      const deltaMs = now - cat.lastUpdateTime;
      if (deltaMs <= 0) return;

      const hours = deltaMs / (60 * 60 * 1000);

      if (cat.isSleeping) {
        // 睡觉状态：快速恢复活力和心情（猫窝加成）
        cat.energy = Math.min(CAT_CONFIG.maxEnergy, cat.energy + CAT_CONFIG.energyRecoverPerHour * hours * bonuses.sleepBonus);
        cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + CAT_CONFIG.happinessRecoverSleep * hours * bonuses.sleepHappinessBonus);
        cat.hunger = Math.max(0, cat.hunger - CAT_CONFIG.hungerRecoverPerHour * hours);
        // 睡满了活力满了也不会自动醒，由玩家主动叫醒
      } else {
        // 清醒状态：消耗状态（饮水机减少饥饿衰减，猫爬架减少心情衰减）
        cat.hunger = Math.max(0, cat.hunger - CAT_CONFIG.hungerDecayPerHour * hours * bonuses.hungerDecayMultiplier);
        
        // 活力缓慢下降（但不会导致自动睡觉）
        cat.energy = Math.max(0, cat.energy - CAT_CONFIG.energyDecayPerHour * hours);
        // 活力高时下降更快一些（从满格掉到中等需要更久），低时下降慢
        // 已经通过 energyDecayPerHour 控制了，保持简单线性

        // 便便让心情多降（猫爬架减少基础心情衰减）
        const happinessPenalty = (CAT_CONFIG.happinessDecayPerHour * bonuses.happinessDecayMultiplier) + cat.poopCount * CAT_CONFIG.poopHappinessPenalty;
        cat.happiness = Math.max(0, cat.happiness - happinessPenalty * hours);

        // 产生便便
        const msPerPoop = (24 * 60 * 60 * 1000) / CAT_CONFIG.poopPerDay;
        const timeSinceLastPoop = now - cat.lastPoopTime;
        if (timeSinceLastPoop >= msPerPoop && cat.hunger > 20) {
          const newPoops = Math.floor(timeSinceLastPoop / msPerPoop);
          cat.poopCount = Math.min(CAT_CONFIG.maxPoop, cat.poopCount + newPoops);
          cat.lastPoopTime = now;
        }
        // 移除了"活力太低自动睡觉"——猫咪永远醒着，不会阻碍玩家互动
      }

      cat.lastUpdateTime = now;
    });
  }

  // ===== 购买道具 =====
  function buyItem(itemId) {
    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, msg: '道具不存在' };

    // 家具类只能买一个
    if (item.type === 'furniture' || item.type === 'bed') {
      if (state.inventory.items[itemId] && state.inventory.items[itemId] > 0) {
        return { success: false, msg: '已经拥有这个家具啦~' };
      }
    }

    if (!spendCoins(item.price, 'buy_item', itemId)) {
      return { success: false, msg: '蛋蛋币不够哦~' };
    }
    state.inventory.items[itemId] = (state.inventory.items[itemId] || 0) + 1;

    save();
    return { success: true, msg: `购买了${item.name}！${item.type === 'furniture' || item.type === 'bed' ? '已自动放置到猫咪小屋~' : ''}` };
  }

  // ===== 使用道具 =====
  function useItem(itemId, catIndex) {
    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, msg: '道具不存在' };

    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    if (!state.inventory.items[itemId] || state.inventory.items[itemId] <= 0) {
      return { success: false, msg: '没有这个道具哦~' };
    }

    // 家具类不能使用（被动效果）
    if (item.type === 'furniture' || item.type === 'bed') {
      return { success: false, msg: '家具是被动加成，不需要使用~' };
    }

    if (cat.isSleeping) {
      return { success: false, msg: '猫咪在睡觉呢，别打扰它~' };
    }

    let msg = '';

    switch(item.effect) {
      case 'grooming': // 梳毛器
        cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + 25);
        // 梳毛也会清理一点便便产生的不快
        if (cat.poopCount > 0) {
          cat.happiness = Math.min(CAT_CONFIG.maxHappiness, cat.happiness + cat.poopCount * 2);
        }
        msg = '喵~ 梳毛好舒服，毛发都顺了！✨';
        break;

      case 'energy': // 营养膏
        cat.energy = Math.min(CAT_CONFIG.maxEnergy, cat.energy + 35);
        cat.hunger = Math.min(CAT_CONFIG.maxHunger, cat.hunger + 10);
        msg = '营养满满！猫咪又充满活力了~ 💪';
        break;

      default:
        return { success: false, msg: '这个道具暂时不能使用哦' };
    }

    state.inventory.items[itemId]--;
    if (state.inventory.items[itemId] <= 0) {
      delete state.inventory.items[itemId];
    }

    save();
    return { success: true, msg: msg };
  }

  // ===== 获取道具加成 =====
  function getItemBonuses() {
    const items = state.inventory.items || {};
    const bonuses = {
      sleepBonus: 1.0,      // 睡眠恢复倍率
      sleepHappinessBonus: 1.0, // 睡眠心情恢复倍率
      happinessDecayMultiplier: 1.0, // 心情衰减倍率（小于1是减少）
      hungerDecayMultiplier: 1.0,    // 饥饿衰减倍率
      hasBed: false,
      hasTree: false,
      hasFountain: false,
      playBonus: 1.0       // 玩耍心情加成倍率
    };

    // 🛏️ 猫窝：睡眠恢复+50%，睡眠心情恢复+100%
    if (items.bed && items.bed > 0) {
      bonuses.hasBed = true;
      bonuses.sleepBonus = 1.5;
      bonuses.sleepHappinessBonus = 2.0;
    }

    // 🌳 猫爬架：心情衰减-30%，玩耍效果+50%
    if (items.tree && items.tree > 0) {
      bonuses.hasTree = true;
      bonuses.happinessDecayMultiplier = 0.7;
      bonuses.playBonus = 1.5;
    }

    // 💧 饮水机：饥饿衰减-25%
    if (items.fountain && items.fountain > 0) {
      bonuses.hasFountain = true;
      bonuses.hungerDecayMultiplier = 0.75;
    }

    return bonuses;
  }

  // ===== 成熟度系统（替换亲密度） =====
  // 成熟等级：1=奶猫(kitten), 2=幼猫(young), 3=成年猫(adult)
  const MATURITY_LEVELS = {
    1: { name: '小奶猫', canBreed: false, scale: 0.7 },
    2: { name: '幼猫',   canBreed: false, scale: 0.85 },
    3: { name: '成年猫', canBreed: true,  scale: 1.0 }
  };

  const MATURITY_THRESHOLDS = [0, 30, 80]; // 升到2级需要30，升到3级需要80

  function addMaturity(catIndex, amount) {
    const cat = state.cats[catIndex];
    if (!cat) return null;

    cat.maturity += amount;
    cat.totalMaturity += amount;

    // 检测成熟等级提升
    let leveledUp = null;
    let newLevel = cat.maturityLevel;
    
    if (cat.maturity >= MATURITY_THRESHOLDS[2] && cat.maturityLevel < 3) {
      newLevel = 3;
    } else if (cat.maturity >= MATURITY_THRESHOLDS[1] && cat.maturityLevel < 2) {
      newLevel = 2;
    }

    if (newLevel > cat.maturityLevel) {
      cat.maturityLevel = newLevel;
      cat.canBreed = MATURITY_LEVELS[newLevel].canBreed;
      if (newLevel === 3) {
        cat.isNewborn = false;
      }
      leveledUp = {
        newLevel: newLevel,
        title: MATURITY_LEVELS[newLevel].name,
        canBreed: cat.canBreed
      };
    }

    return leveledUp;
  }

  function getMaturityInfo(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat) return null;
    
    const currentLevel = cat.maturityLevel;
    const currentThreshold = MATURITY_THRESHOLDS[currentLevel - 1] || 0;
    const nextThreshold = MATURITY_THRESHOLDS[currentLevel] || cat.maturity;
    const progress = currentLevel >= 3 
      ? 100 
      : Math.min(100, ((cat.maturity - currentThreshold) / (nextThreshold - currentThreshold)) * 100);

    return {
      level: currentLevel,
      levelName: MATURITY_LEVELS[currentLevel].name,
      maturity: cat.maturity,
      totalMaturity: cat.totalMaturity,
      progress: progress,
      nextThreshold: nextThreshold,
      currentThreshold: currentThreshold,
      canBreed: cat.canBreed,
      isMaxLevel: currentLevel >= 3,
      scale: MATURITY_LEVELS[currentLevel].scale,
      breedingCount: cat.breedingCount,
      isNewborn: cat.isNewborn
    };
  }

  // ===== 获取猫咪稀有度等级 =====
  function getCatRarityLevel(catId) {
    const catData = CATS.find(c => c.id === catId);
    if (!catData) return 0;
    if (catData.rarity === 'rare' && catData.rarityLevel) return catData.rarityLevel;
    return 0; // 普通品种
  }

  function getCatRarityLabel(catId) {
    const level = getCatRarityLevel(catId);
    if (level === 0) return '普通';
    if (level === 3) return '稀有';
    if (level === 4) return '珍稀';
    if (level === 5) return '传说';
    return '未知';
  }

  // ===== 繁育核心逻辑 =====
  // 根据父母品种计算后代品种
  // ===== 繁育核心逻辑 =====
  // 根据父母品种和亲密度计算后代品种
  // intimacyBonus: 亲密度加成 (0~1)，越高稀有概率越高
  function calculateOffspring(parent1Id, parent2Id, options = {}) {
    const parent1Data = CATS.find(c => c.id === parent1Id);
    const parent2Data = CATS.find(c => c.id === parent2Id);
    
    if (!parent1Data || !parent2Data) return null;

    const rarity1 = getCatRarityLevel(parent1Id);
    const rarity2 = getCatRarityLevel(parent2Id);

    // 确保小的在前，大的在后，用于查表
    const minRarity = Math.min(rarity1, rarity2);
    const maxRarity = Math.max(rarity1, rarity2);
    const tableKey = `${minRarity}_${maxRarity}`;
    
    const table = BREEDING_TABLE[tableKey];
    if (!table) {
      return { rarity: 'common', breedId: 'calico' };
    }

    // 判断是否同品种
    const isSameBreed = parent1Id === parent2Id;
    
    // 同品种时有概率直接出同品种
    if (isSameBreed && Math.random() < table.sameBreedChance) {
      return {
        rarity: parent1Data.rarity,
        breedId: parent1Id,
        isSameBreed: true
      };
    }

    // 亲密度加成：调整权重，让高稀有度的权重增加
    const intimacyBonus = options.intimacyBonus || 0; // 0~1
    // 加成系数：亲密度满时，稀有权重最多 +50%
    const rareBoost = 1 + intimacyBonus * 0.5;

    // 按权重抽取稀有度等级（亲密度加成提升稀有级权重）
    let totalWeight = 0;
    const adjustedWeights = table.distribution.map(item => {
      let weight = item.weight;
      // 稀有度等级越高，加成越多
      if (item.rarity === 'rare3') weight *= (1 + intimacyBonus * 0.3);
      if (item.rarity === 'rare4') weight *= rareBoost;
      if (item.rarity === 'rare5') weight *= (1 + intimacyBonus * 0.8);
      totalWeight += weight;
      return weight;
    });

    // ===== 好感度等级加成（珍稀+2%/级，传说+1%/级，用户可见的直观加成）=====
    const levelBonus = options.levelBonus || { rare4: 0, rare5: 0 };
    if ((levelBonus.rare4 > 0 || levelBonus.rare5 > 0) && totalWeight > 0) {
      // 把权重转成概率，方便计算固定百分比加成
      const probs = {};
      table.distribution.forEach((item, idx) => {
        probs[item.rarity] = adjustedWeights[idx] / totalWeight;
      });

      // 需要增加的总量（从普通/最低稀有度里扣）
      let addRare4 = levelBonus.rare4;
      let addRare5 = levelBonus.rare5;

      // 优先从 common 里扣
      if (probs.common !== undefined) {
        const deductFromCommon = Math.min(probs.common, addRare4 + addRare5);
        probs.common -= deductFromCommon;
        const remaining = addRare4 + addRare5 - deductFromCommon;
        // 按比例分配给 rare4 和 rare5
        if (addRare4 + addRare5 > 0) {
          const ratio4 = addRare4 / (addRare4 + addRare5);
          addRare4 -= deductFromCommon * ratio4;
          addRare5 -= deductFromCommon * (1 - ratio4);
        }
      }

      // 如果 common 不够扣，从 rare3 里扣
      if ((addRare4 > 0 || addRare5 > 0) && probs.rare3 !== undefined) {
        const deductFromRare3 = Math.min(probs.rare3, addRare4 + addRare5);
        probs.rare3 -= deductFromRare3;
        if (addRare4 + addRare5 > 0) {
          const ratio4 = addRare4 / (addRare4 + addRare5);
          addRare4 -= deductFromRare3 * ratio4;
          addRare5 -= deductFromRare3 * (1 - ratio4);
        }
      }

      // 加上到 rare4 和 rare5
      if (probs.rare4 === undefined) probs.rare4 = 0;
      if (probs.rare5 === undefined) probs.rare5 = 0;
      probs.rare4 += levelBonus.rare4 - addRare4; // 实际加上的量（扣剩的）
      probs.rare5 += levelBonus.rare5 - addRare5;

      // 确保不为负
      Object.keys(probs).forEach(k => {
        if (probs[k] < 0) probs[k] = 0;
      });

      // 重新转回权重
      const newTotal = Object.values(probs).reduce((a, b) => a + b, 0);
      if (newTotal > 0) {
        table.distribution.forEach((item, idx) => {
          if (probs[item.rarity] !== undefined) {
            adjustedWeights[idx] = probs[item.rarity] * totalWeight / newTotal;
          }
        });
      }
    }

    let rand = Math.random() * totalWeight;
    let selectedRarity = table.distribution[0].rarity;

    for (let i = 0; i < table.distribution.length; i++) {
      rand -= adjustedWeights[i];
      if (rand <= 0) {
        selectedRarity = table.distribution[i].rarity;
        break;
      }
    }

    // 从对应稀有度的品种列表中随机选一个
    const breedList = RARITY_BREEDS[selectedRarity] || [];
    if (breedList.length === 0) {
      return { rarity: 'common', breedId: 'calico' };
    }

    const randomBreed = breedList[Math.floor(Math.random() * breedList.length)];
    
    return {
      rarity: selectedRarity,
      breedId: randomBreed,
      isSameBreed: false,
      intimacyBonus: intimacyBonus
    };
  }

  // 执行繁育（公园繁育，生2只小猫，一人一只）
  function doBreeding(catIndex, partnerCatId, options = {}) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    // 检查玩家的猫是否是母猫，如果是则检查冷却时间
    if (cat.gender === 'female') {
      const cooldownCheck = checkBreedingCooldown(cat);
      if (!cooldownCheck.canBreed) {
        const catData = window.PET_ENGINE.getCatData ? window.PET_ENGINE.getCatData(cat.catId) : null;
        const catName = catData?.name || cat.name || '母猫';
        return { success: false, msg: `${catName}需要休息${cooldownCheck.remainingHours}小时后才能再次繁育哦~` };
      }
    }

    // 更新繁育次数（只有母猫更新lastBreedingTime）
    cat.breedingCount++;
    if (cat.gender === 'female') {
      cat.lastBreedingTime = Date.now();
    }

    // 计算亲密度加成（取两只猫的亲密度平均值，归一化到0~1）
    // 我的猫的亲密度
    const myIntimacy = cat.intimacy || 0;
    // 对方猫的亲密度（模拟，50~100之间随机）
    const partnerIntimacy = options.partnerIntimacy || (50 + Math.random() * 50);
    const avgIntimacy = (myIntimacy + partnerIntimacy) / 2;
    const intimacyBonus = Math.min(1, Math.max(0, avgIntimacy / 100));

    // 好感度等级加成（珍稀+2%/级，传说+1%/级，取两只猫的等级平均值）
    const myLevelInfo = getLevelInfo(catIndex);
    const myLevel = myLevelInfo ? myLevelInfo.level : 1;
    const partnerLevel = options.partnerLevel || Math.floor(1 + Math.random() * 5); // 对方猫等级模拟
    const avgLevel = Math.floor((myLevel + partnerLevel) / 2);
    const LEVEL_CONFIG = window.PET_DATA.LEVEL_CONFIG;
    const levelBonus = LEVEL_CONFIG && LEVEL_CONFIG.breedingBonus && LEVEL_CONFIG.breedingBonus[avgLevel]
      ? LEVEL_CONFIG.breedingBonus[avgLevel]
      : { rare4: 0, rare5: 0 };

    // 生成小猫
    const kittens = [];
    const kittenCount = BREEDING_CONFIG.kittensPerLitter;

    for (let i = 0; i < kittenCount; i++) {
      const offspring = calculateOffspring(cat.catId, partnerCatId, {
        intimacyBonus: intimacyBonus,
        levelBonus: levelBonus
      });
      if (offspring) {
        const partnerUid = options.partnerUid || ('partner_' + partnerCatId + '_' + Date.now());
        const partnerOwnerName = options.partnerOwnerName || options.partnerName || '公园玩家';
        const kitten = createCat(offspring.breedId, Date.now(), {
          isKitten: false,
          parentIds: [cat.catId, partnerCatId],
          parentUids: [cat.uid, partnerUid],
          parentOwnerNames: [cat.ownerName || '我', partnerOwnerName]
        });
        kitten.rarity = offspring.rarity;
        kitten.breedId = offspring.breedId;
        kitten.isSameBreed = offspring.isSameBreed;
        kitten.canBreed = true; // 小猫也可以繁育
        kitten.intimacy = 0; // 新生小猫亲密度从0开始
        kitten.maturity = 0;
        kittens.push(kitten);
        
        // 记录到父母的子女列表
        if (!cat.childrenUids) cat.childrenUids = [];
        cat.childrenUids.push(kitten.uid);
      }
    }

    // 第一只小猫加入玩家队伍
    if (kittens.length > 0) {
      state.cats.push(kittens[0]);
    }

    // 记录繁育历史
    state.breedingHistory.unshift({
      time: Date.now(),
      parent1Id: cat.catId,
      parent2Id: partnerCatId,
      kittens: kittens.map(k => k.catId),
      usedTicket: useTicket,
      intimacyBonus: intimacyBonus
    });

    save();

    return {
      success: true,
      msg: `🎉 繁育成功！获得了 ${kittens.length} 只可爱的小奶猫~`,
      kittens: kittens,
      myKitten: kittens[0] || null,
      partnerKitten: kittens[1] || null,
      parent1: {
        catId: cat.catId,
        name: cat.name,
        uid: cat.uid
      },
      parent2: {
        catId: partnerCatId,
        name: options.partnerName || '公园猫咪',
        uid: options.partnerUid || ('partner_' + partnerCatId + '_' + Date.now())
      }
    };
  }

  // ===== 盲盒领养 =====
  // ===== 领养名额系统 =====
  function getAdoptionSlots() {
    // 重新计算（防止签到后没更新）
    const totalCheckinDays = state.checkin?.totalDays || 0;
    const extraSlots = Math.floor(totalCheckinDays / ADOPTION_CONFIG.extraSlotAtCheckinDays);
    const bonusSlots = state.adoptionBonusSlots || 0;
    state.adoptionSlots = Math.min(ADOPTION_CONFIG.maxSlots, ADOPTION_CONFIG.baseSlots + extraSlots + bonusSlots);
    
    return {
      total: state.adoptionSlots,
      used: state.adoptedCount,
      remaining: state.adoptionSlots - state.adoptedCount,
      totalCheckinDays: totalCheckinDays,
      nextSlotDays: ADOPTION_CONFIG.extraSlotAtCheckinDays - (totalCheckinDays % ADOPTION_CONFIG.extraSlotAtCheckinDays)
    };
  }

  // 领养野猫（公园里的流浪猫，稀有度洗了才知道——抽卡）
  function adoptStrayCat(catId) {
    const price = CAT_PARK_CONFIG.strayAdoptPrice;
    const slots = getAdoptionSlots();

    // 检查名额
    if (slots.remaining <= 0) {
      return {
        success: false,
        msg: `领养名额用完啦~ 连续签到第3天可获得新名额（每7天1次）`
      };
    }

    // 品种必须存在于当前公园批次（野猫只能领养公园里刷出来的）
    const catData = CATS.find(c => c.id === catId);
    if (!catData) {
      return { success: false, msg: '品种不存在' };
    }
    const inBatch = (state.parkBatch?.strays || []).includes(catId);
    if (!inBatch) {
      return { success: false, msg: '这只流浪猫不在公园里~' };
    }
    // 检查是否已经有了
    if (isCatAdopted(catId)) {
      return { success: false, msg: '你已经有这只猫咪啦~' };
    }
    // 全部校验通过后才扣币（避免校验失败白扣钱）
    if (!spendCoins(price, 'adopt_stray', catId)) {
      return { success: false, msg: '蛋蛋币不够哦~ 需要 ' + price + ' 蛋蛋币' };
    }
    state.adoptedCount++;

    const newCat = createCat(catId, Date.now(), { isKitten: false });
    state.cats.push(newCat);
    state.currentCatIndex = state.cats.length - 1;

    // 这只流浪猫被领养走了，从当前批次移除
    if (state.parkBatch) {
      state.parkBatch.strays = state.parkBatch.strays.filter(id => id !== catId);
    }

    save();

    const rarityLevel = getCatRarityLevel(catId);
    return {
      success: true,
      msg: `🎉 洗干净啦！原来是一只${catData.name}！`,
      cat: newCat,
      breedId: catId,
      rarityLevel: rarityLevel,
      rarityLabel: getCatRarityLabel(catId),
      slots: getAdoptionSlots()
    };
  }

  // 兼容旧接口：从当前公园批次的野猫中随机选一只领养
  function blindAdopt() {
    const strays = (state.parkBatch?.strays || []).filter(id => !isCatAdopted(id));
    const pool = strays.length > 0 ? strays : RARITY_BREEDS['common'];
    const randomBreed = pool[Math.floor(Math.random() * pool.length)];
    return adoptStrayCat(randomBreed);
  }

  // 猫咪公园服务端权威物化：把后端裁决的猫（流浪猫领养 / 繁育后代）直接写入存档，
  // 不走 adoptStrayCat 的名额/扣币校验（领养无前置、后代由后端 48h 冷却权威裁决）。
  function addCatFromPark(catId, options = {}) {
    const catData = CATS.find(c => c.id === catId);
    if (!catData) return { success: false, msg: '品种不存在' };
    const newCat = createCat(catId, Date.now(), {
      isKitten: options.isKitten || false,
      uid: options.uid,
      gender: options.gender,
      parentIds: options.parentIds,
      parentUids: options.parentUids,
      parentOwnerNames: options.parentOwnerNames,
      ownerName: options.ownerName || '我'
    });
    if (options.breedId) newCat.breedId = options.breedId;
    if (options.rarity) newCat.rarity = options.rarity;
    state.cats.push(newCat);
    state.currentCatIndex = state.cats.length - 1;
    save();
    return { success: true, cat: newCat };
  }

  // ===== 繁育冷却系统 =====
  // 检查母猫是否在冷却期（一周只能繁育一次，公猫无限制）
  function checkBreedingCooldown(cat) {
    if (!cat || cat.gender !== 'female') return { canBreed: true, remainingHours: 0 };
    if (!cat.lastBreedingTime) return { canBreed: true, remainingHours: 0 };
    
    const cooldownMs = BREEDING_CONFIG_EXTRA.femaleCooldownDays * 86400000;
    const elapsed = Date.now() - cat.lastBreedingTime;
    const remaining = cooldownMs - elapsed;
    
    if (remaining <= 0) {
      return { canBreed: true, remainingHours: 0 };
    } else {
      return { canBreed: false, remainingHours: Math.ceil(remaining / 3600000) };
    }
  }
  
  // ===== 族谱系统 =====
  
  // 通过uid查找猫（在玩家的猫中查找）
  function findCatByUid(uid) {
    return state.cats.find(c => c.uid === uid) || null;
  }
  
  // 构建某只猫的族谱树（最多追溯maxGenerations代）
  function getFamilyTree(catUid, maxGenerations = 3) {
    const cat = findCatByUid(catUid);
    if (!cat) return null;
    
    // 递归构建时，需要知道当前节点对应父母数组的哪个index，以便取parentOwnerNames
    function buildNode(uid, generation, parentOwnerName = null) {
      const c = findCatByUid(uid);
      if (!c) {
        // 找不到的猫（比如公园的对方猫），用uid的品种信息构造
        const catIdMatch = uid.match(/cat_\d+_/) ? null : (uid.split('_')[1] || null);
        return {
          uid: uid,
          catId: catIdMatch || 'unknown',
          name: '公园猫咪',
          ownerName: parentOwnerName || '公园玩家',
          generation: generation,
          isVirtual: true,
          parents: []
        };
      }
      
      const node = {
        uid: c.uid,
        catId: c.catId,
        name: c.name,
        ownerName: c.ownerName || '我',
        rarity: c.rarity || 'common',
        generation: generation,
        birthTime: c.birthTime,
        breedingCount: c.breedingCount || 0,
        childrenCount: (c.childrenUids || []).length,
        parents: [],
        children: c.childrenUids || []
      };
      
      // 递归构建父母（如果还有代际）
      if (generation < maxGenerations && c.parentUids && c.parentUids.length > 0) {
        c.parentUids.forEach((parentUid, idx) => {
          const parentOwnerName = (c.parentOwnerNames && c.parentOwnerNames[idx]) || null;
          node.parents.push(buildNode(parentUid, generation + 1, parentOwnerName));
        });
      }
      
      return node;
    }
    
    return buildNode(catUid, 0);
  }
  
  // 获取猫的所有后代（树形）
  function getAllDescendants(catUid) {
    const cat = findCatByUid(catUid);
    if (!cat) return [];
    
    function getChildren(uid) {
      const c = findCatByUid(uid);
      if (!c || !c.childrenUids || c.childrenUids.length === 0) return [];
      
      return c.childrenUids.map(childUid => {
        const child = findCatByUid(childUid);
        return {
          uid: childUid,
          catId: child ? child.catId : 'unknown',
          name: child ? child.name : '未知',
          children: getChildren(childUid)
        };
      });
    }
    
    return getChildren(catUid);
  }
  
  // ===== 猫咪公园 =====

  // 按权重抽取野猫稀有度
  function pickStrayRarity() {
    const table = CAT_PARK_CONFIG.strayRarityTable;
    const total = table.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of table) {
      r -= t.weight;
      if (r <= 0) return t.rarity;
    }
    return 'common';
  }

  // 抽一批新野猫（流浪猫抽卡），持久化到state。
  // 他人用户猫已改由服务端 GET /api/cat-park/scene 权威抽取（mock 假猫彻底下线），
  // 这里只负责「换一批」重抽流浪猫品种。
  function generateParkBatch() {
    const strays = [];
    const usedBreeds = new Set();
    for (let i = 0; i < CAT_PARK_CONFIG.strayCatCount; i++) {
      const rarity = pickStrayRarity();
      const breedPool = RARITY_BREEDS[rarity] || RARITY_BREEDS['common'];
      let breedId;
      let attempts = 0;
      do {
        breedId = breedPool[Math.floor(Math.random() * breedPool.length)];
        attempts++;
      } while (usedBreeds.has(breedId) && attempts < 10);
      usedBreeds.add(breedId);
      strays.push(breedId);
    }

    state.parkBatch = { strays, generatedAt: Date.now() };
    save();
  }

  // 服务端场景猫 VO（/api/cat-park/scene 的 user 猫）→ canvas 场景猫形态
  function toSceneCat(vo) {
    const catData = CATS.find(c => c.id === vo.breedCatId);
    // 好感度等级读服务端权威快照 affinity_level（与「我的猫咪」页同源口径）
    const lvl = vo.affinityLevel || 1;
    return {
      catId: vo.breedCatId,
      name: vo.name || (catData ? catData.name : '小猫'),
      uid: 'park_' + vo.id,
      parkCatId: vo.id,
      gender: vo.gender || 'male',
      owner: vo.ownerNickname || '蛋蛋用户',
      userId: 'u' + vo.ownerUserId,
      ownerUserId: vo.ownerUserId,
      school: '',
      level: lvl,
      maturity: 'adult',
      catData: catData,
      rarityLevel: getCatRarityLevel(vo.breedCatId),
      rarityLabel: getCatRarityLabel(vo.breedCatId),
      isMine: false,
      isStray: false,
      isDirty: false,
      canAdopt: false,
      breedable: !!vo.breedable,
      blockedReason: vo.blockedReason || null,
      cooldownRemainingMs: vo.cooldownRemainingMs || 0,
      intimacyLevel: lvl,
      intimacyValue: 0
    };
  }

  // 写入服务端抽取的场景猫（仅他人用户猫；流浪猫部分由本地抽卡批次负责，不动）。
  // 服务端已按「抽 3 个不同用户、每人随机 1 只」裁决并排除自己的猫；这里再做一次
  // 防御性过滤（isMine / source），并限制上限，保证场景规则不被脏数据破坏。
  function setParkSceneCats(list) {
    const arr = Array.isArray(list) ? list : [];
    serverSceneCats = arr
      .filter(c => c && c.source === 'user' && !c.isMine && c.ownerUserId != null && c.breedCatId)
      .slice(0, CAT_PARK_CONFIG.sceneOthersCount)
      .map(toSceneCat);
    return serverSceneCats.length;
  }

  // 场景猫签名：id+繁育资格变化即视为场景变更（主人带回家→id 消失，进入冷却→资格翻转）
  function getParkSceneSignature() {
    return serverSceneCats.map(c => c.parkCatId + ':' + (c.breedable ? 1 : 0)).join('|');
  }

  function getParkCats() {
    // 首次进入：抽一批野猫
    if (!state.parkBatch) generateParkBatch();
    const batch = state.parkBatch;

    // 场景展示规则（服务端权威）：固定 5 只 = 2 只流浪猫（本地抽卡，不动）
    // + 至多 3 只他人用户猫（bridge 拉 /scene 后 setParkSceneCats 注入；
    //   服务端按用户去重抽取，同一用户不会同屏多只）。
    // 玩家自己放到公园的猫不出现在自己的场景里（仅对其他用户可见）。
    const otherCats = serverSceneCats.slice();

    // 生成野猫（流浪猫，脏兮兮的，可以领养；真实稀有度洗了才知道）
    const strayCats = batch.strays.map((breedId, i) => {
      const catData = CATS.find(c => c.id === breedId);
      const alreadyOwned = isCatAdopted(breedId);
      return {
        catId: breedId,
        name: '流浪' + (catData?.name || '小猫'),
        uid: 'stray_' + i + '_' + breedId,
        owner: '流浪猫',
        userId: 'stray_' + i,
        school: '',
        level: 1,
        maturity: 'young',
        catData: catData,
        rarityLevel: getCatRarityLevel(breedId),
        rarityLabel: getCatRarityLabel(breedId),
        isMine: false,
        isStray: true,
        isDirty: true, // 脏兮兮的
        canAdopt: !alreadyOwned // 没拥有的才能领养
      };
    });

    return [...strayCats, ...otherCats];
  }

  // 当前在公园的猫只数（唯一事实源 = 猫实例 inPark 标志）
  function countCatsInPark() {
    return state.cats.reduce(function (n, c) { return n + (c.inPark ? 1 : 0); }, 0);
  }

  // 把猫咪放到公园
  function putCatInPark(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    if (cat.inPark) {
      return { success: false, msg: '这只猫咪已经在公园啦~' };
    }

    // 好感度门槛（2026-10-12）：Lv.3 才能放上公园，与公园页提示、后端
    // CatParkService.MIN_BREED_LEVEL 一致；此前只限数量不限等级，Lv.1 也能放。
    const minLv = CAT_PARK_CONFIG.minLevelInPark || 3;
    const lvl = cat.level || 1;
    if (lvl < minLv) {
      return { success: false, msg: `💕 和「${cat.name || '猫咪'}」的好感度还不到 Lv.${minLv}（当前 Lv.${lvl}），先多喂食、玩耍、陪伴培养感情吧～` };
    }

    if (countCatsInPark() >= CAT_PARK_CONFIG.maxCatsInPark) {
      return { success: false, msg: `最多只能放 ${CAT_PARK_CONFIG.maxCatsInPark} 只猫咪到公园~` };
    }

    cat.inPark = true;   // 公园放置唯一权威标志（uid 级，跨设备稳定；服务端 reconcile 据此投影公园名录）
    save();
    return { success: true, msg: '🐱 猫咪去公园溜达啦~' };
  }

  // 把猫咪从公园带回家
  function takeCatHome(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat || !cat.inPark) {
      return { success: false, msg: '这只猫咪不在公园' };
    }
    cat.inPark = false;   // 同步下架标志（服务端 reconcile 随之软删投影）
    save();
    return { success: true, msg: '🏠 猫咪回家啦~' };
  }

  // 获取玩家在公园的猫咪列表（从 inPark 标志派生；catIndex 为当前数组位置，仅即时使用不持久化）
  function getMyCatsInPark() {
    const list = [];
    state.cats.forEach(function (cat, catIndex) {
      if (!cat.inPark) return;
      list.push({
        catIndex: catIndex,
        uid: cat.uid,
        catId: cat.catId,
        name: cat.name,
        maturityLevel: cat.maturityLevel
      });
    });
    return list;
  }

  // 公园刷新次数：每refreshRegenHours小时恢复1次，储存上限refreshMaxCount
  function getParkRefreshInfo() {
    const intervalMs = CAT_PARK_CONFIG.refreshRegenHours * 3600 * 1000;
    const maxCount = CAT_PARK_CONFIG.refreshMaxCount;
    const pr = state.parkRefresh;
    const now = Date.now();

    // 离线恢复：每过 intervalMs 恢复1次，直到上限
    if (pr.count < maxCount && pr.lastRegenTime) {
      const regen = Math.floor((now - pr.lastRegenTime) / intervalMs);
      if (regen > 0) {
        pr.count = Math.min(maxCount, pr.count + regen);
        // 部分恢复时保留进度；回满时锚点重置
        pr.lastRegenTime = pr.count >= maxCount ? now : pr.lastRegenTime + regen * intervalMs;
        save();
      }
    }

    const nextRegenMs = pr.count >= maxCount ? 0 : Math.max(0, intervalMs - (now - pr.lastRegenTime));
    return {
      count: pr.count,
      maxCount: maxCount,
      nextRegenMs: nextRegenMs,
      intervalMs: intervalMs,
      regenHours: CAT_PARK_CONFIG.refreshRegenHours
    };
  }

  // 换一批：消耗1次刷新次数，重新抽一批（含野猫稀有度抽卡）
  function refreshPark() {
    const info = getParkRefreshInfo();
    if (info.count <= 0) {
      const mins = Math.ceil(info.nextRegenMs / 60000);
      const waitStr = mins >= 60 ? `${Math.floor(mins / 60)}小时${mins % 60}分` : `${mins}分钟`;
      return { success: false, msg: `刷新次数用完啦~ ${waitStr}后恢复1次（每${CAT_PARK_CONFIG.refreshRegenHours}小时+1）`, refresh: info };
    }
    // 从满格开始消耗：恢复计时从消耗这一刻重新起算
    if (state.parkRefresh.count >= info.maxCount) {
      state.parkRefresh.lastRegenTime = Date.now();
    }
    state.parkRefresh.count--;
    generateParkBatch();
    save();
    return { success: true, cats: getParkCats(), refresh: getParkRefreshInfo() };
  }

  // 模拟向其他玩家申请繁育
  function requestBreeding(catIndex, parkCat) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    if (!cat.canBreed || cat.maturityLevel < 3) {
      return { success: false, msg: '猫咪还没长大，不能繁育哦~' };
    }

    // 返回一个模拟的申请结果（异步处理）
    return {
      success: true,
      requestId: Date.now(),
      responseTime: CAT_PARK_CONFIG.responseTime,
      acceptProbability: CAT_PARK_CONFIG.acceptProbability,
      msg: `已向 ${parkCat.owner} 发送繁育申请，等待回应...`
    };
  }

  // 模拟对方回应繁育申请
  function completeBreedingRequest(catIndex, parkCatId, accepted, options = {}) {
    if (!accepted) {
      return { success: false, msg: '对方拒绝了繁育申请...' };
    }

    return doBreeding(catIndex, parkCatId, { 
      partnerIntimacy: options.partnerIntimacy,
      partnerName: options.partnerName,
      partnerUid: options.partnerUid,
      partnerOwnerName: options.partnerOwnerName
    });
  }

  // ===== 获取配置 =====
  // ===== 送猫系统 =====
  function searchUsers(keyword) {
    if (!keyword || keyword.trim() === '') return [];
    const kw = keyword.trim().toLowerCase();
    return window.PET_DATA.MOCK_USERS.filter(u => 
      u.name.toLowerCase().includes(kw) || 
      u.school.toLowerCase().includes(kw)
    ).slice(0, 10); // 最多返回10个结果
  }

  function sendCat(catIndex, targetUserId) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };
    
    // 不能送最后一只猫
    if (state.cats.length <= 1) {
      return { success: false, msg: '至少要留一只猫咪陪伴你哦~' };
    }
    
    // 查找目标用户
    const targetUser = window.PET_DATA.MOCK_USERS.find(u => u.userId === targetUserId);
    if (!targetUser) return { success: false, msg: '找不到该用户' };
    
    // 记录送猫历史
    state.sentCats.unshift({
      catId: cat.catId,
      catName: cat.name,
      rarity: cat.rarity || 'common',
      toUserId: targetUserId,
      toUserName: targetUser.name,
      toUserSchool: targetUser.school,
      intimacy: cat.intimacy || 0,
      sendTime: Date.now()
    });
    
    // 从队伍中移除这只猫
    state.cats.splice(catIndex, 1);
    
    // 如果删掉的是当前猫，切到第一只
    if (state.currentCatIndex >= state.cats.length) {
      state.currentCatIndex = state.cats.length - 1;
    }
    if (state.currentCatIndex < 0) state.currentCatIndex = 0;
    
    // 公园放置标志挂在猫实例上：splice 掉实例即自动下架，无需修正任何下标
    // （旧影子字段 catsInPark 的下标修正逻辑是「公园里显示的猫对不上」的漂移源，已废除）
    
    // 如果是普通猫，返还一个领养名额
    const catData = CATS.find(c => c.id === cat.catId);
    if (catData && catData.rarity === 'common' && state.adoptedCount > 0) {
      state.adoptedCount--;
    }
    
    save();
    return { 
      success: true, 
      msg: `已将 ${cat.name} 送给 ${targetUser.name} 啦~`,
      catName: cat.name,
      targetName: targetUser.name
    };
  }

  function getSentCats() {
    return state.sentCats || [];
  }

  function getReceivedCats() {
    return state.receivedCats || [];
  }

  function getCONFIG() {
    return CAT_CONFIG;
  }

  // ===== 性别系统 =====
  function getGenderLabel(gender) {
    return gender === 'male' ? '弟弟' : gender === 'female' ? '妹妹' : '未知';
  }

  // ===== 栏位系统 =====
  function getPenLimit() {
    const totalCheckins = state.checkin?.totalCheckins || 0;
    const extraSlots = Math.floor(totalCheckins / PEN_CONFIG.signDaysPerSlot);
    const debugBonusSlots = state.debugBonusSlots || 0; // 调试用额外栏位
    const total = Math.min(PEN_CONFIG.maxLimit + debugBonusSlots, PEN_CONFIG.initialLimit + extraSlots + debugBonusSlots);
    const used = state.cats.length;
    const remaining = Math.max(0, total - used);

    // 计算距离下一个栏位还需签到天数
    let nextSlotDays = 0;
    if (total < PEN_CONFIG.maxLimit + debugBonusSlots) {
      const currentSlotCheckins = extraSlots * PEN_CONFIG.signDaysPerSlot;
      nextSlotDays = PEN_CONFIG.signDaysPerSlot - (totalCheckins - currentSlotCheckins);
    }

    return {
      total: total,
      used: used,
      remaining: remaining,
      nextSlotDays: nextSlotDays
    };
  }

  function isPenFull() {
    const limit = getPenLimit();
    return limit.used >= limit.total;
  }

  // 调试：增加栏位（仅用于测试）
  function addDebugSlots(count) {
    count = count || 5;
    state.debugBonusSlots = (state.debugBonusSlots || 0) + count;
    save();
    return { success: true, added: count, totalSlots: getPenLimit().total };
  }

  // 栏位满时的处理结果（供调用方使用）
  function getPenFullOptions() {
    const limit = getPenLimit();
    return {
      code: 'PEN_FULL',
      penLimit: limit.total,
      penLimitInfo: limit,
      catCount: limit.used,
      options: [
        { id: 'replace', label: '替换一只猫咪' },
        { id: 'list_home', label: '去家园上架' },
        { id: 'donate', label: '送给家园（得20金币）' }
      ]
    };
  }

  // ===== 近亲判定系统 =====
  // 追溯三代以内直系亲属是否有共同祖先
  function isInbreeding(cat1Uid, cat2Uid) {
    if (cat1Uid === cat2Uid) return true; // 同一只猫

    const maxGen = BREEDING_CONFIG_EXTRA.inbreedingGenerations || 3;

    // 获取一只猫的所有祖先uid（包含自己，最多追溯maxGen代）
    function getAllAncestors(uid, depth) {
      const ancestors = new Set();
      ancestors.add(uid);
      if (depth >= maxGen) return ancestors;

      const cat = findCatByUid(uid);
      if (cat && cat.parentUids && cat.parentUids.length > 0) {
        for (const parentUid of cat.parentUids) {
          const parentAncestors = getAllAncestors(parentUid, depth + 1);
          parentAncestors.forEach(a => ancestors.add(a));
        }
      }
      return ancestors;
    }

    const ancestors1 = getAllAncestors(cat1Uid, 0);
    const ancestors2 = getAllAncestors(cat2Uid, 0);

    // 检查是否有共同祖先
    for (const uid of ancestors1) {
      if (ancestors2.has(uid)) return true;
    }
    return false;
  }

  // ===== 自繁育功能 =====
  function doSelfBreeding(catIndex1, catIndex2) {
    const cat1 = state.cats[catIndex1];
    const cat2 = state.cats[catIndex2];

    if (!cat1 || !cat2) return { success: false, msg: '猫咪不存在' };
    if (catIndex1 === catIndex2) return { success: false, msg: '不能自己和自己繁育哦~' };

    // 检查是否成年
    if (!cat1.canBreed || cat1.maturityLevel < 3) {
      return { success: false, msg: `${cat1.name}还没长大，不能繁育哦~` };
    }
    if (!cat2.canBreed || cat2.maturityLevel < 3) {
      return { success: false, msg: `${cat2.name}还没长大，不能繁育哦~` };
    }

    // 检查性别（必须异性）
    if (BREEDING_CONFIG_EXTRA.requireOppositeGender && cat1.gender === cat2.gender) {
      return { success: false, msg: '需要异性猫咪才能繁育哦~' };
    }

    // 检查近亲
    if (isInbreeding(cat1.uid, cat2.uid)) {
      return { success: false, msg: '三代以内有血缘关系，不能繁育哦~' };
    }

    // 检查栏位
    if (isPenFull()) {
      return { success: false, msg: '栏位已满，先处理一下猫咪吧~', penFull: true, penInfo: getPenFullOptions() };
    }

    // 确定母猫（检查冷却时间）
    const motherCat = cat1.gender === 'female' ? cat1 : cat2;
    const fatherCat = cat1.gender === 'male' ? cat1 : cat2;
    
    // 检查母猫冷却时间（一周一次，公猫无限制）
    const cooldownCheck = checkBreedingCooldown(motherCat);
    if (!cooldownCheck.canBreed) {
      const catData = window.PET_ENGINE.getCatData ? window.PET_ENGINE.getCatData(motherCat.catId) : null;
      const catName = catData?.name || motherCat.name || '母猫';
      return { success: false, msg: `${catName}需要休息${cooldownCheck.remainingHours}小时后才能再次繁育哦~` };
    }

    // 更新繁育次数（只更新母猫的lastBreedingTime，公猫无限制）
    cat1.breedingCount++;
    cat2.breedingCount++;
    motherCat.lastBreedingTime = Date.now();

    // 计算亲密度加成
    const avgIntimacy = ((cat1.intimacy || 0) + (cat2.intimacy || 0)) / 2;
    const intimacyBonus = Math.min(1, Math.max(0, avgIntimacy / 100));

    // 好感度等级加成（取两只猫的等级平均值）
    const levelInfo1 = getLevelInfo(catIndex1);
    const levelInfo2 = getLevelInfo(catIndex2);
    const level1 = levelInfo1 ? levelInfo1.level : 1;
    const level2 = levelInfo2 ? levelInfo2.level : 1;
    const avgLevel = Math.floor((level1 + level2) / 2);
    const LEVEL_CONFIG_LOCAL = window.PET_DATA.LEVEL_CONFIG;
    const levelBonus = LEVEL_CONFIG_LOCAL && LEVEL_CONFIG_LOCAL.breedingBonus && LEVEL_CONFIG_LOCAL.breedingBonus[avgLevel]
      ? LEVEL_CONFIG_LOCAL.breedingBonus[avgLevel]
      : { rare4: 0, rare5: 0 };

    // 生成小猫（自繁育只生1只）
    const kittenCount = BREEDING_CONFIG_EXTRA.selfBreedingKittens || 1;
    const kittens = [];

    for (let i = 0; i < kittenCount; i++) {
      const offspring = calculateOffspring(cat1.catId, cat2.catId, {
        intimacyBonus: intimacyBonus,
        levelBonus: levelBonus
      });
      if (offspring) {
        const kitten = createCat(offspring.breedId, Date.now(), {
          isKitten: false,
          parentIds: [cat1.catId, cat2.catId],
          parentUids: [cat1.uid, cat2.uid],
          parentOwnerNames: [cat1.ownerName || '我', cat2.ownerName || '我']
        });
        kitten.rarity = offspring.rarity;
        kitten.breedId = offspring.breedId;
        kitten.isSameBreed = offspring.isSameBreed;
        kitten.canBreed = true;
        kitten.intimacy = 0;
        kitten.maturity = 0;
        kittens.push(kitten);

        // 记录到父母的子女列表
        if (!cat1.childrenUids) cat1.childrenUids = [];
        if (!cat1.childrenUids.includes(kitten.uid)) cat1.childrenUids.push(kitten.uid);
        if (!cat2.childrenUids) cat2.childrenUids = [];
        if (!cat2.childrenUids.includes(kitten.uid)) cat2.childrenUids.push(kitten.uid);
      }
    }

    // 小猫加入玩家队伍
    if (kittens.length > 0) {
      state.cats.push(kittens[0]);
    }

    // 记录繁育历史
    state.breedingHistory.unshift({
      time: Date.now(),
      parent1Id: cat1.catId,
      parent2Id: cat2.catId,
      parent1Uid: cat1.uid,
      parent2Uid: cat2.uid,
      kittens: kittens.map(k => k.catId),
      usedTicket: state.breedingTickets >= 0,
      intimacyBonus: intimacyBonus,
      type: 'self'
    });

    save();

    return {
      success: true,
      msg: `🎉 繁育成功！${motherCat.name}生下了 ${kittens.length} 只可爱的小奶猫~`,
      kittens: kittens,
      mother: { name: motherCat.name, uid: motherCat.uid },
      father: { name: fatherCat.name, uid: fatherCat.uid }
    };
  }

  // ===== 猫咪家园（交易市场）=====

  // 上架猫咪到家园
  function listCatOnHome(catIndex, price) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    // 检查家园是否解锁
    if (!isHomeUnlocked()) {
      return { success: false, msg: '猫咪家园还未解锁，完成新手任务后解锁~' };
    }

    // 不能上架最后一只猫
    if (state.cats.length <= 1) {
      return { success: false, msg: '至少要留一只猫咪陪伴你哦~' };
    }

    // 检查上架数量限制
    const myListings = state.homeListings.filter(l => l.sellerId === 'me');
    if (myListings.length >= HOME_CONFIG.maxListingsPerUser) {
      return { success: false, msg: `最多只能同时上架 ${HOME_CONFIG.maxListingsPerUser} 只猫咪~` };
    }

    // 检查价格范围
    const catData = CATS.find(c => c.id === cat.catId);
    const rarityLevel = getCatRarityLevel(cat.catId);
    let minPrice = HOME_CONFIG.minPrice;
    // 稀有品种有最低价格倍数
    if (rarityLevel === 3 && HOME_CONFIG.rareMinPriceMultiplier.rare3) {
      minPrice = Math.max(minPrice, catData.price * HOME_CONFIG.rareMinPriceMultiplier.rare3);
    } else if (rarityLevel === 4 && HOME_CONFIG.rareMinPriceMultiplier.rare4) {
      minPrice = Math.max(minPrice, catData.price * HOME_CONFIG.rareMinPriceMultiplier.rare4);
    } else if (rarityLevel === 5 && HOME_CONFIG.rareMinPriceMultiplier.rare5) {
      minPrice = Math.max(minPrice, catData.price * HOME_CONFIG.rareMinPriceMultiplier.rare5);
    }

    if (price < minPrice) {
      return { success: false, msg: `价格不能低于 ${Math.floor(minPrice)} 蛋蛋币~` };
    }
    if (price > HOME_CONFIG.maxPrice) {
      return { success: false, msg: `价格不能高于 ${HOME_CONFIG.maxPrice} 蛋蛋币~` };
    }

    // 上架手续费
    if (HOME_CONFIG.listingFee > 0) {
      if (!spendCoins(HOME_CONFIG.listingFee, 'home_listing_fee', null)) {
        return { success: false, msg: '蛋蛋币不够支付上架手续费~' };
      }
    }

    const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const listing = {
      id: listingId,
      catId: cat.catId,
      catUid: cat.uid,
      catName: cat.name,
      catGender: cat.gender,
      catMaturityLevel: cat.maturityLevel,
      catIntimacy: cat.intimacy || cat.maturity || 0,
      catRarity: cat.rarity || (catData ? catData.rarity : 'common'),
      rarity: rarityLevel === 0 ? 'common' : ('rare' + rarityLevel),
      rarityLevel: rarityLevel,
      price: price,
      sellerId: 'me',
      sellerName: '我',
      sellerSchool: '我的蛋蛋',
      listTime: Date.now()
    };

    state.homeListings.push(listing);

    // 从猫舍移出
    state.cats.splice(catIndex, 1);
    if (state.currentCatIndex >= state.cats.length) {
      state.currentCatIndex = state.cats.length - 1;
    }
    if (state.currentCatIndex < 0) state.currentCatIndex = 0;

    // 公园放置标志挂在猫实例上：splice 掉实例即自动下架，无需修正任何下标

    // 如果是普通猫，返还一个领养名额
    if (catData && catData.rarity === 'common' && state.adoptedCount > 0) {
      state.adoptedCount--;
    }

    save();
    return { success: true, msg: `🏠 ${cat.name} 已上架到猫咪家园~`, listingId: listingId };
  }

  // 从家园购买猫咪
  function buyCatFromHome(listingId) {
    // 检查家园是否解锁
    if (!isHomeUnlocked()) {
      return { success: false, msg: '猫咪家园还未解锁，完成新手任务后解锁~' };
    }

    // 检查栏位
    if (isPenFull()) {
      return { success: false, msg: '栏位已满，先处理一下猫咪吧~', penFull: true, penInfo: getPenFullOptions() };
    }

    // 查找上架信息（先在玩家自己的上架列表中找，再从模拟市场中找）
    let listing = state.homeListings.find(l => l.id === listingId);

    // 如果不是玩家上架的，从模拟市场生成
    if (!listing) {
      listing = generateMockListing(listingId);
    }

    if (!listing) return { success: false, msg: '该猫咪已下架或不存在' };

    // 不能买自己的猫
    if (listing.sellerId === 'me') {
      return { success: false, msg: '不能购买自己上架的猫咪哦~' };
    }

    // 检查金币
    if (!spendCoins(listing.price, 'home_buy', listing.id)) {
      return { success: false, msg: '蛋蛋币不够哦~' };
    }

    // 创建新猫咪
    const newCat = createCat(listing.catId, Date.now(), {
      gender: listing.catGender || undefined
    });
    // 数值合法性校验：挂牌数据可能来自其它端/被篡改，好感度与成熟度必须各自钳到合法区间
    const { LEVEL_CONFIG } = window.PET_DATA;
    const intimacyCap = LEVEL_CONFIG ? LEVEL_CONFIG.expRequired[LEVEL_CONFIG.maxLevel] : Infinity;
    const boughtIntimacy = clampInt(listing.catIntimacy, 0, intimacyCap);   // 好感度值 0~满级阈值
    newCat.intimacy = boughtIntimacy;
    newCat.totalIntimacy = boughtIntimacy;
    newCat.maturity = clampInt(listing.catMaturity != null ? listing.catMaturity : (listing.catIntimacy || 50), 0, 100);
    newCat.totalMaturity = Math.max(newCat.maturity, 0);
    // 成熟等级：只作用于 maturityLevel / canBreed，绝不能写进好感度等级（两者是不同体系）
    if (typeof listing.catMaturityLevel === 'number') {
      const matLevel = clampInt(listing.catMaturityLevel, 1, 3);
      newCat.maturityLevel = matLevel;
      newCat.canBreed = matLevel >= 3;
    }
    // 好感度等级唯一由好感度值按权威阈值推算
    newCat.level = computeIntimacyLevel(newCat.intimacy);
    if (listing.catRarity) newCat.rarity = listing.catRarity;
    if (listing.catName) newCat.name = listing.catName;

    // 记录历任主人（卖家）
    newCat.ownerHistory = [];
    if (listing.sellerName) {
      newCat.ownerHistory.push({
        name: listing.sellerName,
        time: Date.now(),
        type: 'buy'
      });
    }

    state.cats.push(newCat);
    state.currentCatIndex = state.cats.length - 1;

    // 如果是普通猫，增加已领养数量
    const catData = CATS.find(c => c.id === listing.catId);
    if (catData && catData.rarity === 'common') {
      state.adoptedCount++;
    }

    save();

    return {
      success: true,
      msg: `🎉 成功购买了${listing.catName}！`,
      cat: newCat,
      price: listing.price
    };
  }

  // 生成模拟的上架猫咪（其他用户的）
  function generateMockListing(listingId) {
    // 根据 listingId 解析出对应的猫咪（id 格式：mock_listing_{userId}_{catId}）
    let mockCat = null;
    if (listingId && listingId.startsWith('mock_listing_')) {
      // 去掉前缀 "mock_listing_"，剩下的是 userId_catId
      const rest = listingId.substring('mock_listing_'.length);
      // userId 格式是 u+数字（如 u010），catId 是品种名（如 devon, munchkin）
      // 用第一个下划线分割：userId_catId
      const underscoreIdx = rest.indexOf('_');
      if (underscoreIdx > 0) {
        const userId = rest.substring(0, underscoreIdx);
        const catId = rest.substring(underscoreIdx + 1);
        // 从 MOCK_PARK_CATS 中精确匹配
        mockCat = MOCK_PARK_CATS.find(c => c.userId === userId && c.catId === catId);
      }
    }
    
    // 如果解析失败，回退到随机选择（兼容旧数据）
    if (!mockCat) {
      mockCat = MOCK_PARK_CATS[Math.floor(Math.random() * MOCK_PARK_CATS.length)];
    }
    
    const user = MOCK_USERS.find(u => u.userId === mockCat.userId) || MOCK_USERS[0];
    const catData = CATS.find(c => c.id === mockCat.catId);

    const rarityLevel = getCatRarityLevel(mockCat.catId);
    let basePrice = catData ? catData.price : 100;
    // 稀有度影响价格
    if (rarityLevel >= 3) basePrice *= (1 + rarityLevel * 0.3);
    // 价格用 userId + catId 作为种子，保证同一只猫价格一致
    const seedStr = mockCat.userId + '_' + mockCat.catId;
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) & 0x7fffffff;
    const priceRand = (seed % 100) / 100; // 0~0.99
    const price = Math.floor(basePrice * (0.7 + priceRand * 0.8));

    // 性别也用种子决定，保持一致
    const genderSeed = (seed >> 5) & 1;
    const catGender = genderSeed === 0 ? 'male' : 'female';
    
    // 亲密度也用种子决定
    const intimacy = 40 + (seed % 60);

    return {
      id: listingId || ('mock_listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
      catId: mockCat.catId,
      catUid: 'mock_cat_' + mockCat.userId + '_' + mockCat.catId,
      catName: mockCat.name || (catData ? catData.name : '小猫咪'),
      catGender: catGender,
      catMaturityLevel: 3,
      catIntimacy: intimacy,
      catRarity: catData ? catData.rarity : 'common',
      price: price,
      sellerId: mockCat.userId,
      sellerName: mockCat.owner || user.name,
      sellerSchool: mockCat.school || user.school,
      listTime: Date.now() - Math.floor(Math.random() * 86400000),
      isMock: true
    };
  }

  // 下架自己的猫咪
  function cancelHomeListing(listingId) {
    const idx = state.homeListings.findIndex(l => l.id === listingId);
    if (idx === -1) return { success: false, msg: '上架信息不存在' };

    const listing = state.homeListings[idx];
    if (listing.sellerId !== 'me') {
      return { success: false, msg: '不能下架别人的猫咪哦~' };
    }

    // 检查栏位
    if (isPenFull()) {
      return { success: false, msg: '栏位已满，无法下架猫咪~', penFull: true, penInfo: getPenFullOptions() };
    }

    // 把猫放回猫舍
    const catData = CATS.find(c => c.id === listing.catId);
    const cat = createCat(listing.catId, Date.now(), {
      uid: listing.catUid,
      gender: listing.catGender || undefined
    });
    cat.name = listing.catName || (catData ? catData.name : '小猫咪');
    // catIntimacy 字段里存的是好感度值（旧数据可能和成熟度混用，这里都当作好感度恢复）
    cat.intimacy = listing.catIntimacy || 0;
    cat.totalIntimacy = listing.catIntimacy || 0;
    // 成熟度根据成熟等级设置默认值
    const matLevel = listing.catMaturityLevel || 3;
    cat.maturityLevel = matLevel;
    if (matLevel >= 3) cat.maturity = 50;
    else if (matLevel >= 2) cat.maturity = 30;
    else cat.maturity = 0;
    cat.totalMaturity = cat.maturity;
    // 根据好感度值计算等级（与 addIntimacy 升级判定同语义）
    cat.level = computeIntimacyLevel(cat.intimacy);
    cat.canBreed = matLevel >= 3;
    if (listing.catRarity) cat.rarity = listing.catRarity;

    state.cats.push(cat);

    // 移除上架记录
    state.homeListings.splice(idx, 1);

    // 如果是普通猫，增加已领养数量
    if (catData && catData.rarity === 'common') {
      state.adoptedCount++;
    }

    save();
    return { success: true, msg: `🏠 ${cat.name} 已下架，回到了猫舍~` };
  }

  // 获取家园所有上架猫咪
  function getHomeListings() {
    // 检查家园是否解锁
    if (!isHomeUnlocked()) {
      return { unlocked: false, listings: [], msg: '完成新手任务后解锁猫咪家园~' };
    }

    // 玩家自己的上架
    const myListings = state.homeListings.filter(l => l.sellerId === 'me').map(l => ({
      ...l,
      isMine: true,
      rarityLabel: getCatRarityLabel(l.catId),
      genderLabel: getGenderLabel(l.catGender)
    }));

    // 模拟其他用户的上架猫咪（从 MOCK_PARK_CATS 生成）
    const mockListings = [];
    const shuffled = [...MOCK_PARK_CATS].sort(() => Math.random() - 0.5);
    const mockCount = 8; // 模拟8个上架

    for (let i = 0; i < Math.min(mockCount, shuffled.length); i++) {
      const mockCat = shuffled[i];
      const user = MOCK_USERS.find(u => u.userId === mockCat.userId) || MOCK_USERS[i % MOCK_USERS.length];
      const catData = CATS.find(c => c.id === mockCat.catId);
      const rarityLevel = getCatRarityLevel(mockCat.catId);
      let basePrice = catData ? catData.price : 100;
      // 稀有度影响价格
      if (rarityLevel >= 3) basePrice *= (1 + rarityLevel * 0.3);
      // 用 userId + catId 作为种子生成价格，保证同一只猫价格一致
      const seedStr = mockCat.userId + '_' + mockCat.catId;
      let seed = 0;
      for (let j = 0; j < seedStr.length; j++) seed = (seed * 31 + seedStr.charCodeAt(j)) & 0x7fffffff;
      const priceRand = (seed % 100) / 100;
      const price = Math.floor(basePrice * (0.7 + priceRand * 0.8));
      const genderSeed = (seed >> 5) & 1;
      const catGender = genderSeed === 0 ? 'male' : 'female';
      const intimacy = 40 + (seed % 60);

      mockListings.push({
        id: 'mock_listing_' + mockCat.userId + '_' + mockCat.catId,
        catId: mockCat.catId,
        catUid: 'mock_cat_' + mockCat.userId + '_' + mockCat.catId,
        catName: mockCat.name || (catData ? catData.name : '小猫咪'),
        catGender: catGender,
        catMaturityLevel: 3,
        catIntimacy: intimacy,
        catRarity: catData ? catData.rarity : 'common',
        rarity: rarityLevel === 0 ? 'common' : ('rare' + rarityLevel),
        rarityLevel: rarityLevel,
        price: price,
        sellerId: mockCat.userId,
        sellerName: mockCat.owner || user.name,
        sellerSchool: mockCat.school || user.school,
        listTime: Date.now() - Math.floor(Math.random() * 86400000 * 3),
        isMine: false,
        isMock: true,
        rarityLabel: getCatRarityLabel(mockCat.catId),
        genderLabel: ''
      });
    }

    // 按上架时间排序（最新的在前）
    const allListings = [...myListings, ...mockListings].sort((a, b) => b.listTime - a.listTime);

    return {
      unlocked: true,
      listings: allListings,
      myListingCount: myListings.length,
      maxListings: HOME_CONFIG.maxListingsPerUser
    };
  }

  // 送给猫咪家园（捐赠，得金币奖励）
  function donateCatToHome(catIndex) {
    const cat = state.cats[catIndex];
    if (!cat) return { success: false, msg: '猫咪不存在' };

    // 不能送最后一只猫
    if (state.cats.length <= 1) {
      return { success: false, msg: '至少要留一只猫咪陪伴你哦~' };
    }

    const reward = PEN_CONFIG.donateReward || 20;
    addCoins(reward, 'donate', {});

    const catName = cat.name;

    // 从队伍中移除
    state.cats.splice(catIndex, 1);
    if (state.currentCatIndex >= state.cats.length) {
      state.currentCatIndex = state.cats.length - 1;
    }
    if (state.currentCatIndex < 0) state.currentCatIndex = 0;

    // 公园放置标志挂在猫实例上：splice 掉实例即自动下架，无需修正任何下标

    // 如果是普通猫，返还一个领养名额
    const catData = CATS.find(c => c.id === cat.catId);
    if (catData && catData.rarity === 'common' && state.adoptedCount > 0) {
      state.adoptedCount--;
    }

    save();
    return { success: true, msg: `🏠 ${catName} 去了猫咪家园，获得了 ${reward} 蛋蛋币奖励~`, reward: reward };
  }

  // ===== 新手任务系统 =====
  function getNewbieTasks() {
    return NEWBIE_TASKS.map(task => ({
      ...task,
      completed: !!state.newbieTasks[task.id],
      claimed: !!state.newbieTasks[task.id]
    }));
  }

  function checkNewbieTask(taskId) {
    const task = NEWBIE_TASKS.find(t => t.id === taskId);
    if (!task) return { exists: false, completed: false };
    return {
      exists: true,
      completed: !!state.newbieTasks[taskId],
      task: task
    };
  }

  function completeNewbieTask(taskId) {
    const task = NEWBIE_TASKS.find(t => t.id === taskId);
    if (!task) return { success: false, msg: '任务不存在' };

    if (state.newbieTasks[taskId]) {
      return { success: false, msg: '任务已经完成啦~' };
    }

    // 标记完成
    state.newbieTasks[taskId] = {
      completedAt: Date.now(),
      claimed: true
    };

    // 发放奖励（根据类型）
    let rewardMsg = '';
    if (task.rewardType === 'stray_adoption') {
      // 增加一个领养名额
      state.adoptionSlots = Math.min(ADOPTION_CONFIG.maxSlots, state.adoptionSlots + 1);
      rewardMsg = '解锁了流浪猫领养资格！';
    } else if (task.rewardType === 'unlock_home') {
      rewardMsg = '永久解锁了「猫咪家园」！';
    }

    save();
    return {
      success: true,
      msg: `🎉 新手任务完成！${rewardMsg}`,
      task: task,
      reward: task.reward
    };
  }

  // 检查家园是否解锁
  function isHomeUnlocked() {
    return !!state.newbieTasks['newbie_post_or_claim_task'];
  }

  // ===== 每日任务系统 =====
  // 检查并刷新每日任务
  function checkDailyReset() {
    const today = getTodayStr();
    if (state.lastDailyResetDate !== today) {
      // 新的一天，重置每日任务
      state.dailyTasks = {};
      state.lastDailyResetDate = today;
      // 初始化每个任务的进度
      DAILY_TASKS.forEach(task => {
        state.dailyTasks[task.id] = {
          progress: 0,
          claimed: false
        };
      });
      save();
    }
  }

  function getDailyTasks() {
    checkDailyReset();

    return DAILY_TASKS.map(task => {
      const taskState = state.dailyTasks[task.id] || { progress: 0, claimed: false };
      
      // 生成奖励描述文本
      let rewardText = '';
      let rewardIcon = '🎁';
      if (task.reward) {
        if (task.reward.type === 'random_food_toy') {
          rewardText = `食物玩具×${task.reward.count || 2}`;
          rewardIcon = '🍖';
        } else if (task.reward.type === 'coins') {
          rewardText = `${task.reward.count || 0}金币`;
          rewardIcon = '💰';
        } else {
          rewardText = '神秘奖励';
        }
      }

      return {
        ...task,
        progress: taskState.progress,
        claimed: taskState.claimed,
        completed: taskState.progress >= task.target,
        canClaim: taskState.progress >= task.target && !taskState.claimed,
        rewardText: rewardText,
        rewardIcon: rewardIcon
      };
    });
  }

  function claimDailyTaskReward(taskId) {
    checkDailyReset();

    const task = DAILY_TASKS.find(t => t.id === taskId);
    if (!task) return { success: false, msg: '任务不存在' };

    const taskState = state.dailyTasks[taskId];
    if (!taskState) return { success: false, msg: '任务不存在' };

    if (taskState.claimed) {
      return { success: false, msg: '今天已经领取过奖励啦~' };
    }

    if (taskState.progress < task.target) {
      return { success: false, msg: '任务还未完成哦~' };
    }

    // 发放奖励
    const rewards = { foods: [], toys: [] };
    if (task.reward && task.reward.type === 'random_food_toy') {
      const count = task.reward.count || 2;
      for (let i = 0; i < count; i++) {
        if (Math.random() < 0.5) {
          // 随机食物
          const food = FOODS[Math.floor(Math.random() * FOODS.length)];
          state.inventory.foods[food.id] = (state.inventory.foods[food.id] || 0) + 1;
          const existing = rewards.foods.find(f => f.id === food.id);
          if (existing) existing.count++;
          else rewards.foods.push({ ...food, count: 1 });
        } else {
          // 随机玩具
          const toy = TOYS[Math.floor(Math.random() * TOYS.length)];
          state.inventory.toys[toy.id] = (state.inventory.toys[toy.id] || 0) + 1;
          const existing = rewards.toys.find(t => t.id === toy.id);
          if (existing) existing.count++;
          else rewards.toys.push({ ...toy, count: 1 });
        }
      }
    }

    taskState.claimed = true;
    save();

    return {
      success: true,
      msg: '🎉 奖励领取成功！',
      rewards: rewards,
      task: task
    };
  }

  // 增加每日任务进度（模拟外部调用）
  function incrementDailyTask(taskKey, amount = 1) {
    checkDailyReset();

    // 通过 checkKey 找到对应的任务
    const task = DAILY_TASKS.find(t => t.checkKey === taskKey);
    if (!task) return { success: false, msg: '任务不存在' };

    if (!state.dailyTasks[task.id]) {
      state.dailyTasks[task.id] = { progress: 0, claimed: false };
    }

    const taskState = state.dailyTasks[task.id];
    if (taskState.progress >= task.target) {
      return { success: true, completed: true, alreadyCompleted: true };
    }

    taskState.progress = Math.min(task.target, taskState.progress + amount);
    const justCompleted = taskState.progress >= task.target;

    save();

    return {
      success: true,
      taskId: task.id,
      progress: taskState.progress,
      target: task.target,
      completed: taskState.progress >= task.target,
      justCompleted: justCompleted
    };
  }

  // ===== 测试模式 =====
  // P2 金币合并后已移除：该入口会绕过新手任务/签到进度白拿栏位与解锁，
  // 且历史上直接送 5000 币（合并后等于空投真实蛋蛋币）。
  // 对应 UI 的 🧪 按钮与 adoptCatFree（免费领养绕过扣费）一并移除。

  return {
    init,
    save,
    getState,
    getCurrentCat,
    getCatData,
    selectCat,
    adoptCat,
    isCatAdopted,
    feedCat,
    playWithCat,
    petCat,
    addIntimacy,
    getEnergyBonus,
    getLevelInfo,
    computeIntimacyLevel,
    sanitizeCats,
    // 冒险系统
    startAdventure,
    getAdventureProgress,
    claimAdventureReward,
    cleanPoop,
    toggleSleep,
    buyFood,
    buyToy,
    buyItem,
    useItem,
    getItemBonuses,
    addCoins,
    spendCoins,
    startFocus,
    getFocusProgress,
    stopFocus,
    openBlindBox,
    canCheckIn,
    getCheckinInfo,
    doCheckin,
    updateAllCats,
    // 成熟度系统
    addMaturity,
    getMaturityInfo,
    // 繁育系统
    getCatRarityLevel,
    getCatRarityLabel,
    calculateOffspring,
    doBreeding,
    blindAdopt,
    adoptStrayCat,
    addCatFromPark,
    getAdoptionSlots,
    checkBreedingCooldown,
    // 族谱系统
    findCatByUid,
    getFamilyTree,
    getAllDescendants,
    // 送猫系统
    searchUsers,
    sendCat,
    getSentCats,
    getReceivedCats,
    // 猫咪公园
    getParkCats,
    setParkSceneCats,
    getParkSceneSignature,
    refreshPark,
    getParkRefreshInfo,
    requestBreeding,
    completeBreedingRequest,
    putCatInPark,
    takeCatHome,
    getMyCatsInPark,
    // 性别系统
    getGenderLabel,
    // 栏位系统
    getPenLimit,
    isPenFull,
    getPenFullOptions,
    addDebugSlots, // 调试：增加栏位
    // 近亲判定
    isInbreeding,
    // 自繁育
    doSelfBreeding,
    // 猫咪家园
    listCatOnHome,
    buyCatFromHome,
    cancelHomeListing,
    getHomeListings,
    donateCatToHome,
    // 新手任务
    getNewbieTasks,
    checkNewbieTask,
    completeNewbieTask,
    isHomeUnlocked,
    // 每日任务
    getDailyTasks,
    claimDailyTaskReward,
    incrementDailyTask,
    checkDailyReset,
    // 配置访问
    get CONFIG() { return CAT_CONFIG; },
    get BREEDING_CONFIG() { return BREEDING_CONFIG; },
    get BREEDING_CONFIG_EXTRA() { return BREEDING_CONFIG_EXTRA; },
    get CAT_PARK_CONFIG() { return CAT_PARK_CONFIG; },
    get ADOPTION_CONFIG() { return ADOPTION_CONFIG; },
    get PEN_CONFIG() { return PEN_CONFIG; },
    get HOME_CONFIG() { return HOME_CONFIG; },
    get FOCUS_PET_REWARDS() { return FOCUS_PET_REWARDS; },
    get CATS() { return CATS; },
    get FOODS() { return FOODS; },
    get TOYS() { return TOYS; },
    get ITEMS() { return ITEMS; },
    get NEWBIE_TASKS() { return NEWBIE_TASKS; },
    get DAILY_TASKS() { return DAILY_TASKS; },
    get RARITY_CONFIG() { return RARITY_CONFIG; }
  };
})();
