package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DormitoryImageValidatorTest {

    @Test
    void acceptsSupportedImageSignaturesWithinFiveMegabytes() {
        assertDoesNotThrow(() -> DormitoryImageValidator.validate(
                new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x00}, "image/jpeg"));
        assertDoesNotThrow(() -> DormitoryImageValidator.validate(
                new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}, "image/png"));
        assertDoesNotThrow(() -> DormitoryImageValidator.validate(
                new byte[]{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'}, "image/webp"));
    }

    @Test
    void rejectsMismatchBetweenDeclaredTypeAndActualSignature() {
        BusinessException error = assertThrows(BusinessException.class, () ->
                DormitoryImageValidator.validate(new byte[]{'n', 'o', 't', 'a', 'n', 'i', 'm', 'g'}, "image/png"));
        assertEquals(400, error.getCode());
    }

    @Test
    void rejectsUnsupportedTypesAndOversizedFiles() {
        assertThrows(BusinessException.class, () ->
                DormitoryImageValidator.validate(new byte[]{1, 2, 3, 4}, "image/gif"));
        assertThrows(BusinessException.class, () ->
                DormitoryImageValidator.validate(new byte[5 * 1024 * 1024 + 1], "image/jpeg"));
    }
}
