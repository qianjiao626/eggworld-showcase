package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 会话开始上报请求体
 */
@Data
public class TrackSessionDTO {

    @NotBlank(message = "sessionId 不能为空")
    private String sessionId;

    @NotBlank(message = "visitorId 不能为空")
    private String visitorId;

    private String referrer;

    private String uaDevice;

    private boolean newVisitor;
}
