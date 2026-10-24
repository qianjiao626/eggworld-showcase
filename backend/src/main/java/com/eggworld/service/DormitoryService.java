package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.dto.DormitoryImageVO;
import com.eggworld.dto.DormitoryProfileVO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DormitoryService {
    private final JdbcTemplate jdbc;
    private final DormitoryReviewPermission reviewPermission;
    @Value("${eggworld.dormitory.upload-dir:./uploads/dormitory}")
    private String uploadDirectory;

    public DormitoryProfileVO getProfile(String schoolName) {
        String school = normalizeSchool(schoolName);
        List<DormitoryProfileVO> rows = jdbc.query("SELECT school_name, occupancy, room_configuration, facilities, accommodation_cost, source_url, source_year, verification_status, note FROM dormitory_profiles WHERE school_name = ? LIMIT 1",
                (rs, rowNum) -> {
                    DormitoryProfileVO vo = new DormitoryProfileVO();
                    vo.setSchoolName(rs.getString("school_name"));
                    vo.setDisplayName("蛋蛋世界的 " + rs.getString("school_name"));
                    vo.setOccupancy(rs.getString("occupancy"));
                    vo.setRoomConfiguration(rs.getString("room_configuration"));
                    vo.setFacilities(rs.getString("facilities"));
                    vo.setAccommodationCost(rs.getString("accommodation_cost"));
                    vo.setSourceUrl(rs.getString("source_url"));
                    Object year = rs.getObject("source_year");
                    vo.setSourceYear(year instanceof Number number ? number.intValue() : null);
                    vo.setVerificationStatus(rs.getString("verification_status"));
                    vo.setNote(rs.getString("note"));
                    return vo;
                }, school);
        DormitoryProfileVO profile = rows.isEmpty() ? new DormitoryProfileVO() : rows.get(0);
        if (rows.isEmpty()) {
            profile.setVerificationStatus("unavailable");
            profile.setNote("暂无资料");
        }
        profile.setSchoolName(school);
        profile.setDisplayName("蛋蛋世界的 " + school);
        profile.setImages(listImages("SELECT id, school_name, uploader_id, status, review_reason, campus, building, created_at FROM dormitory_images WHERE school_name = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 30", school));
        profile.getImages().forEach(image -> image.setImageUrl("/api/dormitories/images/" + image.getId()));
        return profile;
    }

    @Transactional
    public List<DormitoryImageVO> upload(String schoolName, Long userId, List<MultipartFile> files) {
        return upload(schoolName, null, null, userId, files);
    }

    @Transactional
    public List<DormitoryImageVO> upload(String schoolName, String campus, String building, Long userId, List<MultipartFile> files) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        String school = normalizeSchool(schoolName);
        String cleanCampus = optionalLocation(campus);
        String cleanBuilding = optionalLocation(building);
        if (files == null || files.isEmpty() || files.size() > 5) throw new BusinessException("每次最多上传 5 张图片");
        Path root = Path.of(uploadDirectory).toAbsolutePath().normalize();
        List<Path> created = new ArrayList<>();
        List<Long> ids = new ArrayList<>();
        try {
            Files.createDirectories(root);
            for (MultipartFile file : files) {
                if (file.getSize() > DormitoryImageValidator.MAX_BYTES) throw new BusinessException("图片不能为空，且单张不能超过 5 MB");
                byte[] bytes = file.getBytes();
                DormitoryImageValidator.validate(bytes, file.getContentType());
                String mediaType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
                String extension = switch (mediaType) {
                    case "image/jpeg", "image/jpg" -> ".jpg";
                    case "image/png" -> ".png";
                    case "image/webp" -> ".webp";
                    default -> throw new BusinessException("仅支持 JPG、PNG、WebP 图片");
                };
                String key = UUID.randomUUID() + extension;
                Path target = root.resolve(key).normalize();
                if (!target.getParent().equals(root)) throw new BusinessException("图片存储路径无效");
                Files.write(target, bytes);
                created.add(target);
                jdbc.update("INSERT INTO dormitory_images (school_name, campus, building, uploader_id, image_key, content_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())",
                        school, cleanCampus, cleanBuilding, userId, key, mediaType);
                ids.add(jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class));
            }
            return ids.stream().map(this::getOwnImage).toList();
        } catch (IOException | RuntimeException error) {
            created.forEach(path -> { try { Files.deleteIfExists(path); } catch (IOException ignored) { } });
            if (error instanceof RuntimeException runtime) throw runtime;
            throw new BusinessException("图片保存失败，请稍后重试");
        }
    }

    public List<DormitoryImageVO> listMine(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return listImages("SELECT id, school_name, uploader_id, status, review_reason, campus, building, created_at FROM dormitory_images WHERE uploader_id = ? ORDER BY created_at DESC LIMIT 100", userId);
    }

    public List<DormitoryImageVO> pending(Long reviewerId) {
        reviewPermission.requireReviewer(reviewerId);
        List<DormitoryImageVO> images = listImages("SELECT id, school_name, uploader_id, status, review_reason, campus, building, created_at FROM dormitory_images WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100");
        images.forEach(image -> image.setImageUrl("/api/dormitories/review/images/" + image.getId()));
        return images;
    }

    public byte[] getReviewImage(Long reviewerId, Long imageId) {
        reviewPermission.requireReviewer(reviewerId);
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT image_key FROM dormitory_images WHERE id = ? AND status = 'pending'", imageId);
        if (rows.isEmpty()) throw new BusinessException(404, "待审核图片不存在");
        return readImage((String) rows.get(0).get("image_key"));
    }

    public String getReviewImageType(Long reviewerId, Long imageId) {
        reviewPermission.requireReviewer(reviewerId);
        return jdbc.query("SELECT content_type FROM dormitory_images WHERE id = ? AND status = 'pending'",
                rs -> rs.next() ? rs.getString(1) : null, imageId);
    }

    @Transactional
    public void review(Long reviewerId, Long imageId, boolean approve, String reason) {
        reviewPermission.requireReviewer(reviewerId);
        String status = approve ? "approved" : "rejected";
        String cleanReason = reason == null || reason.isBlank() ? null : reason.strip();
        if (cleanReason != null && cleanReason.length() > 500) throw new BusinessException("驳回原因最多 500 字");
        int changed = jdbc.update("UPDATE dormitory_images SET status = ?, reviewer_id = ?, review_reason = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
                status, reviewerId, approve ? null : cleanReason, imageId);
        if (changed == 0) throw new BusinessException("图片不存在或已审核");
    }

    public byte[] getApprovedImage(Long imageId) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT image_key FROM dormitory_images WHERE id = ? AND status = 'approved'", imageId);
        if (rows.isEmpty()) throw new BusinessException(404, "图片不存在");
        return readImage((String) rows.get(0).get("image_key"));
    }

    private byte[] readImage(String key) {
        Path root = Path.of(uploadDirectory).toAbsolutePath().normalize();
        Path file = root.resolve(key).normalize();
        if (!root.equals(file.getParent())) throw new BusinessException(404, "图片不存在");
        try { return Files.readAllBytes(file); }
        catch (IOException error) { throw new BusinessException(404, "图片不存在"); }
    }

    public String getApprovedImageType(Long imageId) {
        return jdbc.query("SELECT content_type FROM dormitory_images WHERE id = ? AND status = 'approved'",
                rs -> rs.next() ? rs.getString(1) : null, imageId);
    }

    public boolean isReviewer(Long userId) {
        return userId != null && Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM dormitory_reviewers WHERE user_id = ? AND active = 1)", Boolean.class, userId));
    }

    public void setReviewer(Long userId, boolean active, Long adminId) {
        if (userId == null || userId <= 0 || userId.equals(adminId)) throw new BusinessException("请指定有效的其他用户 ID");
        if (active) {
            jdbc.update("INSERT INTO dormitory_reviewers (user_id, assigned_by, active, created_at) VALUES (?, ?, 1, NOW()) ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by), active = 1", userId, adminId);
        } else {
            jdbc.update("UPDATE dormitory_reviewers SET active = 0 WHERE user_id = ?", userId);
        }
    }

    private DormitoryImageVO getOwnImage(Long id) {
        return listImages("SELECT id, school_name, uploader_id, status, review_reason, campus, building, created_at FROM dormitory_images WHERE id = ?", id).get(0);
    }

    private List<DormitoryImageVO> listImages(String sql, Object... args) {
        return jdbc.query(sql, (rs, rowNum) -> {
            DormitoryImageVO image = new DormitoryImageVO();
            image.setId(rs.getLong("id"));
            image.setSchoolName(rs.getString("school_name"));
            image.setCampus(rs.getString("campus"));
            image.setBuilding(rs.getString("building"));
            image.setStatus(rs.getString("status"));
            image.setReviewReason(rs.getString("review_reason"));
            image.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
            if ("approved".equals(image.getStatus())) image.setImageUrl("/api/dormitories/images/" + image.getId());
            return image;
        }, args);
    }

    private String optionalLocation(String value) {
        if (value == null || value.isBlank()) return null;
        String clean = value.strip();
        if (clean.length() > 100) throw new BusinessException("校区或楼号最多 100 字");
        return clean;
    }

    private String normalizeSchool(String schoolName) {
        if (schoolName == null || schoolName.isBlank() || schoolName.strip().length() > 100) throw new BusinessException("请提供有效学校名称");
        String school = schoolName.strip();
        if (school.startsWith("蛋蛋世界的 ")) school = school.substring("蛋蛋世界的 ".length()).strip();
        if (school.isBlank() || school.contains("/")) throw new BusinessException("请提供有效学校名称");
        return school;
    }
}
