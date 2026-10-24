package com.eggworld.service;

import com.eggworld.common.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 宠物系统管理员权限校验。
 * 与 DormitoryReviewPermission 同一套模式：白名单表 + 显式授权。
 */
@Service
public class CatReviewPermission {

    private final JdbcTemplate jdbc;

    public CatReviewPermission(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isReviewer(Long userId) {
        if (userId == null) return false;
        Boolean ok = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM cat_reviewers WHERE user_id = ? AND active = 1)",
                Boolean.class, userId);
        return Boolean.TRUE.equals(ok);
    }

    public void requireReviewer(Long userId) {
        if (!isReviewer(userId)) {
            throw new BusinessException(403, "无权限审核猫舍内容");
        }
    }
}
