package com.eggworld.controller;

import com.eggworld.common.BuildInfo;
import com.eggworld.common.Result;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查 + 版本自查接口
 *
 * <p>GET /api/health → { code:200, msg:ok, data:{ status, version, gitSha, buildTime } }
 * <p>其中 version / gitSha / buildTime 由打包脚本注入（见 backend/build-deploy.ps1 与 {@link BuildInfo}），
 * 便于任何时候确认「线上跑的是哪一版」；本地 IDE 运行时三项为空串。
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class HealthController {

    private final BuildInfo buildInfo;

    @GetMapping("/health")
    public Result<Map<String, String>> health() {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("status", "up");
        data.put("version", buildInfo.getVersion());
        data.put("gitSha", buildInfo.getGitSha());
        data.put("buildTime", buildInfo.getBuildTime());
        return Result.ok(data);
    }
}
