package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 页面浏览埋点上报请求体
 */
@Data
public class TrackPageDTO {

    /** 页面标识，需命中后端白名单 */
    @NotBlank(message = "pageKey 不能为空")
    private String pageKey;
}
