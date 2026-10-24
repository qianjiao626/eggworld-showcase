package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.service.CatCabinService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 猫咪小屋（移动端任务广场 tab）：存档读写 + 蛋蛋币合并接口。
 * 鉴权走 JwtInterceptor（/api/** 默认需登录），按 UserContext.userId() 隔离。
 */
@RestController
@RequestMapping("/api/cat-cabin")
@RequiredArgsConstructor
public class CatCabinController {

    private final CatCabinService service;

    /** 拉取存档：{ exists, version, save(coins=真实余额), coins }。 */
    @GetMapping("/state")
    public Result<Map<String, Object>> state() {
        return Result.ok(service.getState(UserContext.userId()));
    }

    /** 保存存档（乐观锁）：baseVersion 冲突返回 code=409；coins 字段服务端覆盖为真实余额。 */
    @PostMapping("/state")
    public Result<Map<String, Object>> save(@RequestBody SaveRequest req) {
        return Result.ok(service.saveState(UserContext.userId(), req.getSave(), req.getBaseVersion()));
    }

    /** 扣币（reason 白名单 + 限额）：余额不足返回 code=402，前端回滚。 */
    @PostMapping("/spend")
    public Result<Map<String, Object>> spend(@RequestBody SpendRequest req) {
        return Result.ok(service.spend(UserContext.userId(), req.getReason(), req.getRefId(), req.getAmount()));
    }

    /** 赚币（签到/捐赠）：资格与金额全服务端权威（每天一次 + 每日封顶），前端只报事件。 */
    @PostMapping("/earn")
    public Result<Map<String, Object>> earn(@RequestBody EarnRequest req) {
        return Result.ok(service.earn(UserContext.userId(), req.getReason(),
                Boolean.TRUE.equals(req.getSlotFull())));
    }

    /** 「看看猫咪在想什么」：服务端权威 6 小时冷却（防改本地时间刷好感度）。 */
    @PostMapping("/thought")
    public Result<Map<String, Object>> thought() {
        return Result.ok(service.claimThought(UserContext.userId()));
    }

    @Data public static class SaveRequest { private Map<String, Object> save; private int baseVersion; }
    @Data public static class SpendRequest { private String reason; private String refId; private int amount; }
    @Data public static class EarnRequest { private String reason; private Boolean slotFull; }
}
