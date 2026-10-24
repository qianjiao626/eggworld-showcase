package com.eggworld.service;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PetServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PointService pointService = mock(PointService.class);
    private final PetService service = new PetService(jdbc, pointService);

    @Test
    void shopExposesFoodsToysItems() {
        Map<String, Object> shop = service.shop();
        assertTrue(shop.containsKey("foods"));
        assertTrue(shop.containsKey("toys"));
        assertTrue(shop.containsKey("items"));
        assertEquals(24, ((java.util.List<?>) shop.get("foods")).size(), "8 系 × 3 档 = 24 种食物");
    }

    @Test
    void buyingDeductsCoinsThroughPointService() {
        when(pointService.getBalance(42L)).thenReturn(100);
        Map<String, Object> res = service.buy(42L, "food_grass_1", 2);
        verify(pointService).changeBalance(eq(42L), eq(-10), eq("spend"), contains("宠物商店"), isNull());
        assertEquals(10, res.get("cost"));
        verify(jdbc).update(argThat(sql -> sql.contains("pet_inventory")), eq(42L), eq("food_grass_1"), eq(2));
    }

    @Test
    void buyRejectsUnknownItemAndBadQty() {
        assertThrows(com.eggworld.common.BusinessException.class, () -> service.buy(42L, "nope", 1));
        assertThrows(com.eggworld.common.BusinessException.class, () -> service.buy(42L, "food_grass_1", 0));
        assertThrows(com.eggworld.common.BusinessException.class, () -> service.buy(null, "food_grass_1", 1));
        verifyNoInteractions(pointService);
    }
}
