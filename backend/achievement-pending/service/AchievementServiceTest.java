package com.eggworld.service;

import com.eggworld.entity.Achievement;
import com.eggworld.entity.UserAchievement;
import com.eggworld.mapper.*;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AchievementServiceTest {
 @Test void duplicateInsertNeverCreatesSecondNotification() {
  var definitions=mock(AchievementMapper.class);var progress=mock(AchievementProgressMapper.class);
  var unlocked=mock(UserAchievementMapper.class);var notices=mock(NotificationService.class);
  var tx=mock(PlatformTransactionManager.class);when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
  var a=new Achievement();a.setId(1L);a.setCategory("checkin");a.setCondType("checkin_total");a.setCondValue(1);
  when(definitions.selectEnabledByCategory("checkin")).thenReturn(List.of(a));
  when(unlocked.selectUnlockedAchIds(7L)).thenReturn(List.of());when(progress.countCheckinTotal(7L)).thenReturn(1);
  when(unlocked.insert(any(UserAchievement.class))).thenThrow(new DuplicateKeyException("uk_user_ach"));
  var service=new AchievementService(definitions,progress,unlocked,mock(TitleMapper.class),notices,tx);
  assertDoesNotThrow(()->service.evaluate(7L,"checkin"));verify(unlocked).insert(any(UserAchievement.class));verifyNoInteractions(notices);
  verify(tx).commit(any());verify(tx,never()).rollback(any());
 }
}
