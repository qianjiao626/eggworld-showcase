package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.common.DecoConstants;
import com.eggworld.dto.DecoCatalogVO;
import com.eggworld.dto.DecoItemVO;
import com.eggworld.dto.DecoVO;
import com.eggworld.dto.EquipDTO;
import com.eggworld.entity.Achievement;
import com.eggworld.entity.Title;
import com.eggworld.entity.UserEquip;
import com.eggworld.mapper.AchievementMapper;
import com.eggworld.mapper.UserEquipMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 装扮服务：批量加载（全站展示用）、穿戴校验、装扮图鉴。
 *
 * 性能约束：loadDecos 必须是一次批量查询，禁止在循环内逐用户查库
 * —— 全站所有列表接口都会调用它。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DecoService {

    private final UserEquipMapper userEquipMapper;
    private final AchievementService achievementService;
    private final AchievementMapper achievementMapper;

    /* ==================== 批量加载（全站展示） ==================== */

    /** 批量加载多个用户的装扮。无装扮的用户不会出现在返回的 Map 中。 */
    public Map<Long, DecoVO> loadDecos(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) return Collections.emptyMap();
        // 去重 + 过滤 null，避免 IN 子句出现重复或 NULL
        Set<Long> ids = new HashSet<>();
        for (Long id : userIds) {
            if (id != null) ids.add(id);
        }
        if (ids.isEmpty()) return Collections.emptyMap();

        List<DecoVO> rows = userEquipMapper.selectDecosByUserIds(ids);
        Map<Long, DecoVO> map = new HashMap<>(Math.max(4, rows.size() * 2));
        for (DecoVO row : rows) {
            if (row == null || row.getUserId() == null) continue;
            if (row.isEmpty()) continue;   // 全部槽位为空则不返回，前端按默认样式渲染
            map.put(row.getUserId(), row);
        }
        return map;
    }

    /** 单个用户的装扮（可返回 null） */
    public DecoVO getEquip(Long userId) {
        if (userId == null) return null;
        UserEquip ue = userEquipMapper.selectById(userId);
        if (ue == null) return null;
        DecoVO vo = toVO(ue);
        return vo;   // 允许返回空对象，前端据 isEmpty 判断
    }

    private DecoVO toVO(UserEquip ue) {
        DecoVO vo = new DecoVO();
        vo.setUserId(ue.getUserId());
        vo.setAura(ue.getAuraKey());
        vo.setCloak(ue.getCloakKey());
        vo.setOutfit(ue.getOutfitKey());
        vo.setFrame(ue.getFrameKey());
        vo.setCharm(ue.getCharmKey());
        vo.setTitle(ue.getTitleKey());
        vo.setSkin(ue.getSkinKey());
        if (ue.getTitleKey() != null) {
            Title t = achievementService.titleMap().get(ue.getTitleKey());
            if (t != null) {
                vo.setTitleName(t.getName());
                vo.setTitleStyle(t.getStyleClass());
            }
        }
        return vo;
    }

    /* ==================== 穿戴 / 卸下 ==================== */

    /**
     * 穿戴或卸下装扮（key 为空 = 卸下该槽位）。
     *
     * 四项校验（缺一不可）：
     *   1. slot 合法
     *   2. key 合法（特效在白名单内且前缀与槽位匹配；称号存在于 titles 表）
     *   3. 该装扮确实由「用户已解锁的成就」发放（防越权穿戴未解锁装扮）
     */
    @Transactional
    public DecoVO equip(Long userId, EquipDTO dto) {
        String slot = dto.getSlot();
        if (!DecoConstants.isValidSlot(slot)) {
            throw new BusinessException("非法的装扮槽位");
        }
        String key = dto.getKey() == null ? null : dto.getKey().trim();
        if (key != null && key.isEmpty()) key = null;

        if (key != null) {
            if ("title".equals(slot) && (!key.startsWith("t-") || !DecoConstants.TITLE_WHITELIST.contains(key))) {
                throw new BusinessException("非法的称号标识");
            }
            AchievementService.UnlockedKeys unlocked = achievementService.loadUnlockedKeys(userId);
            if ("title".equals(slot)) {
                if (!unlocked.titles.contains(key)) {
                    throw new BusinessException("该称号尚未解锁，无法佩戴");
                }
            } else {
                if (!DecoConstants.isValidEffect(key)) {
                    throw new BusinessException("非法的特效标识");
                }
                if (!slot.equals(DecoConstants.slotOfEffect(key))) {
                    throw new BusinessException("该特效不属于「" + slot + "」槽位");
                }
                if (!unlocked.effects.contains(key)) {
                    throw new BusinessException("该特效尚未解锁，无法佩戴");
                }
            }
        }

        // 单语句 upsert，只更新所选槽位；显式写 NULL 支持卸下，并避免并发穿戴覆盖其他槽位。
        userEquipMapper.upsertSlot(userId, slot, key);
        return getEquip(userId);
    }

    /* ==================== 装扮图鉴 ==================== */

    /** 全部特效 + 全部称号，标注是否已解锁及来源成就 */
    public DecoCatalogVO catalog(Long userId) {
        AchievementService.UnlockedKeys unlocked = achievementService.loadUnlockedKeys(userId);

        // 建立 key → 来源成就名 的映射
        Map<String, String> effectSource = new HashMap<>();
        Map<String, String> titleSource = new HashMap<>();
        for (Achievement a : achievementMapper.selectAllEnabled()) {
            if (a.getRewardEffectKey() != null) effectSource.put(a.getRewardEffectKey(), a.getName());
            if (a.getRewardTitleKey() != null) titleSource.put(a.getRewardTitleKey(), a.getName());
        }

        List<DecoItemVO> effects = new ArrayList<>();
        for (Map.Entry<String, String> e : DecoConstants.EFFECT_NAMES.entrySet()) {
            String key = e.getKey();
            DecoItemVO item = new DecoItemVO();
            item.setKey(key);
            item.setName(e.getValue());
            item.setSlot(DecoConstants.slotOfEffect(key));
            item.setUnlocked(unlocked.effects.contains(key));
            item.setSourceAchName(effectSource.get(key));
            effects.add(item);
        }

        List<DecoItemVO> titles = new ArrayList<>();
        for (Title t : achievementService.listTitles()) {
            DecoItemVO item = new DecoItemVO();
            item.setKey(t.getTitleKey());
            item.setName(t.getName());
            item.setStyleClass(t.getStyleClass());
            item.setUnlocked(unlocked.titles.contains(t.getTitleKey()));
            item.setSourceAchName(titleSource.get(t.getTitleKey()));
            titles.add(item);
        }

        DecoCatalogVO vo = new DecoCatalogVO();
        vo.setEffects(effects);
        vo.setTitles(titles);
        vo.setTotalEffects(effects.size());
        vo.setTotalTitles(titles.size());
        vo.setUnlockedEffects(countUnlocked(effects));
        vo.setUnlockedTitles(countUnlocked(titles));
        return vo;
    }

    private int countUnlocked(List<DecoItemVO> items) {
        int n = 0;
        for (DecoItemVO i : items) {
            if (i.isUnlocked()) n++;
        }
        return n;
    }
}
