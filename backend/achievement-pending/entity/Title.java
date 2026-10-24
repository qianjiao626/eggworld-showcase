package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 称号定义，对应表 titles
 * 称号由种子数据维护：名称 + 样式 class。
 */
@Data
@TableName("titles")
public class Title {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 称号标识，如 t-steady */
    private String titleKey;

    /** 称号文本，如「雷打不动」 */
    private String name;

    /** 样式 class：title-plain / title-gold / title-neon / title-flame / title-holo */
    private String styleClass;

    /** 档次 N/R/SR/SSR/UR（仅用于排序与展示） */
    private String rarity;

    private Integer sortOrder;

    private java.time.LocalDateTime createdAt;
}
