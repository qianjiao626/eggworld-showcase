package com.eggworld.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * 大师兄简历 · AI 对标分析。
 *
 * 简历站已改为静态站点（同域 /rs/，随前端一起发布），它唯一需要服务端的能力就是这次
 * DeepSeek 调用，因此从 Next.js 的 API Route 迁到这里。密钥只从环境变量
 * （DEEPSEEK_API_KEY）或服务器未入库的 config/application.yml 注入，不写进仓库。
 */
@Slf4j
@Service
public class ResumeAnalysisService {

    private static final String SYSTEM_PROMPT =
            "你是一名来自大厂的资深面试官。你擅长对比简历与 JD 的匹配度，并给出毒辣且专业的批改建议。你必须以 JSON 格式回复。";

    private static final int MAX_JD_LENGTH = 1000;
    private static final int MAX_RESUME_LENGTH = 3000;

    private final String apiKey;
    private final String apiUrl;
    private final Duration timeout;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public ResumeAnalysisService(
            @Value("${eggworld.resume.deepseek-key:}") String apiKey,
            @Value("${eggworld.resume.deepseek-url:https://api.deepseek.com/chat/completions}") String apiUrl,
            @Value("${eggworld.resume.timeout-seconds:60}") long timeoutSeconds) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    /**
     * 返回 DeepSeek 给出的结构化报告（score / summary / highlights）。
     * 失败时抛 IllegalStateException，消息可直接展示给用户。
     */
    public JsonNode analyze(String resumeText, String jdText) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("专家系统未就绪");
        }

        String jd = truncate(jdText, MAX_JD_LENGTH);
        String resume = truncate(resumeText, MAX_RESUME_LENGTH);

        ObjectNode payload = mapper.createObjectNode();
        payload.put("model", "deepseek-chat");
        ArrayNode messages = payload.putArray("messages");
        messages.addObject().put("role", "system").put("content", SYSTEM_PROMPT);
        messages.addObject().put("role", "user").put("content", userPrompt(jd, resume));
        payload.putObject("response_format").put("type", "json_object");
        payload.put("stream", false);

        String body;
        try {
            body = mapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("对标请求构造失败，请稍后重试");
        }

        HttpRequest request = HttpRequest.newBuilder(URI.create(apiUrl))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("对标超时，请稍后重试");
        } catch (Exception e) {
            log.warn("简历对标请求失败: {}", e.getMessage());
            throw new IllegalStateException("对标服务暂时不可用，请稍后重试");
        }

        if (response.statusCode() != 200) {
            log.warn("简历对标上游返回异常状态: {}", response.statusCode());
            throw new IllegalStateException("对标服务暂时不可用（HTTP " + response.statusCode() + "）");
        }

        try {
            JsonNode content = mapper.readTree(response.body())
                    .path("choices").path(0).path("message").path("content");
            String text = content.asText("").replace("```json", "").replace("```", "").trim();
            if (text.isEmpty()) {
                throw new IllegalStateException("报告生成失败，请稍后重试");
            }
            return mapper.readTree(text);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("简历对标结果解析失败: {}", e.getMessage());
            throw new IllegalStateException("报告生成格式异常，请重试");
        }
    }

    private static String truncate(String text, int max) {
        if (text == null) return "";
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static String userPrompt(String jd, String resume) {
        return """
                【目标岗位 JD】:
                "%s"

                【我的简历】:
                "%s"

                任务要求：
                1. 综合分析简历与 JD 的契合度得分（0-100）。
                2. 指出简历中 3-5 个核心问题（如缺乏相关经验、关键词不匹配、描述没量化等）。
                3. 针对每个问题，从原文中摘取一小段，并给出优化后的“专家改写范例”。

                严格按以下 JSON 结构返回：
                {
                  "score": 85,
                  "summary": "匹配度总评（50字以内）",
                  "highlights": [
                    {
                      "title": "问题标题",
                      "detail": "深度分析建议",
                      "original_context": "原文中的一小段话",
                      "expert_rewrite": "改写后的范例段落"
                    }
                  ]
                }
                """.formatted(jd, resume);
    }
}
