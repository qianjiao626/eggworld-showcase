package com.eggworld.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 大师兄简历 AI 对标：验证「密钥缺失快速失败 / 围栏 JSON 解析 / 超长输入截断 / 上游异常友好化」。
 * 用本机 HttpServer 伪造 DeepSeek，不打真实外网、不消耗额度。
 */
class ResumeAnalysisServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HttpServer server;
    private final AtomicReference<String> receivedBody = new AtomicReference<>("");
    private final AtomicReference<String> receivedAuth = new AtomicReference<>("");
    private String okUrl;
    private String failUrl;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat", exchange -> {
            receivedBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            receivedAuth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            String content = "```json\n{\"score\":88,\"summary\":\"不错\",\"highlights\":[]}\n```";
            String body = MAPPER.writeValueAsString(
                    Map.of("choices", List.of(Map.of("message", Map.of("content", content)))));
            respond(exchange, 200, body);
        });
        server.createContext("/fail", exchange -> respond(exchange, 500, "{\"error\":\"boom\"}"));
        server.start();
        int port = server.getAddress().getPort();
        okUrl = "http://127.0.0.1:" + port + "/chat";
        failUrl = "http://127.0.0.1:" + port + "/fail";
    }

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String body) throws java.io.IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Test
    void missingKeyFailsFastWithoutCallingUpstream() {
        ResumeAnalysisService service = new ResumeAnalysisService("", okUrl, 5);
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> service.analyze("简历", "JD"));
        assertEquals("专家系统未就绪", e.getMessage());
        assertEquals("", receivedBody.get(), "密钥缺失时不应发起上游请求");
    }

    @Test
    void parsesFencedJsonAndSendsBearerToken() {
        ResumeAnalysisService service = new ResumeAnalysisService("test-key", okUrl, 5);
        JsonNode result = service.analyze("我的简历", "目标岗位");
        assertEquals(88, result.path("score").asInt());
        assertEquals("不错", result.path("summary").asText());
        assertEquals("Bearer test-key", receivedAuth.get());
        assertTrue(receivedBody.get().contains("我的简历"));
        assertTrue(receivedBody.get().contains("目标岗位"));
    }

    @Test
    void truncatesOverlongInputToProtectTheModelCall() {
        ResumeAnalysisService service = new ResumeAnalysisService("test-key", okUrl, 5);
        String longJd = "J".repeat(5000);
        String longResume = "R".repeat(5000);
        service.analyze(longResume, longJd);

        String sent = receivedBody.get();
        assertTrue(sent.contains("J".repeat(1000)), "JD 前 1000 字应保留");
        assertFalse(sent.contains("J".repeat(1001)), "JD 应截断到 1000 字");
        assertTrue(sent.contains("R".repeat(3000)), "简历前 3000 字应保留");
        assertFalse(sent.contains("R".repeat(3001)), "简历应截断到 3000 字");
    }

    @Test
    void upstreamFailureBecomesFriendlyMessage() {
        ResumeAnalysisService service = new ResumeAnalysisService("test-key", failUrl, 5);
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> service.analyze("简历", "JD"));
        assertTrue(e.getMessage().startsWith("对标服务暂时不可用"), "错误信息应可直接展示给用户：" + e.getMessage());
    }
}
