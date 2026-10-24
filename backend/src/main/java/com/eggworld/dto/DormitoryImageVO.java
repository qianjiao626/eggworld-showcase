package com.eggworld.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class DormitoryImageVO {
    private Long id;
    private String schoolName;
    private String campus;
    private String building;
    private String status;
    private String imageUrl;
    private String reviewReason;
    private LocalDateTime createdAt;
}
