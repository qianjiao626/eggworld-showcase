package com.eggworld.controller;

import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.DecoCatalogVO;
import com.eggworld.service.DecoService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 装扮图鉴接口
 */
@RestController
@RequestMapping("/api/deco")
@RequiredArgsConstructor
public class DecoController {

    private final DecoService decoService;

    /** 全部特效与称号 + 我是否已解锁（装扮页数据源） */
    @GetMapping("/catalog")
    public Result<DecoCatalogVO> catalog() {
        return Result.ok(decoService.catalog(UserContext.userId()));
    }
}
