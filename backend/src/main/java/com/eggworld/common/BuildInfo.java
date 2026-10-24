package com.eggworld.common;

import lombok.Getter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Properties;

/**
 * 构建信息：由打包脚本 backend/build-deploy.ps1 写入 build-info.properties 并打进 jar，
 * 用于线上自查「当前跑的是哪一版」（通过 GET /api/health 暴露）。
 *
 * <p>本地 IDE 运行 / 单元测试时没有该文件，各字段留空字符串，不影响启动。
 */
@Component
@Getter
public class BuildInfo {

    /** 本次上线名称（与迁移文档同名），如 2026-09-13_用户管理改密 */
    private final String version;

    /** 打包时的 commit 短 hash（工作区有未提交改动时带 -dirty 后缀） */
    private final String gitSha;

    /** 打包时间（UTC，ISO-8601） */
    private final String buildTime;

    public BuildInfo() {
        Properties p = new Properties();
        try (InputStream in = new ClassPathResource("build-info.properties").getInputStream()) {
            // 文件由脚本以 UTF-8 无 BOM 写出，故这里显式用 UTF-8 读取（Properties 默认是 ISO-8859-1）
            p.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        } catch (Exception e) {
            // 未注入（本地开发）：留空
        }
        this.version = p.getProperty("version", "");
        this.gitSha = p.getProperty("gitSha", "");
        this.buildTime = p.getProperty("buildTime", "");
    }
}
