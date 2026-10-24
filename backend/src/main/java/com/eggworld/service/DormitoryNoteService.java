package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.dto.DormitoryNoteVO;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DormitoryNoteService {
    private final JdbcTemplate jdbc;
    private final DormitoryReviewPermission permission;
    private final PointService pointService;

    /** 宿舍文字介绍通过审核后一次性奖励的蛋蛋币数量。 */
    static final int NOTE_APPROVAL_REWARD = 5;

    @Transactional
    public void submit(String schoolName, String campus, String building, String content, String sourceUrl, Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        String school = clean(schoolName, 100, true, "学校");
        String text = clean(content, 200, true, "内容");
        String url = clean(sourceUrl, 1000, false, "来源链接");
        if (url != null) {
            try {
                java.net.URI uri = java.net.URI.create(url);
                if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null)
                    throw new IllegalArgumentException();
            } catch (IllegalArgumentException error) { throw new BusinessException("来源链接仅支持完整的 HTTP(S) 地址"); }
        }
        jdbc.update("INSERT INTO dormitory_notes (school_name, campus, building, content, source_url, uploader_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())",
                school, clean(campus, 100, false, "校区"), clean(building, 100, false, "楼号"), text, url, userId);
    }

    public List<DormitoryNoteVO> listApproved(String schoolName) {
        return list("SELECT id, school_name, campus, building, content, source_url, status, review_reason, created_at FROM dormitory_notes WHERE school_name = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50", clean(schoolName, 100, true, "学校"));
    }

    public List<DormitoryNoteVO> listMine(Long userId) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        return list("SELECT id, school_name, campus, building, content, source_url, status, review_reason, created_at FROM dormitory_notes WHERE uploader_id = ? ORDER BY created_at DESC LIMIT 100", userId);
    }

    public List<DormitoryNoteVO> pending(Long reviewerId) {
        permission.requireReviewer(reviewerId);
        return list("SELECT id, school_name, campus, building, content, source_url, status, review_reason, created_at FROM dormitory_notes WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100");
    }

    @Transactional
    public void review(Long reviewerId, Long id, boolean approve, String reason) {
        permission.requireReviewer(reviewerId);
        String cleanReason = clean(reason, 500, false, "驳回原因");
        // 审核前先取出投稿人；奖励仅发给被审核通过的那条待审记录，避免重复发放。
        List<Long> uploaders = jdbc.query(
                "SELECT uploader_id FROM dormitory_notes WHERE id = ? AND status = 'pending'",
                (rs, rowNum) -> rs.getLong(1), id);
        Long uploaderId = uploaders.isEmpty() ? null : uploaders.get(0);
        int changed = jdbc.update("UPDATE dormitory_notes SET status = ?, reviewer_id = ?, review_reason = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
                approve ? "approved" : "rejected", reviewerId, approve ? null : cleanReason, id);
        if (changed == 0) throw new BusinessException("文字不存在或已审核");
        if (approve && uploaderId != null) {
            pointService.changeBalance(uploaderId, NOTE_APPROVAL_REWARD, "reward", "宿舍文字介绍通过审核", null);
        }
    }

    private List<DormitoryNoteVO> list(String sql, Object... args) {
        return jdbc.query(sql, (rs, rowNum) -> {
            DormitoryNoteVO note = new DormitoryNoteVO();
            note.setId(rs.getLong("id"));
            note.setSchoolName(rs.getString("school_name"));
            note.setCampus(rs.getString("campus"));
            note.setBuilding(rs.getString("building"));
            note.setContent(rs.getString("content"));
            note.setSourceUrl(rs.getString("source_url"));
            note.setStatus(rs.getString("status"));
            note.setReviewReason(rs.getString("review_reason"));
            note.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
            return note;
        }, args);
    }

    private String clean(String value, int max, boolean required, String field) {
        String result = value == null ? "" : value.strip();
        if ((required && result.isEmpty()) || result.length() > max || result.indexOf('\u0000') >= 0)
            throw new BusinessException(field + "格式无效，最多 " + max + " 字");
        return result.isEmpty() ? null : result;
    }
}
