package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DormitoryServiceUploadTest {
    @TempDir Path uploadDir;
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final DormitoryService service = new DormitoryService(jdbc, mock(DormitoryReviewPermission.class));

    @Test
    void oversizedFileIsRejectedBeforeReadingItsBytes() throws Exception {
        ReflectionTestUtils.setField(service, "uploadDirectory", uploadDir.toString());
        MultipartFile file = mock(MultipartFile.class);
        when(file.getSize()).thenReturn((long) DormitoryImageValidator.MAX_BYTES + 1);
        assertThrows(BusinessException.class, () -> service.upload("北京大学", null, null, 7L, List.of(file)));
        verify(file, never()).getBytes();
        verifyNoInteractions(jdbc);
    }

    @Test
    void mineRequiresAuthentication() {
        assertEquals(401, assertThrows(BusinessException.class, () -> service.listMine(null)).getCode());
        verifyNoInteractions(jdbc);
    }
}
