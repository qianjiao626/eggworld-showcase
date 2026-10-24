package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 穿戴 / 卸下装扮的请求体
 * key 为 null 或空字符串表示卸下该槽位。
 */
@Data
public class EquipDTO {

    /** aura/cloak/outfit/frame/charm/title/skin */
    @NotBlank(message = "槽位不能为空")
    private String slot;

    /** 特效 key 或称号 key；为空表示卸下 */
    private String key;
}
