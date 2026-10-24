package com.eggworld.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 批量授予 / 收回结果：逐人处理、不做整体回滚
 */
@Data
public class PermissionBatchResultVO {

    /** 成功人数 */
    private int success;

    /** 跳过人数（已授权再授权 / 未授权再收回） */
    private int skipped;

    /** 失败明细（用户不存在 / 主管理员不可授权等） */
    private List<Fail> failed = new ArrayList<>();

    public void addSuccess() {
        success++;
    }

    public void addSkipped() {
        skipped++;
    }

    public void addFail(Long userId, String reason) {
        failed.add(new Fail(userId, reason));
    }

    /** 单条失败 / 跳过明细 */
    @Data
    public static class Fail {
        private Long userId;
        private String reason;

        public Fail() {
        }

        public Fail(Long userId, String reason) {
            this.userId = userId;
            this.reason = reason;
        }
    }
}
