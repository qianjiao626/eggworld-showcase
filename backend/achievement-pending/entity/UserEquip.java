package com.eggworld.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户当前穿戴的装扮，对应表 user_equip
 * 主键即 user_id（一用户一行）。7 个槽位直接存 key 字符串，
 * 因为特效是代码定义的静态资源，没有对应数据表。
 */
@Data
@TableName("user_equip")
public class UserEquip {

    @TableId(type = IdType.INPUT)
    private Long userId;

    private String auraKey;
    private String cloakKey;
    private String outfitKey;
    private String frameKey;
    private String charmKey;
    private String titleKey;
    private String skinKey;

    private LocalDateTime updatedAt;
}
