package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户成就解锁记录，对应表 user_achievements
 * uk_user_ach(user_id, ach_id) 唯一键保证解锁幂等。
 */
@Data
@TableName("user_achievements")
public class UserAchievement {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private Long achId;

    private LocalDateTime unlockedAt;

    /** 0 未读 / 1 已查看解锁弹窗 */
    private Integer isRead;
}
