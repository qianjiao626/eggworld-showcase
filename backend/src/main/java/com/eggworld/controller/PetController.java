package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.PetService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 宠物系统 v2.1（实验室.beta）：商店、背包、孵化、喂食/互动、我的宠物。
 */
@RestController
@RequestMapping("/api/pets")
@RequiredArgsConstructor
public class PetController {

    private final PetService service;

    @GetMapping("/shop")
    public Result<Map<String, Object>> shop() { return Result.ok(service.shop()); }

    @GetMapping("/inventory")
    public Result<List<Map<String, Object>>> inventory() { return Result.ok(service.inventory(UserContext.userId())); }

    @PostMapping("/buy")
    public Result<Map<String, Object>> buy(@RequestBody BuyRequest req) {
        return Result.ok(service.buy(UserContext.userId(), req.getItemId(), req.getQty() <= 0 ? 1 : req.getQty()));
    }

    @GetMapping("/mine")
    public Result<List<Map<String, Object>>> mine() { return Result.ok(service.myPets(UserContext.userId())); }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable long id) { return Result.ok(service.petDetail(UserContext.userId(), id)); }

    @PostMapping("/hatch")
    public Result<Map<String, Object>> hatch(@RequestBody(required = false) HatchRequest req) {
        return Result.ok(service.hatch(UserContext.userId(), req != null && req.isRare()));
    }

    @PostMapping("/{id}/feed")
    public Result<Map<String, Object>> feed(@PathVariable long id, @RequestBody FeedRequest req) {
        return Result.ok(service.feed(UserContext.userId(), id, req.getFoodId()));
    }

    @PostMapping("/{id}/interact")
    public Result<Map<String, Object>> interact(@PathVariable long id, @RequestBody InteractRequest req) {
        return Result.ok(service.interact(UserContext.userId(), id, req.getAction()));
    }

    @PostMapping("/{id}/rename")
    public Result<Void> rename(@PathVariable long id, @RequestBody RenameRequest req) {
        service.rename(UserContext.userId(), id, req.getNickname());
        return Result.ok();
    }

    @Data public static class BuyRequest { private String itemId; private int qty; }
    @Data public static class HatchRequest { private boolean rare; }
    @Data public static class FeedRequest { private String foodId; }
    @Data public static class InteractRequest { private String action; }
    @Data public static class RenameRequest { private String nickname; }
}
