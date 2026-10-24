package com.eggworld.service;

import com.eggworld.common.BusinessException;

/** Validates image size, declared format and file signature before persistence. */
public final class DormitoryImageValidator {
    public static final int MAX_BYTES = 5 * 1024 * 1024;

    private DormitoryImageValidator() {}

    public static void validate(byte[] bytes, String contentType) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw new BusinessException("图片不能为空，且单张不能超过 5 MB");
        }
        boolean valid = switch (contentType == null ? "" : contentType.toLowerCase()) {
            case "image/jpeg", "image/jpg" -> bytes.length >= 3
                    && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8 && (bytes[2] & 0xff) == 0xff;
            case "image/png" -> bytes.length >= 8
                    && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G'
                    && bytes[4] == 0x0d && bytes[5] == 0x0a && (bytes[6] & 0xff) == 0x1a && bytes[7] == 0x0a;
            case "image/webp" -> bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
            default -> false;
        };
        if (!valid) throw new BusinessException("仅支持真实的 JPG、PNG 或 WebP 图片");
    }

    private static boolean ascii(byte[] bytes, int offset, String expected) {
        for (int i = 0; i < expected.length(); i++) if (bytes[offset + i] != expected.charAt(i)) return false;
        return true;
    }
}
