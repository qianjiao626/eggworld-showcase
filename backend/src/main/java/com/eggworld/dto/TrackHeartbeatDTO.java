package com.eggworld.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 心跳上报请求体
 */
@Data
public class TrackHeartbeatDTO {

    @NotBlank(message = "sessionId 不能为空")
    private String sessionId;
}
