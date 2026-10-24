package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.dto.TaskProofImageVO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 任务「技能证明图片」上传/读取的回归测试。
 * 重点锁定四件事：未登录不能上传、假图片（只改扩展名）不能落盘、
 * 落盘文件名由服务端生成、按 id 读图会挡住目录穿越。
 */
class TaskProofImageServiceTest {

    @TempDir
    Path uploadDir;

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final TaskProofImageService service = new TaskProofImageService(jdbc);

    private static final byte[] PNG = new byte[]{
            (byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0
    };

    /** 单列查询的桩：query(String, RowMapper, Object...) */
    private void stubColumn(Long id, List<String> rows) {
        when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<String>>any(), eq(id))).thenReturn(rows);
    }

    private MultipartFile file(String contentType, long size, byte[] bytes) throws Exception {
        MultipartFile f = mock(MultipartFile.class);
        when(f.getContentType()).thenReturn(contentType);
        when(f.getSize()).thenReturn(size);
        when(f.getBytes()).thenReturn(bytes);
        when(f.isEmpty()).thenReturn(false);
        return f;
    }

    @Test
    void saveRequiresLogin() throws Exception {
        assertEquals(401, assertThrows(BusinessException.class,
                () -> service.save(null, file("image/png", PNG.length, PNG))).getCode());
        verifyNoInteractions(jdbc);
    }

    @Test
    void oversizedFileIsRejectedBeforeReadingItsBytes() throws Exception {
        ReflectionTestUtils.setField(service, "uploadDirectory", uploadDir.toString());
        MultipartFile big = mock(MultipartFile.class);
        when(big.getSize()).thenReturn((long) TaskProofImageService.MAX_BYTES + 1);
        when(big.isEmpty()).thenReturn(false);
        assertThrows(BusinessException.class, () -> service.save(7L, big));
        verify(big, never()).getBytes();
        verifyNoInteractions(jdbc);
        try (var files = Files.list(uploadDir)) {
            assertEquals(0, files.count(), "超限图片不得落盘");
        }
    }

    @Test
    void fakeImageIsRejectedAndNothingIsWritten() throws Exception {
        ReflectionTestUtils.setField(service, "uploadDirectory", uploadDir.toString());
        MultipartFile fake = file("image/png", 9, "not-a-png".getBytes(StandardCharsets.UTF_8));
        assertThrows(BusinessException.class, () -> service.save(7L, fake));
        verifyNoInteractions(jdbc);
        try (var files = Files.list(uploadDir)) {
            assertEquals(0, files.count(), "校验失败的图片不得落盘");
        }
    }

    @Test
    void saveWritesFileAndReturnsImageId() throws Exception {
        ReflectionTestUtils.setField(service, "uploadDirectory", uploadDir.toString());
        when(jdbc.update(anyString(), eq(7L), anyString(), eq("image/png"), eq(PNG.length))).thenReturn(1);
        when(jdbc.queryForObject(anyString(), eq(Long.class))).thenReturn(42L);

        TaskProofImageVO vo = service.save(7L, file("image/png", PNG.length, PNG));

        assertEquals(42L, vo.getId());
        assertEquals("/api/tasks/proof-images/42", vo.getImageUrl());
        assertEquals(PNG.length, vo.getByteSize());
        // 落盘文件名必须由服务端生成（UUID + 白名单扩展名），不能沿用前端传来的文件名
        try (var files = Files.list(uploadDir)) {
            String stored = files.map(p -> p.getFileName().toString()).findFirst().orElse("");
            assertTrue(stored.matches("(?i)[0-9a-f-]{36}\\.png"), "落盘文件名应为 UUID.png，实际：" + stored);
        }
    }

    @Test
    void loadRejectsUnknownId() {
        stubColumn(999L, List.of());
        assertEquals(404, assertThrows(BusinessException.class, () -> service.load(999L)).getCode());
    }

    @Test
    void loadRejectsPathTraversalKeyFromDatabase() throws Exception {
        ReflectionTestUtils.setField(service, "uploadDirectory", uploadDir.toString());
        /* 攻击面：库里若被写入带 ../ 的 key，读图必须挡住目录穿越（本用例落一个同级文件当靶子） */
        Files.writeString(uploadDir.resolveSibling("secret.txt"), "secret");
        stubColumn(5L, List.of("../secret.txt"));
        assertEquals(404, assertThrows(BusinessException.class, () -> service.load(5L)).getCode());
    }

    @Test
    void loadReturnsStoredBytesAndContentType() throws Exception {
        ReflectionTestUtils.setField(service, "uploadDirectory", uploadDir.toString());
        Files.write(uploadDir.resolve("abc.png"), PNG);
        stubColumn(8L, List.of("abc.png"));
        stubColumn(9L, List.of("image/png"));

        assertArrayEquals(PNG, service.load(8L));
        assertEquals("image/png", service.contentTypeOf(9L));
    }
}
