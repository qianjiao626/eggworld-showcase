package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("daily_checkins")
public class DailyCheckin {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private LocalDate checkDate;
    private LocalDateTime createdAt;
}
