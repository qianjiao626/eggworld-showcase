package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class DormitoryReviewPermission {
    private final JdbcTemplate jdbc;

    public DormitoryReviewPermission(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void requireReviewer(Long userId) {
        if (userId == null || !Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM dormitory_reviewers WHERE user_id = ? AND active = 1)",
                Boolean.class, userId))) {
            throw new BusinessException(403, "无权审核宿舍图片");
        }
    }
}
