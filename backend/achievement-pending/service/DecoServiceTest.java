package com.eggworld.service;
import com.eggworld.common.BusinessException;
import com.eggworld.dto.*;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class DecoServiceTest {
 UserEquipMapper equips=mock(UserEquipMapper.class);
 AchievementService achievements=mock(AchievementService.class);
 DecoService service=new DecoService(equips,achievements,mock(AchievementMapper.class));
 EquipDTO dto(String slot,String key){ EquipDTO d=new EquipDTO();d.setSlot(slot);d.setKey(key);return d; }
 @Test void titleMustBeWhitelistedEvenIfDatabaseRewardIsCorrupt(){
  when(achievements.loadUnlockedKeys(1L)).thenReturn(new AchievementService.UnlockedKeys(Set.of(),Set.of("a-moon")));
  assertThrows(BusinessException.class,()->service.equip(1L,dto("title","a-moon")));
  verifyNoInteractions(equips);
 }
 @Test void lockedEffectRejected(){
  when(achievements.loadUnlockedKeys(1L)).thenReturn(new AchievementService.UnlockedKeys(Set.of(),Set.of()));
  assertThrows(BusinessException.class,()->service.equip(1L,dto("aura","a-moon")));
 }
 @Test void lockedTitleRejected(){
  when(achievements.loadUnlockedKeys(1L)).thenReturn(new AchievementService.UnlockedKeys(Set.of(),Set.of()));
  assertThrows(BusinessException.class,()->service.equip(1L,dto("title","t-newbie")));
 }
 @Test void invalidSlotAndCrossSlotRejected(){
  when(achievements.loadUnlockedKeys(1L)).thenReturn(new AchievementService.UnlockedKeys(Set.of("sk-gold"),Set.of()));
  assertThrows(BusinessException.class,()->service.equip(1L,dto("hat","a-moon")));
  assertThrows(BusinessException.class,()->service.equip(1L,dto("aura","sk-gold")));
  assertThrows(BusinessException.class,()->service.equip(1L,dto("aura","<script>")));
 }
 @Test void batchUsesOneQuery(){
  when(equips.selectDecosByUserIds(anyCollection())).thenReturn(List.of());
  service.loadDecos(Arrays.asList(1L,2L,1L,null));
  verify(equips,times(1)).selectDecosByUserIds(Set.of(1L,2L));verifyNoMoreInteractions(equips);
 }
 @Test void emptyBatchDoesNotQuery(){service.loadDecos(List.of());verifyNoInteractions(equips);}
}
