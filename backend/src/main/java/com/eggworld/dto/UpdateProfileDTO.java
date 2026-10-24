package com.eggworld.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 更新个人信息请求体（所有字段均可选）
 */
@Data
public class UpdateProfileDTO {

    @Size(max = 20, message = "昵称最长20个字符")
    private String nickname;

    @Size(max = 100, message = "学校最长100个字符")
    private String school;

    @Size(max = 100, message = "专业最长100个字符")
    private String major;

    @Size(max = 50, message = "城市最长50个字符")
    private String city;

    @Size(max = 20, message = "年级最长20个字符")
    private String grade;

    private Integer age;

    @Size(max = 500, message = "简介最长500个字符")
    private String bio;

    /** MBTI 类型，如 INTJ，设置时自动推导分组 */
    @Size(max = 4, message = "MBTI类型为4个字母")
    private String mbtiType;

    /** 当前使用的角色分类 */
    private String currentCategory;
}
